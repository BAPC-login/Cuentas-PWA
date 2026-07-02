import { showAppToast } from './ui-feedback.js';

const API_FAMILY_PRO = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_FAMILY_PRO = 'cuentas-pwa:session-token';
const CATEGORY_ICONS = ['🏠','🏡','🏢','💡','💧','🔥','🧯','⛽','🛢️','🛒','🥩','🍞','🍽️','🧾','💳','💸','🔧','🛠️','🪛','🧰','🧺','🚗','🚙','🛞','🔋','🅿️','📱','☎️','🌐','📺','💻','🎧','🔐','📦','🚚','🐶','🐱','💊','🏥','🦷','🎓','🎁','🎬','🎮','🎵','📚','✈️','🏖️','👕','👟','🧼','🧽','🧹','🌱','🏷️'];

setTimeout(initFamilyPro, 1500);
window.addEventListener('family-data-changed', () => refreshFamilyPro());

function initFamilyPro() {
  injectFamilyProStyles();
  injectRealBillsPanel();
  injectCategoryPanel();
  injectProfilePanel();
  refreshFamilyPro();
}

function injectRealBillsPanel() {
  const movements = document.querySelector('#view-movements');
  if (!movements || document.querySelector('#realBillsPanel')) return;
  movements.insertAdjacentHTML('beforeend', `
    <article class="panel" id="realBillsPanel">
      <div class="panel-header"><div><p class="eyebrow">Libro contable</p><h3>Cuentas comunes del hogar</h3></div><button class="text-button" id="realBillsRefresh" type="button">Actualizar</button></div>
      <p class="muted small">Aquí se muestran solo gastos simples y gastos compuestos agrupados. Los ítems internos de una operación no se duplican en la lista principal.</p>
      <div id="ledgerStats" class="ledger-stats"></div>
      <div class="ledger-section-title"><span>Gastos compuestos</span><small>Operaciones agrupadas</small></div>
      <div class="real-bills-list" id="operationLedgerList"><div class="empty-state">Sin operaciones compuestas.</div></div>
      <div class="ledger-section-title"><span>Gastos simples</span><small>Cuentas directas</small></div>
      <div class="real-bills-list" id="realBillsList"><div class="empty-state">Cargando cuentas...</div></div>
    </article>
  `);
  document.querySelector('#realBillsRefresh').addEventListener('click', refreshFamilyPro);
}

function injectCategoryPanel() {
  const people = document.querySelector('#view-people');
  if (!people || document.querySelector('#categoryPanel')) return;
  people.insertAdjacentHTML('beforeend', `
    <article class="panel" id="categoryPanel">
      <div class="panel-header"><div><p class="eyebrow">Categorías</p><h3>Categorías personalizadas</h3></div></div>
      <form id="categoryForm" class="form-stack">
        <div class="form-row">
          <label class="field"><span>Nombre</span><input id="categoryNameInput" placeholder="Ej: Arriendo, Reparación, Auto, Suscripciones"></label>
          <label class="field"><span>Icono</span><select id="categoryIconInput">${CATEGORY_ICONS.map(i => `<option value="${i}">${i}</option>`).join('')}</select></label>
        </div>
        <button class="secondary-button" type="submit">Crear categoría</button>
      </form>
      <div class="category-chip-list" id="categoryChipList"></div>
    </article>
  `);
  document.querySelector('#categoryForm').addEventListener('submit', createCategory);
}

