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
      <div class="panel-header"><div><p class="eyebrow">Cuentas reales</p><h3>Libro de cuentas del hogar</h3></div><button class="text-button" id="realBillsRefresh" type="button">Actualizar</button></div>
      <p class="muted small">Cuenta = gasto autorizado. Pago = comprobante/transferencia que cubre una deuda. Operación = grupo de gastos relacionados.</p>
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
    const [me, bills, cats, dash] = await Promise.all([api('/me'), api('/bills'), api('/categories'), api('/dashboard')]);
    window.__familyProMe = me.user;
    window.__familyProCategories = cats.categories || [];
    renderRealBills(bills.bills || []);
    renderCategories(cats.categories || []);
    renderTopTotals(dash);
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

function renderTopTotals(dash) {
  const pending = dash.pending_by_user || [];
  const me = window.__familyProMe;
  const mine = pending.find((p) => p.id === me?.id)?.pending || 0;
  const totalPending = pending.reduce((s, p) => s + Number(p.pending || 0), 0);
  const net = document.querySelector('#netBalance');
  const hint = document.querySelector('#balanceHint');
  if (net) net.textContent = money(totalPending);
  if (hint) hint.textContent = totalPending ? `Pendiente familiar total. Tu pendiente: ${money(mine)}.` : 'No hay cuentas pendientes en D1.';
}

function renderRealBills(bills) {
  const list = document.querySelector('#realBillsList');
  if (!list) return;
  list.innerHTML = bills.length ? bills.map((b) => `
    <article class="real-bill-card" data-bill-id="${escapeHtml(b.id)}">
      <div><strong>${escapeHtml(b.category_icon || '')} ${escapeHtml(b.title)}</strong><small>${escapeHtml(b.category_name || '')} · corresponde a ${escapeHtml(b.service_month || String(b.bill_date || '').slice(0,7))} · pago/emisión ${escapeHtml(b.bill_date || '')}${b.operation_title ? ' · operación: ' + escapeHtml(b.operation_title) : ''}</small></div>
      <div><b>${money(b.total_amount)}</b><span class="badge ${b.status === 'paid' ? 'settled' : 'open'}">${labelStatus(b.status)}</span></div>
    </article>
  `).join('') : '<div class="empty-state">Aún no hay cuentas reales cargadas.</div>';
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
    .real-bills-list,.category-chip-list{display:grid;gap:10px}.real-bill-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:20px;background:rgba(148,163,184,.08);padding:14px}.real-bill-card strong{display:block}.real-bill-card small{display:block;margin-top:4px;color:var(--muted)}.real-bill-card b{display:block;text-align:right;margin-bottom:8px}.category-chip-list{display:flex;flex-wrap:wrap;margin-top:14px}.category-chip{border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:rgba(148,163,184,.08);font-weight:800}.profile-dialog{width:min(520px,calc(100vw - 24px));border:1px solid var(--line);border-radius:28px;background:var(--panel-strong);color:var(--text);box-shadow:var(--shadow);padding:0}.profile-dialog::backdrop{background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}.profile-card{position:relative;display:grid;gap:14px;padding:24px}.profile-card h3{margin:0;font-size:1.7rem}.member-mode #view-people .owner-only,.member-mode #categoryPanel,.member-mode .danger-zone{display:none!important}@media(max-width:760px){.real-bill-card{display:grid}.real-bill-card b{text-align:left}.profile-card{padding:22px 16px}}
  `;
  document.head.appendChild(style);
}

function labelStatus(status) { return ({ open: 'Pendiente', partial: 'Parcial', paid: 'Pagada', overdue: 'Atrasada', cancelled: 'Anulada' })[status] || status || 'Pendiente'; }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
