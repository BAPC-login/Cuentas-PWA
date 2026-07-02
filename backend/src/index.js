export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(null, env);

    try {
      if (url.pathname === '/health') return json({ ok: true }, env);
      if (url.pathname === '/auth/request-code' && request.method === 'POST') return requestCode(request, env);
      if (url.pathname === '/auth/verify-code' && request.method === 'POST') return verifyCode(request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') return logout(request, env);
      if (url.pathname === '/me' && request.method === 'GET') return me(request, env);
      if (url.pathname === '/owner/users' && request.method === 'GET') return listUsers(request, env);
      if (url.pathname === '/owner/users' && request.method === 'POST') return createUser(request, env);
      if (url.pathname.match(/^\/owner\/users\/[^/]+\/revoke$/) && request.method === 'PATCH') return setUserStatus(request, env, 'revoked');
      if (url.pathname.match(/^\/owner\/users\/[^/]+\/reactivate$/) && request.method === 'PATCH') return setUserStatus(request, env, 'pending');
      return json({ error: 'not_found' }, env, 404);
    } catch (error) {
      console.error(error);
      return json({ error: 'server_error' }, env, 500);
    }
  },
};

async function requestCode(request, env) {
  const { email } = await readJson(request);
  const normalizedEmail = normalizeEmail(email);
  if (!isEmail(normalizedEmail)) return json({ error: 'invalid_email' }, env, 400);

  await ensureOwner(env);
  const user = await getUserByEmail(env, normalizedEmail);
  if (!user || user.status === 'revoked') return json({ error: 'user_not_allowed' }, env, 403);

  const code = createCode();
  const codeDigest = await digest(code);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + minutes(env.CODE_TTL_MINUTES || 10)).toISOString();
  await env.DB.prepare('INSERT INTO login_codes (id, email, code_digest, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, normalizedEmail, codeDigest, expiresAt)
    .run();

  // Demo: se devuelve el codigo. En produccion se debe enviar por email y no devolverlo.
  return json({ ok: true, demo_code: code, expires_at: expiresAt }, env);
}

async function verifyCode(request, env) {
  const { email, code, name } = await readJson(request);
  const normalizedEmail = normalizeEmail(email);
  if (!isEmail(normalizedEmail) || !String(code || '').match(/^\d{6}$/)) return json({ error: 'invalid_input' }, env, 400);

  const codeDigest = await digest(String(code));
  const row = await env.DB.prepare(
    'SELECT * FROM login_codes WHERE email = ? AND code_digest = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).bind(normalizedEmail, codeDigest, new Date().toISOString()).first();
  if (!row) return json({ error: 'invalid_or_expired_code' }, env, 401);

  const user = await getUserByEmail(env, normalizedEmail);
  if (!user || user.status === 'revoked') return json({ error: 'user_not_allowed' }, env, 403);

  const displayName = String(name || user.name || '').trim();
  if (!user.name && displayName.length < 2) return json({ error: 'profile_required' }, env, 409);

  if (!user.name && displayName) {
    await env.DB.prepare('UPDATE users SET name = ?, status = ?, activated_at = ? WHERE id = ?')
      .bind(displayName, 'active', new Date().toISOString(), user.id)
      .run();
  }

  await env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  const session = await createSession(env, user.id, request.headers.get('user-agent') || '');
  const freshUser = await getUserById(env, user.id);
  return json({ ok: true, session, user: publicUser(freshUser) }, env);
}

async function me(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error }, env, auth.status);
  return json({ user: publicUser(auth.user) }, env);
}

async function logout(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.error) {
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(new Date().toISOString(), auth.session.id).run();
  }
  return json({ ok: true }, env);
}

async function listUsers(request, env) {
  const auth = await requireOwner(request, env);
  if (auth.error) return json({ error: auth.error }, env, auth.status);
  const { results } = await env.DB.prepare('SELECT id, email, name, role, status, created_at, activated_at, revoked_at FROM users ORDER BY created_at DESC').all();
  return json({ users: results }, env);
}

async function createUser(request, env) {
  const auth = await requireOwner(request, env);
  if (auth.error) return json({ error: auth.error }, env, auth.status);
  const { email, name, role } = await readJson(request);
  const normalizedEmail = normalizeEmail(email);
  if (!isEmail(normalizedEmail)) return json({ error: 'invalid_email' }, env, 400);
  const id = crypto.randomUUID();
  const safeRole = ['member', 'viewer'].includes(role) ? role : 'member';
  const displayName = String(name || '').trim();
  const status = displayName ? 'active' : 'pending';
  await env.DB.prepare('INSERT INTO users (id, email, name, role, status, activated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, normalizedEmail, displayName || null, safeRole, status, displayName ? new Date().toISOString() : null)
    .run();
  return json({ ok: true, user: publicUser(await getUserById(env, id)) }, env, 201);
}

async function setUserStatus(request, env, status) {
  const auth = await requireOwner(request, env);
  if (auth.error) return json({ error: auth.error }, env, auth.status);
  const id = new URL(request.url).pathname.split('/')[3];
  if (id === auth.user.id) return json({ error: 'cannot_modify_owner_session' }, env, 400);
  const user = await getUserById(env, id);
  if (!user) return json({ error: 'user_not_found' }, env, 404);
  if (status === 'revoked') {
    await env.DB.prepare('UPDATE users SET status = ?, revoked_at = ? WHERE id = ?').bind('revoked', new Date().toISOString(), id).run();
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(new Date().toISOString(), id).run();
  } else {
    await env.DB.prepare('UPDATE users SET status = ?, revoked_at = NULL WHERE id = ?').bind(user.name ? 'active' : 'pending', id).run();
  }
  return json({ ok: true, user: publicUser(await getUserById(env, id)) }, env);
}

async function ensureOwner(env) {
  const ownerEmail = normalizeEmail(env.OWNER_EMAIL || 'owner@cuentas.local');
  const existing = await getUserByEmail(env, ownerEmail);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, name, role, status, activated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, ownerEmail, 'Benjamín', 'owner', 'active', new Date().toISOString())
    .run();
  return getUserById(env, id);
}

async function createSession(env, userId, userAgent) {
  const raw = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, session_digest, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, await digest(raw), new Date().toISOString(), userAgent)
    .run();
  return { token: raw, type: 'Bearer' };
}

async function requireOwner(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return auth;
  if (auth.user.role !== 'owner') return { error: 'owner_required', status: 403 };
  return auth;
}

async function requireSession(request, env) {
  const header = request.headers.get('authorization') || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!raw) return { error: 'missing_session', status: 401 };
  const sessionDigest = await digest(raw);
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(sessionDigest).first();
  if (!session) return { error: 'invalid_session', status: 401 };
  const user = await getUserById(env, session.user_id);
  if (!user || user.status === 'revoked') return { error: 'session_revoked', status: 401 };
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), session.id).run();
  return { session, user };
}

function publicUser(user) {
  if (!user) return null;
  const { id, email, name, role, status, created_at, activated_at, revoked_at } = user;
  return { id, email, name, role, status, created_at, activated_at, revoked_at };
}

async function getUserByEmail(env, email) {
  return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
}

async function getUserById(env, id) {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

function createCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function minutes(value) {
  return Number(value) * 60 * 1000;
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function json(data, env, status = 200) {
  return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env);
}

function cors(response, env) {
  const headers = new Headers(response?.headers || {});
  headers.set('access-control-allow-origin', env.APP_ORIGIN || '*');
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization');
  return new Response(response?.body || null, { status: response?.status || 204, headers });
}
