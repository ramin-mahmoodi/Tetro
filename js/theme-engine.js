/* ==========================================================================
   TETRO DESIGN SYSTEM - THEME ENGINE
   Handles 58 Palettes, 3 Modes (Light/Sepia/Dark), Low-Contrast & Font-Scaling
   ========================================================================== */

const THEMES_CONFIG = {
  basic: [
    { id: 'defaultPalette', name: 'Default', c1: '#c73854', c2: '#A6BF80' },
    { id: 'prettyPink', name: 'Pretty Pink', c1: '#e06594', c2: '#e39fb7' },
    { id: 'cherryRed', name: 'Cherry Red', c1: '#c73854', c2: '#de6a7a' },
    { id: 'tangyOrange', name: 'Tangy Orange', c1: '#d15f4d', c2: '#e6987e' },
    { id: 'glitterGold', name: 'Glitter Gold', c1: '#bd881e', c2: '#d9b86c' },
    { id: 'leafyGreen', name: 'Leafy Green', c1: '#59804d', c2: '#A6BF80' },
    { id: 'seafoamTeal', name: 'Seafoam Teal', c1: '#2a848c', c2: '#79baba' },
    { id: 'berryBlue', name: 'Berry Blue', c1: '#6265b3', c2: '#8b9be0' },
    { id: 'perfectPurple', name: 'Perfect Purple', c1: '#8451A6', c2: '#b78ac2' }
  ],
  premium: [
    { id: 'bubblegumCrisis', name: 'Bubblegum Crisis', c1: '#e06594', c2: '#de6a7a' },
    { id: 'pinkLemonade', name: 'Pink Lemonade', c1: '#e06594', c2: '#d9b86c' },
    { id: 'hatsuneMiku', name: 'Hatsune Miku', c1: '#e06594', c2: '#79baba' },
    { id: 'unicornDust', name: 'Unicorn Dust', c1: '#e06594', c2: '#b78ac2' },
    { id: 'appleOrchard', name: 'Apple Orchard', c1: '#c73854', c2: '#A6BF80' },
    { id: 'retroGamer', name: 'Retro Gamer', c1: '#c73854', c2: '#8b9be0' },
    { id: 'summerSunshine', name: 'Summer Sunshine', c1: '#d15f4d', c2: '#d9b86c' },
    { id: 'citrusTwist', name: 'Citrus Twist', c1: '#d15f4d', c2: '#A6BF80' },
    { id: 'goldfishPond', name: 'Goldfish Pond', c1: '#d15f4d', c2: '#8b9be0' },
    { id: 'lightningBolt', name: 'Lightning Bolt', c1: '#bd881e', c2: '#79baba' },
    { id: 'mayFlowers', name: 'May Flowers', c1: '#bd881e', c2: '#b78ac2' },
    { id: 'melonSlice', name: 'Melon Slice', c1: '#59804d', c2: '#de6a7a' },
    { id: 'blindJustice', name: 'Blind Justice', c1: '#2a848c', c2: '#de6a7a' },
    { id: 'greenerGrass', name: 'Greener Grass', c1: '#2a848c', c2: '#A6BF80' },
    { id: 'circusTent', name: 'Circus Tent', c1: '#6265b3', c2: '#e39fb7' },
    { id: 'popsicleStick', name: 'Popsicle Stick', c1: '#6265b3', c2: '#c73854' },
    { id: 'blueberryLemonade', name: 'Blueberry Lemonade', c1: '#6265b3', c2: '#d9b86c' },
    { id: 'gamecubeController', name: 'Gamecube Controller', c1: '#6265b3', c2: '#b78ac2' },
    { id: 'mulberryBush', name: 'Mulberry Bush', c1: '#8451A6', c2: '#de6a7a' },
    { id: 'jokerBaby', name: 'Joker Baby', c1: '#8451A6', c2: '#A6BF80' },
    { id: 'dixieCup', name: 'Dixie Cup', c1: '#8451A6', c2: '#79baba' }
  ],
  special: [
    { id: 'preciousMetals', name: 'Precious Metals', c1: '#b39f7d', c2: '#b0b0b0' },
    { id: 'cyberPunk', name: 'Cyberpunk', c1: '#8696b3', c2: '#65bd42' },
    { id: 'cyberPink', name: 'Cyberpink', c1: '#8696b3', c2: '#e6478e' },
    { id: 'sourCandies', name: 'Sour Candies', c1: '#e6478e', c2: '#65bd42' },
    { id: 'coffeeCake', name: 'Coffee Cake', c1: '#735750', c2: '#b39f7d' },
    { id: 'neaPolitan', name: 'Neapolitan', c1: '#735750', c2: '#de6a7a' },
    { id: 'pikaPika', name: 'Pika Pika', c1: '#735750', c2: '#bd881e' },
    { id: 'camoGear', name: 'Camo Gear', c1: '#735750', c2: '#59804d' },
    { id: 'peppermintPatty', name: 'Peppermint Patty', c1: '#735750', c2: '#79baba' }
  ],
  monochrome: [
    { id: 'pastelGoth', name: 'Pastel Goth', c1: '#333333', c2: '#e06594' },
    { id: 'vampireBlood', name: 'Vampire Blood', c1: '#333333', c2: '#c73854' },
    { id: 'jackoLantern', name: 'Jack-o-Lantern', c1: '#333333', c2: '#d15f4d' },
    { id: 'bumbleBee', name: 'Bumblebee', c1: '#333333', c2: '#bd881e' },
    { id: 'getSlimed', name: 'Get Slimed', c1: '#333333', c2: '#65bd42' },
    { id: 'winterNight', name: 'Winter Night', c1: '#333333', c2: '#79baba' },
    { id: 'brutalistBlue', name: 'Brutalist Blue', c1: '#333333', c2: '#6265b3' },
    { id: 'witchingHour', name: 'Witching Hour', c1: '#333333', c2: '#b78ac2' },
    { id: 'doberMann', name: 'Dobermann', c1: '#333333', c2: '#735750' },
    { id: 'newsPrint', name: 'Newsprint', c1: '#333333', c2: '#b0b0b0' },
    { id: 'paintBlack', name: 'Paint It Black', c1: '#111111', c2: '#222222' }
  ],
  holiday: [
    { id: 'thanksGiving', name: 'Thanksgiving', c1: '#735750', c2: '#d15f4d' },
    { id: 'halloWeen', name: 'Halloween', c1: '#d15f4d', c2: '#b78ac2' },
    { id: 'stPatrick', name: "St. Patrick's", c1: '#59804d', c2: '#b39f7d' },
    { id: 'easTer', name: 'Easter', c1: '#b78ac2', c2: '#e39fb7' },
    { id: 'newYear', name: 'New Year', c1: '#bd881e', c2: '#c73854' },
    { id: 'kwanZaa', name: 'Kwanzaa', c1: '#59804d', c2: '#c73854' },
    { id: 'valentinesDay', name: "Valentine's Day", c1: '#c73854', c2: '#e39fb7' },
    { id: 'hanuKkah', name: 'Hanukkah', c1: '#6265b3', c2: '#b0b0b0' }
  ]
};

