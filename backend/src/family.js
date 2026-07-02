export async function listCategories(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY name').all();
  return json({ categories: results }, env);
}

export async function createCategory(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  if (auth.user.role !== 'owner') return json({ error: 'owner_required', message: 'Solo el owner puede crear categorias.' }, env, 403);
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  if (name.length < 2) return json({ error: 'invalid_name', message: 'Nombre de categoria invalido.' }, env, 400);
  const id = 'cat-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO categories (id, name, kind, color, icon) VALUES (?, ?, ?, ?, ?)')
    .bind(id, name, body.kind || 'expense', body.color || null, body.icon || null)
    .run();
  return json({ ok: true, category: await getCategory(env, id) }, env, 201);
}

export async function listBills(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const month = url.searchParams.get('month');
  let sql = `SELECT b.*, c.name AS category_name, c.icon AS category_icon FROM bills b JOIN categories c ON c.id = b.category_id WHERE 1=1`;
  const binds = [];
  if (status) { sql += ' AND b.status = ?'; binds.push(status); }
  if (month) { sql += ' AND substr(b.bill_date,1,7) = ?'; binds.push(month); }
  sql += ' ORDER BY b.bill_date DESC, b.created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ bills: results }, env);
}

export async function createBill(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const title = String(body.title || '').trim();
  const categoryId = String(body.category_id || '').trim();
  const total = toInt(body.total_amount);
  const billDate = String(body.bill_date || today()).slice(0, 10);
  const participants = Array.isArray(body.participants) ? body.participants : [];
  if (!title || !categoryId || total <= 0) return json({ error: 'invalid_bill', message: 'Faltan datos de la cuenta.' }, env, 400);
  if (!participants.length) return json({ error: 'participants_required', message: 'Selecciona al menos un participante.' }, env, 400);
  const billId = 'bill-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO bills (id, category_id, title, description, total_amount, bill_date, due_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(billId, categoryId, title, body.description || null, total, billDate, body.due_date || null, 'open', auth.user.id)
    .run();
  for (const p of participants) {
    const userId = String(p.user_id || '').trim();
    const share = toInt(p.share_amount);
    if (userId && share > 0) {
      await env.DB.prepare('INSERT INTO bill_participants (bill_id, user_id, share_amount) VALUES (?, ?, ?)')
        .bind(billId, userId, share)
        .run();
    }
  }
  return json({ ok: true, bill: await getBill(env, billId) }, env, 201);
}

export async function updateBillStatus(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = new URL(request.url).pathname.split('/')[2];
  const { status } = await readJson(request);
  const allowed = ['open', 'partial', 'paid', 'overdue', 'cancelled'];
  if (!allowed.includes(status)) return json({ error: 'invalid_status', message: 'Estado invalido.' }, env, 400);
  await env.DB.prepare('UPDATE bills SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), id)
    .run();
  return json({ ok: true, bill: await getBill(env, id) }, env);
}

export async function listPayments(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare(`SELECT p.*, payer.name AS payer_name, receiver.name AS receiver_name FROM payments p JOIN users payer ON payer.id = p.payer_id LEFT JOIN users receiver ON receiver.id = p.receiver_id ORDER BY p.paid_at DESC, p.created_at DESC LIMIT 200`).all();
  return json({ payments: results }, env);
}

export async function createPayment(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const total = toInt(body.total_amount);
  const payerId = String(body.payer_id || auth.user.id).trim();
  if (total <= 0 || !payerId) return json({ error: 'invalid_payment', message: 'Pago invalido.' }, env, 400);
  const paymentId = 'pay-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO payments (id, payer_id, receiver_id, total_amount, paid_at, status, note, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(paymentId, payerId, body.receiver_id || null, total, String(body.paid_at || today()).slice(0, 10), body.status || 'pending_review', body.note || null, body.source || 'manual', auth.user.id)
    .run();
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  for (const a of allocations) {
    const billId = String(a.bill_id || '').trim();
    const userId = String(a.user_id || payerId).trim();
    const amount = toInt(a.amount);
    if (billId && userId && amount > 0) {
      await env.DB.prepare('INSERT INTO payment_allocations (id, payment_id, bill_id, user_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)')
        .bind('alloc-' + crypto.randomUUID(), paymentId, billId, userId, amount, a.note || null)
        .run();
    }
  }
  return json({ ok: true, payment: await getPayment(env, paymentId) }, env, 201);
}

export async function createReceipt(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const id = 'rec-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO receipts (id, uploaded_by, source, status, file_name, file_type, raw_text, detected_amount, detected_date, detected_sender, detected_receiver, detected_category, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, auth.user.id, body.source || 'manual_upload', 'pending_review', body.file_name || null, body.file_type || null, body.raw_text || null, toInt(body.detected_amount) || null, body.detected_date || null, body.detected_sender || null, body.detected_receiver || null, body.detected_category || null, body.confidence || null)
    .run();
  return json({ ok: true, receipt: await getReceipt(env, id) }, env, 201);
}

export async function listReceipts(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare('SELECT r.*, u.name AS uploaded_by_name FROM receipts r JOIN users u ON u.id = r.uploaded_by ORDER BY r.created_at DESC LIMIT 100').all();
  return json({ receipts: results }, env);
}

export async function dashboard(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const monthly = await env.DB.prepare(`SELECT substr(bill_date,1,7) AS month, SUM(total_amount) AS total FROM bills WHERE status != 'cancelled' GROUP BY month ORDER BY month`).all();
  const byCategory = await env.DB.prepare(`SELECT c.name, c.icon, SUM(b.total_amount) AS total FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.status != 'cancelled' GROUP BY c.id, c.name, c.icon ORDER BY total DESC`).all();
  const pendingByUser = await env.DB.prepare(`SELECT u.id, u.name, u.email, SUM(bp.share_amount - bp.paid_amount) AS pending FROM bill_participants bp JOIN users u ON u.id = bp.user_id WHERE bp.status != 'paid' GROUP BY u.id, u.name, u.email ORDER BY pending DESC`).all();
  const curves = await env.DB.prepare(`SELECT substr(b.bill_date,1,7) AS month, c.name AS category, SUM(b.total_amount) AS total FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.status != 'cancelled' GROUP BY month, c.name ORDER BY month, c.name`).all();
  return json({ monthly: monthly.results, by_category: byCategory.results, pending_by_user: pendingByUser.results, curves: curves.results }, env);
}

async function getCategory(env, id) { return env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first(); }
async function getBill(env, id) { return env.DB.prepare('SELECT b.*, c.name AS category_name FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.id = ?').bind(id).first(); }
async function getPayment(env, id) { return env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first(); }
async function getReceipt(env, id) { return env.DB.prepare('SELECT * FROM receipts WHERE id = ?').bind(id).first(); }

async function requireSession(request, env) {
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw) return { error: 'missing_session', message: 'Falta iniciar sesion.', status: 401 };
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(await digest(raw)).first();
  if (!session) return { error: 'invalid_session', message: 'Sesion invalida.', status: 401 };
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.status === 'revoked') return { error: 'session_revoked', message: 'Sesion revocada.', status: 401 };
  return { session, user };
}

async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function toInt(value) { return Math.max(0, Math.round(Number(String(value || 0).replace(/[^0-9.-]/g, '')) || 0)); }
function today() { return new Date().toISOString().slice(0, 10); }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
