/* ==========================================================================
   TETRO CHART ENGINE - CANVAS-BASED THEME-AWARE CHART
   Touch-friendly dragging, crosshair, dynamic resolution & theme reactivity
   ========================================================================== */

// Cached formatters to eliminate repeated ICU/locale object allocations on every render & hover
const CHART_DATE_FORMATTERS = {
  faFullDate: new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' }),
  faMonthDay: new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' }),
  faYearMonth: new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', timeZone: 'Asia/Tehran' }),
  enShortDate: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' }),
  enMonthDay: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' }),
  enYearMonth: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', timeZone: 'Asia/Tehran' }),
  time24: new Intl.DateTimeFormat('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }),
  tehranIsoDay: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' })
};

const TIMEFRAME_CONFIGS = {
  '1H': { durationMs: 60 * 60 * 1000, defaultIntervalMs: 60 * 1000 },
  '24H': { durationMs: 24 * 60 * 60 * 1000, defaultIntervalMs: 15 * 60 * 1000 },
  '7D': { durationMs: 7 * 24 * 60 * 60 * 1000, defaultIntervalMs: 60 * 60 * 1000 },
  '30D': { durationMs: 30 * 24 * 60 * 60 * 1000, defaultIntervalMs: 4 * 60 * 60 * 1000 },
  '1Y': { durationMs: 365 * 24 * 60 * 60 * 1000, defaultIntervalMs: 24 * 60 * 60 * 1000 }
};

class ChartEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.viewport = null;
    this.tooltip = null;
    this.timeframe = '24H';
    this.source = 'aggregate';
    this.dataPoints = [];
    this.renderedPoints = [];
    this.renderedCandlePoints = [];
    this.hoverIndex = -1;
    this.isDragging = false;
    this.chartType = 'candlestick'; // 'candlestick' | 'line'
  }

  setChartType(type) {
    this.chartType = type;
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    this.render();
  }

  init() {
    this.viewport = document.getElementById('chart-viewport');
    this.canvas = document.getElementById('chart-canvas');
    this.tooltip = document.getElementById('chart-tooltip');

    if (!this.canvas || !this.viewport) return;
    this.ctx = this.canvas.getContext('2d');

    this.setupListeners();
    this.loadData();
    this.resizeCanvas();

    // Resize observer for responsive layout changes
    const ro = new ResizeObserver(() => {
      this.resizeCanvas();
      this.render();
    });
    ro.observe(this.viewport);

    // Re-render when theme changes
    window.addEventListener('themechange', () => {
      requestAnimationFrame(() => this.render());
    });
  }

  setTimeframe(tf) {
    this.timeframe = tf;
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tf === tf);
    });
    const tfSelect = document.getElementById('chart-timeframe-select');
    if (tfSelect && tfSelect.value !== tf) {
      tfSelect.value = tf;
    }
    this.loadData();
  }

  setSource(src) {
    this.source = src;
    this.loadData();
  }

  async loadData() {
    try {
      this.dataPoints = await window.dataAdapter.getHistory(this.timeframe, this.source);
      this.updateStatsUI();
      this.render();
    } catch (e) {
      console.warn('Failed to load chart data:', e);
    }
  }

  updateStatsUI() {
    if (this.dataPoints.noData || !this.dataPoints.length) {
      const rate = window.dataAdapter ? window.dataAdapter.rates.get(this.source) : null;
      if (rate) {
        const currentEl = document.getElementById('chart-current-price');
        const minEl = document.getElementById('chart-min-price');
        const maxEl = document.getElementById('chart-max-price');
        if (currentEl) currentEl.textContent = window.dataAdapter.formatPrice(rate.buyPrice);
        if (minEl) minEl.textContent = window.dataAdapter.formatPrice(rate.low24h || rate.buyPrice);
        if (maxEl) maxEl.textContent = window.dataAdapter.formatPrice(rate.high24h || rate.buyPrice);
      }
      return;
    }
    const prices = this.dataPoints.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const latest = prices[prices.length - 1];

    let displayedPrice = latest;
    if (this.source === 'aggregate') {
      const stats = window.dataAdapter ? window.dataAdapter.getAggregateStats() : null;
      if (stats && stats.avgBuy) displayedPrice = stats.avgBuy;
    } else {
      const rate = window.dataAdapter ? window.dataAdapter.rates.get(this.source) : null;
      if (rate && rate.buyPrice) displayedPrice = rate.buyPrice;
    }

    const currentEl = document.getElementById('chart-current-price');
    const minEl = document.getElementById('chart-min-price');
    const maxEl = document.getElementById('chart-max-price');

    if (currentEl) currentEl.textContent = window.dataAdapter.formatPrice(displayedPrice);
    if (minEl) minEl.textContent = window.dataAdapter.formatPrice(min);
    if (maxEl) maxEl.textContent = window.dataAdapter.formatPrice(max);
  }

  resizeCanvas() {
    if (!this.canvas || !this.viewport) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.viewport.getBoundingClientRect();

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  // Get current CSS color variables
  getThemeColors() {
    const computed = getComputedStyle(document.body);
    const hypComputed = getComputedStyle(document.getElementById('hyp-color') || document.body);

    const accent1 = hypComputed.getPropertyValue('--accent1').trim() || '#c73854';
    const accent2 = hypComputed.getPropertyValue('--accent2').trim() || '#A6BF80';
    const bgInverse = computed.getPropertyValue('--bgInverse').trim() || '#333333';
    const bg2 = computed.getPropertyValue('--bg2').trim() || '#d3d3d3';

    return { accent1, accent2, bgInverse, bg2 };
  }

  // Format date/time header for tooltips across all timeframes
  formatTooltipHeader(dp) {
    const d = dp.time instanceof Date ? dp.time : new Date(dp.time);
    const tf = this.timeframe;

    let faFullDate = '';
    let faMonthDay = '';
    try {
      faFullDate = CHART_DATE_FORMATTERS.faFullDate.format(d);
      faMonthDay = CHART_DATE_FORMATTERS.faMonthDay.format(d);
    } catch (e) {
      faFullDate = d.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' });
      faMonthDay = faFullDate;
    }

    let enShortDate = '';
    try {
      enShortDate = CHART_DATE_FORMATTERS.enShortDate.format(d);
    } catch (e) {
      enShortDate = d.toLocaleDateString('en-US', { timeZone: 'Asia/Tehran' });
    }

    const timeStr = CHART_DATE_FORMATTERS.time24.format(d);

    if (tf === '1H') {
      let isToday = true;
      try {
        const nowTehran = CHART_DATE_FORMATTERS.tehranIsoDay.format(new Date());
        const candleTehran = CHART_DATE_FORMATTERS.tehranIsoDay.format(d);
        isToday = nowTehran === candleTehran;
      } catch (e) {}
      const dayLabel = isToday ? '(امروز)' : `(${faMonthDay})`;
      return `<b>${timeStr}</b> <span style="opacity:0.75; font-size:10px;">${dayLabel}</span>`;
    }
    if (tf === '24H') {
      return `<b>${faMonthDay}</b> • <b>${timeStr}</b>`;
    }
    if (tf === '7D' || tf === '30D') {
      let enDay = '';
      try {
        enDay = CHART_DATE_FORMATTERS.enMonthDay.format(d);
      } catch (e) {
        enDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' });
      }
      return `<b>${faMonthDay}</b> • <b>${timeStr}</b> <span style="opacity:0.65; font-size:10px;">(${enDay})</span>`;
    }
    if (tf === '1Y') {
      // 1-Year daily candles: Show full Persian date (day, month, 4-digit year) and Gregorian date!
      return `<b>${faFullDate}</b> <span style="opacity:0.75; font-size:10px;">(${enShortDate})</span>`;
    }
    return `<b>${faFullDate}</b> • <b>${timeStr}</b>`;
  }

  // Format tick labels for the chart X-axis
  formatAxisLabel(date, timeframe) {
    const d = date instanceof Date ? date : new Date(date);
    if (timeframe === '1H' || timeframe === '24H') {
      return CHART_DATE_FORMATTERS.time24.format(d);
    }
    if (timeframe === '7D' || timeframe === '30D') {
      try {
        return CHART_DATE_FORMATTERS.faMonthDay.format(d);
      } catch (e) {
        return CHART_DATE_FORMATTERS.enMonthDay.format(d);
      }
    }
    if (timeframe === '1Y') {
      try {
        return CHART_DATE_FORMATTERS.faYearMonth.format(d);
      } catch (e) {
        return CHART_DATE_FORMATTERS.enYearMonth.format(d);
      }
    }
    return d.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' });
  }

  // Mathematically sound bar consolidation for tight viewports
  consolidateBars(rawCandles, maxBars) {
    if (!Array.isArray(rawCandles) || rawCandles.length <= maxBars) return rawCandles;
    const bucketSize = Math.ceil(rawCandles.length / maxBars);
    const result = [];
    for (let i = 0; i < rawCandles.length; i += bucketSize) {
      const bucket = rawCandles.slice(i, i + bucketSize);
      if (!bucket.length) continue;
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      const highs = bucket.map(c => (c.high != null ? c.high : (c.price || 0)));
      const lows = bucket.map(c => (c.low != null ? c.low : (c.price || 0)));
      const open = first.open != null ? first.open : first.price;
      const close = last.close != null ? last.close : last.price;
      const high = Math.max(...highs, open, close);
      const low = Math.min(...lows, open, close);
      const volume = bucket.reduce((sum, c) => sum + (c.volume || 0), 0);
      result.push({
        time: last.time,
        open,
        high,
        low,
        close,
        price: close,
        volume
      });
    }
    return result;
  }

  render() {
    if (!this.ctx) return;

    const rect = this.viewport.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const ctx = this.ctx;
    const { accent1, accent2, bgInverse } = this.getThemeColors();

    ctx.clearRect(0, 0, w, h);

    // If source history has no data yet (e.g. Nobitex API returning no_data)
    if (this.dataPoints.noData || !this.dataPoints.length) {
      if (this.tooltip) this.tooltip.style.display = 'none';
      const rate = window.dataAdapter ? window.dataAdapter.rates.get(this.source) : null;
      const livePrice = rate ? window.dataAdapter.formatPrice(rate.buyPrice) : '';

      ctx.fillStyle = bgInverse;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (this.source === 'nobitex') {
        ctx.font = 'bold 14px "Vazirmatn", sans-serif';
        ctx.fillText('اتصال به اندپوینت رسمی نوبیتکس برقرار است', w / 2, h / 2 - 24);

        ctx.font = '12px "Vazirmatn", sans-serif';
        ctx.fillStyle = accent1;
        ctx.fillText('سرور نوبیتکس در حال حاضر داده‌های کندل تتر را ارسال نمی‌کند (no_data)', w / 2, h / 2 + 2);

        ctx.font = '13px "Vazirmatn", sans-serif';
        ctx.fillStyle = '#10b981';
        ctx.fillText(`نرخ لحظه‌ای نوبیتکس زنده و متصل است: ${livePrice}`, w / 2, h / 2 + 28);

        ctx.font = '11px "Vazirmatn", sans-serif';
        ctx.fillStyle = bgInverse;
        ctx.globalAlpha = 0.55;
        ctx.fillText('(به محض رفع اختلال سرور نوبیتکس، کندل‌های زنده به‌طور خودکار رسم خواهند شد)', w / 2, h / 2 + 52);
        ctx.globalAlpha = 1.0;
      } else {
        ctx.font = 'bold 14px "Vazirmatn", sans-serif';
        ctx.fillText('داده‌های تاریخچه برای این بخش در دسترس نیست', w / 2, h / 2 - 14);
        ctx.font = '12px "Vazirmatn", sans-serif';
        ctx.fillStyle = accent1;
        ctx.fillText(`نرخ لحظه‌ای: ${livePrice}`, w / 2, h / 2 + 14);
      }
      return;
    }

    const isMobile = w < 500;
    const padding = { top: 25, right: isMobile ? 48 : 58, bottom: 35, left: 14 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Deduplicate points by timestamp to prevent duplicate stacking
    const uniqueMap = new Map();
    (this.dataPoints || []).forEach(p => {
      const t = p.time instanceof Date ? p.time.getTime() : Number(p.time);
      if (!isNaN(t)) uniqueMap.set(t, p);
    });
    let renderPoints = Array.from(uniqueMap.values()).sort((a, b) => {
      const ta = a.time instanceof Date ? a.time.getTime() : Number(a.time);
      const tb = b.time instanceof Date ? b.time.getTime() : Number(b.time);
      return ta - tb;
    });

    // Consolidate bars if they exceed the canvas pixel density (avoids candle overlapping on mobile)
    if (this.chartType === 'candlestick') {
      const minSlotW = 3.2;
      const maxBars = Math.max(12, Math.floor(chartW / minSlotW));
      if (renderPoints.length > maxBars) {
        renderPoints = this.consolidateBars(renderPoints, maxBars);
      }
    }
    this.renderedPoints = renderPoints;
    const count = renderPoints.length;

    // Determine scale range from rendered points
    const lows = renderPoints.map(p => (p.low != null ? p.low : p.price));
    const highs = renderPoints.map(p => (p.high != null ? p.high : p.price));
    let minP = Math.min(...lows);
    let maxP = Math.max(...highs);
    const range = (maxP - minP) || 1;
    minP -= range * 0.06;
    maxP += range * 0.06;
    const adjustedRange = maxP - minP;

    // Draw Subtle Horizontal Grid Lines & Price (Y) Axis Labels
    const gridLines = 4;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;

      // Grid line
      ctx.strokeStyle = bgInverse;
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      // Price Label on Y Axis
      const priceVal = Math.round(maxP - (i / gridLines) * adjustedRange);
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = bgInverse;
      ctx.globalAlpha = 0.60;
      ctx.font = '10px "Vazirmatn", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const formattedPrice = window.dataAdapter ? window.dataAdapter.formatPriceNum(priceVal) : priceVal.toLocaleString('en-US');
      ctx.fillText(formattedPrice, w - 4, y);
      ctx.restore();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    const greenColor = '#10b981';
    const redColor = '#ef4444';

    const tfConfig = TIMEFRAME_CONFIGS[this.timeframe] || TIMEFRAME_CONFIGS['24H'];
    const durationMs = tfConfig.durationMs;

    const nowMs = Date.now();
    const lastPointTime = renderPoints.length > 0
      ? (renderPoints[renderPoints.length - 1].time instanceof Date ? renderPoints[renderPoints.length - 1].time.getTime() : Number(renderPoints[renderPoints.length - 1].time))
      : nowMs;
    const endTime = Math.max(nowMs, lastPointTime);
    const startTime = endTime - durationMs;

    // Draw Bottom X-Axis Timeline Labels
    const labelCount = w < 480 ? 3 : (w < 768 ? 4 : 5);
    ctx.fillStyle = bgInverse;
    ctx.globalAlpha = 0.55;
    ctx.font = '10px "Vazirmatn", sans-serif';
    ctx.textBaseline = 'top';

    for (let i = 0; i < labelCount; i++) {
      const t = startTime + (i / (labelCount - 1)) * durationMs;
      const posX = padding.left + (i / (labelCount - 1)) * chartW;

      if (i === 0) {
        ctx.textAlign = 'left';
      } else if (i === labelCount - 1) {
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'center';
      }

      const labelText = this.formatAxisLabel(new Date(t), this.timeframe);
      ctx.fillText(labelText, posX, padding.top + chartH + 8);
    }
    ctx.globalAlpha = 1.0;

    // =========================================================================
    // 1. CANDLESTICK CHART MODE (Default)
    // =========================================================================
    if (this.chartType === 'candlestick') {
      const expectedSlots = Math.max(renderPoints.length, Math.round(durationMs / tfConfig.defaultIntervalMs));
      const slotW = chartW / expectedSlots;
      const candleW = Math.max(1.5, Math.min(16, Math.floor(slotW * 0.72)));
      const maxVol = Math.max(...renderPoints.map(p => p.volume || 1), 1);
      const volAreaHeight = chartH * 0.16;
      const volBaseline = padding.top + chartH;

      const points = [];

      renderPoints.forEach((dp, i) => {
        const timeMs = dp.time instanceof Date ? dp.time.getTime() : Number(dp.time);
        const progress = Math.max(0, Math.min(1, (timeMs - startTime) / durationMs));
        const x = padding.left + progress * chartW;
        const open = dp.open != null ? dp.open : dp.price;
        const close = dp.close != null ? dp.close : dp.price;
        const high = dp.high != null ? dp.high : Math.max(open, close);
        const low = dp.low != null ? dp.low : Math.min(open, close);
        const isGreen = close >= open;
        const candleColor = isGreen ? greenColor : redColor;

        const yHigh = padding.top + chartH - ((high - minP) / adjustedRange) * chartH;
        const yLow = padding.top + chartH - ((low - minP) / adjustedRange) * chartH;
        const yOpen = padding.top + chartH - ((open - minP) / adjustedRange) * chartH;
        const yClose = padding.top + chartH - ((close - minP) / adjustedRange) * chartH;

        points.push({ x, y: yClose, dp, open, high, low, close, isGreen });

        // Volume Bar at Bottom
        if (dp.volume) {
          const vH = (dp.volume / maxVol) * volAreaHeight;
          ctx.fillStyle = isGreen ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.22)';
          ctx.fillRect(x - candleW / 2, volBaseline - vH, candleW, vH);
        }

        // Wick Line
        ctx.strokeStyle = candleColor;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        // Candle Body
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
        ctx.fillStyle = candleColor;
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyHeight);

        // Retro-brutalist body outline
        ctx.strokeStyle = isGreen ? '#059669' : '#b91c1c';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
      });

      this.renderedCandlePoints = points;

      // Active Crosshair & Tooltip
      if (this.hoverIndex >= 0 && this.hoverIndex < points.length) {
        const active = points[this.hoverIndex];

        // Vertical dashed line
        ctx.strokeStyle = accent2;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(active.x, padding.top);
        ctx.lineTo(active.x, padding.top + chartH);
        ctx.stroke();

        // Horizontal dashed line
        ctx.beginPath();
        ctx.moveTo(padding.left, active.y);
        ctx.lineTo(padding.left + chartW, active.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Active indicator dot
        ctx.fillStyle = active.isGreen ? greenColor : redColor;
        ctx.beginPath();
        ctx.arc(active.x, active.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = bgInverse;
        ctx.stroke();

        if (this.tooltip) {
          this.tooltip.style.display = 'block';
          this.tooltip.style.left = `${Math.min(w - 110, Math.max(110, active.x))}px`;
          this.tooltip.style.top = `${Math.max(15, active.y - 12)}px`;

          const diff = active.close - active.open;
          const pct = ((diff / active.open) * 100).toFixed(2);
          const isPos = diff >= 0;

          this.tooltip.innerHTML = `
            <div class="chart-tooltip-header">
              ${this.formatTooltipHeader(active.dp)}
            </div>
            <div class="chart-tooltip-price" style="color:${isPos ? greenColor : redColor};">
              ${window.dataAdapter.formatPrice(active.close)}
              <small style="font-size:11px; margin-right:4px;">(${isPos ? '+' : ''}${pct}%)</small>
            </div>
            <div class="candle-tooltip-grid">
              <div><span>باز:</span> <b>${window.dataAdapter.formatPriceNum(active.open)}</b></div>
              <div><span>بسته:</span> <b>${window.dataAdapter.formatPriceNum(active.close)}</b></div>
              <div><span>سقف:</span> <b style="color:${greenColor};">${window.dataAdapter.formatPriceNum(active.high)}</b></div>
              <div><span>کف:</span> <b style="color:${redColor};">${window.dataAdapter.formatPriceNum(active.low)}</b></div>
            </div>
          `;
        }
      } else {
        if (this.tooltip) this.tooltip.style.display = 'none';
      }

    // =========================================================================
    // 2. LINE CHART MODE
    // =========================================================================
    } else {
      const points = renderPoints.map((dp) => {
        const timeMs = dp.time instanceof Date ? dp.time.getTime() : Number(dp.time);
        const progress = Math.max(0, Math.min(1, (timeMs - startTime) / durationMs));
        const x = padding.left + progress * chartW;
        const y = padding.top + chartH - ((dp.price - minP) / adjustedRange) * chartH;
        return { x, y, dp };
      });
      this.renderedCandlePoints = points;

      if (count <= 1) {
        if (points.length === 1) {
          ctx.fillStyle = accent1;
          ctx.beginPath();
          ctx.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = accent1;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(padding.left, points[0].y);
          ctx.lineTo(padding.left + chartW, points[0].y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        // Gradient Area
        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        grad.addColorStop(0, this.hexToRgba(accent1, 0.35));
        grad.addColorStop(1, this.hexToRgba(accent1, 0.02));

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(points[0].x, padding.top + chartH);
        points.forEach((p, idx) => {
          if (idx === 0) {
            ctx.lineTo(p.x, p.y);
          } else {
            const prev = points[idx - 1];
            const cx = (prev.x + p.x) / 2;
            ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
          }
        });
        ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
        ctx.closePath();
        ctx.fill();

        // Line
        ctx.strokeStyle = accent1;
        ctx.lineWidth = 3;
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
      }

      // Crosshair
      if (this.hoverIndex >= 0 && this.hoverIndex < points.length) {
        const active = points[this.hoverIndex];

        ctx.strokeStyle = accent2;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(active.x, padding.top);
        ctx.lineTo(active.x, padding.top + chartH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = accent2;
        ctx.beginPath();
        ctx.arc(active.x, active.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = bgInverse;
        ctx.stroke();

        if (this.tooltip) {
          this.tooltip.style.display = 'block';
          this.tooltip.style.left = `${Math.min(w - 110, Math.max(110, active.x))}px`;
          this.tooltip.style.top = `${Math.max(15, active.y - 10)}px`;
          this.tooltip.innerHTML = `
            <div class="chart-tooltip-header">
              ${this.formatTooltipHeader(active.dp)}
            </div>
            <div class="chart-tooltip-price">${window.dataAdapter.formatPrice(active.dp.price)}</div>
          `;
        }
      } else {
        if (this.tooltip) this.tooltip.style.display = 'none';
      }
    }
  }

  setupListeners() {
    // Chart Type Switcher (Candlestick vs Line)
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setChartType(btn.dataset.type));
    });

    // Timeframe buttons (Desktop)
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTimeframe(btn.dataset.tf));
    });

    // Mobile Timeframe Select
    const tfSelect = document.getElementById('chart-timeframe-select');
    if (tfSelect) {
      tfSelect.addEventListener('change', (e) => this.setTimeframe(e.target.value));
    }

    // Source Selector
    const sourceSelect = document.getElementById('chart-source-select');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', (e) => this.setSource(e.target.value));
    }

    // Touch & Pointer Dragging
    const handleMove = (clientX) => {
      const rect = this.viewport.getBoundingClientRect();
      const x = clientX - rect.left;
      const pointsList = (this.renderedCandlePoints && this.renderedCandlePoints.length) ? this.renderedCandlePoints : (this.renderedPoints || this.dataPoints);
      const count = pointsList.length;
      if (count <= 0) return;

      let closestIdx = -1;
      let minDistance = Infinity;
      pointsList.forEach((pt, i) => {
        const ptX = typeof pt.x === 'number' ? pt.x : 0;
        const d = Math.abs(ptX - x);
        if (d < minDistance) {
          minDistance = d;
          closestIdx = i;
        }
      });

      this.hoverIndex = closestIdx;
      this.render();
    };

    // Mouse Events
    this.viewport.addEventListener('mousemove', (e) => handleMove(e.clientX));
    this.viewport.addEventListener('mouseleave', () => {
      this.hoverIndex = -1;
      this.render();
    });

    // Touch Events for Mobile (smooth dragging with thumb)
    this.viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.isDragging = true;
        handleMove(e.touches[0].clientX);
      }
    }, { passive: true });

    this.viewport.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    }, { passive: true });

    this.viewport.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  hexToRgba(hex, alpha) {
    if (!hex.startsWith('#')) return `rgba(200, 50, 80, ${alpha})`;
    const h = hex.replace('#', '');
    const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }
}

window.chartEngine = new ChartEngine();
