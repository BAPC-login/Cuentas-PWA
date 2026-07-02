setTimeout(initMobileSidebarFix, 300);

function initMobileSidebarFix() {
  injectMobileStyles();
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || document.querySelector('#mobileCloseMenu')) return;

  const closeButton = document.createElement('button');
  closeButton.id = 'mobileCloseMenu';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Cerrar menú');
  closeButton.textContent = '×';
  sidebar.prepend(closeButton);

  closeButton.addEventListener('click', closeSidebar);

  document.addEventListener('click', (event) => {
    if (!document.body.classList.contains('sidebar-open')) return;
    const target = event.target;
    const clickedSidebar = target.closest('.sidebar');
    const clickedMenu = target.closest('#menuButton');
    const clickedNativeSelect = target.closest('select');

    if (!clickedSidebar && !clickedMenu && !clickedNativeSelect) closeSidebar();
    if (target.closest('.nav-tab')) closeSidebar();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });

  let startX = null;
  let startY = null;
  sidebar.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });

  sidebar.addEventListener('touchend', (event) => {
    if (startX === null || startY === null) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.4) closeSidebar();
    startX = null;
    startY = null;
  }, { passive: true });
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
}

function injectMobileStyles() {
  if (document.querySelector('#mobileSidebarFixStyles')) return;
  const style = document.createElement('style');
  style.id = 'mobileSidebarFixStyles';
  style.textContent = `
    #mobileCloseMenu{display:none;position:absolute;top:14px;right:14px;z-index:3;width:42px;height:42px;border-radius:999px;border:1px solid var(--line);background:rgba(15,23,42,.82);color:var(--text);font-size:1.5rem;font-weight:900;line-height:1}
    @media(max-width:1060px){
      body.sidebar-open{overflow:hidden;touch-action:none}
      body.sidebar-open .content{pointer-events:none;user-select:none}
      .sidebar{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;max-height:calc(100dvh - 24px);padding-top:62px!important}
      body.sidebar-open .sidebar{pointer-events:auto;touch-action:pan-y}
      #mobileCloseMenu{display:grid;place-items:center}
    }
    @media(max-width:520px){
      .sidebar{width:min(330px,calc(100vw - 76px))!important;inset:12px auto 12px 12px!important;border-radius:26px!important}
      body.sidebar-open::after{background:rgba(2,6,23,.66)!important;backdrop-filter:blur(6px)!important}
      .brand{padding-right:38px}.brand h1{font-size:1.12rem}.nav-tab{min-height:56px;font-size:1rem}.sidebar-card{margin-top:32px!important}
    }
  `;
  document.head.appendChild(style);
}
