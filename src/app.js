const STORAGE_KEY = 'cuentas-pwa:v1';

const defaultState = {
  version: 2,
  settings: {
    activeMemberId: 'benjamin',
    ownerId: 'benjamin',
    theme: 'dark',
  },
  members: [
    { id: 'benjamin', name: 'Benjamín', role: 'owner', createdAt: new Date().toISOString() },
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
  elements.dateInput.valueAsDate = new Date();
  document.body.classList.toggle('light', state.settings.theme === 'light');
  bindEvents();
  render();
  registerServiceWorker();
}

function bindEvents() {
  $$('.nav-tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-view-shortcut]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewShortcut)));

  elements.quickAddButton.addEventListener('click', () => {
    setView('movements');
    setTimeout(() => elements.amountInput.focus(), 80);
  });

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
  const members = Array.isArray(rawState.members) && rawState.members.length ? rawState.members : defaultState.members;
  const normalizedMembers = members.map((member, index) => ({
    id: member.id || slugifyFromList(member.name || `Usuario ${index + 1}`, members),
    name: member.name || `Usuario ${index + 1}`,
    role: member.role || (index === 0 ? 'owner' : 'member'),
    createdAt: member.createdAt || createdAt,
  }));

  const owner = normalizedMembers.find((member) => member.role === 'owner') || normalizedMembers[0];
  owner.role = 'owner';

  return {
    ...structuredClone(defaultState),
    ...rawState,
    version: 2,
    settings: {
      ...defaultState.settings,
      ...(rawState.settings || {}),
      ownerId: rawState.settings?.ownerId || owner.id,
      activeMemberId: rawState.settings?.activeMemberId || owner.id,
    },
    members: normalizedMembers,
    movements: Array.isArray(rawState.movements) ? rawState.movements : [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateBackupPreview();
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
  renderSelects();
  renderDashboard();
  renderMovements();
  renderMembers();
  updateBackupPreview();
}

function normalizeActiveMember() {
  const exists = state.members.some((member) => member.id === state.settings.activeMemberId);
  if (!exists) state.settings.activeMemberId = state.settings.ownerId || state.members[0]?.id || null;
}

function isOwnerView() {
  return state.settings.activeMemberId === state.settings.ownerId;
}

function renderSelects() {
  const options = state.members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)}${member.role === 'owner' ? ' · owner' : ''}</option>`).join('');
  elements.activeMemberSelect.innerHTML = options;
  elements.debtorSelect.innerHTML = options;
  elements.creditorSelect.innerHTML = options;
  elements.activeMemberSelect.value = state.settings.activeMemberId;
  elements.debtorSelect.value = state.settings.activeMemberId;
  const firstOther = state.members.find((member) => member.id !== state.settings.activeMemberId) || state.members[0];
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
    ? `A ${active.name} le deben más de lo que debe.`
    : net < 0
      ? `${active.name} debe más de lo que le deben.`
      : 'Cuentas equilibradas para esta vista.';

  elements.activePerspectiveTitle.textContent = `Vista de ${active?.name || 'usuario'}`;
  elements.owedToMe.textContent = formatCurrency(owedToMe);
  elements.iOwe.textContent = formatCurrency(iOwe);
  elements.receiptCount.textContent = String(state.movements.filter((movement) => movement.receipt?.dataUrl).length);

  renderRelationships();
  renderRecentMovements();
}

function renderRelationships() {
  const active = getActiveMember();
  const rows = state.members
    .filter((member) => member.id !== active?.id)
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
    const text = row.net >= 0 ? `${row.member.name} te debe` : `Le debes a ${row.member.name}`;
    return `
      <div class="relationship-card">
        <div>
          <strong>${escapeHtml(text)}</strong>
          <span class="muted small">${row.owesMe ? `${row.member.name} → ${active.name}: ${formatCurrency(row.owesMe)}` : ''}${row.owesMe && row.iOwe ? ' · ' : ''}${row.iOwe ? `${active.name} → ${row.member.name}: ${formatCurrency(row.iOwe)}` : ''}</span>
        </div>
        <strong class="${row.net >= 0 ? 'amount-positive' : 'amount-negative'}">${formatCurrency(Math.abs(row.net))}</strong>
      </div>`;
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
  return `
    <article class="movement-card" data-id="${movement.id}">
      <div class="movement-main">
        <div>
          <p class="movement-title">${escapeHtml(title)}</p>
          <div class="movement-meta">
            <span>${formatDate(movement.date)}</span>
            <span>${escapeHtml(movement.note || 'Sin detalle')}</span>
            ${movement.receipt?.dataUrl ? '<span>Con comprobante</span>' : ''}
          </div>
        </div>
        <strong class="${movement.status === 'settled' ? 'amount-positive' : 'amount-negative'}">${formatCurrency(movement.amount)}</strong>
      </div>
      <div class="movement-actions">
        <span class="badge ${movement.status === 'settled' ? 'settled' : 'open'}">${movement.status === 'settled' ? 'Pagada' : 'Pendiente'}</span>
        <button class="tiny-button" data-action="toggle-status" type="button">${movement.status === 'settled' ? 'Marcar pendiente' : 'Marcar pagada'}</button>
        ${movement.receipt?.dataUrl ? '<button class="tiny-button" data-action="view-receipt" type="button">Ver comprobante</button>' : ''}
        <button class="tiny-button" data-action="delete" type="button">Eliminar</button>
      </div>
    </article>`;
}

function renderMembers() {
  const ownerMode = isOwnerView();
  elements.ownerStatusBadge.textContent = ownerMode ? 'Owner activo' : 'Vista usuario';
  elements.ownerStatusBadge.className = `badge ${ownerMode ? 'settled' : 'open'}`;
  elements.ownerHelpText.textContent = ownerMode
    ? 'Puedes crear usuarios personalizados y eliminar usuarios que ya no participen.'
    : `Estás mirando como ${getActiveMember()?.name}. Cambia a la vista owner para administrar usuarios.`;
  elements.memberForm.style.display = ownerMode ? 'grid' : 'none';

  elements.memberList.innerHTML = state.members.map((member) => {
    const isActive = member.id === state.settings.activeMemberId;
    const isOwner = member.id === state.settings.ownerId;
    const movementCount = state.movements.filter((movement) => movement.debtorId === member.id || movement.creditorId === member.id).length;
    const canDelete = ownerMode && !isOwner && state.members.length > 1;
    return `
      <article class="member-card" data-id="${member.id}">
        <div class="member-info">
          <div class="avatar">${getInitials(member.name)}</div>
          <div>
            <strong>${escapeHtml(member.name)}</strong>
            <div class="movement-meta">
              <span>${isOwner ? 'Owner' : roleLabel(member.role)}</span>
              <span>${isActive ? 'Vista activa' : 'Usuario disponible'}</span>
              <span>${movementCount} movimientos</span>
            </div>
          </div>
        </div>
        <button class="tiny-button" data-action="delete-member" ${canDelete ? '' : 'disabled'} type="button">${isOwner ? 'Protegido' : 'Eliminar'}</button>
      </article>`;
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
  const name = elements.memberNameInput.value.trim();
  const role = elements.memberRoleSelect?.value || 'member';
  if (name.length < 2) return showToast('Escribe un nombre válido.');
  if (state.members.some((member) => member.name.toLowerCase() === name.toLowerCase())) return showToast('Ese usuario ya existe.');

  state.members.push({ id: slugify(name), name, role, createdAt: new Date().toISOString() });
  elements.memberNameInput.value = '';
  saveState();
  render();
  showToast('Usuario creado.');
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
  const button = event.target.closest('button[data-action="delete-member"]');
  if (!button) return;
  if (!isOwnerView()) return showToast('Solo el owner puede eliminar usuarios.');
  const card = button.closest('.member-card');
  const member = state.members.find((item) => item.id === card.dataset.id);
  if (!member) return;
  if (member.id === state.settings.ownerId) return showToast('El owner no se puede eliminar.');

  const hasMovements = state.movements.some((movement) => movement.debtorId === member.id || movement.creditorId === member.id);
  const message = hasMovements ? `Eliminar a ${member.name} también borrará sus movimientos. ¿Continuar?` : `¿Eliminar a ${member.name}?`;
  if (!confirm(message)) return;
  state.members = state.members.filter((item) => item.id !== member.id);
  state.movements = state.movements.filter((movement) => movement.debtorId !== member.id && movement.creditorId !== member.id);
  normalizeActiveMember();
  saveState();
  render();
  showToast('Usuario eliminado.');
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

function getActiveMember() {
  return state.members.find((member) => member.id === state.settings.activeMemberId) || state.members[0];
}

function getMemberName(id) {
  return state.members.find((member) => member.id === id)?.name || 'Usuario eliminado';
}

function roleLabel(role) {
  const labels = { owner: 'Owner', member: 'Usuario', viewer: 'Solo lectura' };
  return labels[role] || 'Usuario';
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
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
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
