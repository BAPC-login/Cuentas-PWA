const WORKSPACES = [
  ['dashboard', 'Resumen'],
  ['expenses', 'Gastos'],
  ['operations', 'Operaciones'],
  ['payments', 'Pagos'],
  ['reports', 'Informes'],
  ['settings', 'Configuración'],
];

setTimeout(initWorkspaceOrganizer, 900);
window.addEventListener('family-data-changed', () => setTimeout(organizePanels, 250));

function initWorkspaceOrganizer() {
  injectStyles();
  rebuildNavigation();
  ensureWorkspaceSections();
  bindNavigation();
  organizePanels();
  setInterval(organizePanels, 1200);
}

function rebuildNavigation() {
  const nav = document.querySelector('.nav-tabs');
  if (!nav || nav.dataset.organized === '1') return;
  nav.dataset.organized = '1';
  nav.innerHTML = WORKSPACES.map(([id, label], index) => `<button class="nav-tab ${index === 0 ? 'active' : ''}" data-view="${id}" type="button">${label}</button>`).join('');
}

function ensureWorkspaceSections() {
  const content = document.querySelector('.content');
  if (!content) return;
  const dashboard = document.querySelector('#view-dashboard');
  const order = ['expenses', 'operations', 'payments', 'reports', 'settings'];
  let after = dashboard;
  for (const id of order) {
    if (!document.querySelector(`#view-${id}`)) {
      const section = document.createElement('section');
      section.className = 'view organized-view';
      section.id = `view-${id}`;
      section.innerHTML = `<div class="workspace-heading"><p class="eyebrow">${titleFor(id).eyebrow}</p><h3>${titleFor(id).title}</h3><p class="muted small">${titleFor(id).help}</p></div><div class="workspace-stack" id="workspace-${id}"></div>`;
      after?.insertAdjacentElement('afterend', section);
      after = section;
    } else {
      after = document.querySelector(`#view-${id}`);
    }
  }
}

function bindNavigation() {
  if (document.body.dataset.workspaceNavReady === '1') return;
  document.body.dataset.workspaceNavReady = '1';
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('.nav-tab[data-view]');
    if (!tab) return;
    event.preventDefault();
    event.stopPropagation();
    setWorkspaceView(tab.dataset.view);
  }, true);
  document.querySelector('#quickAddButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setWorkspaceView('expenses');
    setTimeout(() => document.querySelector('#expenseTitle')?.focus(), 120);
  }, true);
}

function organizePanels() {
  move('#expenseEntryPanel', '#workspace-expenses');
  move('#realBillsPanel', '#workspace-expenses');
  move('#templatesPanel', '#workspace-expenses');

  move('#operationsPanel', '#workspace-operations');

  move('#paymentPanel', '#workspace-payments');
  move('#receiptReviewPanel', '#workspace-payments');

  move('#debtMatrixPanel', '#view-dashboard');
  move('#familyLite', '#workspace-reports');
  move('#proDashboardPanel', '#workspace-reports');
  move('#categoryPanel', '#workspace-settings');

  movePeoplePanels();
  moveBackupPanels();
  hideLegacyViews();
}

function move(selector, targetSelector) {
  const el = document.querySelector(selector);
  const target = document.querySelector(targetSelector);
  if (!el || !target || el.parentElement === target) return;
  target.appendChild(el);
}

function movePeoplePanels() {
  const target = document.querySelector('#workspace-settings');
  const people = document.querySelector('#view-people');
  if (!target || !people) return;
  [...people.children].forEach((child) => {
    if (child.id === 'categoryPanel') return;
    if (!child.classList?.contains('workspace-heading')) target.appendChild(child);
  });
}

function moveBackupPanels() {
  const target = document.querySelector('#workspace-settings');
  const backup = document.querySelector('#view-backup');
  if (!target || !backup) return;
  [...backup.children].forEach((child) => target.appendChild(child));
}

function hideLegacyViews() {
  ['movements', 'people', 'backup'].forEach((id) => {
    const view = document.querySelector(`#view-${id}`);
    if (view) view.classList.add('legacy-view-hidden');
  });
}

function setWorkspaceView(view) {
  organizePanels();
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  document.querySelectorAll('.nav-tab').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const title = document.querySelector('#topbarTitle');
  if (title) title.textContent = titleFor(view).title;
  document.body.classList.remove('sidebar-open');
}

function titleFor(id) {
  return {
    dashboard: { eyebrow: 'Balance del hogar', title: 'Resumen', help: 'Vista ejecutiva: deuda abierta, actividad y lectura general.' },
    expenses: { eyebrow: 'Cuentas comunes', title: 'Gastos', help: 'Carga express, libro contable y plantillas recurrentes.' },
    operations: { eyebrow: 'Gastos compuestos', title: 'Operaciones', help: 'Agrupa reparaciones, compras grandes o eventos con varios ítems.' },
    payments: { eyebrow: 'Transferencias', title: 'Pagos y comprobantes', help: 'Registra pagos, adjunta comprobantes y autoriza documentos.' },
    reports: { eyebrow: 'Cierre contable', title: 'Informes', help: 'Informes por persona, categorías, cierres mensuales y PDF.' },
    settings: { eyebrow: 'Administración', title: 'Configuración', help: 'Usuarios, categorías, respaldo y ajustes de la casa.' },
  }[id] || { eyebrow: 'Cuentas Hogar', title: 'Cuentas Hogar', help: '' };
}

function injectStyles() {
  if (document.querySelector('#workspaceOrganizerStyles')) return;
  const style = document.createElement('style');
  style.id = 'workspaceOrganizerStyles';
  style.textContent = `
    .workspace-heading{border:1px solid var(--line);border-radius:24px;background:linear-gradient(135deg,rgba(56,189,248,.10),rgba(167,139,250,.06));padding:18px 20px;margin-bottom:16px}.workspace-heading h3{margin:4px 0;font-size:1.45rem}.workspace-stack{display:grid;gap:18px}.legacy-view-hidden{display:none!important}.nav-tabs{gap:8px}.nav-tab{justify-content:flex-start}.organized-view .grid{width:100%}@media(max-width:760px){.workspace-heading{padding:16px}.workspace-heading h3{font-size:1.25rem}}
  `;
  document.head.appendChild(style);
}
