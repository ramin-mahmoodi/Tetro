/* ==========================================================================
   TETRO UI RENDERER
   1 Row Per Exchange Table, Mini Sparkline Charts, Tick Flashes, Filter & Sort
   Clean flat layout without spread column
   ========================================================================== */

class UIRenderer {
  constructor() {
    this.searchQuery = '';
    this.sortBy = 'best_buy';
    this.container = null;
  }

  init() {
    this.container = document.getElementById('exchanges-table-body');
    this.setupControls();
    this.renderAll();

    // Subscribe to live data adapter ticks & updates
    window.dataAdapter.subscribe((event) => {
      if (event.type === 'tick') {
        this.handleTick(event);
        this.updateLastUpdateTimeUI();
      } else if (event.type === 'market_loaded' || event.type === 'currency_change') {
        this.renderAll();
        this.updateLastUpdateTimeUI();
      }
    });

    this.updateLastUpdateTimeUI();
    setInterval(() => this.updateLastUpdateTimeUI(), 10000);

    // Redraw sparklines on theme change or resize
    window.addEventListener('themechange', () => {
      this.drawAllSparklines();
    });

    window.addEventListener('resize', () => {
      this.drawAllSparklines();
    });
  }

  setupControls() {
    // Search filter
    const searchInput = document.getElementById('exchange-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderExchangeRows();
      });
    }

    // Sort selector
    const sortSelect = document.getElementById('exchange-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.renderExchangeRows();
      });
    }

    // Currency Switcher buttons (both desktop and mobile header)
    document.querySelectorAll('.currency-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const curr = btn.dataset.currency;
        document.querySelectorAll('.currency-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.currency === curr);
        });
        window.dataAdapter.setCurrency(curr);
      });
    });
  }

  renderAll() {
    this.renderTopMetrics();
    this.renderExchangeRows();
  }

  renderTopMetrics() {
    const stats = window.dataAdapter.getAggregateStats();
    if (!stats) return;

    const heroPriceEl = document.getElementById('hero-avg-price');
    const heroChangeEl = document.getElementById('hero-change-badge');
    const metricHighEl = document.getElementById('metric-high-24h');
    const metricLowEl = document.getElementById('metric-low-24h');
    const metricVolEl = document.getElementById('metric-total-vol');

    if (heroPriceEl) {
      heroPriceEl.textContent = window.dataAdapter.formatPrice(stats.avgBuy);
    }
    if (heroChangeEl) {
      const isPos = stats.change24h >= 0;
      heroChangeEl.className = `change-badge ${isPos ? 'positive' : 'negative'}`;
      heroChangeEl.innerHTML = `
        <i class="ph ${isPos ? 'ph-trend-up' : 'ph-trend-down'}"></i>
        <span>${isPos ? '+' : ''}${stats.change24h}%</span>
      `;
    }
    if (metricHighEl) {
      metricHighEl.textContent = window.dataAdapter.formatPrice(stats.high24h);
    }
    if (metricLowEl) {
      metricLowEl.textContent = window.dataAdapter.formatPrice(stats.low24h);
    }
    if (metricVolEl) {
      metricVolEl.textContent = `${(stats.totalVolume / 1000000).toFixed(1)}M USDT`;
    }
  }

  renderExchangeRows() {
    if (!this.container) return;

    let list = window.dataAdapter.getExchangeRates();

    // Filter by query
    if (this.searchQuery) {
      list = list.filter(item =>
        item.name.toLowerCase().includes(this.searchQuery) ||
        item.faName.includes(this.searchQuery)
      );
    }

    // Sort
    list.sort((a, b) => {
      if (this.sortBy === 'best_buy') return a.buyPrice - b.buyPrice;
      if (this.sortBy === 'best_sell') return b.sellPrice - a.sellPrice;
      if (this.sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

    this.container.innerHTML = '';

    const currUnit = window.dataAdapter.currentCurrency === 'RIAL' ? 'ریال' : 'تومان';

    list.forEach(ex => {
      const row = document.createElement('div');
      row.className = 'exchange-row';
      row.id = `row-${ex.id}`;

      const isPos = ex.change24h >= 0;
      const buyFormatted = window.dataAdapter.formatPriceNum(ex.buyPrice);
      const sellFormatted = window.dataAdapter.formatPriceNum(ex.sellPrice);
      const highFormatted = window.dataAdapter.formatPriceNum(ex.high24h);
      const lowFormatted = window.dataAdapter.formatPriceNum(ex.low24h);

      row.innerHTML = `
        <!-- Col 1: Exchange Info -->
        <div class="ex-col-info">
          <div class="ex-avatar">${ex.name.substring(0, 2).toUpperCase()}</div>
          <div class="ex-name-box">
            <span class="ex-name-eng" dir="ltr">${ex.name}</span>
            <span class="ex-name-fa">${ex.faName}</span>
          </div>
        </div>

        <!-- Col 2: 24h Mini Sparkline Chart -->
        <div class="ex-col-sparkline">
          <canvas class="sparkline-canvas" id="sparkline-${ex.id}"></canvas>
        </div>

        <!-- Col 3: Buy Price -->
        <div class="ex-col-rate ex-col-buy">
          <span class="rate-label">خرید:</span>
          <span class="rate-num" id="rate-buy-${ex.id}" dir="ltr">${buyFormatted}</span>
          <span class="rate-sub">${currUnit}</span>
        </div>

        <!-- Col 4: Sell Price -->
        <div class="ex-col-rate ex-col-sell">
          <span class="rate-label">فروش:</span>
          <span class="rate-num" id="rate-sell-${ex.id}" dir="ltr">${sellFormatted}</span>
          <span class="rate-sub">${currUnit}</span>
        </div>

        <!-- Col 5: 24h Change -->
        <div class="ex-col-change">
          <span class="change-badge ${isPos ? 'positive' : 'negative'}">
            <i class="ph ${isPos ? 'ph-trend-up' : 'ph-trend-down'}"></i>
            <span>${isPos ? '+' : ''}${ex.change24h}%</span>
          </span>
        </div>

        <!-- Col 6: 24h High / Low Range -->
        <div class="ex-col-range">
          <div class="range-stat range-low">
            <span class="range-lbl">کف:</span>
            <span class="range-val" dir="ltr">${lowFormatted}</span>
          </div>
          <span class="range-divider">~</span>
          <div class="range-stat range-high">
            <span class="range-lbl">سقف:</span>
            <span class="range-val" dir="ltr">${highFormatted}</span>
          </div>
        </div>
      `;

      this.container.appendChild(row);
    });

    // Draw all sparkline charts
    this.drawAllSparklines();
  }

  drawAllSparklines() {
    const list = window.dataAdapter.getExchangeRates();
    list.forEach(ex => {
      this.drawSparkline(ex.id, ex.change24h >= 0);
    });
  }

  drawSparkline(exchangeId, isPositive) {
    const canvas = document.getElementById(`sparkline-${exchangeId}`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = window.dataAdapter.getSparkline(exchangeId);
    if (!data || data.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const isMobile = window.innerWidth <= 860;
    const w = canvas.clientWidth || (isMobile ? 120 : 125);
    const h = canvas.clientHeight || (isMobile ? 42 : 36);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;
    const padTop = 3;
    const padBot = 3;
    const effH = h - padTop - padBot;

    const points = data.map((val, i) => ({
      x: (i / (data.length - 1)) * w,
      y: padTop + effH - ((val - min) / range) * effH
    }));

    // Choose color based on trend
    const lineColor = isPositive ? '#10b981' : '#ef4444';
    const fillAlpha = isPositive ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.22)';

    // Area Fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, fillAlpha);
    grad.addColorStop(1, 'rgba(0,0,0,0.01)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    points.forEach((p, idx) => {
      if (idx === 0) {
        ctx.lineTo(p.x, p.y);
      } else {
        const prev = points[idx - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();
    ctx.fill();

    // Smooth Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        const prev = points[idx - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.stroke();

    // End point pulse dot
    const lastP = points[points.length - 1];
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(lastP.x - 2, lastP.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  handleTick(event) {
    // Update top metrics
    this.renderTopMetrics();

    // Animate the ticking card rate
    const buyNumEl = document.getElementById(`rate-buy-${event.exchangeId}`);
    const sellNumEl = document.getElementById(`rate-sell-${event.exchangeId}`);

    if (buyNumEl && sellNumEl) {
      buyNumEl.textContent = window.dataAdapter.formatPriceNum(event.rate.buyPrice);
      sellNumEl.textContent = window.dataAdapter.formatPriceNum(event.rate.sellPrice);

      const flashClass = event.direction === 'up' ? 'tick-flash-up' : 'tick-flash-down';
      buyNumEl.classList.remove('tick-flash-up', 'tick-flash-down');
      sellNumEl.classList.remove('tick-flash-up', 'tick-flash-down');

      void buyNumEl.offsetWidth; // Reflow

      buyNumEl.classList.add(flashClass);
      sellNumEl.classList.add(flashClass);
    }

    // Update 24h high/low range in the row
    const rowEl = document.getElementById(`row-${event.exchangeId}`);
    if (rowEl && event.rate) {
      const highEl = rowEl.querySelector('.range-high .range-val');
      const lowEl = rowEl.querySelector('.range-low .range-val');
      if (highEl && event.rate.high24h) {
        highEl.textContent = window.dataAdapter.formatPriceNum(event.rate.high24h);
      }
      if (lowEl && event.rate.low24h) {
        lowEl.textContent = window.dataAdapter.formatPriceNum(event.rate.low24h);
      }
    }

    // Redraw sparkline for this exchange
    this.drawSparkline(event.exchangeId, event.rate.change24h >= 0);
  }

  updateLastUpdateTimeUI() {
    const date = window.dataAdapter ? window.dataAdapter.getLastUpdateTime() : null;
    const f = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    const toFa = (n) => String(n).replace(/[0-9]/g, w => f[+w]);

    let text = 'لحظاتی پیش';
    if (date) {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - date.getTime()) / 1000));
      if (diffSec < 60) {
        text = 'لحظاتی پیش';
      } else {
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) {
          text = `${toFa(diffMin)} دقیقه پیش`;
        } else {
          const diffHour = Math.floor(diffMin / 60);
          if (diffHour < 24) {
            text = `${toFa(diffHour)} ساعت پیش`;
          } else {
            const diffDay = Math.floor(diffHour / 24);
            text = `${toFa(diffDay)} روز پیش`;
          }
        }
      }
    }

    document.querySelectorAll('.last-update-text').forEach(el => {
      el.textContent = text;
    });
  }
}

window.uiRenderer = new UIRenderer();
