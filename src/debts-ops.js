const API_DEBTS_OPS = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_DEBTS_OPS = 'cuentas-pwa:session-token';

setTimeout(initDebtsOps, 1700);
window.addEventListener('family-data-changed', () => refreshDebtsOps());

function initDebtsOps() {
  injectStyles();
  injectDebtPanel();
  injectOperationsPanel();
  injectBillEditor();
  document.addEventListener('click', handleGlobalClick);
  refreshDebtsOps();
}

function injectDebtPanel() {
  const dashboard = document.querySelector('#view-dashboard');
  if (!dashboard || document.querySelector('#debtMatrixPanel')) return;
  dashboard.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="debtMatrixPanel">
      <div class="panel-header"><div><p class="eyebrow">Deudas por persona</p><h3>Quién debe y a quién se le debe</h3></div><button class="text-button" id="debtRefresh" type="button">Actualizar</button></div>
      <div class="debt-list" id="debtMatrixList"><div class="empty-state">Cargando deudas...</div></div>
    </article>
  `);
  document.querySelector('#debtRefresh')?.addEventListener('click', refreshDebtsOps);
}

function injectOperationsPanel() {
  const movements = document.querySelector('#view-movements');
  if (!movements || document.querySelector('#operationsPanel')) return;
  movements.insertAdjacentHTML('beforeend', `
    <article class="panel" id="operationsPanel">
      <div class="panel-header"><div><p class="eyebrow">Operaciones específicas</p><h3>Gastos compuestos</h3></div><button class="text-button" id="opsRefresh" type="button">Actualizar</button></div>
      <p class="muted small">Agrupa varios gastos en una sola operación: diagnóstico, repuesto, mano de obra, compras relacionadas, etc.</p>
      <form id="operationForm" class="form-stack">
        <div class="form-row"><label class="field"><span>Operación</span><input id="opTitle" placeholder="Ej: Reparación lavadora"></label><label class="field"><span>Categoría única</span><select id="opCategory"></select></label></div>
        <div class="form-row"><label class="field"><span>Fecha</span><input id="opDate" type="date"></label><label class="field"><span>Corresponde al mes de</span><input id="opMonth" type="month"></label></div>
        <label class="field"><span>Descripción</span><input id="opDescription" placeholder="Ej: diagnóstico, repuesto y visita final del técnico"></label>
        <button class="secondary-button" type="submit">Crear operación</button>
      </form>
      <div class="ops-list" id="opsList"><div class="empty-state">Cargando operaciones...</div></div>
    </article>
  `);
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector('#opDate').value = today;
  document.querySelector('#opMonth').value = today.slice(0, 7);
  document.querySelector('#operationForm').addEventListener('submit', createOperation);
  document.querySelector('#opsRefresh')?.addEventListener('click', refreshDebtsOps);
}

function injectBillEditor() {
  if (document.querySelector('#billEditorDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="billEditorDialog" class="bill-editor-dialog">
      <form method="dialog" class="bill-editor-card">
        <button class="dialog-close" value="cancel" aria-label="Cerrar" type="submit">×</button>
        <p class="eyebrow">Editar cuenta autorizada</p><h3 id="billEditorTitle">Cuenta</h3>
        <div class="form-row"><label class="field"><span>Título</span><input id="editBillTitle"></label><label class="field"><span>Categoría</span><select id="editBillCategory"></select></label></div>
        <div class="form-row"><label class="field"><span>Monto total</span><input id="editBillAmount" inputmode="numeric"></label><label class="field"><span>Fecha</span><input id="editBillDate" type="date"></label></div>
        <div class="form-row"><label class="field"><span>Corresponde al mes de</span><input id="editBillMonth" type="month"></label><label class="field"><span>Operación</span><select id="editBillOperation"><option value="">Sin operación</option></select></label></div>
        <label class="field"><span>Descripción</span><input id="editBillDescription"></label>
        <div class="participant-editor"><strong>Participantes</strong><div class="split-mode"><label><input type="radio" name="editSplitMode" value="equal" checked>Partes iguales</label><label><input type="radio" name="editSplitMode" value="manual">Porcentaje/monto específico</label></div><div class="split-note">Para partir, deja Partes iguales: marca participantes y la app calcula la aritmética.</div><div id="editBillParticipants"></div><button class="tiny-button" id="editSplitEven" type="button">Repartir igual ahora</button></div>
        <button class="primary-button full" id="saveBillEditor" type="button">Guardar cambios</button>
      </form>
    </dialog>
  `);
  document.querySelector('#saveBillEditor').addEventListener('click', saveBillEditor);
  document.querySelector('#editSplitEven').addEventListener('click', () => splitEditorEven(true));
  document.querySelector('#editBillAmount').addEventListener('input', () => splitEditorEven(false));
  document.querySelector('#billEditorDialog').addEventListener('input', (event) => {
    if (event.target.matches('[data-edit-check],input[name="editSplitMode"]')) splitEditorEven(false);
  });
}

