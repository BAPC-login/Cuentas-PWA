const API_BASE = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const STORAGE_KEY = 'cuentas-pwa:v4';
const TOKEN_KEY = 'cuentas-pwa:session-token';

let token = localStorage.getItem(TOKEN_KEY) || '';
let sessionUser = null;
let pendingEmail = '';
let state = loadState();
let searchTerm = '';
let pendingReceipt = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  activeMemberSelect: $('#activeMemberSelect'),
  debtorSelect: $('#debtorSelect'),
  creditorSelect: $('#creditorSelect'),
  amountInput: $('#amountInput'),
  dateInput: $('#dateInput'),
  noteInput: $('#noteInput'),
  receiptInput: $('#receiptInput'),
  movementForm: $('#movementForm'),
  memberForm: $('#memberForm'),
  memberNameInput: $('#memberNameInput'),
  memberRoleSelect: $('#memberRoleSelect'),
  memberList: $('#memberList'),
  ownerStatusBadge: $('#ownerStatusBadge'),
  ownerHelpText: $('#ownerHelpText'),
  relationshipList: $('#relationshipList'),
  recentMovements: $('#recentMovements'),
  allMovements: $('#allMovements'),
  searchInput: $('#searchInput'),
  topbarTitle: $('#topbarTitle'),
  netBalance: $('#netBalance'),
  balanceHint: $('#balanceHint'),
  activePerspectiveTitle: $('#activePerspectiveTitle'),
  owedToMe: $('#owedToMe'),
  iOwe: $('#iOwe'),
  receiptCount: $('#receiptCount'),
  backupPreview: $('#backupPreview'),
  exportButton: $('#exportButton'),
  importInput: $('#importInput'),
  resetButton: $('#resetButton'),
  themeToggle: $('#themeToggle'),
  quickAddButton: $('#quickAddButton'),
  menuButton: $('#menuButton'),
  toast: $('#toast'),
  receiptDialog: $('#receiptDialog'),
  receiptImage: $('#receiptImage'),
  closeDialog: $('#closeDialog'),
};

init();

