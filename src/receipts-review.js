const API_RECEIPTS = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_RECEIPTS = 'cuentas-pwa:session-token';

setTimeout(initReceiptsReview, 1400);

function initReceiptsReview() {
  const movements = document.querySelector('#view-movements');
  if (!movements || document.querySelector('#receiptReviewPanel')) return;
  addReceiptStyles();
  movements.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="receiptReviewPanel">
      <div class="panel-header">
        <div><p class="eyebrow">Autorización</p><h3>Comprobantes pendientes</h3></div>
        <button class="text-button" id="receiptRefresh" type="button">Actualizar</button>
      </div>
      <p class="muted small">Edita monto, categoría, mes de consumo y participantes antes de aprobar. Nada pasa a cuenta real sin tu autorización.</p>
      <div class="receipt-review-list" id="receiptReviewList"><div class="empty-state">Cargando comprobantes...</div></div>
    </article>
  `);
  document.querySelector('#receiptRefresh').addEventListener('click', loadReceiptsReview);
  document.querySelector('#receiptReviewList').addEventListener('click', handleReceiptClick);
  document.querySelector('#receiptReviewList').addEventListener('input', handleReceiptInput);
  loadReceiptsReview();
}

function addReceiptStyles() {
  if (document.querySelector('#receiptReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'receiptReviewStyles';
  style.textContent = `
    .receipt-review-list{display:grid;gap:12px;margin-top:16px}.receipt-card{border:1px solid var(--line);border-radius:22px;padding:16px;background:rgba(15,23,42,.52);display:grid;gap:12px}.receipt-top{display:flex;justify-content:space-between;gap:12px}.receipt-title{font-size:1rem;font-weight:900}.receipt-meta{color:var(--muted);font-size:.88rem}.receipt-form{display:grid;gap:10px}.receipt-form .form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.receipt-actions{display:flex;gap:10px;flex-wrap:wrap}.receipt-raw{max-height:90px;overflow:auto;color:var(--muted);font-size:.82rem;border:1px dashed var(--line);border-radius:14px;padding:10px}.participant-editor{display:grid;gap:8px;padding:10px;border:1px solid var(--line);border-radius:16px;background:rgba(148,163,184,.06)}.participant-row{display:grid;grid-template-columns:auto 1fr 125px;gap:8px;align-items:center}.participant-row input[type="checkbox"]{width:18px;height:18px}.participant-row input[type="number"]{min-height:38px}.split-note{font-size:.78rem;color:var(--muted)}@media(max-width:760px){.receipt-top,.receipt-form .form-row{display:grid;grid-template-columns:1fr}.receipt-actions button{width:100%}.participant-row{grid-template-columns:auto 1fr}.participant-row input[type="number"]{grid-column:2;width:100%}}
  `;
  document.head.appendChild(style);
}

async function loadReceiptsReview() {
  const token = localStorage.getItem(TOKEN_RECEIPTS);
  if (!token) return;
  const [receipts, categories, me, users] = await Promise.all([
    api('/receipts?status=pending_review'),
    api('/categories'),
    api('/me'),
    api('/owner/users').catch(() => ({ users: [] })),
  ]);
  window.__receiptCategories = categories.categories || [];
  window.__receiptMe = me.user;
  window.__receiptUsers = (users.users?.length ? users.users : [me.user]).filter((u) => u && u.status !== 'revoked');
  const list = document.querySelector('#receiptReviewList');
  const rows = receipts.receipts || [];
  list.innerHTML = rows.length ? rows.map(renderReceiptCard).join('') : '<div class="empty-state">Sin comprobantes pendientes.</div>';
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
  return `
    <article class="receipt-card" data-id="${escapeHtml(r.id)}">
      <div class="receipt-top">
        <div><div class="receipt-title">${escapeHtml(title)}</div><div class="receipt-meta">${escapeHtml(r.source || '')} · pagado/emitido ${escapeHtml(r.detected_date || '')} · confianza ${Math.round(Number(r.confidence || 0) * 100)}%</div></div>
        <strong>${amount ? money(amount) : 'Monto por revisar'}</strong>
      </div>
      <div class="receipt-raw">${escapeHtml(r.raw_text || 'Sin texto detectado.')}</div>
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
        <div class="participant-editor"><strong>Participantes y montos</strong><div class="split-note">Puedes repartir igual o editar cada monto. La suma debe dar el total.</div>${activeUsers.map((u, index) => `<label class="participant-row"><input type="checkbox" data-user-check value="${escapeHtml(u.id)}" checked><span>${escapeHtml(u.name || u.email)}${u.role === 'owner' ? ' · owner' : ''}</span><input data-user-share="${escapeHtml(u.id)}" type="number" min="0" step="1" value="${index === activeUsers.length - 1 ? Math.max(0, amount - perUser * (activeUsers.length - 1)) : perUser}"></label>`).join('')}<button class="tiny-button" data-action="split-even" type="button">Repartir igual</button></div>
      </div>
      <div class="receipt-actions"><button class="secondary-button" data-action="approve-receipt" type="button">Autorizar como cuenta</button><button class="ghost-button" data-action="reject-receipt" type="button">Rechazar</button></div>
    </article>
  `;
}

function handleReceiptInput(event) {
  const card = event.target.closest('.receipt-card');
  if (!card) return;
  if (event.target.matches('[data-field="amount"]')) splitEven(card);
}

async function handleReceiptClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.receipt-card');
  const id = card.dataset.id;
  if (button.dataset.action === 'split-even') return splitEven(card);
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
  const participants = [...card.querySelectorAll('[data-user-check]:checked')].map((checkbox) => ({ user_id: checkbox.value, share_amount: Number(card.querySelector(`[data-user-share="${CSS.escape(checkbox.value)}"]`).value || 0) })).filter((p) => p.share_amount > 0);
  const sum = participants.reduce((acc, p) => acc + p.share_amount, 0);
  if (!amount || !category || !title || !serviceMonth || !participants.length) return alert('Faltan datos para autorizar.');
  if (sum !== amount) return alert(`La suma de participantes (${money(sum)}) debe ser igual al total (${money(amount)}).`);
  await api(`/receipts/${id}/approve`, { method: 'POST', body: JSON.stringify({ category_id: category, title, total_amount: amount, bill_date: billDate, service_month: serviceMonth, participants }) });
  await loadReceiptsReview();
  refreshFamilyLiteIfAvailable();
}

function splitEven(card) {
  const amount = Number(String(card.querySelector('[data-field="amount"]')?.value || '').replace(/[^0-9]/g, ''));
  const checked = [...card.querySelectorAll('[data-user-check]:checked')];
  if (!amount || !checked.length) return;
  const base = Math.floor(amount / checked.length);
  checked.forEach((checkbox, index) => {
    const input = card.querySelector(`[data-user-share="${CSS.escape(checkbox.value)}"]`);
    input.value = index === checked.length - 1 ? amount - base * (checked.length - 1) : base;
  });
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
function matchCategoryId(name, cats) { const n = String(name || '').toLowerCase(); return cats.find(c => String(c.name || '').toLowerCase() === n)?.id || cats.find(c => c.id === 'cat-other')?.id || cats[0]?.id || ''; }
function cleanTitle(value) { return String(value || '').replace(/BancoEstado compra - /i, '').replace(/ECOMAS SA - /i, '').slice(0, 70); }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
