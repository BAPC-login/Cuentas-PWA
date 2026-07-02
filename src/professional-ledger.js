const API_LEDGER = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_LEDGER = 'cuentas-pwa:session-token';
const MONTH_KEY = 'cuentas-pwa:selected-month';
const AUDIT_KEY = 'cuentas-pwa:audit-local';

setTimeout(initProfessionalLedger, 1300);
window.addEventListener('family-data-changed', () => setTimeout(refreshProfessionalLedger, 450));
window.addEventListener('family-audit-changed', () => renderAuditPanel());

function initProfessionalLedger() {
  injectStyles();
  injectMonthBar();
  injectProfessionalDashboard();
  injectStatementsPanel();
  injectGuidedPaymentPanel();
  injectAuditPanel();
  injectBottomNav();
  bindLedgerEvents();
  refreshProfessionalLedger();
}

function injectMonthBar() {
  if (document.querySelector('#globalMonthBar')) return;
  const content = document.querySelector('.content');
  const month = selectedMonth();
  content?.insertAdjacentHTML('afterbegin', `
    <section id="globalMonthBar" class="global-month-bar">
      <div><p class="eyebrow">Mes contable</p><strong id="globalMonthLabel">${escapeHtml(month)}</strong><small>Todo se revisa por mes: gastos, pagos, deudas, informes y cierre.</small></div>
      <div class="month-actions"><input id="globalMonthInput" type="month" value="${escapeHtml(month)}"><button class="tiny-button" id="goCurrentMonth" type="button">Mes actual</button></div>
    </section>
  `);
}

function injectProfessionalDashboard() {
  const dashboard = document.querySelector('#view-dashboard');
  if (!dashboard || document.querySelector('#professionalDashboard')) return;
  dashboard.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="professionalDashboard">
      <div class="panel-header"><div><p class="eyebrow">Dashboard ejecutivo</p><h3>Estado contable del hogar</h3></div><button class="text-button" id="professionalRefresh" type="button">Actualizar</button></div>
      <div id="monthLockBanner" class="month-lock-banner"></div>
      <div class="summary-grid professional-summary" id="professionalSummary"></div>
      <div class="professional-columns">
        <section><h4>Deudas netas por pagar</h4><div id="professionalNetDebts" class="mini-list"></div></section>
        <section><h4>Gastos por categoría</h4><div id="professionalCategories" class="mini-list"></div></section>
      </div>
    </article>
  `);
}

function injectStatementsPanel() {
  const reports = document.querySelector('#workspace-reports') || document.querySelector('#view-reports');
  if (!reports || document.querySelector('#statementPanel')) return;
  reports.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="statementPanel">
      <div class="panel-header"><div><p class="eyebrow">Cartola individual</p><h3>Informe por usuario</h3></div><button class="text-button" id="statementRefresh" type="button">Actualizar</button></div>
      <p class="muted small">Cada cartola separa: gastos que pagó, gastos donde participa, saldo a favor, restante por pagar y balance final.</p>
      <div id="statementList" class="statement-list"></div>
    </article>
  `);
}

function injectGuidedPaymentPanel() {
  const payments = document.querySelector('#workspace-payments') || document.querySelector('#view-payments');
  if (!payments || document.querySelector('#guidedPaymentPanel')) return;
  payments.insertAdjacentHTML('afterbegin', `
    <article class="panel" id="guidedPaymentPanel">
      <div class="panel-header"><div><p class="eyebrow">Pago guiado</p><h3>Pagar una deuda neta</h3></div><button class="text-button" id="guidedPaymentRefresh" type="button">Actualizar</button></div>
      <p class="muted small">La app sugiere el pago final después de compensar deudas cruzadas. Al elegir una deuda, se completa el formulario de pago.</p>
      <div id="guidedPaymentList" class="mini-list"></div>
    </article>
  `);
}

function injectAuditPanel() {
  const settings = document.querySelector('#workspace-settings') || document.querySelector('#view-settings');
  if (!settings || document.querySelector('#auditPanel')) return;
  settings.insertAdjacentHTML('beforeend', `
    <article class="panel" id="auditPanel">
      <div class="panel-header"><div><p class="eyebrow">Auditoría</p><h3>Historial de cambios local</h3></div><button class="text-button" id="clearAuditButton" type="button">Limpiar</button></div>
      <p class="muted small">Registro visible de ediciones hechas desde este dispositivo. Más adelante conviene persistirlo en D1.</p>
      <div id="auditList" class="mini-list"></div>
    </article>
  `);
}

