const API_BILL_EDIT = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_BILL_EDIT = 'cuentas-pwa:session-token';
const AUDIT_KEY = 'cuentas-pwa:audit-local';

setTimeout(initStableBillEditor, 1600);
window.addEventListener('family-data-changed', () => setTimeout(enhanceBillEditTargets, 400));

function initStableBillEditor() {
  injectStyles();
  injectEditorDialog();
  document.addEventListener('click', handleBillEditClick, true);
  setInterval(enhanceBillEditTargets, 900);
}

function injectEditorDialog() {
  if (document.querySelector('#stableBillEditorDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="stableBillEditorDialog" class="stable-editor-dialog">
      <form method="dialog" class="stable-editor-card">
        <button class="dialog-close" value="cancel" aria-label="Cerrar" type="submit">×</button>
        <p class="eyebrow">Editar gasto registrado</p><h3 id="stableBillEditorTitle">Gasto</h3>
        <div class="form-row"><label class="field"><span>Título</span><input id="stableBillTitle"></label><label class="field"><span>Categoría</span><select id="stableBillCategory"></select></label></div>
        <div class="form-row"><label class="field"><span>Monto total</span><input id="stableBillAmount" inputmode="numeric"></label><label class="field"><span>Quién pagó</span><select id="stableBillPaidBy"></select></label></div>
        <div class="form-row"><label class="field"><span>Fecha</span><input id="stableBillDate" type="date"></label><label class="field"><span>Mes contable</span><input id="stableBillMonth" type="month"></label></div>
        <label class="field"><span>Operación</span><select id="stableBillOperation"><option value="">Sin operación</option></select></label>
        <label class="field"><span>Descripción</span><input id="stableBillDescription"></label>
        <div class="participant-editor"><strong>Se divide entre</strong><div class="split-mode"><label><input type="radio" name="stableSplitMode" value="equal">Partes iguales</label><label><input type="radio" name="stableSplitMode" value="manual" checked>Montos específicos</label></div><div class="split-note">La suma de participantes debe ser igual al monto total. Si el mes está cerrado, hay que reabrirlo antes.</div><div id="stableBillParticipants"></div><button class="tiny-button" id="stableSplitEven" type="button">Repartir igual ahora</button></div>
        <button class="primary-button full" id="stableSaveBill" type="button">Guardar cambios</button>
      </form>
    </dialog>
  `);
  document.querySelector('#stableSaveBill').addEventListener('click', saveStableBill);
  document.querySelector('#stableSplitEven').addEventListener('click', () => splitEven(true));
  document.querySelector('#stableBillAmount').addEventListener('input', () => splitEven(false));
  document.querySelector('#stableBillEditorDialog').addEventListener('input', (event) => {
    if (event.target.matches('[data-stable-check],input[name="stableSplitMode"]')) splitEven(false);
  });
}

function enhanceBillEditTargets() {
  document.querySelectorAll('.real-bill-card[data-bill-id]').forEach((card) => addButton(card, card.dataset.billId));
  document.querySelectorAll('.detail-row[data-bill-id]').forEach((row) => addButton(row, row.dataset.billId));
  document.querySelectorAll('[data-action="open-op"]').forEach((btn) => {
    if (btn.dataset.stableOpReady) return;
    btn.dataset.stableOpReady = '1';
    btn.addEventListener('click', () => setTimeout(() => enhanceOperationDetail(btn.dataset.id), 500));
  });
}

function addButton(container, id) {
  if (!id || container.querySelector('[data-action="stable-edit-bill"]')) return;
  const target = container.querySelector('.bill-actions') || container.querySelector('div:last-child') || container;
  target.insertAdjacentHTML('beforeend', `<button class="tiny-button stable-edit-button" data-action="stable-edit-bill" data-id="${escapeHtml(id)}" type="button">Editar</button>`);
}

async function enhanceOperationDetail(operationId) {
  const box = document.querySelector('#operationDetailBills');
  if (!box || !operationId) return;
  try {
    const detail = await api(`/operations/${operationId}`);
    const bills = detail.bills || [];
    box.innerHTML = bills.length ? bills.map((b) => `
      <article class="detail-row" data-bill-id="${escapeHtml(b.id)}">
        <div><strong>${escapeHtml(b.category_icon || '')} ${escapeHtml(b.title)}</strong><small>${escapeHtml(b.bill_date || '')} · ${escapeHtml(b.category_name || '')}</small></div>
        <div><b>${money(b.total_amount)}</b><button class="tiny-button stable-edit-button" data-action="stable-edit-bill" data-id="${escapeHtml(b.id)}" type="button">Editar</button></div>
      </article>
    `).join('') : '<div class="empty-state">Esta operación todavía no tiene gastos asociados.</div>';
  } catch {}
}

async function handleBillEditClick(event) {
  const button = event.target.closest('[data-action="stable-edit-bill"]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  await openStableBillEditor(button.dataset.id);
}

async function openStableBillEditor(id) {
  try {
    const [detail, cats, ops, users] = await Promise.all([
      api(`/bills/${id}`),
      api('/categories'),
      api('/operations').catch(() => ({ operations: [] })),
      api('/users').catch(() => ({ users: [] })),
    ]);
    const bill = detail.bill;
    window.__stableEditingBillId = id;
    window.__stableOriginalBill = JSON.parse(JSON.stringify(bill || {}));
    window.__stableUsers = users.users || [];
    document.querySelector('#stableBillEditorTitle').textContent = bill.title || 'Gasto';
    document.querySelector('#stableBillTitle').value = bill.title || '';
    document.querySelector('#stableBillAmount').value = bill.total_amount || 0;
    document.querySelector('#stableBillDate').value = String(bill.bill_date || '').slice(0, 10);
    document.querySelector('#stableBillMonth').value = bill.service_month || String(bill.bill_date || '').slice(0, 7);
    document.querySelector('#stableBillDescription').value = bill.description || '';
    document.querySelector('#stableBillCategory').innerHTML = (cats.categories || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === bill.category_id ? 'selected' : ''}>${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
    document.querySelector('#stableBillPaidBy').innerHTML = (users.users || []).map((u) => `<option value="${escapeHtml(u.id)}" ${u.id === (bill.paid_by_user_id || bill.created_by) ? 'selected' : ''}>${escapeHtml(u.name || u.email)}${u.role === 'owner' ? ' · owner' : ''}</option>`).join('');
    document.querySelector('#stableBillOperation').innerHTML = '<option value="">Sin operación</option>' + (ops.operations || []).map((op) => `<option value="${escapeHtml(op.id)}" ${op.id === bill.operation_id ? 'selected' : ''}>${escapeHtml(op.title)}</option>`).join('');
    renderParticipants(detail.participants || []);
    document.querySelector('input[name="stableSplitMode"][value="manual"]').checked = true;
    document.querySelector('#stableBillEditorDialog').showModal();
  } catch (error) {
    alert(error.message || 'No se pudo abrir el editor del gasto.');
  }
}

function renderParticipants(current) {
  const users = window.__stableUsers || [];
  const byId = new Map(current.map((p) => [p.user_id, p]));
  const checked = new Set(current.map((p) => p.user_id));
  document.querySelector('#stableBillParticipants').innerHTML = users.map((u) => {
    const p = byId.get(u.id);
    return `<label class="participant-row"><input type="checkbox" data-stable-check value="${escapeHtml(u.id)}" ${checked.has(u.id) ? 'checked' : ''}><span>${escapeHtml(u.name || u.email)}</span><input data-stable-share="${escapeHtml(u.id)}" type="number" min="0" step="1" value="${Number(p?.share_amount || 0)}"></label>`;
  }).join('') || '<div class="empty-state">No hay usuarios activos para dividir este gasto.</div>';
}

function splitEven(force) {
  const mode = document.querySelector('input[name="stableSplitMode"]:checked')?.value || 'manual';
  if (!force && mode !== 'equal') return;
  const total = amount('#stableBillAmount');
  const checks = [...document.querySelectorAll('[data-stable-check]:checked')];
  if (!total || !checks.length) return;
  const base = Math.floor(total / checks.length);
  checks.forEach((checkbox, index) => {
    const value = index === checks.length - 1 ? total - base * (checks.length - 1) : base;
    const input = document.querySelector(`[data-stable-share="${CSS.escape(checkbox.value)}"]`);
    if (input) input.value = value;
  });
  [...document.querySelectorAll('[data-stable-check]:not(:checked)')].forEach((checkbox) => {
    const input = document.querySelector(`[data-stable-share="${CSS.escape(checkbox.value)}"]`);
    if (input) input.value = 0;
  });
}

async function saveStableBill() {
  const id = window.__stableEditingBillId;
  const total = amount('#stableBillAmount');
  const participants = [...document.querySelectorAll('[data-stable-check]:checked')].map((checkbox) => ({
    user_id: checkbox.value,
    share_amount: Number(document.querySelector(`[data-stable-share="${CSS.escape(checkbox.value)}"]`)?.value || 0),
  })).filter((p) => p.share_amount > 0);
  const sum = participants.reduce((acc, p) => acc + p.share_amount, 0);
  if (!id || !total) return alert('Falta monto del gasto.');
  if (!participants.length) return alert('Selecciona al menos un participante.');
  if (sum !== total) return alert(`La suma de participantes (${money(sum)}) debe ser igual al total (${money(total)}).`);
  const paidBy = document.querySelector('#stableBillPaidBy').value;
  try {
    await api(`/bills/${id}`, { method: 'PATCH', body: JSON.stringify({
      title: document.querySelector('#stableBillTitle').value.trim(),
      category_id: document.querySelector('#stableBillCategory').value,
      total_amount: total,
      paid_by_user_id: paidBy,
      bill_date: document.querySelector('#stableBillDate').value,
      service_month: document.querySelector('#stableBillMonth').value,
      operation_id: document.querySelector('#stableBillOperation').value || null,
      description: document.querySelector('#stableBillDescription').value.trim(),
      participants,
    }) });
    writeAudit('edit_bill', {
      bill_id: id,
      before: window.__stableOriginalBill || null,
      after: {
        title: document.querySelector('#stableBillTitle').value.trim(),
        total_amount: total,
        paid_by_user_id: paidBy,
        service_month: document.querySelector('#stableBillMonth').value,
      },
    });
    document.querySelector('#stableBillEditorDialog').close();
    window.dispatchEvent(new Event('family-data-changed'));
    setTimeout(enhanceBillEditTargets, 900);
  } catch (error) {
    alert(error.message || 'No se pudo guardar el gasto. Si el mes está cerrado, reábrelo primero.');
  }
}

function writeAudit(action, detail) {
  const rows = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  rows.unshift({ id: crypto.randomUUID(), action, detail, at: new Date().toISOString() });
  localStorage.setItem(AUDIT_KEY, JSON.stringify(rows.slice(0, 120)));
  window.dispatchEvent(new Event('family-audit-changed'));
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_BILL_EDIT));
  const res = await fetch(API_BILL_EDIT + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Error API');
  return data;
}

function injectStyles() {
  if (document.querySelector('#stableBillEditorStyles')) return;
  const style = document.createElement('style');
  style.id = 'stableBillEditorStyles';
  style.textContent = `.stable-editor-dialog{width:min(880px,calc(100vw - 20px));border:1px solid var(--line);border-radius:28px;background:var(--panel-strong);color:var(--text);box-shadow:var(--shadow);padding:0}.stable-editor-dialog::backdrop{background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}.stable-editor-card{position:relative;display:grid;gap:14px;padding:24px}.stable-editor-card h3{margin:0;font-size:1.55rem}.stable-edit-button{background:rgba(34,197,94,.12)!important;border-color:rgba(34,197,94,.32)!important}.stable-editor-card .participant-row{grid-template-columns:auto 1fr 130px}@media(max-width:760px){.stable-editor-card{padding:22px 14px}.stable-editor-card .participant-row{grid-template-columns:auto 1fr}.stable-editor-card .participant-row input[type=number]{grid-column:2;width:100%}}`;
  document.head.appendChild(style);
}

function amount(selector) { return Number(String(document.querySelector(selector)?.value || '').replace(/[^0-9]/g, '')); }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
