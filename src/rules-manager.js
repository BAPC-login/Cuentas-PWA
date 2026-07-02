const RULE_KEY = 'cuentas-pwa:auto-rules';
const DEFAULT_RULES = [
  { terms: ['mercado libre', 'mercadolibre', 'ml'], categories: ['hogar', 'otros', 'mantención', 'mantencion', 'reparación', 'reparacion'] },
  { terms: ['cge', 'enel', 'luz'], categories: ['luz', 'servicios', 'casa'] },
  { terms: ['essbio', 'agua'], categories: ['agua', 'servicios', 'casa'] },
  { terms: ['lipigas', 'gasco', 'abastible', 'gas'], categories: ['gas', 'servicios', 'casa'] },
  { terms: ['jumbo', 'lider', 'líder', 'unimarc', 'santa isabel', 'tottus', 'supermercado'], categories: ['alimentación', 'alimentacion', 'supermercado', 'mercadería', 'mercaderia'] },
  { terms: ['wom', 'entel', 'movistar', 'claro', 'internet', 'fibra'], categories: ['internet', 'teléfono', 'telefono', 'servicios'] },
  { terms: ['lavadora', 'técnico', 'tecnico', 'repuesto', 'diagnóstico', 'diagnostico'], categories: ['mantención', 'mantencion', 'reparación', 'reparacion', 'hogar'] },
];

setTimeout(initRulesManager, 2400);
window.addEventListener('family-data-changed', () => setTimeout(initRulesManager, 400));

function initRulesManager() {
  injectStyles();
  injectPanel();
  renderRules();
}

function injectPanel() {
  const target = document.querySelector('#workspace-settings') || document.querySelector('#view-settings') || document.querySelector('#view-people');
  if (!target || document.querySelector('#rulesManagerPanel')) return;
  target.insertAdjacentHTML('beforeend', `
    <article class="panel" id="rulesManagerPanel">
      <div class="panel-header"><div><p class="eyebrow">Automatización</p><h3>Reglas por comercio/categoría</h3></div><button class="text-button" id="resetRulesButton" type="button">Restaurar base</button></div>
      <p class="muted small">Define palabras que al aparecer en el título del gasto seleccionan una categoría sugerida.</p>
      <form id="ruleForm" class="form-stack">
        <div class="form-row"><label class="field"><span>Si título contiene</span><input id="ruleTerms" placeholder="mercado libre, ml, compra online"></label><label class="field"><span>Preferir categoría</span><input id="ruleCategories" placeholder="hogar, reparación, otros"></label></div>
        <button class="secondary-button" type="submit">Agregar regla</button>
      </form>
      <div id="rulesList" class="rules-list"></div>
    </article>
  `);
  document.querySelector('#ruleForm').addEventListener('submit', saveRule);
  document.querySelector('#resetRulesButton').addEventListener('click', () => { localStorage.removeItem(RULE_KEY); renderRules(); window.dispatchEvent(new Event('family-rules-changed')); });
  document.querySelector('#rulesList').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-delete-rule]');
    if (!btn) return;
    const rules = getRules();
    rules.splice(Number(btn.dataset.deleteRule), 1);
    setRules(rules);
  });
}

function saveRule(event) {
  event.preventDefault();
  const terms = csv(document.querySelector('#ruleTerms').value);
  const categories = csv(document.querySelector('#ruleCategories').value);
  if (!terms.length || !categories.length) return alert('Completa palabras y categorías.');
  const rules = getRules();
  rules.unshift({ terms, categories });
  document.querySelector('#ruleForm').reset();
  setRules(rules);
}

function renderRules() {
  const box = document.querySelector('#rulesList');
  if (!box) return;
  const rules = getRules();
  box.innerHTML = rules.length ? rules.map((r, i) => `<article class="rule-card"><div><strong>${escapeHtml((r.terms || []).join(', '))}</strong><small>→ ${escapeHtml((r.categories || []).join(', '))}</small></div><button class="tiny-button danger-mini" data-delete-rule="${i}" type="button">Eliminar</button></article>`).join('') : '<div class="empty-state">Sin reglas personalizadas.</div>';
}

function getRules() {
  try { const saved = JSON.parse(localStorage.getItem(RULE_KEY) || '[]'); return saved.length ? saved : DEFAULT_RULES.slice(); } catch { return DEFAULT_RULES.slice(); }
}
function setRules(rules) { localStorage.setItem(RULE_KEY, JSON.stringify(rules)); renderRules(); window.dispatchEvent(new Event('family-rules-changed')); }
function csv(value) { return String(value || '').split(',').map((x) => x.trim()).filter(Boolean); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
function injectStyles() { if (document.querySelector('#rulesManagerStyles')) return; const style = document.createElement('style'); style.id = 'rulesManagerStyles'; style.textContent = `.rules-list{display:grid;gap:10px;margin-top:14px}.rule-card{display:flex;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:18px;background:rgba(148,163,184,.08);padding:12px}.rule-card small{display:block;color:var(--muted);margin-top:4px}@media(max-width:760px){.rule-card{display:grid}}`; document.head.appendChild(style); }
