import { assertMonthOpen } from './month_lock.js';

export async function listActiveUsers(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare('SELECT id, email, name, avatar_url, role, status FROM users WHERE status != ? ORDER BY role = ? DESC, name, email').bind('revoked', 'owner').all();
  return json({ users: results }, env);
}

export async function createBillExtended(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const result = await createBillRecord(env, auth.user, body);
  if (result.error) return json(result, env, result.status || 400);
  await notifyParticipants(env, result.bill.id, 'Nuevo gasto agregado', `${displayName(auth.user)} agregó un gasto: ${result.bill.title} por ${money(result.bill.total_amount)}.`);
  return json({ ok: true, bill: result.bill }, env, 201);
}

export async function createReceiptExtended(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const id = 'rec-' + crypto.randomUUID();
  const detectedDate = body.detected_date || today();
  const serviceMonth = normalizeMonth(body.service_month || String(detectedDate).slice(0, 7));
  await env.DB.prepare('INSERT INTO receipts (id, uploaded_by, source, status, file_name, file_type, raw_text, detected_amount, detected_date, service_month, detected_sender, detected_receiver, detected_category, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, auth.user.id, body.source || 'manual_upload', body.status || 'pending_review', body.file_name || null, body.file_type || null, body.raw_text || null, toInt(body.detected_amount) || null, detectedDate || null, serviceMonth, body.detected_sender || null, body.detected_receiver || null, body.detected_category || null, body.confidence || null)
    .run();
  await notifyOwnerAndActiveUsers(env, 'Nuevo comprobante pendiente', `${displayName(auth.user)} subió un comprobante para revisar: ${body.file_name || 'Comprobante'}.`);
  return json({ ok: true, receipt: await getReceipt(env, id) }, env, 201);
}

export async function deleteBillExtended(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = pathPart(request, 1);
  const bill = await getBill(env, id);
  if (!bill) return json({ error: 'bill_not_found', message: 'Gasto no encontrado.' }, env, 404);
  const locked = await assertMonthOpen(env, billMonth(bill));
  if (locked) return json(locked, env, locked.status);
  if (auth.user.role !== 'owner' && bill.created_by !== auth.user.id && bill.paid_by_user_id !== auth.user.id) return json({ error: 'not_allowed', message: 'Solo el owner, creador o pagador puede eliminar este gasto.' }, env, 403);
  await env.DB.prepare('DELETE FROM payment_allocations WHERE bill_id = ?').bind(id).run();
  await env.DB.prepare('UPDATE receipts SET status = ?, bill_id = NULL WHERE bill_id = ?').bind('pending_review', id).run().catch(() => null);
  await env.DB.prepare('DELETE FROM bill_participants WHERE bill_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM bills WHERE id = ?').bind(id).run();
  await notifyOwnerAndActiveUsers(env, 'Gasto eliminado', `${displayName(auth.user)} eliminó el gasto: ${bill.title}.`);
  return json({ ok: true, deleted_id: id }, env);
}

export async function listDebtsDetailed(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare(`
    SELECT
      debtor.id AS debtor_id,
      debtor.name AS debtor_name,
      debtor.email AS debtor_email,
      receiver.id AS receiver_id,
      receiver.name AS receiver_name,
      receiver.email AS receiver_email,
      SUM(bp.share_amount) AS total_assigned,
      SUM(bp.paid_amount) AS total_paid,
      SUM(bp.share_amount - bp.paid_amount) AS pending
    FROM bill_participants bp
    JOIN bills b ON b.id = bp.bill_id
    JOIN users debtor ON debtor.id = bp.user_id
    LEFT JOIN users receiver ON receiver.id = COALESCE(b.paid_by_user_id, b.created_by)
    WHERE b.status != 'cancelled'
      AND (bp.share_amount - bp.paid_amount) > 0
      AND debtor.id != COALESCE(b.paid_by_user_id, b.created_by)
    GROUP BY debtor.id, debtor.name, debtor.email, receiver.id, receiver.name, receiver.email
    ORDER BY pending DESC
  `).all();
  return json({ debts: results }, env);
}

async function createBillRecord(env, user, body) {
  const title = String(body.title || '').trim();
  const categoryId = String(body.category_id || '').trim();
  const total = toInt(body.total_amount);
  const billDate = String(body.bill_date || today()).slice(0, 10);
  const serviceMonth = normalizeMonth(body.service_month || billDate.slice(0, 7));
  const operationId = String(body.operation_id || '').trim() || null;
  const paidBy = String(body.paid_by_user_id || user.id).trim();
  const participants = normalizeParticipants(body.participants, total);
  if (!title || !categoryId || total <= 0) return { error: 'invalid_bill', message: 'Faltan datos del gasto.', status: 400 };
  if (!participants.length) return { error: 'participants_required', message: 'Selecciona al menos un participante.', status: 400 };
  const locked = await assertMonthOpen(env, serviceMonth);
  if (locked) return locked;
  const shareSum = participants.reduce((sum, p) => sum + toInt(p.share_amount), 0);
  if (shareSum !== total) return { error: 'invalid_shares', message: 'La suma de participantes debe ser igual al total.', status: 400 };
  const billId = 'bill-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO bills (id, category_id, title, description, total_amount, bill_date, due_date, service_month, operation_id, paid_by_user_id, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(billId, categoryId, title, body.description || null, total, billDate, body.due_date || null, serviceMonth, operationId, paidBy, body.status || 'open', user.id)
    .run();
  await replaceBillParticipants(env, billId, participants);
  return { bill: await getBill(env, billId) };
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

async function notifyParticipants(env, billId, subject, message) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT u.email, u.name FROM bill_participants bp JOIN users u ON u.id = bp.user_id WHERE bp.bill_id = ? AND u.status != 'revoked'`).bind(billId).all();
  await sendNotificationEmails(env, results, subject, message);
}

async function notifyOwnerAndActiveUsers(env, subject, message) {
  const { results } = await env.DB.prepare(`SELECT email, name FROM users WHERE status != 'revoked'`).all();
  await sendNotificationEmails(env, results, subject, message);
}

async function sendNotificationEmails(env, users, subject, message) {
  if (!env.EMAIL_RELAY_URL || !env.EMAIL_RELAY_SECRET) return;
  const unique = [...new Map((users || []).filter((u) => u.email).map((u) => [u.email, u])).values()];
  for (const u of unique) {
    try {
      const form = new URLSearchParams({ secret: env.EMAIL_RELAY_SECRET, to: u.email, subject, message, appName: 'Cuentas Hogar' });
      await fetch(env.EMAIL_RELAY_URL, { method: 'POST', body: form });
    } catch {}
  }
}

async function requireSession(request, env) {
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw) return { error: 'missing_session', message: 'Falta iniciar sesion.', status: 401 };
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(await digest(raw)).first();
  if (!session) return { error: 'invalid_session', message: 'Sesion invalida.', status: 401 };
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.status === 'revoked') return { error: 'session_revoked', message: 'Sesion revocada.', status: 401 };
  return { session, user };
}

async function getBill(env, id) { return env.DB.prepare('SELECT b.*, c.name AS category_name, c.icon AS category_icon FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.id = ?').bind(id).first(); }
async function getReceipt(env, id) { return env.DB.prepare('SELECT * FROM receipts WHERE id = ?').bind(id).first(); }
function billMonth(bill) { return normalizeMonth(bill?.service_month || bill?.bill_date || today()); }
function normalizeParticipants(participants, total) { return (Array.isArray(participants) ? participants : []).map((p) => ({ user_id: String(p.user_id || '').trim(), share_amount: Number(p.share_percent || 0) > 0 ? Math.round(total * Number(p.share_percent) / 100) : toInt(p.share_amount), paid_amount: toInt(p.paid_amount) })).filter((p) => p.user_id && p.share_amount > 0); }
function displayName(user) { return user?.name || user?.email || 'Un usuario'; }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function pathPart(request, index) { return new URL(request.url).pathname.split('/').filter(Boolean)[index]; }
function normalizeMonth(value) { const raw = String(value || '').slice(0, 7); return /^\d{4}-\d{2}$/.test(raw) ? raw : today().slice(0, 7); }
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function toInt(value) { return Math.max(0, Math.round(Number(String(value || 0).replace(/[^0-9.-]/g, '')) || 0)); }
function today() { return new Date().toISOString().slice(0, 10); }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
