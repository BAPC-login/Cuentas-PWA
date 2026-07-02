export async function listTemplates(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare(`SELECT t.*, c.name AS category_name, c.icon AS category_icon FROM expense_templates t JOIN categories c ON c.id = t.category_id WHERE t.is_active = 1 ORDER BY t.created_at DESC`).all();
  return json({ templates: results }, env);
}

export async function createTemplate(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const title = String(body.title || '').trim();
  const category = String(body.category_id || '').trim();
  if (!title || !category) return json({ error: 'invalid_template', message: 'Falta nombre o categoria.' }, env, 400);
  const id = 'tpl-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO expense_templates (id, title, description, category_id, default_amount, service_month_offset, participant_mode, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, title, body.description || null, category, toInt(body.default_amount) || null, Number(body.service_month_offset || 0), body.participant_mode || 'equal', auth.user.id)
    .run();
  return json({ ok: true, template: await getTemplate(env, id) }, env, 201);
}

export async function deleteTemplate(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = pathPart(request, 1);
  await env.DB.prepare('UPDATE expense_templates SET is_active = 0, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
  return json({ ok: true }, env);
}

export async function duplicateCheck(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const url = new URL(request.url);
  const amount = toInt(url.searchParams.get('amount'));
  const date = String(url.searchParams.get('date') || '').slice(0, 10);
  if (!amount || !date) return json({ duplicates: [] }, env);
  const { results } = await env.DB.prepare(`SELECT b.*, c.name AS category_name, c.icon AS category_icon FROM bills b JOIN categories c ON c.id = b.category_id WHERE b.total_amount = ? AND b.bill_date BETWEEN date(?, '-2 day') AND date(?, '+2 day') AND COALESCE(b.deleted_at,'') = '' ORDER BY b.bill_date DESC LIMIT 10`).bind(amount, date, date).all();
  return json({ duplicates: results }, env);
}

export async function listMonthClosures(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const { results } = await env.DB.prepare('SELECT mc.*, u.name AS closed_by_name, u.email AS closed_by_email FROM month_closures mc JOIN users u ON u.id = mc.closed_by ORDER BY mc.month DESC').all();
  return json({ closures: results }, env);
}

export async function closeMonth(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  if (auth.user.role !== 'owner') return json({ error: 'owner_required', message: 'Solo el owner puede cerrar meses.' }, env, 403);
  const body = await readJson(request);
  const month = normalizeMonth(body.month);
  await env.DB.prepare('INSERT OR REPLACE INTO month_closures (month, closed_by, closed_at, note) VALUES (?, ?, ?, ?)').bind(month, auth.user.id, new Date().toISOString(), body.note || null).run();
  return json({ ok: true, month }, env);
}

export async function openMonth(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  if (auth.user.role !== 'owner') return json({ error: 'owner_required', message: 'Solo el owner puede reabrir meses.' }, env, 403);
  const month = pathPart(request, 1);
  await env.DB.prepare('DELETE FROM month_closures WHERE month = ?').bind(month).run();
  return json({ ok: true, month }, env);
}

async function getTemplate(env, id) { return env.DB.prepare('SELECT t.*, c.name AS category_name, c.icon AS category_icon FROM expense_templates t JOIN categories c ON c.id = t.category_id WHERE t.id = ?').bind(id).first(); }
async function requireSession(request, env) { const raw = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (!raw) return { error: 'missing_session', message: 'Falta iniciar sesion.', status: 401 }; const session = await env.DB.prepare('SELECT * FROM sessions WHERE session_digest = ? AND revoked_at IS NULL').bind(await digest(raw)).first(); if (!session) return { error: 'invalid_session', message: 'Sesion invalida.', status: 401 }; const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first(); if (!user || user.status === 'revoked') return { error: 'session_revoked', message: 'Sesion revocada.', status: 401 }; return { session, user }; }
function pathPart(request, index) { return new URL(request.url).pathname.split('/').filter(Boolean)[index]; }
function normalizeMonth(value) { const raw = String(value || '').slice(0, 7); return /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7); }
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function toInt(value) { return Math.max(0, Math.round(Number(String(value || 0).replace(/[^0-9.-]/g, '')) || 0)); }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
