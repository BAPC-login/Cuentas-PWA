export async function createAttachment(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const ownerType = safeOwnerType(body.owner_type);
  const ownerId = String(body.owner_id || '').trim();
  const fileName = String(body.file_name || '').trim();
  const fileType = String(body.file_type || '').trim() || null;
  const dataUrl = String(body.data_url || '').trim() || null;
  const sizeBytes = Number(body.size_bytes || 0);
  if (!ownerType || !ownerId || !fileName) return json({ error: 'invalid_attachment', message: 'Falta tipo, referencia o nombre del archivo.' }, env, 400);
  if (dataUrl && dataUrl.length > 2_200_000) return json({ error: 'file_too_large', message: 'Archivo demasiado grande para guardar en D1. Usa imagen/PDF comprimido o registra solo metadata.' }, env, 413);
  const id = 'att-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO attachments (id, owner_type, owner_id, file_name, file_type, size_bytes, data_url, note, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, ownerType, ownerId, fileName, fileType, sizeBytes || 0, dataUrl, body.note || null, auth.user.id)
    .run();
  await writeAudit(env, auth.user.id, 'attachment_created', ownerType, ownerId, { attachment_id: id, file_name: fileName, size_bytes: sizeBytes || 0 });
  return json({ ok: true, attachment: await getAttachment(env, id) }, env, 201);
}

export async function listAttachments(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const url = new URL(request.url);
  const ownerType = url.searchParams.get('owner_type');
  const ownerId = url.searchParams.get('owner_id');
  let sql = 'SELECT a.id, a.owner_type, a.owner_id, a.file_name, a.file_type, a.size_bytes, a.note, a.uploaded_by, u.name AS uploaded_by_name, a.created_at, CASE WHEN a.data_url IS NOT NULL THEN 1 ELSE 0 END AS has_file FROM attachments a JOIN users u ON u.id = a.uploaded_by WHERE 1=1';
  const binds = [];
  if (ownerType) { sql += ' AND a.owner_type = ?'; binds.push(ownerType); }
  if (ownerId) { sql += ' AND a.owner_id = ?'; binds.push(ownerId); }
  sql += ' ORDER BY a.created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ attachments: results }, env);
}

export async function getAttachmentFile(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const id = new URL(request.url).pathname.split('/').filter(Boolean)[1];
  const row = await env.DB.prepare('SELECT * FROM attachments WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'attachment_not_found', message: 'Adjunto no encontrado.' }, env, 404);
  return json({ attachment: row }, env);
}

export async function createAuditLog(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const body = await readJson(request);
  const id = await writeAudit(env, auth.user.id, body.action || 'event', body.entity_type || null, body.entity_id || null, body.detail || {});
  return json({ ok: true, audit_id: id }, env, 201);
}

export async function listAuditLogs(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  if (auth.user.role !== 'owner') return json({ error: 'owner_required', message: 'Solo el owner puede ver auditoría completa.' }, env, 403);
  const { results } = await env.DB.prepare('SELECT l.*, u.name AS actor_name, u.email AS actor_email FROM audit_logs l JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT 200').all();
  return json({ logs: results }, env);
}

export async function finalHealth(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ error: auth.error, message: auth.message }, env, auth.status);
  const checks = {};
  for (const table of ['users', 'categories', 'bills', 'bill_participants', 'payments', 'receipts', 'operations', 'month_closures', 'attachments', 'audit_logs']) {
    try {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
      checks[table] = { ok: true, count: Number(row?.count || 0) };
    } catch (error) {
      checks[table] = { ok: false, message: String(error?.message || error) };
    }
  }
  return json({ ok: Object.values(checks).every((x) => x.ok), checks }, env);
}

async function writeAudit(env, actorId, action, entityType, entityId, detail) {
  const id = 'audit-' + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, detail_json) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, actorId, String(action || 'event'), entityType || null, entityId || null, JSON.stringify(detail || {}))
    .run()
    .catch(() => null);
  return id;
}

async function getAttachment(env, id) {
  return env.DB.prepare('SELECT id, owner_type, owner_id, file_name, file_type, size_bytes, note, uploaded_by, created_at, CASE WHEN data_url IS NOT NULL THEN 1 ELSE 0 END AS has_file FROM attachments WHERE id = ?').bind(id).first();
}

function safeOwnerType(value) {
  const type = String(value || '').trim();
  return ['bill', 'payment', 'receipt', 'operation', 'month'].includes(type) ? type : '';
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
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function json(data, env, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }), env); }
function cors(response, env) { const headers = new Headers(response?.headers || {}); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('access-control-allow-headers', 'content-type, authorization'); return new Response(response?.body || null, { status: response?.status || 204, headers }); }
