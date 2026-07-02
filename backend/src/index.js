import { listCategories, createCategory, listBills, getBillDetails, createBill, updateBillParticipants, updateBillStatus, listPayments, createPayment, listReceipts, createReceipt, approveReceipt, rejectReceipt, listDebts, dashboard, listOperations, getOperationDetails, createOperation, updateOperation } from './family.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(null, env);

    try {
      if (url.pathname === '/health') return json({ ok: true, emailRelay: Boolean(env.EMAIL_RELAY_URL), resend: Boolean(env.RESEND_API_KEY) }, env);
      if (url.pathname === '/auth/request-code' && request.method === 'POST') return requestCode(request, env);
      if (url.pathname === '/auth/verify-code' && request.method === 'POST') return verifyCode(request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') return logout(request, env);
      if (url.pathname === '/me' && request.method === 'GET') return me(request, env);
      if (url.pathname === '/me/profile' && request.method === 'PATCH') return updateMyProfile(request, env);
      if (url.pathname === '/owner/users' && request.method === 'GET') return listUsers(request, env);
      if (url.pathname === '/owner/users' && request.method === 'POST') return createUser(request, env);
      if (url.pathname.match(/^\/owner\/users\/[^/]+\/revoke$/) && request.method === 'PATCH') return setUserStatus(request, env, 'revoked');
      if (url.pathname.match(/^\/owner\/users\/[^/]+\/reactivate$/) && request.method === 'PATCH') return setUserStatus(request, env, 'pending');
      if (url.pathname === '/categories' && request.method === 'GET') return listCategories(request, env);
      if (url.pathname === '/categories' && request.method === 'POST') return createCategory(request, env);
      if (url.pathname === '/bills' && request.method === 'GET') return listBills(request, env);
      if (url.pathname === '/bills' && request.method === 'POST') return createBill(request, env);
      if (url.pathname.match(/^\/bills\/[^/]+$/) && request.method === 'GET') return getBillDetails(request, env);
      if (url.pathname.match(/^\/bills\/[^/]+$/) && request.method === 'PATCH') return updateBillParticipants(request, env);
      if (url.pathname.match(/^\/bills\/[^/]+\/status$/) && request.method === 'PATCH') return updateBillStatus(request, env);
      if (url.pathname === '/debts' && request.method === 'GET') return listDebts(request, env);
      if (url.pathname === '/operations' && request.method === 'GET') return listOperations(request, env);
      if (url.pathname === '/operations' && request.method === 'POST') return createOperation(request, env);
      if (url.pathname.match(/^\/operations\/[^/]+$/) && request.method === 'GET') return getOperationDetails(request, env);
      if (url.pathname.match(/^\/operations\/[^/]+$/) && request.method === 'PATCH') return updateOperation(request, env);
      if (url.pathname === '/payments' && request.method === 'GET') return listPayments(request, env);
      if (url.pathname === '/payments' && request.method === 'POST') return createPayment(request, env);
      if (url.pathname === '/receipts' && request.method === 'GET') return listReceipts(request, env);
      if (url.pathname === '/receipts' && request.method === 'POST') return createReceipt(request, env);
      if (url.pathname.match(/^\/receipts\/[^/]+\/approve$/) && request.method === 'POST') return approveReceipt(request, env);
      if (url.pathname.match(/^\/receipts\/[^/]+\/reject$/) && request.method === 'POST') return rejectReceipt(request, env);
      if (url.pathname === '/dashboard' && request.method === 'GET') return dashboard(request, env);
      return json({ error: 'not_found', message: 'Ruta no encontrada.' }, env, 404);
    } catch (error) {
      console.error(error);
      return json({ error: 'server_error', message: 'Error interno del servidor.' }, env, 500);
    }
  },
};

async function requestCode(request, env) {
  const { email } = await readJson(request);
  const normalizedEmail = normalizeEmail(email);
  if (!isEmail(normalizedEmail)) return json({ error: 'invalid_email', message: 'Ingresa un correo valido.' }, env, 400);
  await ensureOwner(env);
  const user = await getUserByEmail(env, normalizedEmail);
  if (!user || user.status === 'revoked') return json({ error: 'user_not_allowed', message: 'Este correo no tiene acceso o fue revocado.' }, env, 403);
  const code = createCode();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + minutes(env.CODE_TTL_MINUTES || 10)).toISOString();
  await env.DB.prepare('INSERT INTO login_codes (id, email, code_digest, expires_at) VALUES (?, ?, ?, ?)').bind(id, normalizedEmail, await digest(code), expiresAt).run();
  const delivery = await deliverLoginCode(env, normalizedEmail, code);
  if (delivery.ok) return json({ ok: true, email_sent: true, provider: delivery.provider, expires_at: expiresAt }, env);
  return json({ ok: true, email_sent: false, provider: delivery.provider || 'demo', warning: delivery.message || 'No se pudo enviar el correo. Se muestra codigo demo.', demo_code: code, expires_at: expiresAt }, env);
}