async function refreshDebtsOps() {
  const token = localStorage.getItem(TOKEN_DEBTS_OPS);
  if (!token) return;
  try {
    const [debts, cats, ops, users, bills] = await Promise.all([
      api('/debts'), api('/categories'), api('/operations'), api('/owner/users').catch(() => ({ users: [] })), api('/bills')
    ]);
    window.__debtsOpsCategories = cats.categories || [];
    window.__debtsOpsOperations = ops.operations || [];
    window.__debtsOpsUsers = (users.users || []).filter((u) => u.status !== 'revoked');
    renderDebts(debts);
    renderOperationControls(cats.categories || []);
    renderOperations(ops.operations || []);
    enhanceRealBillsEditButtons(bills.bills || []);
  } catch (error) {
    console.warn('debts-ops', error);
  }
}

function renderDebts(data) {
  const list = document.querySelector('#debtMatrixList');
  if (!list) return;
  const receiver = data.receiver;
  const rows = (data.debts || []).filter((d) => Number(d.pending || 0) > 0);
  list.innerHTML = rows.length ? rows.map((d) => `
    <article class="debt-card">
      <div><strong>${escapeHtml(d.name || d.email)}</strong><small>Debe a ${escapeHtml(receiver?.name || receiver?.email || 'owner')} · asignado ${money(d.total_assigned)} · pagado ${money(d.total_paid)}</small></div>
      <b>${money(d.pending)}</b>
    </article>
  `).join('') : '<div class="empty-state">No hay deuda pendiente registrada.</div>';
}

function renderOperationControls(cats) {
  const select = document.querySelector('#opCategory');
  if (select) select.innerHTML = cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
}

function renderOperations(ops) {
  const list = document.querySelector('#opsList');
  const opSelect = document.querySelector('#editBillOperation');
  if (opSelect) opSelect.innerHTML = '<option value="">Sin operación</option>' + ops.map((op) => `<option value="${escapeHtml(op.id)}">${escapeHtml(op.title)}</option>`).join('');
  if (!list) return;
  list.innerHTML = ops.length ? ops.map((op) => `
    <article class="op-card" data-op="${escapeHtml(op.id)}">
      <div><strong>${escapeHtml(op.category_icon || '')} ${escapeHtml(op.title)}</strong><small>${escapeHtml(op.description || 'Sin descripción')} · ${escapeHtml(op.service_month)} · ${op.item_count || 0} ítems</small></div>
      <div><b>${money(op.total_amount)}</b><button class="tiny-button" data-action="open-op" data-id="${escapeHtml(op.id)}" type="button">Ver detalle</button></div>
    </article>
  `).join('') : '<div class="empty-state">Aún no hay operaciones. Crea una para Reparación lavadora.</div>';
}

function enhanceRealBillsEditButtons(bills) {
  document.querySelectorAll('.real-bill-card').forEach((card, index) => {
    if (card.querySelector('[data-action="edit-bill"]')) return;
    const bill = bills[index];
    if (!bill) return;
    card.dataset.billId = bill.id;
    card.insertAdjacentHTML('beforeend', `<button class="tiny-button" data-action="edit-bill" data-id="${escapeHtml(bill.id)}" type="button">Editar participantes</button>`);
  });
}

async function createOperation(event) {
  event.preventDefault();
  const body = {
    title: document.querySelector('#opTitle').value.trim(),
    category_id: document.querySelector('#opCategory').value,
    expense_date: document.querySelector('#opDate').value,
    service_month: document.querySelector('#opMonth').value,
    description: document.querySelector('#opDescription').value.trim(),
  };
  if (!body.title || !body.category_id) return alert('Falta título o categoría.');
  await api('/operations', { method: 'POST', body: JSON.stringify(body) });
  document.querySelector('#opTitle').value = '';
  document.querySelector('#opDescription').value = '';
  await refreshDebtsOps();
}

