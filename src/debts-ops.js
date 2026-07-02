const API_DEBTS_OPS = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_DEBTS_OPS = 'cuentas-pwa:session-token';

setTimeout(initDebtsOps, 1700);
window.addEventListener('family-data-changed', () => refreshDebtsOps());

function initDebtsOps() {
  injectStyles();
  injectDebtPanel();
  injectOperationsPanel();
  injectBillEditor();
  injectOperationDialogs();
  document.addEventListener('click', handleGlobalClick);
  refreshDebtsOps();
}

function injectDebtPanel() {
  const dashboard = document.querySelector('#view-dashboard');
  if (!dashboard || document.querySelector('#debtMatrixPanel')) return;
  dashboard.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="debtMatrixPanel">
      <div class="panel-header"><div><p class="eyebrow">Detalle y balance</p><h3>Deudas abiertas del hogar</h3></div><button class="text-button" id="debtRefresh" type="button">Actualizar</button></div>
      <p class="muted small">Primero se muestra cada deuda por gasto. Al final se calcula el saldo neto compensado entre personas.</p>
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
      <p class="muted small">Agrupa varios gastos en una sola operación: diagnóstico, repuesto, mano de obra, compras relacionadas, etc. En el libro principal aparece como un solo gasto compuesto.</p>
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
        <p class="eyebrow">Editar gasto común</p><h3 id="billEditorTitle">Cuenta</h3>
        <div class="form-row"><label class="field"><span>Título</span><input id="editBillTitle"></label><label class="field"><span>Categoría</span><select id="editBillCategory"></select></label></div>
        <div class="form-row"><label class="field"><span>Monto total</span><input id="editBillAmount" inputmode="numeric"></label><label class="field"><span>Fecha</span><input id="editBillDate" type="date"></label></div>
        <div class="form-row"><label class="field"><span>Corresponde al mes de</span><input id="editBillMonth" type="month"></label><label class="field"><span>Operación</span><select id="editBillOperation"><option value="">Sin operación</option></select></label></div>
        <label class="field"><span>Descripción</span><input id="editBillDescription"></label>
        <div class="participant-editor"><strong>Se divide entre</strong><div class="split-mode"><label><input type="radio" name="editSplitMode" value="equal" checked>Partes iguales</label><label><input type="radio" name="editSplitMode" value="manual">Montos específicos</label></div><div class="split-note">Marca participantes y revisa que el total cuadre. Si el mes está cerrado, el backend bloqueará el cambio.</div><div id="editBillParticipants"></div><button class="tiny-button" id="editSplitEven" type="button">Repartir igual ahora</button></div>
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

function injectOperationDialogs() {
  if (document.querySelector('#operationDetailDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="operationDetailDialog" class="bill-editor-dialog">
      <form method="dialog" class="bill-editor-card">
        <button class="dialog-close" value="cancel" aria-label="Cerrar" type="submit">×</button>
        <p class="eyebrow">Gasto compuesto</p><h3 id="operationDetailTitle">Operación</h3>
        <p class="muted small" id="operationDetailDescription"></p>
        <div class="summary-grid compact-summary" id="operationDetailStats"></div>
        <div id="operationDetailBills" class="detail-list"></div>
      </form>
    </dialog>
    <dialog id="operationEditorDialog" class="bill-editor-dialog">
      <form method="dialog" class="bill-editor-card">
        <button class="dialog-close" value="cancel" aria-label="Cerrar" type="submit">×</button>
        <p class="eyebrow">Editar operación</p><h3>Gasto compuesto</h3>
        <div class="form-row"><label class="field"><span>Operación</span><input id="editOpTitle"></label><label class="field"><span>Categoría</span><select id="editOpCategory"></select></label></div>
        <div class="form-row"><label class="field"><span>Fecha</span><input id="editOpDate" type="date"></label><label class="field"><span>Mes</span><input id="editOpMonth" type="month"></label></div>
        <label class="field"><span>Descripción</span><input id="editOpDescription"></label>
        <button class="primary-button full" id="saveOperationEditor" type="button">Guardar operación</button>
      </form>
    </dialog>
  `);
  document.querySelector('#saveOperationEditor').addEventListener('click', saveOperationEditor);
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
    window.__debtsOpsBills = bills.bills || [];
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
  const details = data.details || [];
  const netRows = data.net_summary?.length ? data.net_summary : netDebtRows(data.debts || []);
  if (!details.length && !netRows.length) {
    list.innerHTML = '<div class="empty-state">No hay deuda pendiente registrada. Todo está compensado.</div>';
    return;
  }
  const detailHtml = details.length ? `
    <div class="debt-section-title"><span>Detalle por gasto</span><small>${details.length} deuda${details.length === 1 ? '' : 's'} abierta${details.length === 1 ? '' : 's'}</small></div>
    ${details.map((d) => `
      <article class="debt-card debt-detail-card">
        <div>
          <strong>${escapeHtml(d.debtor_name || d.debtor_email)} debe a ${escapeHtml(d.receiver_name || d.receiver_email)}</strong>
          <small>${escapeHtml(d.category_icon || '')} ${escapeHtml(d.bill_title)} · ${escapeHtml(d.category_name || '')} · mes ${escapeHtml(d.service_month || '')}${d.operation_title ? ' · operación: ' + escapeHtml(d.operation_title) : ''}</small>
          <small>Asignado ${money(d.total_assigned)} · pagado ${money(d.total_paid)}</small>
        </div>
        <b>${money(d.pending)}</b>
      </article>
    `).join('')}
  ` : '';
  const netHtml = netRows.length ? `
    <div class="debt-section-title net-summary-title"><span>Balance final neto</span><small>Después de compensar deudas cruzadas</small></div>
    ${netRows.map((d) => `
      <article class="debt-card net-debt-card">
        <div><strong>${escapeHtml(d.debtor_name)} debe pagar a ${escapeHtml(d.receiver_name)}</strong><small>Saldo final compensado entre ambas personas</small></div>
        <b>${money(d.amount)}</b>
      </article>
    `).join('')}
  ` : '<div class="debt-section-title net-summary-title"><span>Balance final neto</span><small>Todo compensado entre personas</small></div>';
  list.innerHTML = detailHtml + netHtml;
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
      <div><strong>${escapeHtml(op.category_icon || '')} ${escapeHtml(op.title)}</strong><small>${escapeHtml(op.description || 'Sin descripción')} · ${escapeHtml(op.service_month)} · ${op.item_count || 0} ítems internos</small></div>
      <div><b>${money(op.total_amount)}</b><button class="tiny-button" data-action="open-op" data-id="${escapeHtml(op.id)}" type="button">Ver detalle</button><button class="tiny-button" data-action="edit-op" data-id="${escapeHtml(op.id)}" type="button">Editar</button></div>
    </article>
  `).join('') : '<div class="empty-state">Aún no hay operaciones. Crea una para Reparación lavadora.</div>';
}

function enhanceRealBillsEditButtons(bills) {
  const byId = new Map((bills || []).map((b) => [b.id, b]));
  document.querySelectorAll('.real-bill-card[data-bill-id]').forEach((card) => {
    const id = card.dataset.billId;
    if (!id || !byId.has(id)) return;
    let actions = card.querySelector('.bill-actions') || card;
    if (!card.querySelector('[data-action="edit-bill"]')) actions.insertAdjacentHTML('beforeend', `<button class="tiny-button" data-action="edit-bill" data-id="${escapeHtml(id)}" type="button">Editar gasto</button>`);
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
  await refreshEverything();
}

async function handleGlobalClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'edit-bill') return openBillEditor(button.dataset.id);
  if (button.dataset.action === 'open-op') return showOperationDetail(button.dataset.id);
  if (button.dataset.action === 'edit-op') return openOperationEditor(button.dataset.id);
}

async function openBillEditor(id) {
  try {
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
    document.querySelector('input[name="editSplitMode"][value="manual"]').checked = true;
    document.querySelector('#billEditorDialog').showModal();
  } catch (error) {
    alert(error.message || 'No se pudo abrir el editor.');
  }
}

function renderEditorParticipants(total, current) {
  const users = window.__debtsOpsUsers || [];
  const byId = new Map(current.map((p) => [p.user_id, p]));
  const checkedIds = current.length ? new Set(current.map((p) => p.user_id)) : new Set(users.map((u) => u.id));
  const html = users.map((u) => {
    const p = byId.get(u.id);
    const checked = checkedIds.has(u.id) ? 'checked' : '';
    const amount = Number(p?.share_amount || 0);
    return `<label class="participant-row"><input type="checkbox" data-edit-check value="${escapeHtml(u.id)}" ${checked}><span>${escapeHtml(u.name || u.email)}</span><input data-edit-share="${escapeHtml(u.id)}" type="number" min="0" step="1" value="${amount}" placeholder="Monto"></label>`;
  }).join('');
  document.querySelector('#editBillParticipants').innerHTML = html;
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
    if (share) share.value = amount;
  });
  [...document.querySelectorAll('[data-edit-check]:not(:checked)')].forEach((checkbox) => {
    const share = document.querySelector(`[data-edit-share="${CSS.escape(checkbox.value)}"]`);
    if (share) share.value = 0;
  });
}

