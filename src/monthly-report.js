const API_MONTHLY = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_MONTHLY = 'cuentas-pwa:session-token';

setTimeout(initMonthlyReport, 1900);

function initMonthlyReport() {
  injectStyles();
  polishLogin();
  injectReportPanel();
  document.querySelector('#monthlyReportRefresh')?.addEventListener('click', loadMonthlyReport);
  loadMonthlyReport();
}

function polishLogin() {
  const nameField = document.querySelector('#profileNameInput')?.closest('.field');
  if (nameField) nameField.style.display = 'none';
  const title = document.querySelector('.auth-brand h1');
  if (title) title.textContent = 'Acceso seguro';
  const note = document.querySelector('#authEmailStep .muted');
  if (note) note.textContent = 'Ingresa tu correo autorizado. Mantendremos la sesión abierta en este dispositivo hasta que hagas logout o el owner la revoque.';
  const codeHelp = document.querySelector('#codeHelpText');
  if (codeHelp) codeHelp.textContent = 'Revisa tu correo e ingresa el código de 6 dígitos.';
}

function injectReportPanel() {
  const dashboard = document.querySelector('#view-dashboard');
  if (!dashboard || document.querySelector('#monthlyReportPanel')) return;
  dashboard.insertAdjacentHTML('beforeend', `
    <article class="panel" id="monthlyReportPanel">
      <div class="panel-header"><div><p class="eyebrow">Cierre mensual</p><h3>Informe del mes</h3></div><button class="text-button" id="monthlyReportRefresh" type="button">Actualizar</button></div>
      <div class="report-grid" id="monthlyReportGrid"><div class="empty-state">Cargando informe...</div></div>
    </article>
  `);
}

async function loadMonthlyReport() {
  const token = localStorage.getItem(TOKEN_MONTHLY);
  const grid = document.querySelector('#monthlyReportGrid');
  if (!token || !grid) return;
  try {
    const [dash, debts, receipts] = await Promise.all([api('/dashboard'), api('/debts'), api('/receipts')]);
    const month = (dash.monthly || []).at(-1)?.month || new Date().toISOString().slice(0, 7);
    const monthTotal = Number((dash.monthly || []).find((m) => m.month === month)?.total || 0);
    const pending = (debts.debts || []).reduce((s, d) => s + Number(d.pending || 0), 0);
    const pendingReceipts = (receipts.receipts || []).filter((r) => r.status === 'pending_review').length;
    const duplicates = findDuplicates(receipts.receipts || []).length;
    const topCategory = (dash.by_category || [])[0];
    grid.innerHTML = `
      <div class="report-card"><span>Mes</span><strong>${escapeHtml(month)}</strong></div>
      <div class="report-card"><span>Gasto del mes</span><strong>${money(monthTotal)}</strong></div>
      <div class="report-card"><span>Deuda pendiente</span><strong>${money(pending)}</strong></div>
      <div class="report-card"><span>Comprobantes por revisar</span><strong>${pendingReceipts}</strong></div>
      <div class="report-card"><span>Duplicados posibles</span><strong>${duplicates}</strong></div>
      <div class="report-card wide"><span>Categoría fuerte</span><strong>${topCategory ? `${escapeHtml(topCategory.icon || '')} ${escapeHtml(topCategory.name)} · ${money(topCategory.total)}` : 'Sin datos'}</strong></div>
      <div class="report-note">Al cierre de mes se revisa: gastos por usuario, pagos faltantes, categorías, operaciones especiales y duplicados probables antes de cerrar.</div>
    `;
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">No se pudo cargar el informe: ${escapeHtml(error.message)}</div>`;
  }
}

function findDuplicates(receipts) {
  const map = new Map();
  for (const r of receipts) {
    const key = `${r.detected_amount || 0}|${String(r.detected_date || '').slice(0,10)}|${String(r.detected_sender || r.source || '').toLowerCase()}`;
    if (!Number(r.detected_amount || 0)) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()].filter((count) => count > 1);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  headers.set('authorization', 'Bearer ' + localStorage.getItem(TOKEN_MONTHLY));
  const res = await fetch(API_MONTHLY + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Error API');
  return data;
}

function injectStyles() {
  if (document.querySelector('#monthlyReportStyles')) return;
  const style = document.createElement('style');
  style.id = 'monthlyReportStyles';
  style.textContent = `.report-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.report-card{border:1px solid var(--line);border-radius:20px;background:rgba(148,163,184,.08);padding:14px}.report-card span{display:block;color:var(--muted);font-weight:800;margin-bottom:6px}.report-card strong{font-size:1.3rem}.report-card.wide{grid-column:span 3}.report-note{grid-column:span 3;color:var(--muted);border:1px dashed var(--line);border-radius:18px;padding:14px}.auth-card h1{letter-spacing:-.04em}.auth-note{font-weight:700}@media(max-width:760px){.report-grid{grid-template-columns:1fr}.report-card.wide,.report-note{grid-column:auto}}`;
  document.head.appendChild(style);
}

function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
