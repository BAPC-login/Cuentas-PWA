import { assertMonthOpen, firstClosedMonth, monthClosedPayload } from './month_lock.js';

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
    .bind(id, name, body.kind || 'expense', body.color || '#38bdf8', body.icon || '🏷️')
    .run();
  return json({ ok: true, category: await getCategory(env, id) }, env, 201);
}

export async function listBills(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const month = url.searchParams.get('month');
  let sql = `SELECT b.*, c.name AS category_name, c.icon AS category_icon, o.title AS operation_title FROM bills b JOIN categories c ON c.id = b.category_id LEFT JOIN operations o ON o.id = b.operation_id WHERE 1=1`;
  const binds = [];
  if (status) { sql += ' AND b.status = ?'; binds.push(status); }
  if (month) { sql += ' AND COALESCE(b.service_month, substr(b.bill_date,1,7)) = ?'; binds.push(month); }
  sql += ' ORDER BY COALESCE(b.service_month, substr(b.bill_date,1,7)) DESC, b.bill_date DESC, b.created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ bills: results }, env);
}

export async function getBillDetails(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = pathPart(request, 1);
  const bill = await getBill(env, id);
  if (!bill) return json({ error: 'bill_not_found', message: 'Cuenta no encontrada.' }, env, 404);
  const participants = await getBillParticipants(env, id);
  return json({ bill, participants }, env);
}

export async function createBill(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const result = await createBillRecord(env, auth.user, body);
  if (result.error) return json(result, env, result.status || 400);
  return json({ ok: true, bill: result.bill }, env, 201);
}

async function createBillRecord(env, user, body) {
  const title = String(body.title || '').trim();
  const categoryId = String(body.category_id || '').trim();
  const total = toInt(body.total_amount);
  const billDate = String(body.bill_date || today()).slice(0, 10);
  const serviceMonth = normalizeMonth(body.service_month || billDate.slice(0, 7));
  const operationId = String(body.operation_id || '').trim() || null;
  const participants = normalizeParticipants(body.participants, total);
  if (!title || !categoryId || total <= 0) return { error: 'invalid_bill', message: 'Faltan datos de la cuenta.', status: 400 };
  if (!participants.length) return { error: 'participants_required', message: 'Selecciona al menos un participante.', status: 400 };
  const locked = await assertMonthOpen(env, serviceMonth);
  if (locked) return locked;
  const shareSum = participants.reduce((sum, p) => sum + toInt(p.share_amount), 0);
  if (shareSum !== total) return { error: 'invalid_shares', message: 'La suma de participantes debe ser igual al total.', status: 400 };
  const billId = 'bill-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO bills (id, category_id, title, description, total_amount, bill_date, due_date, service_month, operation_id, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(billId, categoryId, title, body.description || null, total, billDate, body.due_date || null, serviceMonth, operationId, body.status || 'open', user.id)
    .run();
  await replaceBillParticipants(env, billId, participants);
  return { bill: await getBill(env, billId) };
}

export async function updateBillParticipants(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = pathPart(request, 1);
  const bill = await getBill(env, id);
  if (!bill) return json({ error: 'bill_not_found', message: 'Cuenta no encontrada.' }, env, 404);
  const body = await readJson(request);
  const targetMonth = normalizeMonth(body.service_month || bill.service_month || bill.bill_date);
  const lockedMonth = await firstClosedMonth(env, [billMonth(bill), targetMonth]);
  if (lockedMonth) return json(monthClosedPayload(lockedMonth), env, 423);
  const total = toInt(body.total_amount || bill.total_amount);
  const participants = normalizeParticipants(body.participants, total);
  const shareSum = participants.reduce((sum, p) => sum + toInt(p.share_amount), 0);
  if (!participants.length || shareSum !== total) return json({ error: 'invalid_shares', message: 'La suma de participantes debe ser igual al total.' }, env, 400);
  await env.DB.prepare('UPDATE bills SET category_id = ?, title = ?, description = ?, total_amount = ?, bill_date = ?, due_date = ?, service_month = ?, operation_id = ?, updated_at = ? WHERE id = ?')
    .bind(body.category_id || bill.category_id, body.title || bill.title, body.description ?? bill.description, total, String(body.bill_date || bill.bill_date).slice(0, 10), body.due_date || bill.due_date || null, targetMonth, body.operation_id || bill.operation_id || null, new Date().toISOString(), id)
    .run();
  await replaceBillParticipants(env, id, participants);
  await refreshBillStatuses(env, [id]);
  return json({ ok: true, bill: await getBill(env, id), participants: await getBillParticipants(env, id) }, env);
}

