import { showAppToast, resetForm } from './ui-feedback.js';

const API_EXPENSE = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_EXPENSE = 'cuentas-pwa:session-token';

setTimeout(initExpenseEntry, 1800);
window.addEventListener('family-data-changed', () => { hydrateExpenseEntry(); setTimeout(enhanceBillCards, 450); });

function initExpenseEntry() {
  injectStyles();
  injectExpenseForm();
  document.addEventListener('click', handleExpenseActions);
  setInterval(enhanceBillCards, 1400);
  hydrateExpenseEntry();
}

function injectExpenseForm() {
  const movements = document.querySelector('#view-movements');
  if (!movements || document.querySelector('#expenseEntryPanel')) return;
  movements.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="expenseEntryPanel">
      <div class="panel-header"><div><p class="eyebrow">Carga rápida</p><h3>Subir gasto real</h3></div></div>
      <p class="muted small">Cualquier usuario autorizado puede subir gastos. El owner puede indicar quién pagó para que el balance quede correcto.</p>
      <form id="expenseEntryForm" class="form-stack">
        <div class="form-row"><label class="field"><span>Gasto</span><input id="expenseTitle" placeholder="Ej: Mano de obra técnico lavadora" required></label><label class="field"><span>Categoría</span><select id="expenseCategory" required></select></label></div>
        <div class="form-row"><label class="field"><span>Monto</span><input id="expenseAmount" inputmode="numeric" placeholder="30000" required></label><label class="field"><span>Pagó</span><select id="expensePaidBy" required></select></label></div>
        <div class="form-row"><label class="field"><span>Fecha del gasto</span><input id="expenseDate" type="date" required></label><label class="field"><span>Corresponde al mes de</span><input id="expenseMonth" type="month" required></label></div>
        <label class="field"><span>Descripción</span><input id="expenseDescription" placeholder="Detalle opcional"></label>
        <div class="participant-editor"><strong>Participantes</strong><div class="split-mode"><label><input type="radio" name="expenseSplitMode" value="equal" checked>Partes iguales</label><label><input type="radio" name="expenseSplitMode" value="manual">Montos específicos</label></div><div class="split-note">Marca participantes. En partes iguales no debes poner valores.</div><div id="expenseParticipants"></div></div>
        <button class="primary-button full" type="submit">Guardar gasto real</button>
      </form>
    </article>
  `);
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector('#expenseDate').value = today;
  document.querySelector('#expenseMonth').value = today.slice(0, 7);
  document.querySelector('#expenseEntryForm').addEventListener('submit', submitExpense);
  document.querySelector('#expenseAmount').addEventListener('input', () => splitExpenseEven(false));
  document.querySelector('#expenseParticipants').addEventListener('input', (event) => {
    if (event.target.matches('[data-expense-check],input[name="expenseSplitMode"]')) splitExpenseEven(false);
  });
}

async function hydrateExpenseEntry() {
  const token = localStorage.getItem(TOKEN_EXPENSE);
  if (!token || !document.querySelector('#expenseEntryPanel')) return;
  try {
    const [me, cats, users, ops] = await Promise.all([api('/me'), api('/categories'), api('/users').catch(() => ({ users: [] })), api('/operations').catch(() => ({ operations: [] }))]);
    window.__expenseMe = me.user;
    window.__expenseUsers = (users.users?.length ? users.users : [me.user]).filter((u) => u && u.status !== 'revoked');
    renderExpenseOptions(cats.categories || [], ops.operations || []);
    renderExpenseParticipants();
    enhanceBillCards();
  } catch (error) {
    console.warn('expense entry', error);
  }
}

function renderExpenseOptions(cats) {
  const cat = document.querySelector('#expenseCategory');
  const paidBy = document.querySelector('#expensePaidBy');
  if (cat) cat.innerHTML = cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
  if (paidBy) {
    const me = window.__expenseMe;
    const users = window.__expenseUsers || [];
    const canChoose = me?.role === 'owner';
    paidBy.innerHTML = (canChoose ? users : [me]).filter(Boolean).map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.email)}${u.role === 'owner' ? ' · owner' : ''}</option>`).join('');
    paidBy.disabled = !canChoose;
  }
}

function renderExpenseParticipants() {
  const box = document.querySelector('#expenseParticipants');
  const users = window.__expenseUsers || [];
  if (!box) return;
  box.innerHTML = users.map((u) => `<label class="participant-row"><input type="checkbox" data-expense-check value="${escapeHtml(u.id)}" checked><span>${escapeHtml(u.name || u.email)}</span><input data-expense-share="${escapeHtml(u.id)}" type="number" min="0" step="1" value="0"></label>`).join('');
  splitExpenseEven(true);
}

function enhanceBillCards() {
  document.querySelectorAll('.real-bill-card[data-bill-id]').forEach((card) => {
    const id = card.dataset.billId;
    if (!id || card.querySelector('[data-action="delete-bill"]')) return;
    card.insertAdjacentHTML('beforeend', `<button class="tiny-button danger-mini" data-action="delete-bill" data-id="${escapeHtml(id)}" type="button">Eliminar gasto</button>`);
  });
}

