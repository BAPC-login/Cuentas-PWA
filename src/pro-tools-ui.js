import { showAppToast, resetForm } from './ui-feedback.js';

const API_PRO = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_PRO = 'cuentas-pwa:session-token';

setTimeout(initProToolsUi, 2100);
window.addEventListener('family-data-changed', () => refreshProTools());

function initProToolsUi() {
  injectStyles();
  injectTemplatesPanel();
  injectHistoryAndClosePanel();
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  refreshProTools();
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
      <div class="panel-header"><div><p class="eyebrow">Gestión profesional</p><h3>Historial, cierre y PDF</h3></div><button class="text-button" data-action="print-report" type="button">Exportar PDF</button></div>
      <div class="pro-grid">
        <section><h4>Historial por persona</h4><div id="personHistoryList" class="template-list"></div></section>
        <section><h4>Cierre mensual</h4><div class="form-row"><label class="field"><span>Mes a cerrar</span><input id="closeMonthInput" type="month"></label><button class="secondary-button" data-action="close-month" type="button">Cerrar mes</button></div><div id="monthClosureList" class="template-list"></div></section>
      </div>
    </article>
  `);
  document.querySelector('#closeMonthInput').value = new Date().toISOString().slice(0, 7);
}

async function refreshProTools() {
  const token = localStorage.getItem(TOKEN_PRO);
  if (!token) return;
  try {
    const [cats, templates, debts, closures, bills] = await Promise.all([
      api('/categories'), api('/templates'), api('/debts'), api('/month-closures'), api('/bills')
    ]);
    window.__proCats = cats.categories || [];
    window.__proTemplates = templates.templates || [];
    renderTemplateControls(cats.categories || []);
    renderTemplates(templates.templates || []);
    renderPersonHistory(debts.debts || [], bills.bills || []);
    renderClosures(closures.closures || []);
  } catch (error) {
    console.warn('pro tools', error);
  }
}

function renderTemplateControls(cats) {
  const select = document.querySelector('#tplCategory');
  if (select) select.innerHTML = cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
}

function renderTemplates(templates) {
  const list = document.querySelector('#templateList');
  if (!list) return;
  list.innerHTML = templates.length ? templates.map((t) => `<article class="template-card"><div><strong>${escapeHtml(t.category_icon || '')} ${escapeHtml(t.title)}</strong><small>${escapeHtml(t.category_name || '')} · ${t.default_amount ? money(t.default_amount) : 'Sin monto'} · ${monthLabel(t.service_month_offset)}</small></div><div><button class="tiny-button" data-action="use-template" data-id="${escapeHtml(t.id)}" type="button">Usar</button><button class="tiny-button danger-mini" data-action="delete-template" data-id="${escapeHtml(t.id)}" type="button">Eliminar</button></div></article>`).join('') : '<div class="empty-state">Crea plantillas para arriendo, internet, suscripciones, etc.</div>';
}

function renderPersonHistory(debts, bills) {
  const list = document.querySelector('#personHistoryList');
  if (!list) return;
  const map = new Map();
  debts.forEach((d) => {
    const name = d.debtor_name || d.debtor_email;
    const row = map.get(name) || { name, pending: 0, assigned: 0, paid: 0 };
    row.pending += Number(d.pending || 0);
    row.assigned += Number(d.total_assigned || 0);
    row.paid += Number(d.total_paid || 0);
    map.set(name, row);
  });
  bills.forEach((b) => {
    const key = b.paid_by_user_id || b.created_by || 'Pagador';
    const row = map.get(key) || { name: 'Pagó / creó gastos', pending: 0, assigned: 0, paid: 0 };
    row.paid += Number(b.total_amount || 0);
    map.set(key, row);
  });
  const rows = [...map.values()];
  list.innerHTML = rows.length ? rows.map((r) => `<article class="template-card"><div><strong>${escapeHtml(r.name)}</strong><small>Asignado ${money(r.assigned)} · Pagado ${money(r.paid)}</small></div><b>${money(r.pending)} pendiente</b></article>`).join('') : '<div class="empty-state">Sin historial por persona todavía.</div>';
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

async function handleClick(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'use-template') useTemplate(btn.dataset.id);
  if (btn.dataset.action === 'delete-template') { await api(`/templates/${btn.dataset.id}`, { method: 'DELETE' }); showAppToast('Plantilla eliminada.'); refreshProTools(); }
  if (btn.dataset.action === 'close-month') { await api('/month-closures', { method: 'POST', body: JSON.stringify({ month: val('#closeMonthInput') }) }); showAppToast('Mes cerrado.'); refreshProTools(); }
  if (btn.dataset.action === 'open-month') { await api(`/month-closures/${btn.dataset.month}`, { method: 'DELETE' }); showAppToast('Mes reabierto.'); refreshProTools(); }
  if (btn.dataset.action === 'print-report') window.print();
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
function injectStyles(){ if(document.querySelector('#proToolsStyles')) return; const style=document.createElement('style'); style.id='proToolsStyles'; style.textContent=`.pro-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.template-list{display:grid;gap:10px;margin-top:12px}.template-card{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--line);border-radius:18px;background:rgba(148,163,184,.08);padding:12px}.template-card small{display:block;color:var(--muted);margin-top:4px}.duplicate-warning{color:#fbbf24;font-weight:900;padding:10px 12px;border:1px solid rgba(251,191,36,.35);border-radius:16px;background:rgba(251,191,36,.08)}@media(max-width:760px){.pro-grid,.template-card{display:grid}}@media print{.sidebar,.topbar,.hero-actions,button,#expenseEntryPanel,#receiptReviewPanel,#templatesPanel,#operationsPanel,.danger-zone{display:none!important}.content{padding:0!important}.panel{break-inside:avoid;box-shadow:none!important}}`; document.head.appendChild(style); }
function val(s){return document.querySelector(s)?.value || '';} function amount(s){return Number(String(val(s)).replace(/[^0-9]/g,''));}
function addMonths(date, n){ const d=new Date(date); d.setMonth(d.getMonth()+n); return d; }
function monthLabel(offset){ return Number(offset) === 1 ? 'mes siguiente' : Number(offset) === -1 ? 'mes anterior' : 'mes actual'; }
function money(value){return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
