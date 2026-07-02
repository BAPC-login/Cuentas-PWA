const API_RECEIPTS = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_RECEIPTS = 'cuentas-pwa:session-token';
let receiptStatusFilter = 'pending_review';

setTimeout(initReceiptsReview, 1400);

function initReceiptsReview() {
  const movements = document.querySelector('#view-movements');
  if (!movements || document.querySelector('#receiptReviewPanel')) return;
  addReceiptStyles();
  movements.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="receiptReviewPanel">
      <div class="panel-header">
        <div><p class="eyebrow">Centro de autorización</p><h3>Comprobantes y pagos</h3></div>
        <button class="text-button" id="receiptRefresh" type="button">Actualizar</button>
      </div>
      <p class="muted small">Bandeja profesional: pendiente, aprobado, rechazado y posible duplicado. Para partir, usa partes iguales y no llenes montos.</p>
      <div class="receipt-tabs" id="receiptTabs">
        <button class="receipt-tab active" data-status="pending_review" type="button">Pendientes</button>
        <button class="receipt-tab" data-status="duplicate_probable" type="button">Duplicados</button>
        <button class="receipt-tab" data-status="approved" type="button">Aprobados</button>
        <button class="receipt-tab" data-status="rejected" type="button">Rechazados</button>
      </div>
      <div class="receipt-review-list" id="receiptReviewList"><div class="empty-state">Cargando comprobantes...</div></div>
    </article>
  `);
  document.querySelector('#receiptRefresh').addEventListener('click', loadReceiptsReview);
  document.querySelector('#receiptReviewList').addEventListener('click', handleReceiptClick);
  document.querySelector('#receiptReviewList').addEventListener('input', handleReceiptInput);
  document.querySelector('#receiptTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.receipt-tab');
    if (!tab) return;
    receiptStatusFilter = tab.dataset.status;
    document.querySelectorAll('.receipt-tab').forEach((item) => item.classList.toggle('active', item === tab));
    loadReceiptsReview();
  });
  loadReceiptsReview();
}

function addReceiptStyles() {
  if (document.querySelector('#receiptReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'receiptReviewStyles';
  style.textContent = `
    .receipt-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.receipt-tab{border:1px solid var(--line);border-radius:999px;background:rgba(148,163,184,.08);color:var(--muted);padding:9px 13px;font-weight:900}.receipt-tab.active{color:var(--text);background:rgba(56,189,248,.16);border-color:rgba(56,189,248,.45)}.receipt-review-list{display:grid;gap:12px;margin-top:16px}.receipt-card{border:1px solid var(--line);border-radius:22px;padding:16px;background:rgba(15,23,42,.52);display:grid;gap:12px}.receipt-card.duplicate{border-color:rgba(251,191,36,.65)}.receipt-top{display:flex;justify-content:space-between;gap:12px}.receipt-title{font-size:1rem;font-weight:900}.receipt-meta{color:var(--muted);font-size:.88rem}.receipt-form{display:grid;gap:10px}.receipt-form .form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.receipt-actions{display:flex;gap:10px;flex-wrap:wrap}.receipt-raw{max-height:90px;overflow:auto;color:var(--muted);font-size:.82rem;border:1px dashed var(--line);border-radius:14px;padding:10px}.participant-editor{display:grid;gap:8px;padding:10px;border:1px solid var(--line);border-radius:16px;background:rgba(148,163,184,.06)}.participant-row{display:grid;grid-template-columns:auto 1fr 125px;gap:8px;align-items:center}.participant-row input[type="checkbox"]{width:18px;height:18px}.participant-row input[type="number"]{min-height:38px}.split-note{font-size:.78rem;color:var(--muted)}.split-mode{display:flex;gap:10px;flex-wrap:wrap}.split-mode label{border:1px solid var(--line);border-radius:999px;padding:8px 10px;font-weight:800;color:var(--muted)}.split-mode input{margin-right:6px}@media(max-width:760px){.receipt-top,.receipt-form .form-row{display:grid;grid-template-columns:1fr}.receipt-actions button{width:100%}.participant-row{grid-template-columns:auto 1fr}.participant-row input[type="number"]{grid-column:2;width:100%}}
  `;
  document.head.appendChild(style);
}

async function loadReceiptsReview() {
  const token = localStorage.getItem(TOKEN_RECEIPTS);
  if (!token) return;
  const [receipts, categories, me, users] = await Promise.all([
    api('/receipts' + (receiptStatusFilter ? `?status=${receiptStatusFilter}` : '')),
    api('/categories'),
    api('/me'),
    api('/owner/users').catch(() => ({ users: [] })),
  ]);
  window.__receiptCategories = categories.categories || [];
  window.__receiptMe = me.user;
  window.__receiptUsers = (users.users?.length ? users.users : [me.user]).filter((u) => u && u.status !== 'revoked');
  const list = document.querySelector('#receiptReviewList');
  const rows = receipts.receipts || [];
  list.innerHTML = rows.length ? rows.map(renderReceiptCard).join('') : '<div class="empty-state">No hay comprobantes en esta bandeja.</div>';
}

function renderReceiptCard(r) {
  const cats = window.__receiptCategories || [];
  const users = window.__receiptUsers || [];
  const selected = matchCategoryId(r.detected_category, cats);
  const amount = Number(r.detected_amount || 0);
  const title = r.file_name || 'Comprobante sin nombre';
  const serviceMonth = r.service_month || String(r.detected_date || new Date().toISOString()).slice(0, 7);
  const activeUsers = users.filter((u) => u.status !== 'pending' || u.name || u.email);
  const perUser = activeUsers.length && amount ? Math.floor(amount / activeUsers.length) : amount;
  const readonly = r.status !== 'pending_review' && r.status !== 'duplicate_probable';
  return `
    <article class="receipt-card ${r.status === 'duplicate_probable' ? 'duplicate' : ''}" data-id="${escapeHtml(r.id)}">
      <div class="receipt-top">
        <div><div class="receipt-title">${escapeHtml(title)}</div><div class="receipt-meta">${escapeHtml(r.source || '')} · ${labelStatus(r.status)} · pagado/emitido ${escapeHtml(r.detected_date || '')} · confianza ${Math.round(Number(r.confidence || 0) * 100)}%</div></div>
        <strong>${amount ? money(amount) : 'Monto por revisar'}</strong>
      </div>
      <div class="receipt-raw">${escapeHtml(r.raw_text || 'Sin texto detectado.')}</div>
      ${readonly ? `<div class="empty-state">Este comprobante está ${labelStatus(r.status).toLowerCase()}. Las cuentas autorizadas se editan abajo, en Cuentas reales.</div>` : `
      <div class="receipt-form">
        <div class="form-row">
          <label class="field"><span>Categoría</span><select data-field="category_id">${cats.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Monto editable</span><input data-field="amount" inputmode="numeric" value="${amount || ''}" placeholder="Monto"></label>
        </div>
        <div class="form-row">
          <label class="field"><span>Corresponde al mes de</span><input data-field="service_month" type="month" value="${escapeHtml(serviceMonth)}"></label>
          <label class="field"><span>Fecha de pago/emisión</span><input data-field="bill_date" type="date" value="${escapeHtml(String(r.detected_date || new Date().toISOString()).slice(0,10))}"></label>
        </div>
        <label class="field"><span>Nombre de la cuenta</span><input data-field="title" value="${escapeHtml(cleanTitle(title))}" placeholder="Ej: Luz julio"></label>
        <div class="participant-editor"><strong>Participantes y montos</strong><div class="split-mode"><label><input type="radio" name="split-${escapeHtml(r.id)}" value="equal" checked>Partes iguales</label><label><input type="radio" name="split-${escapeHtml(r.id)}" value="manual">Montos específicos</label></div><div class="split-note">En partes iguales solo marca participantes. La app calcula todo.</div>${activeUsers.map((u, index) => `<label class="participant-row"><input type="checkbox" data-user-check value="${escapeHtml(u.id)}" checked><span>${escapeHtml(u.name || u.email)}${u.role === 'owner' ? ' · owner' : ''}</span><input data-user-share="${escapeHtml(u.id)}" type="number" min="0" step="1" value="${index === activeUsers.length - 1 ? Math.max(0, amount - perUser * (activeUsers.length - 1)) : perUser}"></label>`).join('')}<button class="tiny-button" data-action="split-even" type="button">Repartir igual ahora</button></div>
      </div>
      <div class="receipt-actions"><button class="secondary-button" data-action="approve-receipt" type="button">Autorizar como cuenta</button><button class="ghost-button" data-action="reject-receipt" type="button">Rechazar</button></div>`}
    </article>
  `;
}

function handleReceiptInput(event) {
  const card = event.target.closest('.receipt-card');
  if (!card) return;
  if (event.target.matches('[data-field="amount"],[data-user-check],input[type="radio"]')) splitEven(card, false);
}

async function handleReceiptClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.receipt-card');
  const id = card.dataset.id;
  if (button.dataset.action === 'split-even') return splitEven(card, true);
  if (button.dataset.action === 'reject-receipt') {
    await api(`/receipts/${id}/reject`, { method: 'POST', body: '{}' });
    await loadReceiptsReview();
    refreshFamilyLiteIfAvailable();
    return;
  }
  const amount = Number(String(card.querySelector('[data-field="amount"]').value).replace(/[^0-9]/g, ''));
  const category = card.querySelector('[data-field="category_id"]').value;
  const title = card.querySelector('[data-field="title"]').value.trim();
  const billDate = card.querySelector('[data-field="bill_date"]').value;
  const serviceMonth = card.querySelector('[data-field="service_month"]').value;
  const participants = buildParticipants(card, amount);
  const sum = participants.reduce((acc, p) => acc + p.share_amount, 0);
  if (!amount || !category || !title || !serviceMonth || !participants.length) return alert('Faltan datos para autorizar.');
  if (sum !== amount) return alert(`La suma de participantes (${money(sum)}) debe ser igual al total (${money(amount)}).`);
  await api(`/receipts/${id}/approve`, { method: 'POST', body: JSON.stringify({ category_id: category, title, total_amount: amount, bill_date: billDate, service_month: serviceMonth, participants }) });
  receiptStatusFilter = 'pending_review';
  await loadReceiptsReview();
  refreshFamilyLiteIfAvailable();
}

function buildParticipants(card, amount) {
  const mode = card.querySelector('input[type="radio"]:checked')?.value || 'equal';
  const checked = [...card.querySelectorAll('[data-user-check]:checked')];
  if (mode === 'equal') return splitValues(checked.map((c) => c.value), amount).map(([user_id, share_amount]) => ({ user_id, share_amount }));
  return checked.map((checkbox) => ({ user_id: checkbox.value, share_amount: Number(card.querySelector(`[data-user-share="${CSS.escape(checkbox.value)}"]`).value || 0) })).filter((p) => p.share_amount > 0);
}

function splitEven(card, force = true) {
  const amount = Number(String(card.querySelector('[data-field="amount"]')?.value || '').replace(/[^0-9]/g, ''));
  const checked = [...card.querySelectorAll('[data-user-check]:checked')];
  if (!amount || !checked.length) return;
  const values = splitValues(checked.map((c) => c.value), amount);
  values.forEach(([id, value]) => {
    const input = card.querySelector(`[data-user-share="${CSS.escape(id)}"]`);
    if (force || card.querySelector('input[type="radio"]:checked')?.value === 'equal') input.value = value;
  });
}

function splitValues(ids, amount) {
  const base = Math.floor(amount / ids.length);
  return ids.map((id, index) => [id, index === ids.length - 1 ? amount - base * (ids.length - 1) : base]);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_RECEIPTS));
  const res = await fetch(API_RECEIPTS + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Error API');
  return data;
}

function refreshFamilyLiteIfAvailable() { document.querySelector('#familyLiteReload')?.click(); window.dispatchEvent(new Event('family-data-changed')); }
function labelStatus(status) { return ({ pending_review: 'Pendiente', duplicate_probable: 'Duplicado probable', approved: 'Aprobado', rejected: 'Rechazado' })[status] || status || 'Pendiente'; }
function matchCategoryId(name, cats) { const n = String(name || '').toLowerCase(); return cats.find(c => String(c.name || '').toLowerCase() === n)?.id || cats.find(c => c.id === 'cat-other')?.id || cats[0]?.id || ''; }
function cleanTitle(value) { return String(value || '').replace(/BancoEstado compra - /i, '').replace(/ECOMAS SA - /i, '').slice(0, 70); }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