async function submitExpense(event) {
  event.preventDefault();
  const total = amountValue('#expenseAmount');
  const participants = buildParticipants(total);
  const sum = participants.reduce((s, p) => s + p.share_amount, 0);
  if (!total || !participants.length) return showAppToast('Falta monto o participantes.', 'error');
  if (sum !== total) return showAppToast(`La suma debe ser ${money(total)}.`, 'error');
  try {
    await api('/bills', { method: 'POST', body: JSON.stringify({
      title: document.querySelector('#expenseTitle').value.trim(),
      category_id: document.querySelector('#expenseCategory').value,
      total_amount: total,
      paid_by_user_id: document.querySelector('#expensePaidBy').value,
      bill_date: document.querySelector('#expenseDate').value,
      service_month: document.querySelector('#expenseMonth').value,
      description: document.querySelector('#expenseDescription').value.trim(),
      participants,
    }) });
    resetForm(document.querySelector('#expenseEntryForm'));
    document.querySelector('#expenseDate').value = new Date().toISOString().slice(0, 10);
    document.querySelector('#expenseMonth').value = new Date().toISOString().slice(0, 7);
    renderExpenseParticipants();
    showAppToast('Gasto creado y participantes notificados.');
    window.dispatchEvent(new Event('family-data-changed'));
  } catch (error) {
    showAppToast(error.message || 'No se pudo crear el gasto.', 'error');
  }
}

async function handleExpenseActions(event) {
  const button = event.target.closest('button[data-action="delete-bill"]');
  if (!button) return;
  const id = button.dataset.id;
  if (!confirm('¿Eliminar este gasto? Esta acción quita el gasto y sus participantes.')) return;
  try {
    await api(`/bills/${id}`, { method: 'DELETE' });
    showAppToast('Gasto eliminado.');
    window.dispatchEvent(new Event('family-data-changed'));
  } catch (error) {
    showAppToast(error.message || 'No se pudo eliminar.', 'error');
  }
}

function buildParticipants(total) {
  const mode = document.querySelector('input[name="expenseSplitMode"]:checked')?.value || 'equal';
  const checked = [...document.querySelectorAll('[data-expense-check]:checked')];
  if (mode === 'equal') return splitValues(checked.map((c) => c.value), total).map(([user_id, share_amount]) => ({ user_id, share_amount }));
  return checked.map((checkbox) => ({ user_id: checkbox.value, share_amount: Number(document.querySelector(`[data-expense-share="${CSS.escape(checkbox.value)}"]`).value || 0) })).filter((p) => p.share_amount > 0);
}

function splitExpenseEven(force = true) {
  const total = amountValue('#expenseAmount');
  const checked = [...document.querySelectorAll('[data-expense-check]:checked')];
  const mode = document.querySelector('input[name="expenseSplitMode"]:checked')?.value || 'equal';
  if (!checked.length) return;
  if (!total) return document.querySelectorAll('[data-expense-share]').forEach((i) => { if (force || mode === 'equal') i.value = 0; });
  if (!force && mode !== 'equal') return;
  splitValues(checked.map((c) => c.value), total).forEach(([id, value]) => {
    const input = document.querySelector(`[data-expense-share="${CSS.escape(id)}"]`);
    if (input) input.value = value;
  });
  [...document.querySelectorAll('[data-expense-check]:not(:checked)')].forEach((checkbox) => {
    const input = document.querySelector(`[data-expense-share="${CSS.escape(checkbox.value)}"]`);
    if (input) input.value = 0;
  });
}

function splitValues(ids, amount) { const base = Math.floor(amount / ids.length); return ids.map((id, index) => [id, index === ids.length - 1 ? amount - base * (ids.length - 1) : base]); }
async function api(path, options = {}) { const headers = new Headers(options.headers || {}); headers.set('content-type', 'application/json'); headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_EXPENSE)); const res = await fetch(API_EXPENSE + path, { ...options, headers }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.message || data.error || 'Error API'); return data; }
function amountValue(selector) { return Number(String(document.querySelector(selector)?.value || '').replace(/[^0-9]/g, '')); }
function injectStyles() { if (document.querySelector('#expenseEntryStyles')) return; const style = document.createElement('style'); style.id = 'expenseEntryStyles'; style.textContent = `#expenseEntryPanel{border-color:rgba(56,189,248,.25)}#expenseEntryPanel .participant-row{grid-template-columns:auto 1fr 130px}.danger-mini{background:rgba(248,113,113,.12)!important;border-color:rgba(248,113,113,.36)!important}@media(max-width:760px){#expenseEntryPanel .participant-row{grid-template-columns:auto 1fr}#expenseEntryPanel .participant-row input[type="number"]{grid-column:2;width:100%}}`; document.head.appendChild(style); }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