async function init() {
  injectAuthGate();
  injectSessionControls();
  injectEmailField();
  elements.dateInput.valueAsDate = new Date();
  document.body.classList.toggle('light', state.settings.theme === 'light');
  bindEvents();
  await bootstrapAuth();
  registerServiceWorker();
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      settings: { activeMemberId: raw.settings?.activeMemberId || '', theme: raw.settings?.theme || 'dark' },
      members: Array.isArray(raw.members) ? raw.members : [],
      movements: Array.isArray(raw.movements) ? raw.movements : [],
    };
  } catch {
    return { settings: { activeMemberId: '', theme: 'dark' }, members: [], movements: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateBackupPreview();
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', ['Bearer', token].join(' '));
  const response = await fetch(API_BASE + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'api_error');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function bootstrapAuth() {
  if (!token) {
    showLogin();
    return;
  }
  try {
    const data = await api('/me');
    sessionUser = normalizeRemoteUser(data.user);
    hideLogin();
    await refreshRemoteUsers();
    render();
  } catch {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }
}

function injectAuthGate() {
  if ($('#authGate')) return;
  const styles = document.createElement('style');
  styles.textContent = `.auth-gate{position:fixed;inset:0;z-index:200;display:none;place-items:center;padding:18px;background:rgba(2,6,23,.92);backdrop-filter:blur(18px)}.auth-gate.active{display:grid}.auth-card{width:min(520px,100%);padding:28px;border:1px solid var(--line);border-radius:var(--radius-xl);background:var(--panel-strong);box-shadow:var(--shadow)}.auth-step{display:none;gap:16px}.auth-step.active{display:grid}.auth-note{margin-top:14px;padding:12px;border-radius:16px;background:rgba(56,189,248,.1);color:var(--muted)}body.auth-required .app-shell{filter:blur(10px);pointer-events:none;user-select:none}.session-actions{margin-top:12px}.member-card.revoked{opacity:.55}`;
  document.head.appendChild(styles);
  const gate = document.createElement('section');
  gate.className = 'auth-gate';
  gate.id = 'authGate';
  gate.innerHTML = `<div class="auth-card"><div class="brand auth-brand"><div class="brand-mark">↔</div><div><p class="eyebrow">Cuentas Hogar</p><h1>Ingreso por correo</h1></div></div><div class="auth-step active" id="authEmailStep"><p class="muted">Ingresa tu correo. La sesión queda abierta hasta logout o revocación del owner.</p><form id="emailLoginForm" class="form-stack"><label class="field"><span>Correo</span><input id="loginEmailInput" type="email" placeholder="tu-correo@dominio.com" required></label><button class="primary-button full" type="submit">Enviar código</button></form></div><div class="auth-step" id="authCodeStep"><p class="muted" id="codeHelpText">Ingresa el código temporal.</p><form id="codeLoginForm" class="form-stack"><label class="field"><span>Código</span><input id="loginCodeInput" inputmode="numeric" maxlength="6" required></label><label class="field"><span>Nombre si es primera vez</span><input id="profileNameInput" placeholder="Tu nombre visible"></label><button class="primary-button full" type="submit">Entrar</button><button class="ghost-button full" id="backToEmailButton" type="button">Cambiar correo</button></form></div><div class="auth-note" id="authNote">Modo demo: el código se muestra aquí hasta conectar envío real por correo.</div></div>`;
  document.body.appendChild(gate);
}

function showLogin() {
  document.body.classList.add('auth-required');
  $('#authGate').classList.add('active');
}

function hideLogin() {
  document.body.classList.remove('auth-required');
  $('#authGate').classList.remove('active');
}

function bindEvents() {
  $('#emailLoginForm')?.addEventListener('submit', requestCode);
  $('#codeLoginForm')?.addEventListener('submit', verifyCode);
  $('#backToEmailButton')?.addEventListener('click', () => setAuthStep('email'));
  $$('.nav-tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-view-shortcut]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewShortcut)));
  elements.quickAddButton.addEventListener('click', () => { setView('movements'); setTimeout(() => elements.amountInput.focus(), 80); });
  $('#logoutButton')?.addEventListener('click', logout);
  elements.menuButton.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  elements.activeMemberSelect.addEventListener('change', (event) => { state.settings.activeMemberId = event.target.value; saveState(); render(); });
  elements.themeToggle.addEventListener('click', () => { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; document.body.classList.toggle('light', state.settings.theme === 'light'); saveState(); });
  elements.movementForm.addEventListener('submit', (event) => { event.preventDefault(); addMovement(); });
  elements.memberForm.addEventListener('submit', (event) => { event.preventDefault(); addMember(); });
  elements.searchInput.addEventListener('input', (event) => { searchTerm = event.target.value.trim().toLowerCase(); renderMovements(); });
  elements.exportButton.addEventListener('click', exportData);
  elements.importInput.addEventListener('change', importData);
  elements.resetButton.addEventListener('click', resetData);
  elements.allMovements.addEventListener('click', handleMovementAction);
  elements.recentMovements.addEventListener('click', handleMovementAction);
  elements.memberList.addEventListener('click', handleMemberAction);
  elements.closeDialog.addEventListener('click', () => elements.receiptDialog.close());
  elements.receiptDialog.addEventListener('click', (event) => { if (event.target === elements.receiptDialog) elements.receiptDialog.close(); });
  elements.receiptInput.addEventListener('change', async (event) => { const [file] = event.target.files; if (!file) return; pendingReceipt = await compressImage(file); showToast('Comprobante listo para guardar.'); });
}

function injectSessionControls() {
  const card = document.querySelector('.sidebar-card');
  if (!card || $('#logoutButton')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'button-row session-actions';
  wrapper.innerHTML = '<button class="ghost-button" id="logoutButton" type="button">Logout</button>';
  card.appendChild(wrapper);
}

function injectEmailField() {
  if (!elements.memberForm || $('#memberEmailInput')) return;
  const label = document.createElement('label');
  label.className = 'field';
  label.innerHTML = '<span>Correo del usuario</span><input id="memberEmailInput" type="email" placeholder="usuario@correo.com" autocomplete="off">';
  elements.memberForm.insertBefore(label, elements.memberForm.firstChild);
  const nameLabel = elements.memberNameInput.closest('.field');
  if (nameLabel) nameLabel.querySelector('span').textContent = 'Nombre visible opcional';
  const submit = elements.memberForm.querySelector('button[type="submit"]');
  if (submit) submit.textContent = 'Crear invitación';
}

async function requestCode(event) {
  event.preventDefault();
  pendingEmail = $('#loginEmailInput').value.trim().toLowerCase();
  $('#authNote').textContent = 'Generando código...';
  try {
    const data = await api('/auth/request-code', { method: 'POST', body: JSON.stringify({ email: pendingEmail }) });
    $('#codeHelpText').textContent = `Código demo: ${data.demo_code}`;
    $('#authNote').textContent = 'Código generado. En producción llegará por correo.';
    setAuthStep('code');
  } catch (error) {
    $('#authNote').textContent = error.status === 403 ? 'Ese correo no tiene acceso. Pídele al owner que lo cree.' : `Error: ${error.message}`;
  }
}

async function verifyCode(event) {
  event.preventDefault();
  $('#authNote').textContent = 'Validando sesión...';
  try {
    const data = await api('/auth/verify-code', { method: 'POST', body: JSON.stringify({ email: pendingEmail, code: $('#loginCodeInput').value, name: $('#profileNameInput').value }) });
    token = data.session.token;
    localStorage.setItem(TOKEN_KEY, token);
    sessionUser = normalizeRemoteUser(data.user);
    hideLogin();
    await refreshRemoteUsers();
    render();
    showToast('Sesión iniciada.');
  } catch (error) {
    $('#authNote').textContent = error.status === 409 ? 'Completa tu nombre para activar el usuario.' : `No se pudo entrar: ${error.message}`;
  }
}

function setAuthStep(step) {
  $('#authEmailStep').classList.toggle('active', step === 'email');
  $('#authCodeStep').classList.toggle('active', step === 'code');
}

async function refreshRemoteUsers() {
  if (!sessionUser) return;
  if (sessionUser.role === 'owner') {
    try {
      const data = await api('/owner/users');
      state.members = data.users.map(normalizeRemoteUser);
    } catch {
      state.members = [sessionUser];
    }
  } else {
    state.members = [sessionUser];
  }
  if (!state.settings.activeMemberId || !state.members.some((m) => m.id === state.settings.activeMemberId)) state.settings.activeMemberId = sessionUser.id;
  if (sessionUser.role !== 'owner') state.settings.activeMemberId = sessionUser.id;
  saveState();
}

function normalizeRemoteUser(user) {
  return { id: user.id, email: user.email, name: user.name || '', role: user.role, status: user.status, createdAt: user.created_at, activatedAt: user.activated_at, revokedAt: user.revoked_at };
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch {}
  token = '';
  sessionUser = null;
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
  showToast('Sesión cerrada.');
}

function setView(view) {
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-tab').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  elements.topbarTitle.textContent = ({ dashboard: 'Resumen', movements: 'Movimientos', people: 'Usuarios', backup: 'Respaldo' })[view] || 'Cuentas Hogar';
  if (view === 'backup') updateBackupPreview();
}

function render() {
  renderSession();
  renderSelects();
  renderDashboard();
  renderMovements();
  renderMembers();
  updateBackupPreview();
}

function renderSession() {
  const card = document.querySelector('.sidebar-card');
  if (!card) return;
  const helper = card.querySelector('.muted.small');
  if (helper) helper.textContent = sessionUser ? `${displayName(sessionUser)} · ${sessionUser.email}` : 'Sin sesión';
}

function renderSelects() {
  const visible = state.members.filter((m) => m.status !== 'revoked');
  const options = visible.map((m) => `<option value="${m.id}">${escapeHtml(displayName(m))}${m.role === 'owner' ? ' · owner' : ''}</option>`).join('');
  elements.activeMemberSelect.innerHTML = options;
  elements.debtorSelect.innerHTML = options;
  elements.creditorSelect.innerHTML = options;
  elements.activeMemberSelect.value = state.settings.activeMemberId;
  elements.activeMemberSelect.disabled = sessionUser?.role !== 'owner';
  elements.debtorSelect.value = state.settings.activeMemberId;
  elements.creditorSelect.value = visible.find((m) => m.id !== state.settings.activeMemberId)?.id || '';
}

function renderDashboard() {
  const active = getActiveMember();
  const open = state.movements.filter((m) => m.status !== 'settled');
  const owedToMe = open.filter((m) => m.creditorId === active?.id).reduce((s, m) => s + m.amount, 0);
  const iOwe = open.filter((m) => m.debtorId === active?.id).reduce((s, m) => s + m.amount, 0);
  const net = owedToMe - iOwe;
  elements.netBalance.textContent = formatCurrency(Math.abs(net));
  elements.netBalance.className = net >= 0 ? 'amount-positive' : 'amount-negative';
  elements.balanceHint.textContent = net === 0 ? 'Cuentas equilibradas para esta vista.' : net > 0 ? `A ${displayName(active)} le deben más de lo que debe.` : `${displayName(active)} debe más de lo que le deben.`;
  elements.activePerspectiveTitle.textContent = `Vista de ${displayName(active)}`;
  elements.owedToMe.textContent = formatCurrency(owedToMe);
  elements.iOwe.textContent = formatCurrency(iOwe);
  elements.receiptCount.textContent = state.movements.filter((m) => m.receipt?.dataUrl).length;
  renderRelationships();
  renderRecentMovements();
}

function renderRelationships() {
  const active = getActiveMember();
  const rows = state.members.filter((m) => m.id !== active?.id && m.status !== 'revoked').map((m) => ({ member: m, owesMe: sumOpen((x) => x.debtorId === m.id && x.creditorId === active.id), iOwe: sumOpen((x) => x.debtorId === active.id && x.creditorId === m.id) })).filter((r) => r.owesMe || r.iOwe);
  elements.relationshipList.innerHTML = rows.length ? rows.map((r) => { const net = r.owesMe - r.iOwe; return `<div class="relationship-card"><div><strong>${escapeHtml(net >= 0 ? `${displayName(r.member)} te debe` : `Le debes a ${displayName(r.member)}`)}</strong></div><strong>${formatCurrency(Math.abs(net))}</strong></div>`; }).join('') : '<div class="empty-state">No hay cuentas pendientes entre usuarios.</div>';
}

function renderRecentMovements() { elements.recentMovements.innerHTML = state.movements.slice(-5).reverse().map(renderMovementCard).join('') || '<div class="empty-state">Registra la primera cuenta para comenzar.</div>'; }
function renderMovements() { const items = state.movements.filter((m) => !searchTerm || `${getMemberName(m.debtorId)} ${getMemberName(m.creditorId)} ${m.note} ${m.amount}`.toLowerCase().includes(searchTerm)); elements.allMovements.innerHTML = items.slice().reverse().map(renderMovementCard).join('') || '<div class="empty-state">No hay movimientos con ese filtro.</div>'; }
function renderMovementCard(m) { const active = getActiveMember(); const debtor = getMemberName(m.debtorId); const creditor = getMemberName(m.creditorId); const title = m.debtorId === active?.id ? `Le debes a ${creditor}` : m.creditorId === active?.id ? `${debtor} te debe` : `${debtor} le debe a ${creditor}`; return `<article class="movement-card" data-id="${m.id}"><div class="movement-main"><div><p class="movement-title">${escapeHtml(title)}</p><div class="movement-meta"><span>${formatDate(m.date)}</span><span>${escapeHtml(m.note || 'Sin detalle')}</span></div></div><strong>${formatCurrency(m.amount)}</strong></div><div class="movement-actions"><span class="badge ${m.status === 'settled' ? 'settled' : 'open'}">${m.status === 'settled' ? 'Pagada' : 'Pendiente'}</span><button class="tiny-button" data-action="toggle-status">${m.status === 'settled' ? 'Marcar pendiente' : 'Marcar pagada'}</button>${m.receipt?.dataUrl ? '<button class="tiny-button" data-action="view-receipt">Ver comprobante</button>' : ''}<button class="tiny-button" data-action="delete">Eliminar</button></div></article>`; }

function renderMembers() {
  const owner = sessionUser?.role === 'owner';
  elements.ownerStatusBadge.textContent = owner ? 'Owner activo' : 'Usuario';
  elements.ownerHelpText.textContent = owner ? 'Crea usuarios por correo en la base real.' : 'Solo el owner administra usuarios.';
  elements.memberForm.style.display = owner ? 'grid' : 'none';
  elements.memberList.innerHTML = state.members.map((m) => `<article class="member-card ${m.status}" data-id="${m.id}"><div class="member-info"><div class="avatar">${getInitials(displayName(m))}</div><div><strong>${escapeHtml(displayName(m))}</strong><div class="movement-meta"><span>${escapeHtml(m.email)}</span><span>${roleLabel(m.role)}</span><span>${statusLabel(m.status)}</span></div></div></div><div class="movement-actions">${owner && m.role !== 'owner' && m.status !== 'revoked' ? '<button class="tiny-button" data-action="revoke-member">Revocar</button>' : ''}${owner && m.role !== 'owner' && m.status === 'revoked' ? '<button class="tiny-button" data-action="reactivate-member">Reactivar</button>' : ''}</div></article>`).join('');
}

function addMovement() { const debtorId = elements.debtorSelect.value; const creditorId = elements.creditorSelect.value; const amount = parseAmount(elements.amountInput.value); if (!debtorId || !creditorId || debtorId === creditorId) return showToast('Elige dos usuarios distintos.'); if (!amount) return showToast('Ingresa un monto válido.'); state.movements.push({ id: crypto.randomUUID(), debtorId, creditorId, amount, date: elements.dateInput.value, note: elements.noteInput.value.trim(), status: 'open', receipt: pendingReceipt, createdAt: new Date().toISOString() }); pendingReceipt = null; elements.amountInput.value = ''; elements.noteInput.value = ''; saveState(); render(); showToast('Movimiento guardado localmente.'); }
async function addMember() { if (sessionUser?.role !== 'owner') return showToast('Solo el owner puede crear usuarios.'); const email = $('#memberEmailInput').value.trim().toLowerCase(); const name = elements.memberNameInput.value.trim(); const role = elements.memberRoleSelect.value; try { await api('/owner/users', { method: 'POST', body: JSON.stringify({ email, name, role }) }); $('#memberEmailInput').value = ''; elements.memberNameInput.value = ''; await refreshRemoteUsers(); render(); showToast('Usuario creado en D1.'); } catch (e) { showToast(`No se pudo crear: ${e.message}`); } }
async function handleMemberAction(event) { const button = event.target.closest('button[data-action]'); if (!button) return; const id = button.closest('.member-card').dataset.id; const endpoint = button.dataset.action === 'revoke-member' ? `/owner/users/${id}/revoke` : `/owner/users/${id}/reactivate`; try { await api(endpoint, { method: 'PATCH', body: '{}' }); await refreshRemoteUsers(); render(); } catch (e) { showToast(`Error: ${e.message}`); } }
function handleMovementAction(event) { const button = event.target.closest('button[data-action]'); if (!button) return; const id = button.closest('.movement-card').dataset.id; const m = state.movements.find((x) => x.id === id); if (!m) return; if (button.dataset.action === 'toggle-status') m.status = m.status === 'settled' ? 'open' : 'settled'; if (button.dataset.action === 'delete') state.movements = state.movements.filter((x) => x.id !== id); if (button.dataset.action === 'view-receipt') { elements.receiptImage.src = m.receipt.dataUrl; elements.receiptDialog.showModal(); } saveState(); render(); }

function exportData() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cuentas-hogar.json'; a.click(); URL.revokeObjectURL(a.href); }
async function importData(event) { const [file] = event.target.files; if (!file) return; state = JSON.parse(await file.text()); saveState(); render(); }
function resetData() { if (!confirm('¿Borrar movimientos locales?')) return; state.movements = []; saveState(); render(); }
function updateBackupPreview() { if (elements.backupPreview) elements.backupPreview.value = JSON.stringify(state, null, 2); }
function sumOpen(predicate) { return state.movements.filter((m) => m.status !== 'settled').filter(predicate).reduce((s, m) => s + m.amount, 0); }
function getActiveMember() { return state.members.find((m) => m.id === state.settings.activeMemberId) || sessionUser || state.members[0]; }
function getMemberName(id) { return displayName(state.members.find((m) => m.id === id)); }
function displayName(member) { return member?.name || member?.email || 'Usuario'; }
function roleLabel(role) { return ({ owner: 'Owner', member: 'Usuario', viewer: 'Solo lectura' })[role] || 'Usuario'; }
function statusLabel(status) { return ({ active: 'Activo', pending: 'Pendiente', revoked: 'Revocado' })[status] || 'Activo'; }
function parseAmount(value) { return Number(String(value).replace(/[^0-9]/g, '')); }
function formatCurrency(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value || 0); }
function formatDate(value) { return value || 'Sin fecha'; }
function getInitials(name) { return String(name).split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U'; }
function escapeHtml(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
async function compressImage(file) { const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); return { name: file.name, dataUrl, createdAt: new Date().toISOString() }; }
function showToast(message) { elements.toast.textContent = message; elements.toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2400); }
function registerServiceWorker() { if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.warn)); }
