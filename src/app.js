const STORAGE_KEY = 'cuentas-pwa:v1';

const defaultState = {
  version: 3,
  settings: {
    activeMemberId: 'benjamin',
    ownerId: 'benjamin',
    theme: 'dark',
  },
  session: {
    userId: 'benjamin',
    startedAt: new Date().toISOString(),
  },
  members: [
    {
      id: 'benjamin',
      name: 'Benjamín',
      email: 'owner@cuentas.local',
      role: 'owner',
      status: 'active',
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
    },
  ],
  movements: [],
};

let state = loadState();
let pendingReceipt = null;
let currentView = 'dashboard';
let searchTerm = '';

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

function init() {
  injectSessionControls();
  injectEmailField();
  elements.dateInput.valueAsDate = new Date();
  document.body.classList.toggle('light', state.settings.theme === 'light');
  bindEvents();
  ensureValidSession();
  render();
  registerServiceWorker();
}

function injectSessionControls() {
  const sidebarCard = document.querySelector('.sidebar-card');
  if (!sidebarCard || $('#sessionActions')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'sessionActions';
  wrapper.className = 'button-row session-actions';
  wrapper.innerHTML = '<button class="ghost-button" id="logoutButton" type="button">Logout</button>';
  sidebarCard.appendChild(wrapper);
}

function injectEmailField() {
  if (!elements.memberForm || $('#memberEmailInput')) return;
  const emailLabel = document.createElement('label');
  emailLabel.className = 'field';
  emailLabel.innerHTML = '<span>Correo del usuario</span><input id="memberEmailInput" type="email" placeholder="usuario@correo.com" autocomplete="off" />';
  elements.memberForm.insertBefore(emailLabel, elements.memberForm.firstChild);

  const nameLabel = elements.memberNameInput?.closest('.field');
  if (nameLabel) {
    nameLabel.querySelector('span').textContent = 'Nombre visible opcional';
    elements.memberNameInput.placeholder = 'Lo puede completar al ingresar';
  }

  const submit = elements.memberForm.querySelector('button[type="submit"]');
  if (submit) submit.textContent = 'Crear invitación';
}

function bindEvents() {
  $$('.nav-tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-view-shortcut]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewShortcut)));

  elements.quickAddButton.addEventListener('click', () => {
    setView('movements');
    setTimeout(() => elements.amountInput.focus(), 80);
  });

  $('#logoutButton')?.addEventListener('click', logout);
  elements.menuButton.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  document.addEventListener('click', (event) => {
    if (document.body.classList.contains('sidebar-open') && !event.target.closest('.sidebar') && !event.target.closest('.menu-button')) {
      document.body.classList.remove('sidebar-open');
    }
  });

  elements.activeMemberSelect.addEventListener('change', (event) => {
    state.settings.activeMemberId = event.target.value;
    saveState();
    render();
  });

  elements.themeToggle.addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('light', state.settings.theme === 'light');
    saveState();
  });

  elements.receiptInput.addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      pendingReceipt = await compressImage(file);
      showToast('Comprobante listo para guardar.');
    } catch (error) {
      console.error(error);
      showToast('No pude procesar esa imagen. Prueba con otra.');
      elements.receiptInput.value = '';
    }
  });

  elements.movementForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addMovement();
  });

  elements.memberForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addMember();
  });

  elements.searchInput.addEventListener('input', (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    renderMovements();
  });

  elements.exportButton.addEventListener('click', exportData);
  elements.importInput.addEventListener('change', importData);
  elements.resetButton.addEventListener('click', resetData);
  elements.allMovements.addEventListener('click', handleMovementAction);
  elements.recentMovements.addEventListener('click', handleMovementAction);
  elements.memberList.addEventListener('click', handleMemberAction);
  elements.closeDialog.addEventListener('click', () => elements.receiptDialog.close());
  elements.receiptDialog.addEventListener('click', (event) => {
    if (event.target === elements.receiptDialog) elements.receiptDialog.close();
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const base = raw ? JSON.parse(raw) : structuredClone(defaultState);
    const migrated = migrateState(base);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (error) {
    console.warn('No se pudo cargar el estado local.', error);
    return structuredClone(defaultState);
  }
}

function migrateState(rawState) {
  const createdAt = new Date().toISOString();
  const rawMembers = Array.isArray(rawState.members) && rawState.members.length ? rawState.members : defaultState.members;
  const normalizedMembers = rawMembers.map((member, index) => ({
    id: member.id || slugifyFromList(member.name || member.email || `usuario-${index + 1}`, rawMembers),
    name: member.name || '',
    email: normalizeEmail(member.email || (index === 0 ? 'owner@cuentas.local' : `${member.id || `usuario${index + 1}`}@pendiente.local`)),
    role: member.role || (index === 0 ? 'owner' : 'member'),
    status: member.status || 'active',
    createdAt: member.createdAt || createdAt,
    activatedAt: member.activatedAt || (member.name ? createdAt : null),
    revokedAt: member.revokedAt || null,
  }));

  const owner = normalizedMembers.find((member) => member.role === 'owner') || normalizedMembers[0];
  owner.role = 'owner';
  owner.status = 'active';
  if (!owner.name) owner.name = 'Benjamín';

  return {
    ...structuredClone(defaultState),
    ...rawState,
    version: 3,
    settings: {
      ...defaultState.settings,
      ...(rawState.settings || {}),
      ownerId: rawState.settings?.ownerId || owner.id,
      activeMemberId: rawState.settings?.activeMemberId || owner.id,
    },
    session: rawState.session || { userId: owner.id, startedAt: createdAt },
    members: normalizedMembers,
    movements: Array.isArray(rawState.movements) ? rawState.movements : [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateBackupPreview();
}

function ensureValidSession() {
  const sessionUser = getSessionUser();
  if (!sessionUser || sessionUser.status === 'revoked') {
    state.session = { userId: state.settings.ownerId, startedAt: new Date().toISOString() };
  }
  const active = getSessionUser();
  if (!isOwnerSession()) state.settings.activeMemberId = active?.id;
  saveState();
}

function logout() {
  const owner = state.members.find((member) => member.id === state.settings.ownerId);
  state.session = { userId: owner?.id || state.members[0]?.id, startedAt: new Date().toISOString() };
  state.settings.activeMemberId = state.session.userId;
  saveState();
  render();
  showToast('Sesión cerrada. En demo vuelve al owner.');
}

function setView(view) {
  currentView = view;
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-tab').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const titles = { dashboard: 'Resumen', movements: 'Movimientos', people: 'Usuarios', backup: 'Respaldo' };
  elements.topbarTitle.textContent = titles[view] || 'Cuentas Hogar';
  document.body.classList.remove('sidebar-open');
  if (view === 'backup') updateBackupPreview();
}

function render() {
  normalizeActiveMember();
  renderSession();
  renderSelects();
  renderDashboard();
  renderMovements();
  renderMembers();
  updateBackupPreview();
}

function normalizeActiveMember() {
  const exists = state.members.some((member) => member.id === state.settings.activeMemberId && member.status !== 'revoked');
  if (!exists) state.settings.activeMemberId = getSessionUser()?.id || state.settings.ownerId || state.members[0]?.id || null;
  if (!isOwnerSession()) state.settings.activeMemberId = getSessionUser()?.id;
}

function isOwnerSession() {
  return state.session?.userId === state.settings.ownerId;
}

function isOwnerView() {
  return isOwnerSession();
}

function renderSession() {
  const sessionUser = getSessionUser();
  const sessionName = $('#sessionName');
  const sessionEmail = $('#sessionEmail');
  const sessionHelpText = $('#sessionHelpText');
  if (sessionName) sessionName.textContent = sessionUser?.name || 'Usuario pendiente';
  if (sessionEmail) sessionEmail.textContent = sessionUser?.email || 'sin correo';
  if (sessionHelpText) sessionHelpText.textContent = isOwnerSession()
    ? 'Sesión owner abierta. Puedes cambiar la vista y administrar usuarios.'
    : 'Tu sesión queda abierta hasta logout o revocación.';
}

function renderSelects() {
  const visibleMembers = state.members.filter((member) => member.status !== 'revoked');
  const options = visibleMembers.map((member) => `<option value="${member.id}">${escapeHtml(displayName(member))}${member.role === 'owner' ? ' · owner' : ''}</option>`).join('');
  elements.activeMemberSelect.innerHTML = options;
  elements.debtorSelect.innerHTML = options;
  elements.creditorSelect.innerHTML = options;
  elements.activeMemberSelect.value = state.settings.activeMemberId;
  elements.activeMemberSelect.disabled = !isOwnerSession();
  elements.debtorSelect.value = state.settings.activeMemberId;
  const firstOther = visibleMembers.find((member) => member.id !== state.settings.activeMemberId) || visibleMembers[0];
  elements.creditorSelect.value = firstOther?.id || '';
}

function renderDashboard() {
  const active = getActiveMember();
  const openMovements = state.movements.filter((movement) => movement.status !== 'settled');
  const owedToMe = openMovements.filter((movement) => movement.creditorId === active?.id).reduce((sum, movement) => sum + movement.amount, 0);
  const iOwe = openMovements.filter((movement) => movement.debtorId === active?.id).reduce((sum, movement) => sum + movement.amount, 0);
  const net = owedToMe - iOwe;

  elements.netBalance.textContent = formatCurrency(Math.abs(net));
  elements.netBalance.className = net >= 0 ? 'amount-positive' : 'amount-negative';
  elements.balanceHint.textContent = net > 0
    ? `A ${displayName(active)} le deben más de lo que debe.`
    : net < 0
      ? `${displayName(active)} debe más de lo que le deben.`
      : 'Cuentas equilibradas para esta vista.';

  elements.activePerspectiveTitle.textContent = `Vista de ${displayName(active)}`;
  elements.owedToMe.textContent = formatCurrency(owedToMe);
  elements.iOwe.textContent = formatCurrency(iOwe);
  elements.receiptCount.textContent = String(state.movements.filter((movement) => movement.receipt?.dataUrl).length);
  renderRelationships();
  renderRecentMovements();
}

function renderRelationships() {
  const active = getActiveMember();
  const rows = state.members
    .filter((member) => member.id !== active?.id && member.status !== 'revoked')
    .map((member) => {
      const owesMe = sumOpen((movement) => movement.debtorId === member.id && movement.creditorId === active.id);
      const iOwe = sumOpen((movement) => movement.debtorId === active.id && movement.creditorId === member.id);
      return { member, owesMe, iOwe, net: owesMe - iOwe };
    })
    .filter((row) => row.owesMe > 0 || row.iOwe > 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  if (!rows.length) {
    elements.relationshipList.innerHTML = '<div class="empty-state">No hay cuentas pendientes entre usuarios.</div>';
    return;
  }

  elements.relationshipList.innerHTML = rows.map((row) => {
    const text = row.net >= 0 ? `${displayName(row.member)} te debe` : `Le debes a ${displayName(row.member)}`;
    return `<div class="relationship-card"><div><strong>${escapeHtml(text)}</strong><span class="muted small">${row.owesMe ? `${displayName(row.member)} → ${displayName(active)}: ${formatCurrency(row.owesMe)}` : ''}${row.owesMe && row.iOwe ? ' · ' : ''}${row.iOwe ? `${displayName(active)} → ${displayName(row.member)}: ${formatCurrency(row.iOwe)}` : ''}</span></div><strong class="${row.net >= 0 ? 'amount-positive' : 'amount-negative'}">${formatCurrency(Math.abs(row.net))}</strong></div>`;
  }).join('');
}

function renderRecentMovements() {
  const recent = [...state.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  elements.recentMovements.innerHTML = recent.length ? recent.map(renderMovementCard).join('') : '<div class="empty-state">Registra la primera cuenta para comenzar.</div>';
}

function renderMovements() {
  const filtered = [...state.movements]
    .filter((movement) => {
      if (!searchTerm) return true;
      const haystack = [getMemberName(movement.debtorId), getMemberName(movement.creditorId), movement.note, String(movement.amount), movement.date].join(' ').toLowerCase();
      return haystack.includes(searchTerm);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  elements.allMovements.innerHTML = filtered.length ? filtered.map(renderMovementCard).join('') : '<div class="empty-state">No hay movimientos con ese filtro.</div>';
}

function renderMovementCard(movement) {
  const active = getActiveMember();
  const debtor = getMemberName(movement.debtorId);
  const creditor = getMemberName(movement.creditorId);
  const title = movement.debtorId === active?.id ? `Le debes a ${creditor}` : movement.creditorId === active?.id ? `${debtor} te debe` : `${debtor} le debe a ${creditor}`;
  return `<article class="movement-card" data-id="${movement.id}"><div class="movement-main"><div><p class="movement-title">${escapeHtml(title)}</p><div class="movement-meta"><span>${formatDate(movement.date)}</span><span>${escapeHtml(movement.note || 'Sin detalle')}</span>${movement.receipt?.dataUrl ? '<span>Con comprobante</span>' : ''}</div></div><strong class="${movement.status === 'settled' ? 'amount-positive' : 'amount-negative'}">${formatCurrency(movement.amount)}</strong></div><div class="movement-actions"><span class="badge ${movement.status === 'settled' ? 'settled' : 'open'}">${movement.status === 'settled' ? 'Pagada' : 'Pendiente'}</span><button class="tiny-button" data-action="toggle-status" type="button">${movement.status === 'settled' ? 'Marcar pendiente' : 'Marcar pagada'}</button>${movement.receipt?.dataUrl ? '<button class="tiny-button" data-action="view-receipt" type="button">Ver comprobante</button>' : ''}<button class="tiny-button" data-action="delete" type="button">Eliminar</button></div></article>`;
}

function renderMembers() {
  const ownerMode = isOwnerView();
  elements.ownerStatusBadge.textContent = ownerMode ? 'Owner activo' : 'Vista usuario';
  elements.ownerStatusBadge.className = `badge ${ownerMode ? 'settled' : 'open'}`;
  elements.ownerHelpText.textContent = ownerMode
    ? 'Crea usuarios por correo. La cuenta queda pendiente hasta que el usuario complete su nombre.'
    : `Estás mirando como ${displayName(getSessionUser())}. Solo el owner administra usuarios.`;
  elements.memberForm.style.display = ownerMode ? 'grid' : 'none';

  elements.memberList.innerHTML = state.members.map((member) => {
    const isActive = member.id === state.settings.activeMemberId;
    const isOwner = member.id === state.settings.ownerId;
    const movementCount = state.movements.filter((movement) => movement.debtorId === member.id || movement.creditorId === member.id).length;
    const statusClass = member.status === 'revoked' ? 'revoked' : member.status === 'pending' ? 'pending' : 'settled';
    const canRevoke = ownerMode && !isOwner && member.status !== 'revoked';
    const canReactivate = ownerMode && !isOwner && member.status === 'revoked';
    const canDelete = ownerMode && !isOwner;
    return `<article class="member-card ${escapeHtml(member.status)}" data-id="${member.id}"><div class="member-info"><div class="avatar">${getInitials(displayName(member))}</div><div><strong>${escapeHtml(displayName(member))}</strong><div class="movement-meta"><span>${escapeHtml(member.email)}</span><span>${roleLabel(member.role)}</span><span>${isActive ? 'Vista activa' : statusLabel(member.status)}</span><span>${movementCount} movimientos</span></div></div></div><div class="movement-actions"><span class="badge ${statusClass}">${statusLabel(member.status)}</span>${canRevoke ? '<button class="tiny-button" data-action="revoke-member" type="button">Revocar</button>' : ''}${canReactivate ? '<button class="tiny-button" data-action="reactivate-member" type="button">Reactivar</button>' : ''}<button class="tiny-button" data-action="delete-member" ${canDelete ? '' : 'disabled'} type="button">${isOwner ? 'Protegido' : 'Eliminar'}</button></div></article>`;
  }).join('');
}

function addMovement() {
  const debtorId = elements.debtorSelect.value;
  const creditorId = elements.creditorSelect.value;
  const amount = parseAmount(elements.amountInput.value);
  const date = elements.dateInput.value;
  const note = elements.noteInput.value.trim();
  if (!debtorId || !creditorId || debtorId === creditorId) return showToast('Elige dos usuarios distintos.');
  if (!amount || amount <= 0) return showToast('Ingresa un monto válido.');
  state.movements.push({ id: crypto.randomUUID(), debtorId, creditorId, amount, date, note, status: 'open', receipt: pendingReceipt, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  pendingReceipt = null;
  elements.receiptInput.value = '';
  elements.amountInput.value = '';
  elements.noteInput.value = '';
  saveState();
  render();
  showToast('Movimiento guardado.');
}

function addMember() {
  if (!isOwnerView()) return showToast('Solo el owner puede crear usuarios.');
  const emailInput = $('#memberEmailInput');
  const email = normalizeEmail(emailInput?.value || '');
  const name = elements.memberNameInput.value.trim();
  const role = elements.memberRoleSelect?.value || 'member';
  if (!isValidEmail(email)) return showToast('Ingresa un correo válido.');
  if (state.members.some((member) => member.email === email)) return showToast('Ese correo ya existe.');
  state.members.push({ id: slugify(email.split('@')[0]), email, name, role, status: name ? 'active' : 'pending', createdAt: new Date().toISOString(), activatedAt: name ? new Date().toISOString() : null, revokedAt: null });
  if (emailInput) emailInput.value = '';
  elements.memberNameInput.value = '';
  saveState();
  render();
  showToast('Usuario creado. En la próxima etapa recibirá acceso por correo.');
}

function handleMovementAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.movement-card');
  const movement = state.movements.find((item) => item.id === card.dataset.id);
  if (!movement) return;
  if (button.dataset.action === 'toggle-status') {
    movement.status = movement.status === 'settled' ? 'open' : 'settled';
    movement.updatedAt = new Date().toISOString();
    saveState();
    render();
  }
  if (button.dataset.action === 'view-receipt') {
    elements.receiptImage.src = movement.receipt.dataUrl;
    elements.receiptDialog.showModal();
  }
  if (button.dataset.action === 'delete') {
    if (!confirm('¿Eliminar este movimiento?')) return;
    state.movements = state.movements.filter((item) => item.id !== movement.id);
    saveState();
    render();
    showToast('Movimiento eliminado.');
  }
}

function handleMemberAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !button.closest('.member-card')) return;
  if (!isOwnerView()) return showToast('Solo el owner puede administrar usuarios.');
  const card = button.closest('.member-card');
  const member = state.members.find((item) => item.id === card.dataset.id);
  if (!member) return;
  if (member.id === state.settings.ownerId) return showToast('El owner no se puede modificar desde aquí.');

  if (button.dataset.action === 'revoke-member') {
    member.status = 'revoked';
    member.revokedAt = new Date().toISOString();
    if (state.session?.userId === member.id) state.session = { userId: state.settings.ownerId, startedAt: new Date().toISOString() };
    saveState();
    render();
    showToast('Acceso revocado.');
    return;
  }

  if (button.dataset.action === 'reactivate-member') {
    member.status = member.name ? 'active' : 'pending';
    member.revokedAt = null;
    saveState();
    render();
    showToast('Usuario reactivado.');
    return;
  }

  if (button.dataset.action === 'delete-member') {
    const hasMovements = state.movements.some((movement) => movement.debtorId === member.id || movement.creditorId === member.id);
    const message = hasMovements ? `Eliminar a ${displayName(member)} también borrará sus movimientos. ¿Continuar?` : `¿Eliminar a ${displayName(member)}?`;
    if (!confirm(message)) return;
    state.members = state.members.filter((item) => item.id !== member.id);
    state.movements = state.movements.filter((movement) => movement.debtorId !== member.id && movement.creditorId !== member.id);
    normalizeActiveMember();
    saveState();
    render();
    showToast('Usuario eliminado.');
  }
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cuentas-hogar-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Respaldo descargado.');
}

async function importData(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.members) || !Array.isArray(parsed.movements)) throw new Error('Formato inválido');
    state = migrateState(parsed);
    saveState();
    render();
    showToast('Respaldo importado.');
  } catch (error) {
    console.error(error);
    showToast('Ese archivo no parece un respaldo válido.');
  } finally {
    elements.importInput.value = '';
  }
}

function resetData() {
  if (!confirm('¿Borrar todos los datos locales y volver al inicio?')) return;
  state = structuredClone(defaultState);
  saveState();
  render();
  showToast('Datos reiniciados.');
}

function updateBackupPreview() {
  if (elements.backupPreview) elements.backupPreview.value = JSON.stringify(state, null, 2);
}

function sumOpen(predicate) {
  return state.movements.filter((movement) => movement.status !== 'settled').filter(predicate).reduce((sum, movement) => sum + movement.amount, 0);
}

function getSessionUser() {
  return state.members.find((member) => member.id === state.session?.userId);
}

function getActiveMember() {
  return state.members.find((member) => member.id === state.settings.activeMemberId) || getSessionUser() || state.members[0];
}

function getMemberName(id) {
  const member = state.members.find((item) => item.id === id);
  return member ? displayName(member) : 'Usuario eliminado';
}

function displayName(member) {
  if (!member) return 'Usuario';
  return member.name || member.email || 'Usuario pendiente';
}

function roleLabel(role) {
  const labels = { owner: 'Owner', member: 'Usuario', viewer: 'Solo lectura' };
  return labels[role] || 'Usuario';
}

function statusLabel(status) {
  const labels = { active: 'Activo', pending: 'Pendiente', revoked: 'Revocado' };
  return labels[status] || 'Activo';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value || 0);
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function parseAmount(value) {
  return Number(String(value).replace(/[^0-9]/g, ''));
}

function getInitials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function slugify(value) {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'usuario';
  let candidate = base;
  let counter = 2;
  while (state.members.some((member) => member.id === candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function slugifyFromList(value, list) {
  const base = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'usuario';
  let candidate = base;
  let counter = 2;
  while (list.some((member) => member.id === candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function compressImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const maxSize = 1200;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return { name: file.name, type: 'image/jpeg', size: file.size, dataUrl: canvas.toDataURL('image/jpeg', 0.76), createdAt: new Date().toISOString() };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('Service worker no registrado.', error));
  });
}