class ThemeEngine {
  constructor() {
    this.currentPalette = localStorage.getItem('tetroPalette') || 'defaultPalette';
    this.currentMode = localStorage.getItem('tetroMode') || '1'; // 1: light, 2: sepia, 3: dark
    this.isContrast = localStorage.getItem('tetroContrast') === 'true';
    this.fontSize = parseFloat(localStorage.getItem('tetroFontSize')) || 14;
    this.lineHeight = parseFloat(localStorage.getItem('tetroLineHeight')) || 22;
  }

  init() {
    this.applyMode(this.currentMode);
    this.applyPalette(this.currentPalette);
    this.applyContrast(this.isContrast);
    this.applyFontScale(this.fontSize, this.lineHeight);
    this.renderModalSwatches();
    this.setupListeners();
  }

  applyMode(modeVal) {
    this.currentMode = String(modeVal);
    localStorage.setItem('tetroMode', this.currentMode);

    const body = document.body;
    body.classList.remove('sepiamode', 'darkmode');

    if (this.currentMode === '2') {
      body.classList.add('sepiamode');
    } else if (this.currentMode === '3') {
      body.classList.add('darkmode');
    }

    // Update active state in modal buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.currentMode);
    });

    window.dispatchEvent(new CustomEvent('themechange', { detail: { mode: this.currentMode, palette: this.currentPalette } }));
  }

  applyPalette(paletteId) {
    this.currentPalette = paletteId;
    localStorage.setItem('tetroPalette', paletteId);

    const hypContainer = document.getElementById('hyp-color');
    if (hypContainer) {
      hypContainer.className = paletteId;
    }

    // Update active swatch state in UI
    document.querySelectorAll('.palette-swatch-item').forEach(item => {
      item.classList.toggle('active', item.dataset.palette === paletteId);
    });

    // Update active select if present
    const select = document.getElementById('palette-quick-select');
    if (select) {
      select.value = paletteId;
    }

    window.dispatchEvent(new CustomEvent('themechange', { detail: { mode: this.currentMode, palette: this.currentPalette } }));
  }

  applyContrast(enable) {
    this.isContrast = Boolean(enable);
    localStorage.setItem('tetroContrast', this.isContrast ? 'true' : 'false');

    const hyp = document.querySelector('.hyp');
    if (hyp) {
      hyp.classList.toggle('contrastmode', this.isContrast);
    }
    const btn = document.getElementById('contrast-toggle');
    if (btn) {
      btn.classList.toggle('active', this.isContrast);
    }
  }

  applyFontScale(size, lineH) {
    this.fontSize = Math.min(28, Math.max(10, size));
    this.lineHeight = Math.min(38, Math.max(16, lineH));

    document.documentElement.style.setProperty('--fontSize', `${this.fontSize}px`);
    document.documentElement.style.setProperty('--lineHeight', `${this.lineHeight}px`);

    localStorage.setItem('tetroFontSize', this.fontSize);
    localStorage.setItem('tetroLineHeight', this.lineHeight);
  }

  renderModalSwatches() {
    const container = document.getElementById('modal-palettes-container');
    if (!container) return;

    container.innerHTML = '';

    const categories = [
      { key: 'basic', label: 'Basic Palettes (9)' },
      { key: 'premium', label: 'Premium Palettes (21)' },
      { key: 'special', label: 'Special & Neon (9)' },
      { key: 'monochrome', label: 'Monochrome & Dark (11)' },
      { key: 'holiday', label: 'Holiday & Seasonal (8)' }
    ];

    categories.forEach(cat => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'palette-group';

      const title = document.createElement('div');
      title.className = 'palette-group-title';
      title.innerHTML = `<span>${cat.label}</span>`;
      groupDiv.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'palette-swatches-grid';

      THEMES_CONFIG[cat.key].forEach(theme => {
        const item = document.createElement('button');
        item.className = `palette-swatch-item ${theme.id === this.currentPalette ? 'active' : ''}`;
        item.dataset.palette = theme.id;
        item.type = 'button';
        item.setAttribute('aria-label', `انتخاب پالت ${theme.name}`);
        item.innerHTML = `
          <div class="swatch-color-bars" aria-hidden="true">
            <div class="swatch-bar" style="background-color: ${theme.c1}"></div>
            <div class="swatch-bar" style="background-color: ${theme.c2}"></div>
          </div>
          <div class="swatch-name">${theme.name}</div>
        `;
        item.addEventListener('click', () => this.applyPalette(theme.id));
        grid.appendChild(item);
      });

      groupDiv.appendChild(grid);
      container.appendChild(groupDiv);
    });
  }

  openModal(triggerEl = null) {
    const modal = document.getElementById('theme-modal');
    if (!modal) return;
    this.modalTriggerEl = triggerEl || document.activeElement;
    modal.classList.add('open');
    const closeBtn = document.getElementById('theme-modal-close');
    if (closeBtn) closeBtn.focus();
  }

  closeModal() {
    const modal = document.getElementById('theme-modal');
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    if (this.modalTriggerEl && typeof this.modalTriggerEl.focus === 'function') {
      this.modalTriggerEl.focus();
    }
  }

  toggleModal(triggerEl = null) {
    const modal = document.getElementById('theme-modal');
    if (!modal) return;
    if (modal.classList.contains('open')) {
      this.closeModal();
    } else {
      this.openModal(triggerEl);
    }
  }

  setupListeners() {
    // Mode Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => this.applyMode(btn.dataset.mode));
    });

    // Contrast Toggle
    const contrastBtn = document.getElementById('contrast-toggle');
    if (contrastBtn) {
      contrastBtn.addEventListener('click', () => this.applyContrast(!this.isContrast));
    }

    // Font Sizing Buttons
    const fontUp = document.getElementById('font-up');
    const fontDown = document.getElementById('font-down');
    const fontReset = document.getElementById('font-reset');

    if (fontUp) fontUp.addEventListener('click', () => this.applyFontScale(this.fontSize + 1, this.lineHeight + 1.5));
    if (fontDown) fontDown.addEventListener('click', () => this.applyFontScale(this.fontSize - 1, this.lineHeight - 1.5));
    if (fontReset) fontReset.addEventListener('click', () => this.applyFontScale(14, 22));

    // Modal Opening & Closing
    const modal = document.getElementById('theme-modal');
    const openBtns = document.querySelectorAll('.open-theme-modal');
    const closeBtn = document.getElementById('theme-modal-close');

    openBtns.forEach(b => b.addEventListener('click', () => this.openModal(b)));

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });

      // Accessibility Focus Trap: Keep keyboard focus trapped inside the modal while open
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          const focusable = Array.from(modal.querySelectorAll(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"]), select:not([disabled]), input:not([disabled])'
          ));
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      });
    }
  }
}

window.themeEngine = new ThemeEngine();
