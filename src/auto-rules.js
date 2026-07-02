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
const API_FIX = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN_FIX = 'cuentas-pwa:session-token';

setTimeout(initAutoRules, 2300);
setTimeout(fixPayerSelect, 2600);
window.addEventListener('family-data-changed', () => { setTimeout(initAutoRules, 300); setTimeout(fixPayerSelect, 500); });
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
    style.textContent = '.auto-rule-hint{display:block;margin-top:6px;color:var(--muted);font-weight:800}.auto-rule-hint.active{color:#38bdf8}.payer-fix-hint{display:block;margin-top:6px;color:var(--muted);font-weight:800}';
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

async function fixPayerSelect() {
  const token = localStorage.getItem(TOKEN_FIX);
  const select = document.querySelector('#expensePaidBy');
  if (!token || !select) return;
  try {
    const me = await fetchJson('/me');
    const owner = String(me.user?.role || '').toLowerCase() === 'owner';
    if (!owner) {
      select.innerHTML = `<option value="${html(me.user.id)}">${html(me.user.name || me.user.email)}</option>`;
      select.disabled = true;
      addPayerHint('Este gasto quedará registrado como pagado por ti.');
      return;
    }
    const data = await fetchJson('/owner/users').catch(() => fetchJson('/users'));
    const users = (data.users || []).filter((u) => u.status !== 'revoked');
    select.innerHTML = users.map((u) => `<option value="${html(u.id)}">${html(u.name || u.email)}${u.role === 'owner' ? ' · owner' : ''}</option>`).join('');
    select.disabled = false;
    select.style.pointerEvents = 'auto';
    select.style.opacity = '1';
    addPayerHint('Como owner puedes escoger quién pagó.');
  } catch (error) {
    console.warn('payer select fix', error);
  }
}

function addPayerHint(text) {
  const select = document.querySelector('#expensePaidBy');
  if (!select) return;
  let hint = document.querySelector('#payerFixHint');
  if (!hint) {
    select.closest('.field')?.insertAdjacentHTML('beforeend', '<small id="payerFixHint" class="payer-fix-hint"></small>');
    hint = document.querySelector('#payerFixHint');
  }
  if (hint) hint.textContent = text;
}

async function fetchJson(path) {
  const response = await fetch(API_FIX + path, { headers: { authorization: 'Bearer ' + localStorage.getItem(TOKEN_FIX) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'api error');
  return data;
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function html(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
