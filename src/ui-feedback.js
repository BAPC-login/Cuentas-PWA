export function showAppToast(message, type = 'ok') {
  let toast = document.querySelector('#appFeedbackToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appFeedbackToast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    const style = document.createElement('style');
    style.id = 'appFeedbackToastStyles';
    style.textContent = `#appFeedbackToast{position:fixed;left:50%;bottom:24px;z-index:9999;transform:translate(-50%,16px);opacity:0;pointer-events:none;padding:12px 16px;border-radius:999px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.92);color:#f8fafc;box-shadow:0 18px 60px rgba(2,6,23,.35);font-weight:900;transition:.22s ease;max-width:min(92vw,520px);text-align:center}#appFeedbackToast.show{opacity:1;transform:translate(-50%,0)}#appFeedbackToast.error{background:rgba(127,29,29,.96);border-color:rgba(248,113,113,.4)}#appFeedbackToast.ok{background:rgba(15,23,42,.94)}`;
    document.head.appendChild(style);
  }
  toast.textContent = message;
  toast.className = type;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(showAppToast.timer);
  showAppToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

export function resetForm(form) {
  if (!form) return;
  form.reset();
  form.querySelectorAll('input[type="date"]').forEach((input) => { if (!input.value) input.value = new Date().toISOString().slice(0, 10); });
  form.querySelectorAll('input[type="month"]').forEach((input) => { if (!input.value) input.value = new Date().toISOString().slice(0, 7); });
}
