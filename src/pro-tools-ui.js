import { showAppToast, resetForm } from './ui-feedback.js';

const API_PRO = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_PRO = 'cuentas-pwa:session-token';

setTimeout(initProToolsUi, 2100);
window.addEventListener('family-data-changed', () => refreshProTools());

function initProToolsUi() {
  injectStyles();
  injectPaymentPanel();
  injectTemplatesPanel();
  injectHistoryAndClosePanel();
  injectReportDialog();
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  refreshProTools();
}

function injectPaymentPanel() {
  const movements = document.querySelector('#view-movements');
  if (!movements || document.querySelector('#paymentPanel')) return;
  movements.insertAdjacentHTML('beforeend', `
    <article class="panel" id="paymentPanel">
      <div class="panel-header"><div><p class="eyebrow">Pagos y comprobantes</p><h3>Registrar pago de deudas</h3></div><button class="text-button" id="paymentRefresh" type="button">Actualizar</button></div>
      <p class="muted small">Sube un comprobante y selecciona uno o varios gastos que estás pagando. El pago descuenta el saldo del usuario elegido.</p>
      <form id="paymentForm" class="form-stack">
        <div class="form-row"><label class="field"><span>Quién paga</span><select id="paymentPayer"></select></label><label class="field"><span>Quién recibe</span><select id="paymentReceiver"><option value="">Sin receptor específico</option></select></label></div>
        <div class="form-row"><label class="field"><span>Monto pagado</span><input id="paymentAmount" inputmode="numeric" placeholder="50000"></label><label class="field"><span>Fecha</span><input id="paymentDate" type="date"></label></div>
        <label class="field"><span>Nota / comprobante</span><input id="paymentNote" placeholder="Ej: transferencia banco, folio, comentario"></label>
        <label class="upload-box compact-upload" for="paymentReceiptFile"><input id="paymentReceiptFile" type="file" accept="image/*,application/pdf"><span class="upload-icon">📎</span><strong>Adjuntar comprobante</strong><small id="paymentReceiptName">Opcional. Se registra el nombre del archivo y el pago queda trazado.</small></label>
        <div class="participant-editor"><strong>Gastos que cubre este pago</strong><div class="split-note">Marca 1 o más gastos. Puedes pagar todo o solo una parte de cada uno.</div><div id="paymentAllocations" class="allocation-list"></div></div>
        <button class="primary-button full" type="submit">Registrar pago</button>
      </form>
      <div id="paymentRecentList" class="template-list"></div>
    </article>
  `);
  document.querySelector('#paymentDate').value = new Date().toISOString().slice(0, 10);
  document.querySelector('#paymentForm').addEventListener('submit', createPaymentRecord);
  document.querySelector('#paymentRefresh').addEventListener('click', refreshProTools);
  document.querySelector('#paymentReceiptFile').addEventListener('change', () => {
    const file = document.querySelector('#paymentReceiptFile').files?.[0];
    document.querySelector('#paymentReceiptName').textContent = file ? file.name : 'Opcional. Se registra el nombre del archivo y el pago queda trazado.';
  });
}

function injectTemplatesPanel() {
  const movements = document.querySelector('#view-movements');
  if (!movements || document.querySelector('#templatesPanel')) return;
  movements.insertAdjacentHTML('beforeend', `
    <article class="panel" id="templatesPanel">
      <div class="panel-header"><div><p class="eyebrow">Plantillas rápidas</p><h3>Gastos recurrentes</h3></div><button class="text-button" id="templatesRefresh" type="button">Actualizar</button></div>
      <form id="templateForm" class="form-stack">
        <div class="form-row"><label class="field"><span>Nombre plantilla</span><input id="tplTitle" placeholder="Ej: Arriendo"></label><label class="field"><span>Categoría</span><select id="tplCategory"></select></label></div>
        <div class="form-row"><label class="field"><span>Monto referencial</span><input id="tplAmount" inputmode="numeric" placeholder="Opcional"></label><label class="field"><span>Mes</span><select id="tplOffset"><option value="0">Mes actual</option><option value="1">Mes siguiente</option><option value="-1">Mes anterior</option></select></label></div>
        <button class="secondary-button" type="submit">Crear plantilla</button>
      </form>
      <div class="template-list" id="templateList"><div class="empty-state">Cargando plantillas...</div></div>
    </article>
  `);
  document.querySelector('#templateForm').addEventListener('submit', createTemplate);
  document.querySelector('#templatesRefresh').addEventListener('click', refreshProTools);
}