async function deliverLoginCode(env, to, code) {
  if (env.EMAIL_RELAY_URL && env.EMAIL_RELAY_SECRET) {
    const relay = await sendViaAppsScriptRelay(env, to, code);
    if (relay.ok) return relay;
    if (!env.RESEND_API_KEY) return relay;
  }
  if (env.RESEND_API_KEY) return sendViaResend(env, to, code);
  return { ok: false, provider: 'demo', message: 'No hay proveedor de correo configurado.' };
}

async function sendViaAppsScriptRelay(env, to, code) {
  try {
    const form = new URLSearchParams({ secret: env.EMAIL_RELAY_SECRET, to, code, appName: 'Cuentas Hogar' });
    const response = await fetch(env.EMAIL_RELAY_URL, { method: 'POST', body: form });
    const text = await response.text();
    if (!response.ok) return { ok: false, provider: 'apps_script', message: text.slice(0, 200) };
    try { const data = JSON.parse(text); return data.ok ? { ok: true, provider: 'apps_script' } : { ok: false, provider: 'apps_script', message: data.error || 'Apps Script rechazo el envio.' }; }
    catch { return { ok: true, provider: 'apps_script' }; }
  } catch { return { ok: false, provider: 'apps_script', message: 'No hubo conexion con Apps Script.' }; }
}

async function sendViaResend(env, to, code) {
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.RESEND_FROM || 'Cuentas Hogar <onboarding@resend.dev>', to, subject: 'Tu codigo de acceso a Cuentas Hogar', html: `<p>Tu codigo de acceso a Cuentas Hogar es:</p><h1>${code}</h1><p>Este codigo vence pronto.</p>` }) });
    if (response.ok) return { ok: true, provider: 'resend' };
    return { ok: false, provider: 'resend', message: normalizeProviderError(await response.text()) };
  } catch { return { ok: false, provider: 'resend', message: 'No hubo conexion con Resend.' }; }
}

function normalizeProviderError(detail) { if (!detail) return 'Proveedor rechazo el envio.'; try { const parsed = JSON.parse(detail); return parsed.message || parsed.error || detail.slice(0, 220); } catch { return detail.slice(0, 220); } }

async function verifyCode(request, env) {
  const { email, code, name } = await readJson(request);
  const normalizedEmail = normalizeEmail(email);
  if (!isEmail(normalizedEmail) || !String(code || '').match(/^\d{6}$/)) return json({ error: 'invalid_input', message: 'Correo o codigo invalido.' }, env, 400);
  const row = await env.DB.prepare('SELECT * FROM login_codes WHERE email = ? AND code_digest = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1').bind(normalizedEmail, await digest(String(code)), new Date().toISOString()).first();
  if (!row) return json({ error: 'invalid_or_expired_code', message: 'Codigo invalido o vencido.' }, env, 401);
  const user = await getUserByEmail(env, normalizedEmail);
  if (!user || user.status === 'revoked') return json({ error: 'user_not_allowed', message: 'Este usuario no tiene acceso.' }, env, 403);
  const displayName = String(name || user.name || '').trim();
  if (!user.name && displayName) await env.DB.prepare('UPDATE users SET name = ?, status = ?, activated_at = ? WHERE id = ?').bind(displayName, 'active', new Date().toISOString(), user.id).run();
  await env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  const session = await createSession(env, user.id, request.headers.get('user-agent') || '');
  return json({ ok: true, session, user: publicUser(await getUserById(env, user.id)) }, env);
}

