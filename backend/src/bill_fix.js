export async function updateBillFixed(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);

  const id = new URL(request.url).pathname.split('/').filter(Boolean)[1];
  const bill = await getBill(env, id);
  if (!bill) return json({ error: 'bill_not_found', message: 'Gasto no encontrado.' }, env, 404);

  const body = await readJson(request);
  const targetMonth = normalizeMonth(body.service_month || bill.service_month || bill.bill_date);
  const originalMonth = normalizeMonth(bill.service_month || bill.bill_date);
  const lockedMonth = await firstClosedMonth(env, [originalMonth, targetMonth]);
  if (lockedMonth) return json({ error: 'month_closed', message: `El mes ${lockedMonth} está cerrado. El owner debe reabrirlo antes de modificar gastos.`, month: lockedMonth }, env, 423);

  const total = toInt(body.total_amount || bill.total_amount);
  const currentParticipants = await getBillParticipants(env, id);
  const participants = normalizeParticipants(body.participants, total, currentParticipants);
  const shareSum = participants.reduce((sum, p) => sum + toInt(p.share_amount), 0);
  if (!participants.length || shareSum !== total) return json({ error: 'invalid_shares', message: 'La suma de participantes debe ser igual al total.' }, env, 400);

  const hasOperation = Object.prototype.hasOwnProperty.call(body, 'operation_id');
  const operationId = hasOperation ? (String(body.operation_id || '').trim() || null) : (bill.operation_id || null);
  const paidBy = Object.prototype.hasOwnProperty.call(body, 'paid_by_user_id') ? (String(body.paid_by_user_id || '').trim() || bill.paid_by_user_id || bill.created_by || auth.user.id) : (bill.paid_by_user_id || bill.created_by || auth.user.id);

  await env.DB.prepare('UPDATE bills SET category_id = ?, title = ?, description = ?, total_amount = ?, bill_date = ?, due_date = ?, service_month = ?, operation_id = ?, paid_by_user_id = ?, updated_at = ? WHERE id = ?')
    .bind(body.category_id || bill.category_id, body.title || bill.title, body.description ?? bill.description, total, String(body.bill_date || bill.bill_date).slice(0, 10), body.due_date || bill.due_date || null, targetMonth, operationId, paidBy, new Date().toISOString(), id)
    .run();

  await replaceBillParticipants(env, id, participants);
  await refreshBillStatuses(env, [id]);
  return json({ ok: true, bill: await getBill(env, id), participants: await getBillParticipants(env, id) }, env);
}

async function firstClosedMonth(env, months) {
  for (const month of [...new Set((months || []).filter(Boolean).map(normalizeMonth))]) {
    const row = await env.DB.prepare('SELECT month FROM month_closures WHERE month = ? LIMIT 1').bind(month).first();
    if (row) return month;
  }
  return null;
}

function normalizeParticipants(participants, total, currentParticipants = []) {
  const old = new Map((currentParticipants || []).map((p) => [p.user_id, Number(p.paid_amount || 0)]));
  return (Array.isArray(participants) ? participants : [])
    .map((p) => {
      const userId = String(p.user_id || '').trim();
      const share = Number(p.share_percent || 0) > 0 ? Math.round(total * Number(p.share_percent) / 100) : toInt(p.share_amount);
      const explicitPaid = Object.prototype.hasOwnProperty.call(p, 'paid_amount');
      const paid = Math.min(share, explicitPaid ? toInt(p.paid_amount) : Number(old.get(userId) || 0));
      return { user_id: userId, share_amount: share, paid_amount: paid };
    })
    .filter((p) => p.user_id && p.share_amount > 0);
}

async function replaceBillParticipants(env, billId, participants) {
  await env.DB.prepare('DELETE FROM bill_participants WHERE bill_id = ?').bind(billId).run();
  for (const p of participants) {
    const paid = Math.min(toInt(p.share_amount), toInt(p.paid_amount));
    await env.DB.prepare('INSERT INTO bill_participants (bill_id, user_id, share_amount, paid_amount, status) VALUES (?, ?, ?, ?, ?)')
      .bind(billId, p.user_id, toInt(p.share_amount), paid, paid >= toInt(p.share_amount) ? 'paid' : paid > 0 ? 'partial' : 'pending')
      .run();
  }
}

async function refreshBillStatuses(env, billIds) {
  for (const id of [...new Set((billIds || []).filter(Boolean))]) {
    const summary = await env.DB.prepare('SELECT SUM(share_amount) AS total, SUM(paid_amount) AS paid FROM bill_participants WHERE bill_id = ?').bind(id).first();
    if (!summary) continue;
    const total = Number(summary.total || 0);
    const paid = Number(summary.paid || 0);
    const status = paid <= 0 ? 'open' : paid >= total ? 'paid' : 'partial';
    await env.DB.prepare('UPDATE bills SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), id).run();
    await env.DB.prepare("UPDATE bill_participants SET status = CASE WHEN paid_amount >= share_amount THEN 'paid' WHEN paid_amount > 0 THEN 'partial' ELSE 'pending' END WHERE bill_id = ?").bind(id).run();
  }
}

async function getBill(env, id) {
  return env.DB.prepare('SELECT b.*, c.name AS category_name, c.icon AS category_icon, o.title AS operation_title, payer.name AS paid_by_name, payer.email AS paid_by_email FROM bills b JOIN categories c ON c.id = b.category_id LEFT JOIN operations o ON o.id = b.operation_id LEFT JOIN users payer ON payer.id = COALESCE(b.paid_by_user_id, b.created_by) WHERE b.id = ?').bind(id).first();
}

async function getBillParticipants(env, id) {
  const { results } = await env.DB.prepare('SELECT bp.*, u.name, u.email FROM bill_participants bp JOIN users u ON u.id = bp.user_id WHERE bp.bill_id = ? ORDER BY u.name, u.email').bind(id).all();
  return results;
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

function normalizeMonth(value) { const raw = String(value || '').slice(0, 7); return /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7); }
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function toInt(value) { return Math.max(0, Math.round(Number(String(value || 0).replace(/[^0-9.-]/g, '')) || 0)); }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