async function replaceBillParticipants(env, billId, participants) {
  await env.DB.prepare('DELETE FROM bill_participants WHERE bill_id = ?').bind(billId).run();
  for (const p of participants) {
    const userId = String(p.user_id || '').trim();
    const share = toInt(p.share_amount);
    const paid = Math.min(share, toInt(p.paid_amount));
    if (userId && share > 0) {
      await env.DB.prepare('INSERT INTO bill_participants (bill_id, user_id, share_amount, paid_amount, status) VALUES (?, ?, ?, ?, ?)')
        .bind(billId, userId, share, paid, paid >= share ? 'paid' : paid > 0 ? 'partial' : 'pending')
        .run();
    }
  }
}

export async function updateBillStatus(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = pathPart(request, 1);
  const bill = await getBill(env, id);
  if (!bill) return json({ error: 'bill_not_found', message: 'Cuenta no encontrada.' }, env, 404);
  const locked = await assertMonthOpen(env, billMonth(bill));
  if (locked) return json(locked, env, locked.status);
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
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  const lockedMonth = await firstClosedAllocatedBillMonth(env, allocations);
  if (lockedMonth) return json(monthClosedPayload(lockedMonth), env, 423);
  if (total <= 0 || !payerId) return json({ error: 'invalid_payment', message: 'Pago invalido.' }, env, 400);
  const paymentId = 'pay-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO payments (id, payer_id, receiver_id, total_amount, paid_at, status, note, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(paymentId, payerId, body.receiver_id || null, total, String(body.paid_at || today()).slice(0, 10), body.status || 'pending_review', body.note || null, body.source || 'manual', auth.user.id)
    .run();
  for (const a of allocations) {
    const billId = String(a.bill_id || '').trim();
    const userId = String(a.user_id || payerId).trim();
    const amount = toInt(a.amount);
    if (billId && userId && amount > 0) {
      await env.DB.prepare('INSERT INTO payment_allocations (id, payment_id, bill_id, user_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)')
        .bind('alloc-' + crypto.randomUUID(), paymentId, billId, userId, amount, a.note || null)
        .run();
      await env.DB.prepare('UPDATE bill_participants SET paid_amount = paid_amount + ? WHERE bill_id = ? AND user_id = ?')
        .bind(amount, billId, userId)
        .run();
    }
  }
  await refreshBillStatuses(env, allocations.map((a) => String(a.bill_id || '')).filter(Boolean));
  return json({ ok: true, payment: await getPayment(env, paymentId) }, env, 201);
}

export async function createReceipt(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const id = 'rec-' + crypto.randomUUID();
  const detectedDate = body.detected_date || today();
  const serviceMonth = normalizeMonth(body.service_month || String(detectedDate).slice(0, 7));
  await env.DB.prepare('INSERT INTO receipts (id, uploaded_by, source, status, file_name, file_type, raw_text, detected_amount, detected_date, service_month, detected_sender, detected_receiver, detected_category, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, auth.user.id, body.source || 'manual_upload', 'pending_review', body.file_name || null, body.file_type || null, body.raw_text || null, toInt(body.detected_amount) || null, detectedDate || null, serviceMonth, body.detected_sender || null, body.detected_receiver || null, body.detected_category || null, body.confidence || null)
    .run();
  return json({ ok: true, receipt: await getReceipt(env, id) }, env, 201);
}

export async function listReceipts(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  let sql = 'SELECT r.*, u.name AS uploaded_by_name FROM receipts r JOIN users u ON u.id = r.uploaded_by';
  const binds = [];
  if (status) { sql += ' WHERE r.status = ?'; binds.push(status); }
  sql += ' ORDER BY r.created_at DESC LIMIT 100';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ receipts: results }, env);
}

export async function approveReceipt(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const receiptId = pathPart(request, 1);
  const receipt = await getReceipt(env, receiptId);
  if (!receipt) return json({ error: 'receipt_not_found', message: 'Comprobante no encontrado.' }, env, 404);
  const body = await readJson(request);
  const amount = body.total_amount || receipt.detected_amount;
  const billBody = {
    category_id: body.category_id,
    title: body.title || receipt.file_name || 'Comprobante aprobado',
    description: body.description || receipt.raw_text || null,
    total_amount: amount,
    bill_date: body.bill_date || receipt.detected_date || today(),
    service_month: body.service_month || receipt.service_month || String(receipt.detected_date || today()).slice(0, 7),
    operation_id: body.operation_id || null,
    participants: body.participants || [{ user_id: auth.user.id, share_amount: amount }],
  };
  const result = await createBillRecord(env, auth.user, billBody);
  if (result.error) return json(result, env, result.status || 400);
  await env.DB.prepare('UPDATE receipts SET status = ?, reviewed_by = ?, reviewed_at = ?, service_month = ?, bill_id = ? WHERE id = ?')
    .bind('approved', auth.user.id, new Date().toISOString(), billBody.service_month, result.bill.id, receiptId)
    .run();
  return json({ ok: true, receipt: await getReceipt(env, receiptId), bill: result.bill }, env);
}