function injectProfilePanel() {
  if (document.querySelector('#profileButton')) return;
  const card = document.querySelector('.sidebar-card');
  card?.insertAdjacentHTML('beforeend', '<button class="ghost-button full" id="profileButton" type="button">Editar perfil</button>');
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="profileDialog" class="profile-dialog">
      <form method="dialog" class="profile-card">
        <button class="dialog-close" value="cancel" aria-label="Cerrar" type="submit">×</button>
        <p class="eyebrow">Perfil</p><h3>Completa tus datos</h3>
        <p class="muted small">Esto aparece solo si falta tu nombre, y luego puedes cambiarlo cuando quieras.</p>
        <label class="field"><span>Nombre visible</span><input id="profileNameEdit" placeholder="Tu nombre"></label>
        <label class="field"><span>Foto / avatar por ahora URL opcional</span><input id="profileAvatarEdit" placeholder="https://..."></label>
        <button class="primary-button full" id="saveProfileButton" value="default" type="button">Guardar perfil</button>
      </form>
    </dialog>
  `);
  document.querySelector('#profileButton').addEventListener('click', openProfileDialog);
  document.querySelector('#saveProfileButton').addEventListener('click', saveProfile);
}

async function refreshFamilyPro() {
  const token = localStorage.getItem(TOKEN_FAMILY_PRO);
  if (!token) return;
  try {
    const [me, bills, cats, dash, ops, debts] = await Promise.all([
      api('/me'),
      api('/bills'),
      api('/categories'),
      api('/dashboard'),
      api('/operations').catch(() => ({ operations: [] })),
      api('/debts').catch(() => ({ debts: [] })),
    ]);
    window.__familyProMe = me.user;
    window.__familyProCategories = cats.categories || [];
    const allBills = bills.bills || [];
    renderRealBills(allBills, ops.operations || []);
    renderCategories(cats.categories || []);
    renderTopTotals(dash, debts.debts || []);
    renderLedgerStats(allBills, ops.operations || [], debts.debts || []);
    if (!me.user?.name) setTimeout(openProfileDialog, 400);
    applyFamilyMode(me.user);
  } catch (error) {
    console.warn('family-pro', error);
  }
}

function applyFamilyMode(user) {
  const isOwner = user?.role === 'owner';
  document.body.classList.toggle('member-mode', !isOwner);
}

function renderTopTotals(dash, debts = []) {
  const netRows = netDebtRows(debts);
  const totalPending = netRows.reduce((s, r) => s + r.amount, 0);
  const me = window.__familyProMe;
  const myOwe = netRows.filter((r) => r.debtor_id === me?.id).reduce((s, r) => s + r.amount, 0);
  const myFavor = netRows.filter((r) => r.receiver_id === me?.id).reduce((s, r) => s + r.amount, 0);
  const net = document.querySelector('#netBalance');
  const hint = document.querySelector('#balanceHint');
  if (net) net.textContent = money(totalPending);
  if (hint) hint.textContent = totalPending ? `Deuda neta abierta. Tu saldo: ${myFavor >= myOwe ? 'a favor ' + money(myFavor - myOwe) : 'por pagar ' + money(myOwe - myFavor)}.` : 'Todas las cuentas están compensadas.';
  const owedToMe = document.querySelector('#owedToMe');
  const iOwe = document.querySelector('#iOwe');
  if (owedToMe) owedToMe.textContent = money(myFavor);
  if (iOwe) iOwe.textContent = money(myOwe);
}

function renderLedgerStats(bills, ops, debts) {
  const box = document.querySelector('#ledgerStats');
  if (!box) return;
  const simpleBills = bills.filter((b) => !b.operation_id);
  const compoundTotal = ops.reduce((s, op) => s + Number(op.total_amount || 0), 0);
  const simpleTotal = simpleBills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const netOpen = netDebtRows(debts).reduce((s, r) => s + r.amount, 0);
  box.innerHTML = `
    <div><span>Total simple</span><strong>${money(simpleTotal)}</strong></div>
    <div><span>Total operaciones</span><strong>${money(compoundTotal)}</strong></div>
    <div><span>Deuda neta abierta</span><strong>${money(netOpen)}</strong></div>
  `;
}

function renderRealBills(bills, ops = []) {
  const list = document.querySelector('#realBillsList');
  const opList = document.querySelector('#operationLedgerList');
  if (!list) return;
  const simpleBills = bills.filter((b) => !b.operation_id);
  list.innerHTML = simpleBills.length ? simpleBills.map(renderBillCard).join('') : '<div class="empty-state">No hay gastos simples. Si pertenecen a una operación, aparecen arriba como gasto compuesto.</div>';
  if (opList) {
    opList.innerHTML = ops.length ? ops.map((op) => `
      <article class="real-bill-card operation-summary-card" data-op="${escapeHtml(op.id)}">
        <div><strong>${escapeHtml(op.category_icon || '🧰')} ${escapeHtml(op.title)}</strong><small>${escapeHtml(op.description || 'Gasto compuesto')} · ${escapeHtml(op.service_month || '')} · ${Number(op.item_count || 0)} ítems internos</small></div>
        <div class="bill-actions"><b>${money(op.total_amount)}</b><span class="badge ${op.status === 'closed' ? 'settled' : 'open'}">${op.status === 'closed' ? 'Cerrada' : 'Abierta'}</span><button class="tiny-button" data-action="open-op" data-id="${escapeHtml(op.id)}" type="button">Abrir detalle</button></div>
      </article>
    `).join('') : '<div class="empty-state">No hay gastos compuestos. Crea una operación para agrupar ítems como reparación lavadora.</div>';
  }
}

function renderBillCard(b) {
  return `
    <article class="real-bill-card" data-bill-id="${escapeHtml(b.id)}">
      <div><strong>${escapeHtml(b.category_icon || '')} ${escapeHtml(b.title)}</strong><small>${escapeHtml(b.category_name || '')} · mes ${escapeHtml(b.service_month || String(b.bill_date || '').slice(0,7))} · fecha ${escapeHtml(b.bill_date || '')}</small></div>
      <div class="bill-actions"><b>${money(b.total_amount)}</b><span class="badge ${b.status === 'paid' ? 'settled' : 'open'}">${labelStatus(b.status)}</span></div>
    </article>
  `;
}

function renderCategories(cats) {
  const list = document.querySelector('#categoryChipList');
  if (!list) return;
  list.innerHTML = cats.map((c) => `<span class="category-chip">${escapeHtml(c.icon || '🏷️')} ${escapeHtml(c.name)}</span>`).join('');
}

async function createCategory(event) {
  event.preventDefault();
  const form = document.querySelector('#categoryForm');
  const name = document.querySelector('#categoryNameInput').value.trim();
  const icon = document.querySelector('#categoryIconInput').value || '🏷️';
  if (!name) return showAppToast('Escribe un nombre de categoría.', 'error');
  try {
    await api('/categories', { method: 'POST', body: JSON.stringify({ name, icon, kind: 'expense' }) });
    form.reset();
    document.querySelector('#categoryIconInput').value = '🏷️';
    await refreshFamilyPro();
    showAppToast('Categoría creada.');
    window.dispatchEvent(new Event('family-data-changed'));
  } catch (error) {
    showAppToast(error.message || 'No se pudo crear la categoría.', 'error');
  }
}

function openProfileDialog() {
  const me = window.__familyProMe || {};
  const dialog = document.querySelector('#profileDialog');
  document.querySelector('#profileNameEdit').value = me.name || '';
  document.querySelector('#profileAvatarEdit').value = me.avatar_url || '';
  dialog?.showModal();
}

async function saveProfile() {
  const name = document.querySelector('#profileNameEdit').value.trim();
  const avatar_url = document.querySelector('#profileAvatarEdit').value.trim();
  if (name.length < 2) return showAppToast('Pon tu nombre visible.', 'error');
  try {
    await api('/me/profile', { method: 'PATCH', body: JSON.stringify({ name, avatar_url }) });
    document.querySelector('#profileDialog')?.close();
    showAppToast('Perfil actualizado.');
    await refreshFamilyPro();
  } catch (error) {
    showAppToast(error.message || 'No se pudo guardar el perfil.', 'error');
  }
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
  headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_FAMILY_PRO));
  const res = await fetch(API_FAMILY_PRO + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Error API');
  return data;
}

function injectFamilyProStyles() {
  if (document.querySelector('#familyProStyles')) return;
  const style = document.createElement('style');
  style.id = 'familyProStyles';
  style.textContent = `
    .real-bills-list,.category-chip-list{display:grid;gap:10px}.real-bill-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:20px;background:rgba(148,163,184,.08);padding:14px}.real-bill-card strong{display:block}.real-bill-card small{display:block;margin-top:4px;color:var(--muted)}.real-bill-card b{display:block;text-align:right;margin-bottom:8px}.bill-actions{display:grid;gap:8px;justify-items:end}.operation-summary-card{border-color:rgba(56,189,248,.32);background:linear-gradient(135deg,rgba(56,189,248,.12),rgba(167,139,250,.08))}.ledger-section-title{display:flex;justify-content:space-between;align-items:end;margin:18px 0 8px;color:var(--muted);font-size:.88rem}.ledger-section-title span{color:var(--text);font-weight:950}.ledger-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.ledger-stats>div{border:1px solid var(--line);border-radius:18px;background:rgba(15,23,42,.22);padding:12px}.ledger-stats span{display:block;color:var(--muted);font-size:.82rem;font-weight:800}.ledger-stats strong{display:block;margin-top:4px;font-size:1.15rem}.category-chip-list{display:flex;flex-wrap:wrap;margin-top:14px}.category-chip{border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:rgba(148,163,184,.08);font-weight:800}.profile-dialog{width:min(520px,calc(100vw - 24px));border:1px solid var(--line);border-radius:28px;background:var(--panel-strong);color:var(--text);box-shadow:var(--shadow);padding:0}.profile-dialog::backdrop{background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}.profile-card{position:relative;display:grid;gap:14px;padding:24px}.profile-card h3{margin:0;font-size:1.7rem}.member-mode #view-people .owner-only,.member-mode #categoryPanel,.member-mode .danger-zone{display:none!important}@media(max-width:760px){.real-bill-card{display:grid}.real-bill-card b,.bill-actions{text-align:left;justify-items:start}.profile-card{padding:22px 16px}.ledger-stats{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function labelStatus(status) { return ({ open: 'Pendiente', partial: 'Parcial', paid: 'Pagada', overdue: 'Atrasada', cancelled: 'Anulada' })[status] || status || 'Pendiente'; }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