function injectBottomNav() {
  if (document.querySelector('#mobileBottomNav')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <nav id="mobileBottomNav" class="mobile-bottom-nav">
      <button data-view="dashboard" type="button">Resumen</button>
      <button data-view="expenses" type="button">Gastos</button>
      <button data-view="payments" type="button">Pagos</button>
      <button data-view="reports" type="button">Informes</button>
      <button data-view="settings" type="button">Más</button>
    </nav>
  `);
}

function bindLedgerEvents() {
  if (document.body.dataset.profLedgerReady === '1') return;
  document.body.dataset.profLedgerReady = '1';
  document.addEventListener('click', (event) => {
    if (event.target.id === 'professionalRefresh' || event.target.id === 'statementRefresh' || event.target.id === 'guidedPaymentRefresh') refreshProfessionalLedger();
    if (event.target.id === 'goCurrentMonth') setSelectedMonth(new Date().toISOString().slice(0, 7));
    if (event.target.id === 'clearAuditButton') { localStorage.removeItem(AUDIT_KEY); renderAuditPanel(); }
    const guided = event.target.closest('[data-guided-pay]');
    if (guided) fillPaymentForm(guided.dataset.debtor, guided.dataset.receiver, Number(guided.dataset.amount || 0));
    const nav = event.target.closest('#mobileBottomNav button[data-view]');
    if (nav) document.querySelector(`.nav-tab[data-view="${nav.dataset.view}"]`)?.click();
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'globalMonthInput') setSelectedMonth(event.target.value);
  });
}

async function refreshProfessionalLedger() {
  if (!localStorage.getItem(TOKEN_LEDGER)) return;
  const month = selectedMonth();
  const [billsData, debtsData, catsData, usersData, paymentsData, closuresData, operationsData] = await Promise.all([
    api('/bills').catch(() => ({ bills: [] })),
    api('/debts').catch(() => ({ debts: [], details: [], net_summary: [] })),
    api('/categories').catch(() => ({ categories: [] })),
    api('/users').catch(() => ({ users: [] })),
    api('/payments').catch(() => ({ payments: [] })),
    api('/month-closures').catch(() => ({ closures: [] })),
    api('/operations').catch(() => ({ operations: [] })),
  ]);
  const bills = (billsData.bills || []).filter((b) => billMonth(b) === month);
  const payments = (paymentsData.payments || []).filter((p) => String(p.paid_at || '').slice(0, 7) === month);
  const details = (debtsData.details || []).filter((d) => String(d.service_month || '').slice(0, 7) === month);
  const net = netDebtRows(details.length ? details : debtsData.debts || []);
  const closures = closuresData.closures || [];
  const isClosed = closures.some((c) => c.month === month);
  const ctx = { month, bills, payments, details, net, categories: catsData.categories || [], users: usersData.users || [], closures, operations: operationsData.operations || [], isClosed };
  window.__ledgerContext = ctx;
  renderMonthBar(ctx);
  renderProfessionalDashboard(ctx);
  renderStatements(ctx);
  renderGuidedPayments(ctx);
  renderAuditPanel();
  applyClosedVisualState(ctx);
}

function renderMonthBar(ctx) {
  const input = document.querySelector('#globalMonthInput');
  const label = document.querySelector('#globalMonthLabel');
  if (input) input.value = ctx.month;
  if (label) label.textContent = ctx.month;
}

function renderProfessionalDashboard(ctx) {
  const total = ctx.bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const paid = ctx.payments.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const pending = ctx.details.reduce((s, d) => s + Number(d.pending || 0), 0);
  const operationsTotal = ctx.operations.filter((op) => op.service_month === ctx.month).reduce((s, op) => s + Number(op.total_amount || 0), 0);
  const summary = document.querySelector('#professionalSummary');
  if (summary) summary.innerHTML = `
    <div class="summary-card"><span>Total del mes</span><strong>${money(total)}</strong></div>
    <div class="summary-card"><span>Pagos registrados</span><strong>${money(paid)}</strong></div>
    <div class="summary-card"><span>Deuda bruta pendiente</span><strong>${money(pending)}</strong></div>
    <div class="summary-card"><span>Operaciones</span><strong>${money(operationsTotal)}</strong></div>
  `;
  const lock = document.querySelector('#monthLockBanner');
  if (lock) lock.innerHTML = ctx.isClosed ? `<strong>Mes cerrado. Solo lectura.</strong><span>Para editar o pagar gastos de ${escapeHtml(ctx.month)}, el owner debe reabrir el mes.</span>` : `<strong>Mes abierto.</strong><span>Puedes registrar gastos, editar y pagar normalmente.</span>`;
  if (lock) lock.classList.toggle('closed', ctx.isClosed);
  renderNetDebts(ctx.net);
  renderCategories(ctx);
}

function renderNetDebts(rows) {
  const box = document.querySelector('#professionalNetDebts');
  if (!box) return;
  box.innerHTML = rows.length ? rows.map((d) => `<article class="mini-card"><div><strong>${escapeHtml(d.debtor_name)} → ${escapeHtml(d.receiver_name)}</strong><small>Balance final neto</small></div><b>${money(d.amount)}</b></article>`).join('') : '<div class="empty-state">No hay deuda neta abierta.</div>';
}

function renderCategories(ctx) {
  const box = document.querySelector('#professionalCategories');
  if (!box) return;
  const map = new Map();
  ctx.bills.forEach((b) => {
    const key = b.category_name || 'Sin categoría';
    const row = map.get(key) || { name: key, icon: b.category_icon || '🏷️', total: 0 };
    row.total += Number(b.total_amount || 0);
    map.set(key, row);
  });
  const rows = [...map.values()].sort((a, b) => b.total - a.total);
  box.innerHTML = rows.length ? rows.map((r) => `<article class="mini-card"><div><strong>${escapeHtml(r.icon)} ${escapeHtml(r.name)}</strong><small>Gasto categorizado del mes</small></div><b>${money(r.total)}</b></article>`).join('') : '<div class="empty-state">Sin gastos categorizados en este mes.</div>';
}

function renderStatements(ctx) {
  const box = document.querySelector('#statementList');
  if (!box) return;
  const reports = buildReports(ctx);
  box.innerHTML = reports.length ? reports.map((r) => `
    <article class="statement-card">
      <div class="statement-head"><div><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.email || '')}</small></div><b>${r.final >= 0 ? money(r.final) + ' a favor' : money(Math.abs(r.final)) + ' por pagar'}</b></div>
      <div class="statement-kpis"><span>Pagó ${money(r.paid)}</span><span>Participó ${money(r.assigned)}</span><span>Saldo a favor ${money(r.favor)}</span><span>Restante ${money(r.owes)}</span></div>
      <details><summary>Ver detalle</summary><div class="mini-list">${r.lines.length ? r.lines.map((line) => `<article class="mini-card"><div><strong>${escapeHtml(line.title)}</strong><small>${escapeHtml(line.meta)}</small></div><b>${money(line.amount)}</b></article>`).join('') : '<div class="empty-state">Sin movimientos del mes.</div>'}</div></details>
    </article>
  `).join('') : '<div class="empty-state">No hay usuarios o movimientos para este mes.</div>';
}

function renderGuidedPayments(ctx) {
  const box = document.querySelector('#guidedPaymentList');
  if (!box) return;
  box.innerHTML = ctx.net.length ? ctx.net.map((d) => `
    <article class="mini-card guided-card">
      <div><strong>${escapeHtml(d.debtor_name)} debe pagar a ${escapeHtml(d.receiver_name)}</strong><small>Pago recomendado según balance neto de ${escapeHtml(ctx.month)}</small></div>
      <div><b>${money(d.amount)}</b><button class="tiny-button" data-guided-pay="1" data-debtor="${escapeHtml(d.debtor_id)}" data-receiver="${escapeHtml(d.receiver_id)}" data-amount="${Number(d.amount || 0)}" type="button">Registrar pago</button></div>
    </article>
  `).join('') : '<div class="empty-state">No hay deudas netas para pagar este mes.</div>';
}

function renderAuditPanel() {
  const box = document.querySelector('#auditList');
  if (!box) return;
  const rows = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  box.innerHTML = rows.length ? rows.slice(0, 20).map((r) => `<article class="mini-card"><div><strong>${labelAudit(r.action)}</strong><small>${new Date(r.at).toLocaleString('es-CL')} · ${escapeHtml(r.detail?.after?.title || r.detail?.bill_id || '')}</small></div></article>`).join('') : '<div class="empty-state">Aún no hay cambios registrados en este dispositivo.</div>';
}

function applyClosedVisualState(ctx) {
  document.body.classList.toggle('month-closed', ctx.isClosed);
}

function fillPaymentForm(debtorId, receiverId, amount) {
  document.querySelector('.nav-tab[data-view="payments"]')?.click();
  setTimeout(() => {
    const payer = document.querySelector('#paymentPayer');
    const receiver = document.querySelector('#paymentReceiver');
    const value = document.querySelector('#paymentAmount');
    const date = document.querySelector('#paymentDate');
    const note = document.querySelector('#paymentNote');
    if (payer) payer.value = debtorId;
    if (receiver) receiver.value = receiverId;
    if (value) value.value = amount;
    if (date) date.value = new Date().toISOString().slice(0, 10);
    if (note) note.value = `Pago sugerido por balance neto ${selectedMonth()}`;
    document.querySelector('#paymentForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 150);
}

function buildReports(ctx) {
  const map = new Map();
  const ensure = (id, name, email) => {
    if (!id) return null;
    if (!map.has(id)) map.set(id, { id, name: name || email || 'Usuario', email, paid: 0, assigned: 0, favor: 0, owes: 0, lines: [] });
    return map.get(id);
  };
  ctx.users.forEach((u) => ensure(u.id, u.name, u.email));
  ctx.bills.forEach((b) => {
    const payer = ensure(b.paid_by_user_id || b.created_by, b.paid_by_name, b.paid_by_email);
    if (payer) { payer.paid += Number(b.total_amount || 0); payer.lines.push({ title: `Pagó: ${b.title}`, meta: `${b.category_name || ''} · ${b.bill_date || ''}`, amount: Number(b.total_amount || 0) }); }
  });
  ctx.details.forEach((d) => {
    const debtor = ensure(d.debtor_id, d.debtor_name, d.debtor_email);
    const receiver = ensure(d.receiver_id, d.receiver_name, d.receiver_email);
    if (debtor) { debtor.assigned += Number(d.total_assigned || 0); debtor.owes += Number(d.pending || 0); debtor.lines.push({ title: `Debe por: ${d.bill_title}`, meta: `A ${d.receiver_name || d.receiver_email} · ${d.category_name || ''}`, amount: Number(d.pending || 0) }); }
    if (receiver) { receiver.favor += Number(d.pending || 0); }
  });
  return [...map.values()].map((r) => ({ ...r, final: r.favor - r.owes })).sort((a, b) => Math.abs(b.final) - Math.abs(a.final));
}

function netDebtRows(input) {
  if (!Array.isArray(input)) return [];
  if (input.some((x) => x.bill_id)) return netFromDetails(input);
  return netFromAggregates(input);
}
function netFromDetails(details) {
  const names = new Map();
  const pairs = new Map();
  details.forEach((d) => {
    const amount = Number(d.pending || 0);
    if (!d.debtor_id || !d.receiver_id || d.debtor_id === d.receiver_id || amount <= 0) return;
    names.set(d.debtor_id, d.debtor_name || d.debtor_email || 'Usuario');
    names.set(d.receiver_id, d.receiver_name || d.receiver_email || 'Usuario');
    const key = [d.debtor_id, d.receiver_id].sort().join('::');
    const row = pairs.get(key) || { a: d.debtor_id, b: d.receiver_id, amountAB: 0, amountBA: 0 };
    if (d.debtor_id === row.a) row.amountAB += amount; else row.amountBA += amount;
    pairs.set(key, row);
  });
  return netRowsFromPairs(pairs, names);
}
function netFromAggregates(debts) {
  const names = new Map();
  const pairs = new Map();
  debts.forEach((d) => {
    const debtor = d.debtor_id || d.id;
    const receiver = d.receiver_id || d.owes_to?.id;
    const amount = Number(d.pending || 0);
    if (!debtor || !receiver || debtor === receiver || amount <= 0) return;
    names.set(debtor, d.debtor_name || d.name || d.debtor_email || d.email || 'Usuario');
    names.set(receiver, d.receiver_name || d.owes_to?.name || d.receiver_email || d.owes_to?.email || 'Usuario');
    const key = [debtor, receiver].sort().join('::');
    const row = pairs.get(key) || { a: debtor, b: receiver, amountAB: 0, amountBA: 0 };
    if (debtor === row.a) row.amountAB += amount; else row.amountBA += amount;
    pairs.set(key, row);
  });
  return netRowsFromPairs(pairs, names);
}
function netRowsFromPairs(pairs, names) {
  return [...pairs.values()].map((p) => {
    const net = p.amountAB - p.amountBA;
    if (net > 0) return { debtor_id: p.a, debtor_name: names.get(p.a), receiver_id: p.b, receiver_name: names.get(p.b), amount: net };
    if (net < 0) return { debtor_id: p.b, debtor_name: names.get(p.b), receiver_id: p.a, receiver_name: names.get(p.a), amount: Math.abs(net) };
    return null;
  }).filter(Boolean).sort((a, b) => b.amount - a.amount);
}

function selectedMonth() { return localStorage.getItem(MONTH_KEY) || new Date().toISOString().slice(0, 7); }
function setSelectedMonth(month) { if (!month) return; localStorage.setItem(MONTH_KEY, month); window.dispatchEvent(new Event('family-data-changed')); }
function billMonth(bill) { return String(bill.service_month || bill.bill_date || '').slice(0, 7); }
async function api(path, options = {}) { const headers = new Headers(options.headers || {}); headers.set('content-type', 'application/json'); headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_LEDGER)); const res = await fetch(API_LEDGER + path, { ...options, headers }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.message || data.error || 'Error API'); return data; }
function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
function labelAudit(action) { return ({ edit_bill: 'Edición de gasto' })[action] || action || 'Cambio'; }

function injectStyles() {
  if (document.querySelector('#professionalLedgerStyles')) return;
  const style = document.createElement('style');
  style.id = 'professionalLedgerStyles';
  style.textContent = `.global-month-bar{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid var(--line);border-radius:24px;background:linear-gradient(135deg,rgba(56,189,248,.16),rgba(167,139,250,.08));padding:14px 18px;margin-bottom:16px}.global-month-bar strong{display:block;font-size:1.2rem}.global-month-bar small{display:block;color:var(--muted);margin-top:2px}.month-actions{display:flex;gap:8px;align-items:center}.month-actions input{border:1px solid var(--line);border-radius:14px;background:rgba(15,23,42,.44);color:var(--text);padding:10px}.month-lock-banner{display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(34,197,94,.25);border-radius:18px;background:rgba(34,197,94,.08);padding:12px;margin-bottom:14px}.month-lock-banner.closed{border-color:rgba(248,113,113,.42);background:rgba(248,113,113,.1)}.month-lock-banner span{color:var(--muted)}.professional-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.mini-list,.statement-list{display:grid;gap:10px}.mini-card,.statement-card{border:1px solid var(--line);border-radius:18px;background:rgba(148,163,184,.08);padding:12px}.mini-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.mini-card small,.statement-card small{display:block;color:var(--muted);margin-top:4px}.guided-card{border-color:rgba(34,197,94,.26)}.statement-head{display:flex;justify-content:space-between;gap:12px}.statement-kpis{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.statement-kpis span{border:1px solid var(--line);border-radius:999px;padding:6px 9px;color:var(--muted);font-weight:800;font-size:.82rem}.statement-card summary{cursor:pointer;font-weight:900}.month-closed #expenseEntryPanel,.month-closed #paymentForm,.month-closed #operationForm{opacity:.62}.mobile-bottom-nav{display:none}@media(max-width:760px){.global-month-bar,.professional-columns,.mini-card,.statement-head{display:grid}.month-actions{display:grid}.mobile-bottom-nav{position:fixed;left:10px;right:10px;bottom:10px;z-index:80;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;border:1px solid var(--line);border-radius:24px;background:rgba(15,23,42,.9);backdrop-filter:blur(14px);padding:8px}.mobile-bottom-nav button{border:0;background:transparent;color:var(--muted);font-weight:900;font-size:.75rem}.content{padding-bottom:86px!important}}`;
  document.head.appendChild(style);
}