async function handleGlobalClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'edit-bill') return openBillEditor(button.dataset.id);
  if (button.dataset.action === 'open-op') return showOperationDetail(button.dataset.id);
}

async function openBillEditor(id) {
  const [detail, cats, ops, users] = await Promise.all([api(`/bills/${id}`), api('/categories'), api('/operations'), api('/owner/users').catch(() => ({ users: [] }))]);
  const b = detail.bill;
  window.__editingBillId = id;
  window.__editingBillParticipants = detail.participants || [];
  window.__debtsOpsUsers = (users.users || window.__debtsOpsUsers || []).filter((u) => u.status !== 'revoked');
  document.querySelector('#billEditorTitle').textContent = b.title;
  document.querySelector('#editBillTitle').value = b.title || '';
  document.querySelector('#editBillAmount').value = b.total_amount || 0;
  document.querySelector('#editBillDate').value = String(b.bill_date || '').slice(0,10);
  document.querySelector('#editBillMonth').value = b.service_month || String(b.bill_date || '').slice(0,7);
  document.querySelector('#editBillDescription').value = b.description || '';
  document.querySelector('#editBillCategory').innerHTML = (cats.categories || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === b.category_id ? 'selected' : ''}>${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
  document.querySelector('#editBillOperation').innerHTML = '<option value="">Sin operación</option>' + (ops.operations || []).map((op) => `<option value="${escapeHtml(op.id)}" ${op.id === b.operation_id ? 'selected' : ''}>${escapeHtml(op.title)}</option>`).join('');
  renderEditorParticipants(Number(b.total_amount || 0), detail.participants || []);
  document.querySelector('input[name="editSplitMode"][value="equal"]').checked = true;
  splitEditorEven(true);
  document.querySelector('#billEditorDialog').showModal();
}

function renderEditorParticipants(total, current) {
  const users = window.__debtsOpsUsers || [];
  const byId = new Map(current.map((p) => [p.user_id, p]));
  const checkedIds = current.length ? new Set(current.map((p) => p.user_id)) : new Set(users.map((u) => u.id));
  const html = users.map((u) => {
    const p = byId.get(u.id);
    const checked = checkedIds.has(u.id) ? 'checked' : '';
    const amount = Number(p?.share_amount || 0);
    const pct = total ? Math.round(amount * 10000 / total) / 100 : 0;
    return `<label class="participant-row"><input type="checkbox" data-edit-check value="${escapeHtml(u.id)}" ${checked}><span>${escapeHtml(u.name || u.email)}</span><input data-edit-pct="${escapeHtml(u.id)}" type="number" min="0" max="100" step="0.01" value="${pct}" placeholder="%"><input data-edit-share="${escapeHtml(u.id)}" type="number" min="0" step="1" value="${amount}" placeholder="Monto"></label>`;
  }).join('');
  document.querySelector('#editBillParticipants').innerHTML = html;
  document.querySelectorAll('[data-edit-pct]').forEach((input) => input.addEventListener('input', syncPercentToAmount));
}

function syncPercentToAmount(event) {
  const total = Number(String(document.querySelector('#editBillAmount').value).replace(/[^0-9]/g, ''));
  const id = event.target.dataset.editPct;
  const amountInput = document.querySelector(`[data-edit-share="${CSS.escape(id)}"]`);
  amountInput.value = Math.round(total * Number(event.target.value || 0) / 100);
  document.querySelector('input[name="editSplitMode"][value="manual"]').checked = true;
}

function splitEditorEven(force = true) {
  const total = Number(String(document.querySelector('#editBillAmount').value).replace(/[^0-9]/g, ''));
  const checked = [...document.querySelectorAll('[data-edit-check]:checked')];
  const mode = document.querySelector('input[name="editSplitMode"]:checked')?.value || 'equal';
  if (!total || !checked.length || (!force && mode !== 'equal')) return;
  const base = Math.floor(total / checked.length);
  checked.forEach((checkbox, index) => {
    const amount = index === checked.length - 1 ? total - base * (checked.length - 1) : base;
    const share = document.querySelector(`[data-edit-share="${CSS.escape(checkbox.value)}"]`);
    const pct = document.querySelector(`[data-edit-pct="${CSS.escape(checkbox.value)}"]`);
    share.value = amount;
    pct.value = Math.round(amount * 10000 / total) / 100;
  });
  [...document.querySelectorAll('[data-edit-check]:not(:checked)')].forEach((checkbox) => {
    document.querySelector(`[data-edit-share="${CSS.escape(checkbox.value)}"]`).value = 0;
    document.querySelector(`[data-edit-pct="${CSS.escape(checkbox.value)}"]`).value = 0;
  });
}

async function saveBillEditor() {
  const id = window.__editingBillId;
  const total = Number(String(document.querySelector('#editBillAmount').value).replace(/[^0-9]/g, ''));
  splitEditorEven(false);
  const participants = [...document.querySelectorAll('[data-edit-check]:checked')].map((checkbox) => ({
    user_id: checkbox.value,
    share_amount: Number(document.querySelector(`[data-edit-share="${CSS.escape(checkbox.value)}"]`).value || 0),
  })).filter((p) => p.share_amount > 0);
  const sum = participants.reduce((s, p) => s + p.share_amount, 0);
  if (sum !== total) return alert(`La suma (${money(sum)}) debe ser igual al total (${money(total)}).`);
  await api(`/bills/${id}`, { method: 'PATCH', body: JSON.stringify({
    title: document.querySelector('#editBillTitle').value.trim(),
    category_id: document.querySelector('#editBillCategory').value,
    total_amount: total,
    bill_date: document.querySelector('#editBillDate').value,
    service_month: document.querySelector('#editBillMonth').value,
    operation_id: document.querySelector('#editBillOperation').value || null,
    description: document.querySelector('#editBillDescription').value.trim(),
    participants,
  }) });
  document.querySelector('#billEditorDialog').close();
  await refreshDebtsOps();
  document.querySelector('#familyLiteReload')?.click();
}

async function showOperationDetail(id) {
  const detail = await api(`/operations/${id}`);
  const text = [`${detail.operation.title}`, detail.operation.description || '', '', ...(detail.bills || []).map((b) => `• ${b.title}: ${money(b.total_amount)} (${b.bill_date})`)].join('\n');
  alert(text);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_DEBTS_OPS));
  const res = await fetch(API_DEBTS_OPS + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Error API');
  return data;
}

