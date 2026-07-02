const DEFAULT_RULES = [
  { terms: ['mercado libre', 'mercadolibre', 'ml'], categories: ['hogar', 'otros', 'mantención', 'mantencion', 'reparación', 'reparacion'] },
  { terms: ['cge', 'enel', 'luz'], categories: ['luz', 'servicios', 'casa'] },
  { terms: ['essbio', 'agua'], categories: ['agua', 'servicios', 'casa'] },
  { terms: ['lipigas', 'gasco', 'abastible', 'gas'], categories: ['gas', 'servicios', 'casa'] },
  { terms: ['jumbo', 'lider', 'líder', 'unimarc', 'santa isabel', 'tottus', 'supermercado'], categories: ['alimentación', 'alimentacion', 'supermercado', 'mercadería', 'mercaderia'] },
  { terms: ['wom', 'entel', 'movistar', 'claro', 'internet', 'fibra'], categories: ['internet', 'teléfono', 'telefono', 'servicios'] },
  { terms: ['lavadora', 'técnico', 'tecnico', 'repuesto', 'diagnóstico', 'diagnostico'], categories: ['mantención', 'mantencion', 'reparación', 'reparacion', 'hogar'] },
];
const RULE_KEY = 'cuentas-pwa:auto-rules';

setTimeout(initAutoRules, 2300);
window.addEventListener('family-data-changed', () => setTimeout(initAutoRules, 300));
window.addEventListener('family-rules-changed', () => setTimeout(initAutoRules, 150));

function getRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(RULE_KEY) || '[]');
    return saved.length ? saved : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

function initAutoRules() {
  injectRuleHint();
  const title = document.querySelector('#expenseTitle');
  if (!title || title.dataset.autoRulesReady) return;
  title.dataset.autoRulesReady = '1';
  title.addEventListener('input', () => applyCategoryRule(title.value));
  title.addEventListener('blur', () => applyCategoryRule(title.value));
}

function injectRuleHint() {
  if (document.querySelector('#autoRuleHint')) return;
  const category = document.querySelector('#expenseCategory');
  category?.closest('.field')?.insertAdjacentHTML('beforeend', '<small id="autoRuleHint" class="auto-rule-hint"></small>');
  if (!document.querySelector('#autoRuleStyles')) {
    const style = document.createElement('style');
    style.id = 'autoRuleStyles';
    style.textContent = '.auto-rule-hint{display:block;margin-top:6px;color:var(--muted);font-weight:800}.auto-rule-hint.active{color:#38bdf8}';
    document.head.appendChild(style);
  }
}

function applyCategoryRule(rawTitle) {
  const title = normalize(rawTitle);
  const select = document.querySelector('#expenseCategory');
  const hint = document.querySelector('#autoRuleHint');
  if (!title || !select) return;
  const rule = getRules().find((r) => (r.terms || []).some((term) => title.includes(normalize(term))));
  if (!rule) {
    if (hint) { hint.textContent = ''; hint.classList.remove('active'); }
    return;
  }
  const options = [...select.options];
  const found = options.find((option) => (rule.categories || []).some((cat) => normalize(option.textContent).includes(normalize(cat))));
  if (found) {
    select.value = found.value;
    if (hint) { hint.textContent = `Regla aplicada: ${found.textContent.trim()}`; hint.classList.add('active'); }
  } else if (hint) {
    hint.textContent = 'Regla detectada, pero falta crear la categoría recomendada.';
    hint.classList.add('active');
  }
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