function injectHistoryAndClosePanel() {
  const dashboard = document.querySelector('#view-dashboard');
  if (!dashboard || document.querySelector('#proDashboardPanel')) return;
  dashboard.insertAdjacentHTML('beforeend', `
    <article class="panel" id="proDashboardPanel">
      <div class="panel-header"><div><p class="eyebrow">Control contable</p><h3>Informes, categorías y cierre</h3></div><button class="text-button" data-action="print-report" type="button">Exportar PDF</button></div>
      <div class="pro-grid">
        <section><h4>Informe por persona</h4><div id="personHistoryList" class="template-list"></div></section>
        <section><h4>Gastos por categoría</h4><div id="categoryDashboardList" class="template-list"></div></section>
        <section><h4>Cierre mensual</h4><div class="form-row"><label class="field"><span>Mes a cerrar</span><input id="closeMonthInput" type="month"></label><button class="secondary-button" data-action="close-month" type="button">Cerrar mes</button></div><div id="monthClosureList" class="template-list"></div></section>
      </div>
    </article>
  `);
  document.querySelector('#closeMonthInput').value = new Date().toISOString().slice(0, 7);
}

function injectReportDialog() {
  if (document.querySelector('#personReportDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="personReportDialog" class="report-dialog">
      <form method="dialog" class="report-card">
        <button class="dialog-close" value="cancel" aria-label="Cerrar" type="submit">×</button>
        <p class="eyebrow">Informe individual</p><h3 id="personReportTitle">Usuario</h3>
        <div class="summary-grid" id="personReportTotals"></div>
        <div id="personReportDetails" class="template-list"></div>
      </form>
    </dialog>
  `);
}

async function refreshProTools() {
  const token = localStorage.getItem(TOKEN_PRO);
  if (!token) return;
  try {
    const [cats, templates, debts, closures, bills, users, payments, dash] = await Promise.all([
      api('/categories'),
      api('/templates'),
      api('/debts'),
      api('/month-closures'),
      api('/bills'),
      api('/users').catch(() => ({ users: [] })),
      api('/payments').catch(() => ({ payments: [] })),
      api('/dashboard').catch(() => ({ by_category: [] })),
    ]);
    window.__proCats = cats.categories || [];
    window.__proTemplates = templates.templates || [];
    window.__proUsers = users.users || [];
    window.__proBills = bills.bills || [];
    window.__proDebts = debts.debts || [];
    window.__proPayments = payments.payments || [];
    renderTemplateControls(cats.categories || []);
    renderTemplates(templates.templates || []);
    renderPaymentControls(users.users || [], bills.bills || []);
    renderRecentPayments(payments.payments || []);
    renderPersonHistory(debts.debts || [], bills.bills || []);
    renderCategoryDashboard(dash.by_category || []);
    renderClosures(closures.closures || []);
  } catch (error) {
    console.warn('pro tools', error);
  }
}

function renderTemplateControls(cats) {
  const select = document.querySelector('#tplCategory');
  if (select) select.innerHTML = cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
}

function renderPaymentControls(users, bills) {
  const payer = document.querySelector('#paymentPayer');
  const receiver = document.querySelector('#paymentReceiver');
  if (payer) payer.innerHTML = users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.email)}</option>`).join('');
  if (receiver) receiver.innerHTML = '<option value="">Sin receptor específico</option>' + users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.email)}</option>`).join('');
  const box = document.querySelector('#paymentAllocations');
  if (!box) return;
  const openBills = bills.filter((b) => !['paid', 'cancelled'].includes(b.status));
  box.innerHTML = openBills.length ? openBills.map((b) => `
    <label class="allocation-row">
      <input type="checkbox" data-payment-bill value="${escapeHtml(b.id)}">
      <span><strong>${escapeHtml(b.title)}</strong><small>${escapeHtml(b.category_name || '')} · ${escapeHtml(b.service_month || '')} · total ${money(b.total_amount)}</small></span>
      <input data-payment-amount="${escapeHtml(b.id)}" inputmode="numeric" placeholder="Monto" value="">
    </label>
  `).join('') : '<div class="empty-state">No hay gastos pendientes para asociar.</div>';
}

function renderTemplates(templates) {
  const list = document.querySelector('#templateList');
  if (!list) return;
  list.innerHTML = templates.length ? templates.map((t) => `<article class="template-card"><div><strong>${escapeHtml(t.category_icon || '')} ${escapeHtml(t.title)}</strong><small>${escapeHtml(t.category_name || '')} · ${t.default_amount ? money(t.default_amount) : 'Sin monto'} · ${monthLabel(t.service_month_offset)}</small></div><div><button class="tiny-button" data-action="use-template" data-id="${escapeHtml(t.id)}" type="button">Usar</button><button class="tiny-button danger-mini" data-action="delete-template" data-id="${escapeHtml(t.id)}" type="button">Eliminar</button></div></article>`).join('') : '<div class="empty-state">Crea plantillas para arriendo, internet, suscripciones, etc.</div>';
}

function renderRecentPayments(payments) {
  const list = document.querySelector('#paymentRecentList');
  if (!list) return;
  list.innerHTML = payments.length ? `<h4>Últimos pagos</h4>` + payments.slice(0, 6).map((p) => `<article class="template-card"><div><strong>${escapeHtml(p.payer_name || 'Pago')}</strong><small>${escapeHtml(p.paid_at || '')} · ${escapeHtml(p.note || p.source || '')}</small></div><b>${money(p.total_amount)}</b></article>`).join('') : '<div class="empty-state">Aún no hay pagos registrados.</div>';
}

function renderPersonHistory(debts, bills) {
  const list = document.querySelector('#personHistoryList');
  if (!list) return;
  const reports = buildPersonReports(debts, bills);
  window.__personReports = reports;
  const rows = [...reports.values()].sort((a, b) => (b.balanceFavor + b.toPay) - (a.balanceFavor + a.toPay));
  list.innerHTML = rows.length ? rows.map((r) => `<article class="template-card person-report-card"><div><strong>${escapeHtml(r.name)}</strong><small>Saldo a favor ${money(r.balanceFavor)} · Restante a pagar ${money(r.toPay)}</small></div><button class="tiny-button" data-action="person-report" data-person="${escapeHtml(r.id)}" type="button">Ver informe</button></article>`).join('') : '<div class="empty-state">Sin historial por persona todavía.</div>';
}

function renderCategoryDashboard(rows) {
  const list = document.querySelector('#categoryDashboardList');
  if (!list) return;
  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  list.innerHTML = rows.length ? rows.map((r) => {
    const pct = total ? Math.round(Number(r.total || 0) * 100 / total) : 0;
    return `<article class="template-card category-row"><div><strong>${escapeHtml(r.icon || '')} ${escapeHtml(r.name)}</strong><small>${pct}% del total categorizado</small><div class="bar"><i style="width:${pct}%"></i></div></div><b>${money(r.total)}</b></article>`;
  }).join('') : '<div class="empty-state">Todavía no hay gastos categorizados.</div>';
}

function renderClosures(closures) {
  const list = document.querySelector('#monthClosureList');
  if (!list) return;
  list.innerHTML = closures.length ? closures.map((c) => `<article class="template-card"><div><strong>${escapeHtml(c.month)}</strong><small>Cerrado por ${escapeHtml(c.closed_by_name || c.closed_by_email)}</small></div><button class="tiny-button" data-action="open-month" data-month="${escapeHtml(c.month)}" type="button">Reabrir</button></article>`).join('') : '<div class="empty-state">No hay meses cerrados.</div>';
}

async function createTemplate(event) {
  event.preventDefault();
  try {
    await api('/templates', { method: 'POST', body: JSON.stringify({ title: val('#tplTitle'), category_id: val('#tplCategory'), default_amount: amount('#tplAmount'), service_month_offset: Number(val('#tplOffset') || 0) }) });
    resetForm(document.querySelector('#templateForm'));
    showAppToast('Plantilla creada.');
    await refreshProTools();
  } catch (error) { showAppToast(error.message || 'No se pudo crear plantilla.', 'error'); }
}

async function createPaymentRecord(event) {
  event.preventDefault();
  const payerId = val('#paymentPayer');
  const total = amount('#paymentAmount');
  const allocations = [...document.querySelectorAll('[data-payment-bill]:checked')].map((checkbox) => ({
    bill_id: checkbox.value,
    user_id: payerId,
    amount: Number(String(document.querySelector(`[data-payment-amount="${CSS.escape(checkbox.value)}"]`)?.value || '').replace(/[^0-9]/g, '')) || 0,
  })).filter((a) => a.bill_id && a.amount > 0);
  const sum = allocations.reduce((s, a) => s + a.amount, 0);
  if (!payerId || total <= 0) return showAppToast('Falta pagador o monto.', 'error');
  if (!allocations.length) return showAppToast('Selecciona al menos un gasto a pagar.', 'error');
  if (sum !== total) return showAppToast(`La suma asignada (${money(sum)}) debe coincidir con el pago (${money(total)}).`, 'error');
  const file = document.querySelector('#paymentReceiptFile')?.files?.[0];
  const note = [val('#paymentNote'), file ? `Comprobante: ${file.name}` : ''].filter(Boolean).join(' · ');
  try {
    await api('/payments', { method: 'POST', body: JSON.stringify({
      payer_id: payerId,
      receiver_id: val('#paymentReceiver') || null,
      total_amount: total,
      paid_at: val('#paymentDate'),
      status: 'approved',
      source: file ? 'comprobante' : 'manual',
      note,
      allocations,
    }) });
    if (file) {
      await api('/receipts', { method: 'POST', body: JSON.stringify({
        source: 'payment_receipt',
        status: 'approved',
        file_name: file.name,
        file_type: file.type || 'archivo',
        detected_amount: total,
        detected_date: val('#paymentDate'),
        raw_text: `Comprobante de pago por ${money(total)}. ${note}`,
      }) }).catch(() => null);
    }
    resetForm(document.querySelector('#paymentForm'));
    document.querySelector('#paymentDate').value = new Date().toISOString().slice(0, 10);
    document.querySelector('#paymentReceiptName').textContent = 'Opcional. Se registra el nombre del archivo y el pago queda trazado.';
    showAppToast('Pago registrado y saldos actualizados.');
    window.dispatchEvent(new Event('family-data-changed'));
    await refreshProTools();
  } catch (error) {
    showAppToast(error.message || 'No se pudo registrar el pago.', 'error');
  }
}

async function handleClick(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'use-template') useTemplate(btn.dataset.id);
  if (btn.dataset.action === 'delete-template') { await api(`/templates/${btn.dataset.id}`, { method: 'DELETE' }); showAppToast('Plantilla eliminada.'); refreshProTools(); }
  if (btn.dataset.action === 'close-month') { await api('/month-closures', { method: 'POST', body: JSON.stringify({ month: val('#closeMonthInput') }) }); showAppToast('Mes cerrado.'); window.dispatchEvent(new Event('family-data-changed')); refreshProTools(); }
  if (btn.dataset.action === 'open-month') { await api(`/month-closures/${btn.dataset.month}`, { method: 'DELETE' }); showAppToast('Mes reabierto.'); window.dispatchEvent(new Event('family-data-changed')); refreshProTools(); }
  if (btn.dataset.action === 'print-report') window.print();
  if (btn.dataset.action === 'person-report') openPersonReport(btn.dataset.person);
}

function openPersonReport(id) {
  const report = window.__personReports?.get(id);
  if (!report) return;
  document.querySelector('#personReportTitle').textContent = report.name;
  document.querySelector('#personReportTotals').innerHTML = `
    <div class="summary-card"><span>Saldo a favor</span><strong>${money(report.balanceFavor)}</strong></div>
    <div class="summary-card"><span>Restante a pagar</span><strong>${money(report.toPay)}</strong></div>
    <div class="summary-card"><span>Balance final</span><strong>${report.balanceFavor >= report.toPay ? money(report.balanceFavor - report.toPay) + ' a favor' : money(report.toPay - report.balanceFavor) + ' por pagar'}</strong></div>
  `;
  const lines = [];
  report.receivable.forEach((r) => lines.push(`<article class="template-card"><div><strong>${escapeHtml(r.from)} debe pagarle</strong><small>Saldo neto compensado</small></div><b>${money(r.amount)}</b></article>`));
  report.payable.forEach((r) => lines.push(`<article class="template-card"><div><strong>Debe pagar a ${escapeHtml(r.to)}</strong><small>Saldo neto compensado</small></div><b>${money(r.amount)}</b></article>`));
  report.paidBills.forEach((b) => lines.push(`<article class="template-card"><div><strong>Pagó: ${escapeHtml(b.title)}</strong><small>${escapeHtml(b.category_name || '')} · ${escapeHtml(b.bill_date || '')}</small></div><b>${money(b.total_amount)}</b></article>`));
  document.querySelector('#personReportDetails').innerHTML = lines.join('') || '<div class="empty-state">Este usuario no tiene movimientos pendientes.</div>';
  document.querySelector('#personReportDialog').showModal();
}

function buildPersonReports(debts, bills) {
  const reports = new Map();
  const ensure = (id, name) => {
    if (!id) return null;
    if (!reports.has(id)) reports.set(id, { id, name: name || 'Usuario', balanceFavor: 0, toPay: 0, receivable: [], payable: [], paidBills: [] });
    return reports.get(id);
  };
  netDebtRows(debts).forEach((d) => {
    const debtor = ensure(d.debtor_id, d.debtor_name);
    const receiver = ensure(d.receiver_id, d.receiver_name);
    debtor.toPay += d.amount;
    receiver.balanceFavor += d.amount;
    debtor.payable.push({ to: receiver.name, amount: d.amount });
    receiver.receivable.push({ from: debtor.name, amount: d.amount });
  });
  (bills || []).forEach((b) => {
    const paidBy = b.paid_by_user_id || b.created_by;
    const user = (window.__proUsers || []).find((u) => u.id === paidBy);
    const report = ensure(paidBy, user?.name || user?.email || 'Pagador');
    if (report) report.paidBills.push(b);
  });
  return reports;
}

function netDebtRows(debts) {
  const names = new Map();
  const pairs = new Map();
  (debts || []).forEach((d) => {
    const debtorId = d.debtor_id || d.id;
    const receiverId = d.receiver_id || d.owes_to?.id;
    const amountValue = Number(d.pending || 0);
    if (!debtorId || !receiverId || debtorId === receiverId || amountValue <= 0) return;
    names.set(debtorId, d.debtor_name || d.name || d.debtor_email || d.email || 'Usuario');
    names.set(receiverId, d.receiver_name || d.owes_to?.name || d.receiver_email || d.owes_to?.email || 'Usuario');
    const key = [debtorId, receiverId].sort().join('::');
    const row = pairs.get(key) || { a: debtorId, b: receiverId, amountAB: 0, amountBA: 0 };
    if (debtorId === row.a) row.amountAB += amountValue; else row.amountBA += amountValue;
    pairs.set(key, row);
  });
  return [...pairs.values()].map((r) => {
    const net = r.amountAB - r.amountBA;
    if (net > 0) return { debtor_id: r.a, debtor_name: names.get(r.a), receiver_id: r.b, receiver_name: names.get(r.b), amount: net };
    if (net < 0) return { debtor_id: r.b, debtor_name: names.get(r.b), receiver_id: r.a, receiver_name: names.get(r.a), amount: Math.abs(net) };
    return null;
  }).filter(Boolean).sort((a, b) => b.amount - a.amount);
}

function useTemplate(id) {
  const tpl = (window.__proTemplates || []).find((t) => t.id === id);
  if (!tpl) return;
  document.querySelector('[data-view="movements"]')?.click();
  document.querySelector('#expenseTitle').value = tpl.title;
  document.querySelector('#expenseCategory').value = tpl.category_id;
  document.querySelector('#expenseAmount').value = tpl.default_amount || '';
  document.querySelector('#expenseMonth').value = addMonths(new Date(), Number(tpl.service_month_offset || 0)).toISOString().slice(0, 7);
  document.querySelector('#expenseTitle')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showAppToast('Plantilla aplicada.');
}

function handleInput(event) {
  if (event.target?.id === 'expenseAmount' || event.target?.id === 'expenseDate') checkDuplicateWarning();
  if (event.target?.matches('[data-payment-bill]')) autoFillPaymentAllocation(event.target);
}

function autoFillPaymentAllocation(checkbox) {
  const input = document.querySelector(`[data-payment-amount="${CSS.escape(checkbox.value)}"]`);
  const bill = (window.__proBills || []).find((b) => b.id === checkbox.value);
  if (checkbox.checked && input && !input.value) input.value = bill?.total_amount || '';
}

async function checkDuplicateWarning() {
  const amountValue = amount('#expenseAmount');
  const date = val('#expenseDate');
  if (!amountValue || !date) return;
  const data = await api(`/duplicates/check?amount=${amountValue}&date=${encodeURIComponent(date)}`).catch(() => ({ duplicates: [] }));
  let box = document.querySelector('#duplicateWarningBox');
  if (!box) { document.querySelector('#expenseEntryForm')?.insertAdjacentHTML('beforeend', '<div id="duplicateWarningBox" class="duplicate-warning"></div>'); box = document.querySelector('#duplicateWarningBox'); }
  box.innerHTML = data.duplicates?.length ? `⚠️ Posible duplicado: ya existe ${escapeHtml(data.duplicates[0].title)} por ${money(data.duplicates[0].total_amount)}.` : '';
}

async function api(path, options = {}) { const headers = new Headers(options.headers || {}); headers.set('content-type', 'application/json'); headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_PRO)); const res = await fetch(API_PRO + path, { ...options, headers }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.message || data.error || 'Error API'); return data; }
function injectStyles(){ if(document.querySelector('#proToolsStyles')) return; const style=document.createElement('style'); style.id='proToolsStyles'; style.textContent=`.pro-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.template-list{display:grid;gap:10px;margin-top:12px}.template-card{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--line);border-radius:18px;background:rgba(148,163,184,.08);padding:12px}.template-card small{display:block;color:var(--muted);margin-top:4px}.duplicate-warning{color:#fbbf24;font-weight:900;padding:10px 12px;border:1px solid rgba(251,191,36,.35);border-radius:16px;background:rgba(251,191,36,.08)}.allocation-list{display:grid;gap:10px}.allocation-row{display:grid;grid-template-columns:auto 1fr 140px;gap:10px;align-items:center;border:1px solid var(--line);border-radius:18px;background:rgba(148,163,184,.08);padding:12px}.allocation-row small{display:block;color:var(--muted);margin-top:4px}.allocation-row input[data-payment-amount]{width:100%;border-radius:14px;border:1px solid var(--line);background:rgba(15,23,42,.4);color:var(--text);padding:10px}.compact-upload{padding:14px}.bar{height:8px;border-radius:999px;background:rgba(148,163,184,.18);overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#a78bfa)}.report-dialog{width:min(840px,calc(100vw - 20px));border:1px solid var(--line);border-radius:28px;background:var(--panel-strong);color:var(--text);box-shadow:var(--shadow);padding:0}.report-dialog::backdrop{background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}.report-card{position:relative;display:grid;gap:14px;padding:24px}.person-report-card{border-color:rgba(56,189,248,.22)}@media(max-width:760px){.pro-grid,.template-card,.allocation-row{display:grid;grid-template-columns:1fr}.allocation-row input[type=checkbox]{justify-self:start}}@media print{.sidebar,.topbar,.hero-actions,button,#expenseEntryPanel,#receiptReviewPanel,#templatesPanel,#operationsPanel,#paymentPanel,.danger-zone{display:none!important}.content{padding:0!important}.panel{break-inside:avoid;box-shadow:none!important}}`; document.head.appendChild(style); }
function val(s){return document.querySelector(s)?.value || '';} function amount(s){return Number(String(val(s)).replace(/[^0-9]/g,''));}
function addMonths(date, n){ const d=new Date(date); d.setMonth(d.getMonth()+n); return d; }
function monthLabel(offset){ return Number(offset) === 1 ? 'mes siguiente' : Number(offset) === -1 ? 'mes anterior' : 'mes actual'; }
function money(value){return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
