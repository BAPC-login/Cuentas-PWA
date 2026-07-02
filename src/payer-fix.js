const API = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const TOKEN = 'cuentas-pwa:session-token';

setTimeout(init, 2200);
window.addEventListener('family-data-changed', () => setTimeout(init, 500));

async function init() {
  const token = localStorage.getItem(TOKEN);
  const select = document.querySelector('#expensePaidBy');
  if (!token || !select) return;
  try {
    const me = await get('/me');
    if (String(me.user?.role || '').toLowerCase() !== 'owner') {
      select.disabled = true;
      if (me.user?.id) select.innerHTML = `<option value="${safe(me.user.id)}">${safe(me.user.name || me.user.email)}</option>`;
      return;
    }
    const data = await get('/owner/users').catch(() => get('/users'));
    const users = (data.users || []).filter((u) => u.status !== 'revoked');
    select.innerHTML = users.map((u) => `<option value="${safe(u.id)}">${safe(u.name || u.email)}${u.role === 'owner' ? ' · owner' : ''}</option>`).join('');
    select.disabled = false;
    select.style.pointerEvents = 'auto';
    select.style.opacity = '1';
  } catch (e) {
    console.warn('payer fix', e);
  }
}

async function get(path) {
  const response = await fetch(API + path, { headers: { authorization: 'Bearer ' + localStorage.getItem(TOKEN) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'api error');
  return data;
}

function safe(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