function injectStyles() {
  if (document.querySelector('#debtsOpsStyles')) return;
  const style = document.createElement('style');
  style.id = 'debtsOpsStyles';
  style.textContent = `
    .debt-list,.ops-list{display:grid;gap:10px}.debt-card,.op-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:20px;background:rgba(148,163,184,.08);padding:14px}.debt-card small,.op-card small{display:block;color:var(--muted);margin-top:4px}.debt-card b,.op-card b{display:block;text-align:right;margin-bottom:8px}.tiny-button{border:1px solid var(--line);background:rgba(56,189,248,.12);color:var(--text);border-radius:999px;padding:7px 10px;font-weight:900;cursor:pointer}.bill-editor-dialog{width:min(760px,calc(100vw - 20px));border:1px solid var(--line);border-radius:28px;background:var(--panel-strong);color:var(--text);box-shadow:var(--shadow);padding:0}.bill-editor-dialog::backdrop{background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}.bill-editor-card{position:relative;display:grid;gap:14px;padding:24px}.bill-editor-card h3{margin:0;font-size:1.55rem}.bill-editor-card .participant-row{grid-template-columns:auto 1fr 90px 130px}.split-mode{display:flex;gap:10px;flex-wrap:wrap}.split-mode label{border:1px solid var(--line);border-radius:999px;padding:8px 10px;font-weight:800;color:var(--muted)}.split-mode input{margin-right:6px}@media(max-width:760px){.debt-card,.op-card{display:grid}.debt-card b,.op-card b{text-align:left}.bill-editor-card{padding:22px 14px}.bill-editor-card .participant-row{grid-template-columns:auto 1fr}.bill-editor-card .participant-row input[type="number"]{grid-column:2;width:100%}}
  `;
  document.head.appendChild(style);
}

function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
