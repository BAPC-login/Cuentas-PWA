export async function deleteOperationFixed(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = new URL(request.url).pathname.split('/').filter(Boolean)[1];
  const operation = await env.DB.prepare('SELECT * FROM operations WHERE id = ?').bind(id).first();
  if (!operation) return json({ error: 'operation_not_found', message: 'Operación no encontrada.' }, env, 404);
  if (auth.user.role !== 'owner' && operation.created_by !== auth.user.id) return json({ error: 'not_allowed', message: 'Solo el owner o creador puede eliminar esta operación.' }, env, 403);
  const month = String(operation.service_month || operation.expense_date || '').slice(0, 7);
  if (month) {
    const locked = await env.DB.prepare('SELECT month FROM month_closures WHERE month = ? LIMIT 1').bind(month).first().catch(() => null);
    if (locked) return json({ error: 'month_closed', message: `El mes ${month} está cerrado. Reábrelo antes de eliminar operaciones.`, month }, env, 423);
  }
  await env.DB.prepare('UPDATE bills SET operation_id = NULL, updated_at = ? WHERE operation_id = ?').bind(new Date().toISOString(), id).run();
  await env.DB.prepare('DELETE FROM operations WHERE id = ?').bind(id).run();
  await writeAudit(env, auth.user.id, 'operation_deleted', 'operation', id, { title: operation.title });
  return json({ ok: true, deleted_id: id, detached_bills: true }, env);
}

export async function finalBalances(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare(`
    SELECT debtor.id AS debtor_id, debtor.name AS debtor_name, debtor.email AS debtor_email,
           receiver.id AS receiver_id, receiver.name AS receiver_name, receiver.email AS receiver_email,
           (bp.share_amount - bp.paid_amount) AS pending,
           b.id AS bill_id, b.title AS bill_title, COALESCE(b.service_month, substr(b.bill_date,1,7)) AS service_month
    FROM bill_participants bp
    JOIN bills b ON b.id = bp.bill_id
    JOIN users debtor ON debtor.id = bp.user_id
    JOIN users receiver ON receiver.id = COALESCE(b.paid_by_user_id, b.created_by)
    WHERE b.status != 'cancelled'
      AND debtor.id != receiver.id
      AND (bp.share_amount - bp.paid_amount) > 0
  `).all();
  const balances = new Map();
  const names = new Map();
  for (const r of results || []) {
    const amount = Number(r.pending || 0);
    if (amount <= 0) continue;
    names.set(r.debtor_id, { id: r.debtor_id, name: r.debtor_name || r.debtor_email || 'Usuario', email: r.debtor_email });
    names.set(r.receiver_id, { id: r.receiver_id, name: r.receiver_name || r.receiver_email || 'Usuario', email: r.receiver_email });
    balances.set(r.debtor_id, Number(balances.get(r.debtor_id) || 0) - amount);
    balances.set(r.receiver_id, Number(balances.get(r.receiver_id) || 0) + amount);
  }
  const debtors = [...balances.entries()].filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: Math.abs(v), ...names.get(id) })).sort((a, b) => b.amount - a.amount);
  const creditors = [...balances.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ id, amount: v, ...names.get(id) })).sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) settlements.push({ debtor_id: debtors[i].id, debtor_name: debtors[i].name, receiver_id: creditors[j].id, receiver_name: creditors[j].name, amount: Math.round(amount) });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= 0.5) i++;
    if (creditors[j].amount <= 0.5) j++;
  }
  return json({ ok: true, settlements, balances: [...balances.entries()].map(([id, balance]) => ({ id, ...names.get(id), balance })) }, env);
}

async function writeAudit(env, actorId, action, entityType, entityId, detail) {
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, detail_json) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('audit-' + crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(detail || {}))
    .run()
    .catch(() => null);
}

async function requireSession(request, env) {
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw) return { error: 'missing_session', message: 'Falta iniciar sesión.', status: 401 };
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(await digest(raw)).first();
  if (!session) return { error: 'invalid_session', message: 'Sesión inválida.', status: 401 };
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.status === 'revoked') return { error: 'session_revoked', message: 'Sesión revocada.', status: 401 };
  return { session, user };
}
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
