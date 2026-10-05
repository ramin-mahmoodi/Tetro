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

  // 5. Setup Mobile Bottom Nav & Desktop Rail Interactions
  setupMobileNav();
  setupRailNav();

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
        if (window.themeEngine) window.themeEngine.openModal(item);
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
    // Ignore modifiers (Ctrl, Alt, Meta) so browser shortcuts (like Ctrl+T) aren't hijacked
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Ignore when typing inside inputs, selects, textareas or contenteditable
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    // Use e.code to work seamlessly across English, Persian, and all keyboard layouts
    if (e.code === 'KeyT') {
      if (window.themeEngine) window.themeEngine.toggleModal();
    } else if (e.code === 'Escape' || e.key === 'Escape') {
      if (window.themeEngine) window.themeEngine.closeModal();
    } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
      if (window.themeEngine) window.themeEngine.applyMode(1);
    } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
      if (window.themeEngine) window.themeEngine.applyMode(2);
    } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
      if (window.themeEngine) window.themeEngine.applyMode(3);
    }
  });
}

// Desktop Rail Nav Handling
function setupRailNav() {
  const railLinks = document.querySelectorAll('.hyp-menu-links a');
  railLinks.forEach(item => {
    item.addEventListener('click', (e) => {
      const href = item.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        railLinks.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        if (href === '#' || href === '') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          const el = document.querySelector(href);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
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
      if (!btn._installBound) {
        btn._installBound = true;
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
      }
    });
  });
}