async function saveBillEditor() {
  const id = window.__editingBillId;
  const total = Number(String(document.querySelector('#editBillAmount').value).replace(/[^0-9]/g, ''));
  const participants = [...document.querySelectorAll('[data-edit-check]:checked')].map((checkbox) => ({
    user_id: checkbox.value,
    share_amount: Number(document.querySelector(`[data-edit-share="${CSS.escape(checkbox.value)}"]`).value || 0),
  })).filter((p) => p.share_amount > 0);
  const sum = participants.reduce((s, p) => s + p.share_amount, 0);
  if (sum !== total) return alert(`La suma (${money(sum)}) debe ser igual al total (${money(total)}).`);
  try {
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
    await refreshEverything();
  } catch (error) {
    alert(error.message || 'No se pudo guardar. Si el mes está cerrado, reábrelo primero.');
  }
}

async function showOperationDetail(id) {
  try {
    const detail = await api(`/operations/${id}`);
    const op = detail.operation || {};
    const bills = detail.bills || [];
    document.querySelector('#operationDetailTitle').textContent = op.title || 'Operación';
    document.querySelector('#operationDetailDescription').textContent = op.description || 'Sin descripción.';
    document.querySelector('#operationDetailStats').innerHTML = `
      <div class="summary-card"><span>Total</span><strong>${money(bills.reduce((s,b)=>s+Number(b.total_amount||0),0))}</strong></div>
      <div class="summary-card"><span>Ítems</span><strong>${bills.length}</strong></div>
      <div class="summary-card"><span>Mes</span><strong>${escapeHtml(op.service_month || '')}</strong></div>
    `;
    document.querySelector('#operationDetailBills').innerHTML = bills.length ? bills.map((b) => `<article class="detail-row"><div><strong>${escapeHtml(b.category_icon || '')} ${escapeHtml(b.title)}</strong><small>${escapeHtml(b.bill_date || '')} · ${escapeHtml(b.category_name || '')}</small></div><b>${money(b.total_amount)}</b></article>`).join('') : '<div class="empty-state">Esta operación todavía no tiene gastos asociados.</div>';
    document.querySelector('#operationDetailDialog').showModal();
  } catch (error) {
    alert(error.message || 'No se pudo abrir el detalle.');
  }
}

