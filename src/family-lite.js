import './mobile-fix.js';
import './workspace-organizer.js';
import './receipts-review.js';
import './family-pro.js';
import './debts-ops.js';
import './monthly-report.js';
import './expense-entry.js';
import './pro-tools-ui.js';
import './auto-rules.js';
import './bill-edit-stable.js';

const API_BASE_FAMILY = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const SESSION_TOKEN_KEY_FAMILY = 'cuentas-pwa:session-token';

setTimeout(initFamilyLite, 1200);

function initFamilyLite() {
  const dashboard = document.querySelector('#view-dashboard');
  if (!dashboard || document.querySelector('#familyLite')) return;
  dashboard.insertAdjacentHTML('beforeend', `
    <article class="panel" id="familyLite">
      <div class="panel-header"><div><p class="eyebrow">Datos reales D1</p><h3>Dashboard familiar</h3></div><button class="text-button" id="familyLiteReload" type="button">Actualizar</button></div>
      <div class="summary-grid">
        <div class="summary-card"><span>Total histórico</span><strong id="familyLiteTotal">$0</strong></div>
        <div class="summary-card"><span>Mes actual</span><strong id="familyLiteMonth">$0</strong></div>
        <div class="summary-card wide"><span>Comprobantes pendientes</span><strong id="familyLitePending">0</strong></div>
      </div>
      <div class="movement-list" id="familyLiteRows"></div>
    </article>
  `);
  document.querySelector('#familyLiteReload').addEventListener('click', loadFamilyLite);
  window.addEventListener('family-data-changed', loadFamilyLite);
  loadFamilyLite();
}

async function loadFamilyLite() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY_FAMILY);
  if (!token) return;
  const headers = { authorization: `Bearer ${token}` };
  const [dash, receipts] = await Promise.all([
    fetch(API_BASE_FAMILY + '/dashboard', { headers }).then(r => r.json()),
    fetch(API_BASE_FAMILY + '/receipts', { headers }).then(r => r.json()).catch(() => ({ receipts: [] }))
  ]);
  const monthly = dash.monthly || [];
  const total = monthly.reduce((s, r) => s + Number(r.total || 0), 0);
  const month = Number(monthly[monthly.length - 1]?.total || 0);
  document.querySelector('#familyLiteTotal').textContent = money(total);
  document.querySelector('#familyLiteMonth').textContent = money(month);
  document.querySelector('#familyLitePending').textContent = String((receipts.receipts || []).filter(r => r.status === 'pending_review').length);
  const rows = (dash.by_category || []).map(r => `<article class="movement-card"><div class="movement-main"><div><p class="movement-title">${escapeHtml(r.icon || '')} ${escapeHtml(r.name)}</p><div class="movement-meta"><span>Histórico por categoría</span></div></div><strong>${money(r.total)}</strong></div></article>`).join('');
  document.querySelector('#familyLiteRows').innerHTML = rows || '<div class="empty-state">Aún no hay datos históricos.</div>';
}

function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
