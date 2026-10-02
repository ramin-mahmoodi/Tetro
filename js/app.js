/* ==========================================================================
   TETRO APPLICATION ENTRY POINT
   Initializes subsystems, PWA registration, install prompt & interactions
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Theme Engine
  window.themeEngine.init();

  // 2. Initialize Data Engine
  window.dataAdapter.init();

  // 3. Initialize Chart Engine
  window.chartEngine.init();

  // 4. Initialize UI Renderer
  window.uiRenderer.init();

  // 5. Setup Mobile Bottom Nav Interaction
  setupMobileNav();

  // 6. Setup Keyboard Shortcuts
  setupKeyboardShortcuts();

  // 7. Register PWA Service Worker
  registerPWA();
});

// Mobile Bottom Nav Smooth Scrolling & Action Handling
function setupMobileNav() {
  const navItems = document.querySelectorAll('.mobile-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const target = item.dataset.target;
      if (target === 'themes') {
        const modal = document.getElementById('theme-modal');
        if (modal) modal.classList.add('open');
      } else if (target === 'chart') {
        const chartEl = document.getElementById('chart-section');
        if (chartEl) chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (target === 'exchanges') {
        const exEl = document.getElementById('exchanges-section');
        if (exEl) exEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (target === 'home') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// Power User Shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore when typing inside inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key === 't' || e.key === 'T') {
      const modal = document.getElementById('theme-modal');
      if (modal) modal.classList.toggle('open');
    } else if (e.key === 'Escape') {
      const modal = document.getElementById('theme-modal');
      if (modal) modal.classList.remove('open');
    } else if (e.key === '1') {
      window.themeEngine.applyMode(1);
    } else if (e.key === '2') {
      window.themeEngine.applyMode(2);
    } else if (e.key === '3') {
      window.themeEngine.applyMode(3);
    }
  });
}

// PWA Service Worker & Install Prompt
let deferredPrompt = null;
function registerPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Tetro Service Worker registered:', reg.scope))
        .catch(err => console.warn('Service Worker registration failed:', err));
    });
  }

  // Handle PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const installBtns = document.querySelectorAll('.pwa-install-btn');
    installBtns.forEach(btn => {
      btn.style.display = 'inline-flex';
      btn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          console.log('User installed Tetro PWA');
        }
        deferredPrompt = null;
        btn.style.display = 'none';
      });
    });
  });
}