async function openOperationEditor(id) {
  const op = (window.__debtsOpsOperations || []).find((item) => item.id === id) || (await api(`/operations/${id}`)).operation;
  window.__editingOperationId = id;
  document.querySelector('#editOpTitle').value = op.title || '';
  document.querySelector('#editOpDate').value = String(op.expense_date || '').slice(0, 10);
  document.querySelector('#editOpMonth').value = op.service_month || String(op.expense_date || '').slice(0, 7);
  document.querySelector('#editOpDescription').value = op.description || '';
  document.querySelector('#editOpCategory').innerHTML = (window.__debtsOpsCategories || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === op.category_id ? 'selected' : ''}>${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
  document.querySelector('#operationEditorDialog').showModal();
}

async function saveOperationEditor() {
  const id = window.__editingOperationId;
  try {
    await api(`/operations/${id}`, { method: 'PATCH', body: JSON.stringify({
      title: document.querySelector('#editOpTitle').value.trim(),
      category_id: document.querySelector('#editOpCategory').value,
      expense_date: document.querySelector('#editOpDate').value,
      service_month: document.querySelector('#editOpMonth').value,
      description: document.querySelector('#editOpDescription').value.trim(),
    }) });
    document.querySelector('#operationEditorDialog').close();
    await refreshEverything();
  } catch (error) {
    alert(error.message || 'No se pudo actualizar la operación.');
  }
}

async function refreshEverything() {
  await refreshDebtsOps();
  window.dispatchEvent(new Event('family-data-changed'));
  document.querySelector('#familyLiteReload')?.click();
}

function netDebtRows(debts) {
  const names = new Map();
  const pairs = new Map();
  (debts || []).forEach((d) => {
    const debtorId = d.debtor_id || d.id;
    const receiverId = d.receiver_id || d.owes_to?.id;
    const amount = Number(d.pending || 0);
    if (!debtorId || !receiverId || debtorId === receiverId || amount <= 0) return;
    names.set(debtorId, d.debtor_name || d.name || d.debtor_email || d.email || 'Usuario');
    names.set(receiverId, d.receiver_name || d.owes_to?.name || d.receiver_email || d.owes_to?.email || 'Usuario');
    const key = [debtorId, receiverId].sort().join('::');
    const row = pairs.get(key) || { a: debtorId, b: receiverId, amountAB: 0, amountBA: 0 };
    if (debtorId === row.a) row.amountAB += amount; else row.amountBA += amount;
    pairs.set(key, row);
  });
  return [...pairs.values()].map((r) => {
    const net = r.amountAB - r.amountBA;
    if (net > 0) return { debtor_id: r.a, debtor_name: names.get(r.a), receiver_id: r.b, receiver_name: names.get(r.b), amount: net };
    if (net < 0) return { debtor_id: r.b, debtor_name: names.get(r.b), receiver_id: r.a, receiver_name: names.get(r.a), amount: Math.abs(net) };
    return null;
  }).filter(Boolean).sort((a, b) => b.amount - a.amount);
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
    .debt-list,.ops-list,.detail-list{display:grid;gap:10px}.debt-card,.op-card,.detail-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:20px;background:rgba(148,163,184,.08);padding:14px}.debt-detail-card{background:rgba(148,163,184,.07)}.net-debt-card{border-color:rgba(34,197,94,.28);background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(56,189,248,.07))}.debt-section-title{display:flex;justify-content:space-between;align-items:end;margin:10px 2px 2px;color:var(--muted);font-size:.86rem}.debt-section-title span{color:var(--text);font-weight:950}.net-summary-title{margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}.debt-card small,.op-card small,.detail-row small{display:block;color:var(--muted);margin-top:4px}.debt-card b,.op-card b,.detail-row b{display:block;text-align:right;margin-bottom:8px}.tiny-button{border:1px solid var(--line);background:rgba(56,189,248,.12);color:var(--text);border-radius:999px;padding:7px 10px;font-weight:900;cursor:pointer}.bill-editor-dialog{width:min(820px,calc(100vw - 20px));border:1px solid var(--line);border-radius:28px;background:var(--panel-strong);color:var(--text);box-shadow:var(--shadow);padding:0}.bill-editor-dialog::backdrop{background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}.bill-editor-card{position:relative;display:grid;gap:14px;padding:24px}.bill-editor-card h3{margin:0;font-size:1.55rem}.bill-editor-card .participant-row{grid-template-columns:auto 1fr 130px}.split-mode{display:flex;gap:10px;flex-wrap:wrap}.split-mode label{border:1px solid var(--line);border-radius:999px;padding:8px 10px;font-weight:800;color:var(--muted)}.split-mode input{margin-right:6px}.compact-summary{grid-template-columns:repeat(3,1fr)}@media(max-width:760px){.debt-card,.op-card,.detail-row{display:grid}.debt-card b,.op-card b,.detail-row b{text-align:left}.debt-section-title{display:grid;gap:3px}.bill-editor-card{padding:22px 14px}.bill-editor-card .participant-row{grid-template-columns:auto 1fr}.bill-editor-card .participant-row input[type="number"]{grid-column:2;width:100%}.compact-summary{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
