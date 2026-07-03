export async function createPaymentLite(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const payerId = String(body.payer_id || auth.user.id).trim();
  const total = toInt(body.total_amount);
  const input = Array.isArray(body.allocations) ? body.allocations : [];
  if (!payerId || total <= 0 || !input.length) return json({ error: 'invalid_payment', message: 'Selecciona una o más deudas pendientes.' }, env, 400);
  const clean = [];
  for (const item of input) {
    const billId = String(item.bill_id || '').trim();
    const userId = String(item.user_id || payerId).trim();
    const amount = toInt(item.amount);
    if (!billId || !userId || amount <= 0) continue;
    const part = await env.DB.prepare('SELECT share_amount, paid_amount FROM bill_participants WHERE bill_id = ? AND user_id = ?').bind(billId, userId).first();
    const pending = Math.max(0, Number(part?.share_amount || 0) - Number(part?.paid_amount || 0));
    if (!part || pending <= 0) continue;
    if (amount > pending) return json({ error: 'overpayment', message: 'El pago supera una cuota pendiente.' }, env, 400);
    clean.push({ billId, userId, amount, note: item.note || null });
  }
  const sum = clean.reduce((s, x) => s + x.amount, 0);
  if (!clean.length || sum !== total) return json({ error: 'payment_mismatch', message: 'El total del pago debe coincidir con las cuotas seleccionadas.' }, env, 400);
  const paymentId = 'pay-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO payments (id, payer_id, receiver_id, total_amount, paid_at, status, note, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(paymentId, payerId, body.receiver_id || null, total, String(body.paid_at || today()).slice(0, 10), body.status || 'approved', body.note || null, body.source || 'manual', auth.user.id)
    .run();
  for (const a of clean) {
    await env.DB.prepare('INSERT INTO payment_allocations (id, payment_id, bill_id, user_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('alloc-' + crypto.randomUUID(), paymentId, a.billId, a.userId, a.amount, a.note)
      .run();
    await env.DB.prepare('UPDATE bill_participants SET paid_amount = CASE WHEN paid_amount + ? > share_amount THEN share_amount ELSE paid_amount + ? END WHERE bill_id = ? AND user_id = ?')
      .bind(a.amount, a.amount, a.billId, a.userId)
      .run();
  }
  await updateBillStates(env, clean.map((a) => a.billId));
  return json({ ok: true, payment: await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first() }, env, 201);
}
async function updateBillStates(env, ids) {
  for (const id of [...new Set(ids)]) {
    const row = await env.DB.prepare('SELECT SUM(share_amount) total, SUM(paid_amount) paid FROM bill_participants WHERE bill_id = ?').bind(id).first();
    const bill = await env.DB.prepare('SELECT service_month, due_date FROM bills WHERE id = ?').bind(id).first();
    const total = Number(row?.total || 0), paid = Number(row?.paid || 0);
    const due = bill?.due_date || dueDate(bill?.service_month);
    const status = paid >= total ? 'paid' : paid > 0 ? 'partial' : (due && today() > due ? 'overdue' : 'open');
    await env.DB.prepare('UPDATE bills SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), id).run();
    await env.DB.prepare("UPDATE bill_participants SET status = CASE WHEN paid_amount >= share_amount THEN 'paid' WHEN paid_amount > 0 THEN 'partial' ELSE 'pending' END WHERE bill_id = ?").bind(id).run();
  }
}
function dueDate(month) { const raw = String(month || '').slice(0, 7); if (!raw.includes('-')) return null; const [y, m] = raw.split('-').map(Number); return new Date(Date.UTC(y, m, 5)).toISOString().slice(0, 10); }
async function requireSession(request, env) { const raw = (request.headers.get('authorization') || '').replace('Bearer ', ''); if (!raw) return { error: 'missing_session', message: 'Falta iniciar sesión.', status: 401 }; const dig = await digest(raw); const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(dig).first(); if (!session) return { error: 'invalid_session', message: 'Sesión inválida.', status: 401 }; const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first(); if (!user || user.status === 'revoked') return { error: 'session_revoked', message: 'Sesión revocada.', status: 401 }; return { session, user }; }
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function toInt(value) { return Math.max(0, Math.round(Number(String(value || 0).replace(/[^0-9.-]/g, '')) || 0)); }
function today() { return new Date().toISOString().slice(0, 10); }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