async function me(request, env) { const auth = await requireSession(request, env); if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status); return json({ user: publicUser(auth.user) }, env); }
async function updateMyProfile(request, env) { const auth = await requireSession(request, env); if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status); const { name, avatar_url } = await readJson(request); const displayName = String(name || '').trim(); if (displayName.length < 2) return json({ error: 'invalid_name', message: 'El nombre debe tener al menos 2 caracteres.' }, env, 400); await env.DB.prepare('UPDATE users SET name = ?, avatar_url = ?, status = ?, activated_at = COALESCE(activated_at, ?) WHERE id = ?').bind(displayName, avatar_url || null, 'active', new Date().toISOString(), auth.user.id).run(); return json({ ok: true, user: publicUser(await getUserById(env, auth.user.id)) }, env); }
async function logout(request, env) { const auth = await requireSession(request, env); if (!auth.error) await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(new Date().toISOString(), auth.session.id).run(); return json({ ok: true }, env); }
async function listUsers(request, env) { const auth = await requireOwner(request, env); if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status); const { results } = await env.DB.prepare('SELECT id, email, name, avatar_url, role, status, created_at, activated_at, revoked_at FROM users ORDER BY created_at DESC').all(); return json({ users: results }, env); }
async function createUser(request, env) { const auth = await requireOwner(request, env); if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status); const { email, name, role } = await readJson(request); const normalizedEmail = normalizeEmail(email); if (!isEmail(normalizedEmail)) return json({ error: 'invalid_email', message: 'Ingresa un correo valido.' }, env, 400); if (await getUserByEmail(env, normalizedEmail)) return json({ error: 'email_already_exists', message: 'Ese usuario ya existe.' }, env, 409); const id = crypto.randomUUID(); const safeRole = ['member', 'viewer'].includes(role) ? role : 'member'; const displayName = String(name || '').trim(); await env.DB.prepare('INSERT INTO users (id, email, name, role, status, activated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, normalizedEmail, displayName || null, safeRole, displayName ? 'active' : 'pending', displayName ? new Date().toISOString() : null).run(); return json({ ok: true, user: publicUser(await getUserById(env, id)) }, env, 201); }
async function setUserStatus(request, env, status) { const auth = await requireOwner(request, env); if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status); const id = new URL(request.url).pathname.split('/')[3]; if (id === auth.user.id) return json({ error: 'cannot_modify_owner_session', message: 'No puedes revocar tu propio owner.' }, env, 400); const user = await getUserById(env, id); if (!user) return json({ error: 'user_not_found', message: 'Usuario no encontrado.' }, env, 404); if (status === 'revoked') { await env.DB.prepare('UPDATE users SET status = ?, revoked_at = ? WHERE id = ?').bind('revoked', new Date().toISOString(), id).run(); await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(new Date().toISOString(), id).run(); } else { await env.DB.prepare('UPDATE users SET status = ?, revoked_at = NULL WHERE id = ?').bind(user.name ? 'active' : 'pending', id).run(); } return json({ ok: true, user: publicUser(await getUserById(env, id)) }, env); }
async function ensureOwner(env) { const ownerEmail = normalizeEmail(env.OWNER_EMAIL || 'owner@cuentas.local'); const existing = await getUserByEmail(env, ownerEmail); if (existing) return existing; const id = crypto.randomUUID(); await env.DB.prepare('INSERT INTO users (id, email, name, role, status, activated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, ownerEmail, 'Benjamin', 'owner', 'active', new Date().toISOString()).run(); return getUserById(env, id); }
async function createSession(env, userId, userAgent) { const raw = `${crypto.randomUUID()}.${crypto.randomUUID()}`; const id = crypto.randomUUID(); await env.DB.prepare('INSERT INTO sessions (id, user_id, session_digest, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?)').bind(id, userId, await digest(raw), new Date().toISOString(), userAgent).run(); return { token: raw, type: 'Bearer' }; }
async function requireOwner(request, env) { const auth = await requireSession(request, env); if (auth.error) return auth; if (auth.user.role !== 'owner') return { error: 'owner_required', message: 'Solo el owner puede hacer esto.', status: 403 }; return auth; }
async function requireSession(request, env) { const header = request.headers.get('authorization') || ''; const raw = header.startsWith('Bearer ') ? header.slice(7) : ''; if (!raw) return { error: 'missing_session', message: 'Falta iniciar sesion.', status: 401 }; const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(await digest(raw)).first(); if (!session) return { error: 'invalid_session', message: 'Sesion invalida o cerrada.', status: 401 }; const user = await getUserById(env, session.user_id); if (!user || user.status === 'revoked') return { error: 'session_revoked', message: 'Sesion revocada.', status: 401 }; await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), session.id).run(); return { session, user }; }
function publicUser(user) { if (!user) return null; const { id, email, name, avatar_url, role, status, created_at, activated_at, revoked_at } = user; return { id, email, name, avatar_url, role, status, created_at, activated_at, revoked_at }; }
async function getUserByEmail(env, email) { return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first(); }
async function getUserById(env, id) { return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first(); }
function createCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function minutes(value) { return Number(value) * 60 * 1000; }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