export async function rejectReceipt(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const receiptId = pathPart(request, 1);
  const receipt = await getReceipt(env, receiptId);
  if (!receipt) return json({ error: 'receipt_not_found', message: 'Comprobante no encontrado.' }, env, 404);
  await env.DB.prepare('UPDATE receipts SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
    .bind('rejected', auth.user.id, new Date().toISOString(), receiptId)
    .run();
  return json({ ok: true, receipt: await getReceipt(env, receiptId) }, env);
}

export async function listDebts(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.name, u.email,
           SUM(bp.share_amount) AS total_assigned,
           SUM(bp.paid_amount) AS total_paid,
           SUM(bp.share_amount - bp.paid_amount) AS pending
    FROM bill_participants bp
    JOIN bills b ON b.id = bp.bill_id
    JOIN users u ON u.id = bp.user_id
    WHERE b.status != 'cancelled'
    GROUP BY u.id, u.name, u.email
    ORDER BY pending DESC
  `).all();
  const receiver = await env.DB.prepare('SELECT id, name, email FROM users WHERE role = ? ORDER BY created_at LIMIT 1').bind('owner').first();
  return json({ receiver, debts: results.map((r) => ({ ...r, owes_to: receiver })) }, env);
}

export async function dashboard(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const monthly = await env.DB.prepare(`SELECT COALESCE(service_month, substr(bill_date,1,7)) AS month, SUM(total_amount) AS total FROM bills WHERE status != 'cancelled' GROUP BY month ORDER BY month`).all();
  const byCategory = await env.DB.prepare(`SELECT c.name, c.icon, SUM(b.total_amount) AS total FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.status != 'cancelled' GROUP BY c.id, c.name, c.icon ORDER BY total DESC`).all();
  const pendingByUser = await env.DB.prepare(`SELECT u.id, u.name, u.email, SUM(bp.share_amount - bp.paid_amount) AS pending FROM bill_participants bp JOIN bills b ON b.id = bp.bill_id JOIN users u ON u.id = bp.user_id WHERE bp.status != 'paid' AND b.status != 'cancelled' GROUP BY u.id, u.name, u.email HAVING pending > 0 ORDER BY pending DESC`).all();
  const curves = await env.DB.prepare(`SELECT COALESCE(b.service_month, substr(b.bill_date,1,7)) AS month, c.name AS category, SUM(b.total_amount) AS total FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.status != 'cancelled' GROUP BY month, c.name ORDER BY month, c.name`).all();
  return json({ monthly: monthly.results, by_category: byCategory.results, pending_by_user: pendingByUser.results, curves: curves.results }, env);
}

export async function listOperations(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare(`
    SELECT o.*, c.name AS category_name, c.icon AS category_icon, COALESCE(SUM(b.total_amount),0) AS total_amount, COUNT(b.id) AS item_count
    FROM operations o
    JOIN categories c ON c.id = o.category_id
    LEFT JOIN bills b ON b.operation_id = o.id AND b.status != 'cancelled'
    GROUP BY o.id
    ORDER BY o.expense_date DESC, o.created_at DESC
  `).all();
  return json({ operations: results }, env);
}

export async function getOperationDetails(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = pathPart(request, 1);
  const operation = await getOperation(env, id);
  if (!operation) return json({ error: 'operation_not_found', message: 'Operacion no encontrada.' }, env, 404);
  const bills = await env.DB.prepare('SELECT b.*, c.name AS category_name, c.icon AS category_icon FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.operation_id = ? ORDER BY b.bill_date, b.created_at').bind(id).all();
  return json({ operation, bills: bills.results }, env);
}

export async function createOperation(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const title = String(body.title || '').trim();
  const categoryId = String(body.category_id || '').trim();
  const serviceMonth = normalizeMonth(body.service_month || today().slice(0, 7));
  if (!title || !categoryId) return json({ error: 'invalid_operation', message: 'Falta titulo o categoria.' }, env, 400);
  const locked = await assertMonthOpen(env, serviceMonth);
  if (locked) return json(locked, env, locked.status);
  const id = 'op-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO operations (id, title, description, category_id, service_month, expense_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, title, body.description || null, categoryId, serviceMonth, String(body.expense_date || today()).slice(0, 10), body.status || 'open', auth.user.id)
    .run();
  return json({ ok: true, operation: await getOperation(env, id) }, env, 201);
}

export async function updateOperation(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = pathPart(request, 1);
  const operation = await getOperation(env, id);
  if (!operation) return json({ error: 'operation_not_found', message: 'Operacion no encontrada.' }, env, 404);
  const body = await readJson(request);
  const targetMonth = normalizeMonth(body.service_month || operation.service_month || operation.expense_date);
  const lockedMonth = await firstClosedMonth(env, [operationMonth(operation), targetMonth]);
  if (lockedMonth) return json(monthClosedPayload(lockedMonth), env, 423);
  await env.DB.prepare('UPDATE operations SET title = ?, description = ?, category_id = ?, service_month = ?, expense_date = ?, status = ?, updated_at = ? WHERE id = ?')
    .bind(body.title || operation.title, body.description ?? operation.description, body.category_id || operation.category_id, targetMonth, String(body.expense_date || operation.expense_date).slice(0, 10), body.status || operation.status, new Date().toISOString(), id)
    .run();
  return json({ ok: true, operation: await getOperation(env, id) }, env);
}

async function refreshBillStatuses(env, billIds) {
  for (const id of [...new Set(billIds)]) {
    const summary = await env.DB.prepare('SELECT SUM(share_amount) AS total, SUM(paid_amount) AS paid FROM bill_participants WHERE bill_id = ?').bind(id).first();
    if (!summary) continue;
    const total = Number(summary.total || 0);
    const paid = Number(summary.paid || 0);
    const status = paid <= 0 ? 'open' : paid >= total ? 'paid' : 'partial';
    await env.DB.prepare('UPDATE bills SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), id).run();
    await env.DB.prepare("UPDATE bill_participants SET status = CASE WHEN paid_amount >= share_amount THEN 'paid' WHEN paid_amount > 0 THEN 'partial' ELSE 'pending' END WHERE bill_id = ?").bind(id).run();
  }
}

async function firstClosedAllocatedBillMonth(env, allocations) {
  const billIds = [...new Set((allocations || []).map((a) => String(a.bill_id || '').trim()).filter(Boolean))];
  const months = [];
  for (const id of billIds) {
    const bill = await env.DB.prepare('SELECT service_month, bill_date FROM bills WHERE id = ?').bind(id).first();
    if (bill) months.push(billMonth(bill));
  }
  return firstClosedMonth(env, months);
}

function normalizeParticipants(participants, total) {
  const list = Array.isArray(participants) ? participants : [];
  return list.map((p) => {
    const pct = Number(p.share_percent || 0);
    const amount = pct > 0 ? Math.round(total * pct / 100) : toInt(p.share_amount);
    return { user_id: String(p.user_id || '').trim(), share_amount: amount, paid_amount: toInt(p.paid_amount) };
  }).filter((p) => p.user_id && p.share_amount > 0);
}

async function getCategory(env, id) { return env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first(); }
async function getBill(env, id) { return env.DB.prepare('SELECT b.*, c.name AS category_name, c.icon AS category_icon, o.title AS operation_title FROM bills b JOIN categories c ON c.id = b.category_id LEFT JOIN operations o ON o.id = b.operation_id WHERE b.id = ?').bind(id).first(); }
async function getBillParticipants(env, id) { const { results } = await env.DB.prepare('SELECT bp.*, u.name, u.email FROM bill_participants bp JOIN users u ON u.id = bp.user_id WHERE bp.bill_id = ? ORDER BY u.name, u.email').bind(id).all(); return results; }
async function getPayment(env, id) { return env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first(); }
async function getReceipt(env, id) { return env.DB.prepare('SELECT * FROM receipts WHERE id = ?').bind(id).first(); }
async function getOperation(env, id) { return env.DB.prepare('SELECT o.*, c.name AS category_name, c.icon AS category_icon FROM operations o JOIN categories c ON c.id = o.category_id WHERE o.id = ?').bind(id).first(); }

async function requireSession(request, env) {
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw) return { error: 'missing_session', message: 'Falta iniciar sesion.', status: 401 };
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(await digest(raw)).first();
  if (!session) return { error: 'invalid_session', message: 'Sesion invalida.', status: 401 };
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.status === 'revoked') return { error: 'session_revoked', message: 'Sesion revocada.', status: 401 };
  return { session, user };
}

function billMonth(bill) { return normalizeMonth(bill?.service_month || bill?.bill_date || today()); }
function operationMonth(operation) { return normalizeMonth(operation?.service_month || operation?.expense_date || today()); }
function pathPart(request, index) { return new URL(request.url).pathname.split('/').filter(Boolean)[index]; }
function normalizeMonth(value) { const raw = String(value || '').slice(0, 7); return /^\d{4}-\d{2}$/.test(raw) ? raw : today().slice(0, 7); }
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function toInt(value) { return Math.max(0, Math.round(Number(String(value || 0).replace(/[^0-9.-]/g, '')) || 0)); }
function today() { return new Date().toISOString().slice(0, 10); }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
