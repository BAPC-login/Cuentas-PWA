const API_URL = 'https://cuentas-pwa-api.botreservasmultilocal.workers.dev';
const SESSION_KEY = 'cuentas-pwa:session-token';
let firstLoginEmail = '';
let firstLoginCode = '';

(function bootProfileModal() {
  addStyles();
  addModal();
  const timer = setInterval(() => {
    const emailForm = document.querySelector('#emailLoginForm');
    const codeForm = document.querySelector('#codeLoginForm');
    if (!emailForm || !codeForm) return;
    clearInterval(timer);
    patchLogin(emailForm, codeForm);
  }, 120);
  setTimeout(() => clearInterval(timer), 10000);
})();

function addStyles() {
  if (document.querySelector('#profileModalCss')) return;
  const style = document.createElement('style');
  style.id = 'profileModalCss';
  style.textContent = `
    .initial-profile-modal{position:fixed;inset:0;z-index:500;display:none;place-items:center;padding:18px;background:rgba(2,6,23,.78);backdrop-filter:blur(18px)}
    .initial-profile-modal.active{display:grid}
    .initial-profile-card{width:min(520px,100%);padding:28px;border:1px solid var(--line);border-radius:var(--radius-xl);background:var(--panel-strong);box-shadow:var(--shadow)}
    .initial-profile-card .brand{margin-bottom:18px}
    .initial-profile-card .error{display:none;margin-top:12px;padding:12px 14px;border-radius:16px;background:rgba(248,113,113,.16);border:1px solid rgba(248,113,113,.28)}
    .initial-profile-card .error.active{display:block}
    .login-name-field-hidden{display:none!important}
  `;
  document.head.appendChild(style);
}

function addModal() {
  if (document.querySelector('#initialProfileModal')) return;
  const modal = document.createElement('section');
  modal.id = 'initialProfileModal';
  modal.className = 'initial-profile-modal';
  modal.innerHTML = `<div class="initial-profile-card"><div class="brand"><div class="brand-mark">👤</div><div><p class="eyebrow">Primer ingreso</p><h1>Completa tu nombre</h1></div></div><p class="muted">Este nombre se pedirá solo una vez y se usará para mostrar tus cuentas.</p><form id="initialProfileForm" class="form-stack"><label class="field"><span>Nombre visible</span><input id="initialProfileName" autocomplete="name" placeholder="Ej: Iriannys" required maxlength="60"></label><button class="primary-button full" type="submit">Guardar y entrar</button></form><div class="error" id="initialProfileError"></div></div>`;
  document.body.appendChild(modal);
  document.querySelector('#initialProfileForm').addEventListener('submit', finishFirstLogin);
}

function patchLogin(emailForm, codeForm) {
  const profileInput = document.querySelector('#profileNameInput');
  const profileField = profileInput && profileInput.closest('.field');
  if (profileField) profileField.classList.add('login-name-field-hidden');

  emailForm.addEventListener('submit', () => {
    firstLoginEmail = (document.querySelector('#loginEmailInput')?.value || '').trim().toLowerCase();
  }, true);

  codeForm.addEventListener('submit', async (event) => {
    const email = (document.querySelector('#loginEmailInput')?.value || firstLoginEmail).trim().toLowerCase();
    const code = (document.querySelector('#loginCodeInput')?.value || '').trim();
    if (!email || !code) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    firstLoginEmail = email;
    firstLoginCode = code;
    setLoginNote('Validando código...');
    try {
      const data = await verify(email, code, '');
      enter(data);
    } catch (error) {
      if (error.status === 409 || error.key === 'profile_required') {
        setLoginNote('Código correcto. Completa tu nombre para activar el usuario.');
        document.querySelector('#initialProfileModal').classList.add('active');
        setTimeout(() => document.querySelector('#initialProfileName').focus(), 80);
        return;
      }
      setLoginNote(error.message || 'No se pudo entrar.');
    }
  }, true);
}

async function finishFirstLogin(event) {
  event.preventDefault();
  const name = document.querySelector('#initialProfileName').value.trim();
  if (name.length < 2) return showModalError('Ingresa un nombre válido.');
  try {
    const data = await verify(firstLoginEmail, firstLoginCode, name);
    enter(data);
  } catch (error) {
    showModalError(error.message || 'No se pudo guardar el nombre.');
  }
}

async function verify(email, code, name) {
  const response = await fetch(API_URL + '/auth/verify-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code, name }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Error de acceso');
    error.status = response.status;
    error.key = data.error;
    throw error;
  }
  return data;
}

function enter(data) {
  if (!data?.session?.token) throw new Error('No llegó sesión.');
  localStorage.setItem(SESSION_KEY, data.session.token);
  document.querySelector('#initialProfileModal')?.classList.remove('active');
  location.reload();
}

function setLoginNote(message) {
  const note = document.querySelector('#authNote');
  if (note) note.textContent = message;
}

function showModalError(message) {
  const box = document.querySelector('#initialProfileError');
  box.textContent = message;
  box.classList.add('active');
}
