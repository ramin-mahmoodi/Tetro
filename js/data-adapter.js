/* ==========================================================================
   TETRO DATA ADAPTER & PRICE ENGINE
   Unified data store, live market rates & ticker engine
   ========================================================================== */

const EXCHANGES_DEF = [
  { id: 'nobitex', name: 'Nobitex', faName: 'نوبیتکس' },
  { id: 'wallex', name: 'Wallex', faName: 'والکس' },
  { id: 'ramzinex', name: 'Ramzinex', faName: 'رمزینکس' },
  { id: 'abantether', name: 'AbanTether', faName: 'آبان‌تتر' },
  { id: 'tetherland', name: 'TetherLand', faName: 'تترلند' },
  { id: 'tabdeal', name: 'Tabdeal', faName: 'تبدیل' },
  { id: 'exir', name: 'Exir', faName: 'اکسیر' },
  { id: 'bitpin', name: 'Bitpin', faName: 'بیت‌پین' }
];

// Cached formatters to eliminate repeated ICU/locale object allocations
const DATA_DATE_FORMATTERS = {
  time24: new Intl.DateTimeFormat('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }),
  faMonthDay: new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' }),
  faYearMonth: new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' }),
  enMonthDay: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' }),
  enYearMonth: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' })
};

const UDF_CONFIGS = {
  wallex: {
    divisor: 1,
    url: (res, from, to) => `https://api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=${res}&from=${from}&to=${to}`
  },
  nobitex: {
    divisor: 1,
    url: (res, from, to, countback) => `https://apiv2.nobitex.ir/market/udf/history?symbol=USDTIRT&resolution=${res}&from=${from}&to=${to}&countback=${countback}`
  },
  abantether: {
    divisor: 1,
    url: (res, from, to, countback) => `https://api.abantether.com/otc_reporting/tradingview/history?symbol=USDT%2FIRT&resolution=${res}&from=${from}&to=${to}&countback=${countback}`
  },
  ramzinex: {
    divisor: 10,
    url: (res, from, to, countback) => `https://publicapi.ramzinex.ir/exchange/api/v1.0/exchange/chart/tv/v2.0/history?symbol=USDTIRR&resolution=${res}&from=${from}&to=${to}&countback=${countback}`
  },
  tabdeal: {
    divisor: 1,
    url: (res, from, to, countback) => `https://api-web.tabdeal.org/r/plots/history/?first_currency_symbol=USDT&second_currency_symbol=IRT&from=${from}&to=${to}&resolution=${res}&countback=${countback}&symbol=USDT_IRT`
  },
  exir: {
    divisor: 1,
    url: (res, from, to) => `https://api.exir.io/v2/chart?symbol=usdt-irt&resolution=${res}&from=${from}&to=${to}`
  },
  bitpin: {
    divisor: 1,
    url: (res, from, to) => `https://api.bitpin.ir/v1/mkt/tv/get_bars/?symbol=USDT_IRT&res=${res}&from=${from}&to=${to}`
  }
};

class DataAdapter {
  constructor() {
    const savedCurrency = (typeof localStorage !== 'undefined' && localStorage.getItem('tetro_currency')) || 'TOMAN';
    this.currentCurrency = savedCurrency === 'RIAL' ? 'RIAL' : 'TOMAN';
    this.rates = new Map();
    this.historyCache = new Map();
    this.subscribers = new Set();
    this.tickTimer = null;
    this.livePollTimer = null;
    this.sparklinePollTimer = null;
    this.marketJsonTimer = null;
    this.basePrice = null;
  }

  // Resolves API endpoint through local development proxy (when on localhost)
  getProxyUrl(targetUrl) {
    if (typeof window !== 'undefined') {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `/proxy?url=${encodeURIComponent(targetUrl)}`;
      }
    }
    return null;
  }

  init() {
    // Populate baseline structure (real data is loaded from market.json / live APIs)
    EXCHANGES_DEF.forEach(ex => {
      this.rates.set(ex.id, {
        id: ex.id,
        name: ex.name,
        faName: ex.faName,
        status: 'live',
        lastSuccessAt: null,
        buyPrice: null,
        sellPrice: null,
        vol24h: 0,
        change24h: null,
        high24h: null,
        low24h: null,
        sparkline: [],
        lastUpdate: new Date(),
        lastDirection: 'none'
      });
    });

    // Load real pre-built market.json (synced from real exchange APIs)
    this.loadMarketDataJson();

    // Check for updated market.json every 60 seconds in background
    this.marketJsonTimer = setInterval(() => {
      this.loadMarketDataJson();
    }, 60000);

    // Start live fetching from real exchange API endpoints only on localhost where dev proxy runs
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      this.startLiveApiFetchers();
    }

    // Stop background polling when tab is hidden to save bandwidth and memory
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pauseAllPolling();
        } else {
          this.resumeAllPolling();
          this.loadMarketDataJson();
        }
      });
    }
  }

  pauseAllPolling() {
    if (this.marketJsonTimer) {
      clearInterval(this.marketJsonTimer);
      this.marketJsonTimer = null;
    }
    if (this.livePollTimer) {
      clearInterval(this.livePollTimer);
      this.livePollTimer = null;
    }
    if (this.sparklinePollTimer) {
      clearInterval(this.sparklinePollTimer);
      this.sparklinePollTimer = null;
    }
  }

  resumeAllPolling() {
    if (!this.marketJsonTimer) {
      this.marketJsonTimer = setInterval(() => this.loadMarketDataJson(), 60000);
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      if (!this.livePollTimer) {
        this.startLiveApiFetchers();
      }
    }
  }

  // Load and apply market data snapshot generated by automated sync (GitHub Actions)
  async loadMarketDataJson() {
    try {
      const res = await fetch('./data/market.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.rates) return;

      if (data.timestamp || data.updatedAt) {
        this.lastMarketUpdate = data.timestamp ? new Date(data.timestamp * 1000) : new Date(data.updatedAt);
      }

      if (data.basePrice) {
        this.basePrice = data.basePrice;
      }

      // Update exchange rates
      Object.keys(data.rates).forEach(id => {
        const item = data.rates[id];
        const current = this.rates.get(id);
        if (current && item) {
          current.status = item.status || 'live';
          current.lastSuccessAt = item.lastSuccessAt || null;
          current.buyPrice = item.buyPrice != null ? item.buyPrice : current.buyPrice;
          current.sellPrice = item.sellPrice != null ? item.sellPrice : current.sellPrice;
          current.change24h = item.change24h != null ? Number(Number(item.change24h).toFixed(2)) : current.change24h;
          current.high24h = item.high24h != null ? item.high24h : current.high24h;
          current.low24h = item.low24h != null ? item.low24h : current.low24h;
          current.vol24h = item.vol24h != null ? item.vol24h : current.vol24h;
          if (Array.isArray(item.sparkline) && item.sparkline.length > 0) {
            current.sparkline = item.sparkline;
          }
          current.lastUpdate = new Date(data.timestamp ? data.timestamp * 1000 : Date.now());
          this.rates.set(id, current);
        }
      });

      // Cache pre-fetched candles
      if (data.candles && typeof data.candles === 'object') {
        Object.keys(data.candles).forEach(tf => {
          const rawPoints = data.candles[tf];
          if (Array.isArray(rawPoints) && rawPoints.length > 0) {
            const cleanTf = tf.replace(/^[a-z0-9]+_/, '');
            const formatted = rawPoints.map(p => ({
              ...p,
              time: new Date(p.time),
              label: this.formatTimeLabel(new Date(p.time), cleanTf)
            }));
            if (tf.includes('_')) {
              this.historyCache.set(tf, formatted);
            } else {
              this.historyCache.set(`wallex_${tf}`, formatted);
              this.historyCache.set(`aggregate_${tf}`, formatted);
            }
          }
        });
      }

      // Notify UI
      this.notify({
        type: 'market_loaded',
        stats: this.getAggregateStats()
      });

      if (window.chartEngine && window.chartEngine.loadData) {
        window.chartEngine.loadData();
      }
    } catch (err) {
      // Quietly ignore if market.json is not yet available
    }
  }

  // Subscribe to real-time price updates
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify(event) {
    this.subscribers.forEach(cb => {
      try {
        cb(event);
      } catch (err) {
        console.error('Subscriber notification error:', err);
      }
    });
  }

  getExchangeRates() {
    return Array.from(this.rates.values());
  }

  getSparkline(exchangeId) {
    // 1. Try to get directly from cached 24H candles of that exchange
    const cKey = exchangeId === 'wallex' ? '24H' : `${exchangeId}_24H`;
    if (this.historyCache.has(cKey)) {
      const candles = this.historyCache.get(cKey);
      if (Array.isArray(candles) && candles.length > 1) {
        return candles.map(c => Math.round(Number(c.close != null ? c.close : c.price)));
      }
    }
    // 2. Fallback to rates sparkline
    const item = this.rates.get(exchangeId);
    return item && Array.isArray(item.sparkline) ? item.sparkline : [];
  }

  getLastUpdateTime() {
    return this.lastMarketUpdate || new Date();
  }

  getAggregateStats() {
    const list = this.getExchangeRates().filter(r => r.status !== 'failed');
    if (!list.length) return null;

    // Filter valid prices in normal reasonable range
    const valid = list.filter(r => typeof r.buyPrice === 'number' && r.buyPrice > 50000 && r.buyPrice < 500000);
    if (!valid.length) return null;

    // Calculate median buy price for outlier rejection
    const sortedBuys = valid.map(r => r.buyPrice).sort((a, b) => a - b);
    const mid = Math.floor(sortedBuys.length / 2);
    const medianBuy = sortedBuys.length % 2 !== 0 ? sortedBuys[mid] : (sortedBuys[mid - 1] + sortedBuys[mid]) / 2;

    // Exclude any price with > 8% deviation from median
    const nonOutliers = valid.filter(r => Math.abs(r.buyPrice - medianBuy) / medianBuy <= 0.08);
    const pool = nonOutliers.length > 0 ? nonOutliers : valid;

    // Calculate Volume-Weighted Average Price (VWAP)
    let totalWeight = 0;
    let weightedBuy = 0;
    let weightedSell = 0;
    let weightedChange = 0;
    let totalVol = 0;
    let minLow = Infinity;
    let maxHigh = -Infinity;

    pool.forEach(item => {
      totalVol += (Number(item.vol24h) || 0);
      if (item.low24h != null && item.low24h < minLow) minLow = item.low24h;
      if (item.high24h != null && item.high24h > maxHigh) maxHigh = item.high24h;
    });

    const poolWithVol = pool.filter(item => (Number(item.vol24h) || 0) > 0);
    const vwapPool = poolWithVol.length > 0 ? poolWithVol : pool;

    vwapPool.forEach(item => {
      const vol = poolWithVol.length > 0 ? Number(item.vol24h) : 1;
      totalWeight += vol;
      weightedBuy += item.buyPrice * vol;
      weightedSell += item.sellPrice * vol;
      weightedChange += (Number(item.change24h) || 0) * vol;
    });

    let avgBuy = totalWeight > 0 ? Math.round(weightedBuy / totalWeight) : Math.round(medianBuy);
    let avgSell = totalWeight > 0 ? Math.round(weightedSell / totalWeight) : Math.round(medianBuy);

    // Guaranteed spread integrity
    if (avgBuy < avgSell) {
      const tmp = avgBuy;
      avgBuy = avgSell;
      avgSell = tmp;
    }

    const avgChange = totalWeight > 0 ? Number((weightedChange / totalWeight).toFixed(2)) : 0;

    return {
      avgBuy,
      avgSell,
      totalVolume: totalVol,
      high24h: maxHigh !== -Infinity ? maxHigh : avgBuy,
      low24h: minLow !== Infinity ? minLow : avgSell,
      change24h: avgChange
    };
  }

  formatPrice(rawToman, currency = this.currentCurrency) {
    if (rawToman == null) return '--';
    if (currency === 'RIAL') {
      return (rawToman * 10).toLocaleString('en-US') + ' ریال';
    }
    // Default TOMAN
    return rawToman.toLocaleString('en-US') + ' تومان';
  }

  formatPriceNum(rawToman, currency = this.currentCurrency) {
    if (rawToman == null) return '--';
    if (currency === 'RIAL') {
      return (rawToman * 10).toLocaleString('en-US');
    }
    return rawToman.toLocaleString('en-US');
  }

  setCurrency(curr) {
    this.currentCurrency = curr === 'RIAL' ? 'RIAL' : 'TOMAN';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tetro_currency', this.currentCurrency);
    }
    this.notify({ type: 'currency_change', currency: this.currentCurrency });
  }

  consolidateCandles(rawCandles, maxBars = 140) {
    if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];
    if (rawCandles.length <= maxBars) return rawCandles;
    const bucketSize = Math.ceil(rawCandles.length / maxBars);
    const result = [];
    for (let i = 0; i < rawCandles.length; i += bucketSize) {
      const bucket = rawCandles.slice(i, i + bucketSize);
      if (bucket.length === 0) continue;
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      const high = Math.max(...bucket.map(c => c.high));
      const low = Math.min(...bucket.map(c => c.low));
      const volume = bucket.reduce((sum, c) => sum + (c.volume || 0), 0);
      result.push({
        time: last.time,
        open: first.open,
        high: Math.max(high, first.open, last.close),
        low: Math.min(low, first.open, last.close),
        close: last.close,
        price: last.close,
        volume: volume,
        label: last.label
      });
    }
    return result;
  }

  parseCandleBars(data, { divisor = 1, timeframe = '24H' } = {}) {
    const raw = [];
    if (data && data.s === 'ok' && Array.isArray(data.t) && Array.isArray(data.c)) {
      // Standard TradingView UDF format { s: 'ok', t, o, h, l, c, v }
      for (let i = 0; i < data.t.length; i++) {
        const d = new Date(data.t[i] * 1000);
        const o = Math.round(Number(data.o ? data.o[i] : data.c[i]) / divisor);
        const h = Math.round(Number(data.h ? data.h[i] : data.c[i]) / divisor);
        const l = Math.round(Number(data.l ? data.l[i] : data.c[i]) / divisor);
        const c = Math.round(Number(data.c[i]) / divisor);
        const v = Math.round(Number(data.v ? data.v[i] : 0));
        raw.push({
          time: d,
          open: o,
          high: Math.max(h, o, c),
          low: Math.min(l, o, c),
          close: c,
          price: c,
          volume: v,
          label: this.formatTimeLabel(d, timeframe)
        });
      }
    } else if (Array.isArray(data)) {
      // Array of candle objects [{ time, open, high, low, close, volume }]
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const rawTime = typeof item.time === 'number' ? (item.time > 1e11 ? item.time : item.time * 1000) : item.time;
        const d = new Date(rawTime);
        const o = Math.round(Number(item.open != null ? item.open : item.close) / divisor);
        const h = Math.round(Number(item.high != null ? item.high : item.close) / divisor);
        const l = Math.round(Number(item.low != null ? item.low : item.close) / divisor);
        const c = Math.round(Number(item.close) / divisor);
        const v = Math.round(Number(item.volume || 0));
        raw.push({
          time: d,
          open: o,
          high: Math.max(h, o, c),
          low: Math.min(l, o, c),
          close: c,
          price: c,
          volume: v,
          label: this.formatTimeLabel(d, timeframe)
        });
      }
    }
    return raw;
  }

  // Live historical candle data fetcher (table-driven, clean & DRY)
  async getHistory(timeframe = '24H', sourceId = 'aggregate') {
    const cacheKey = `${sourceId}_${timeframe}`;
    if (this.historyCache.has(cacheKey) && this.historyCache.get(cacheKey).length > 0) {
      return this.historyCache.get(cacheKey);
    }

    // 1. When source is Aggregate: return the true pre-computed market aggregate candles
    if (sourceId === 'aggregate') {
      const aggKey = `aggregate_${timeframe}`;
      if (this.historyCache.has(aggKey) && this.historyCache.get(aggKey).length > 0) {
        return this.historyCache.get(aggKey);
      }
      if (this.historyCache.has(timeframe) && this.historyCache.get(timeframe).length > 0) {
        return this.historyCache.get(timeframe);
      }
    }

    const endpointDef = UDF_CONFIGS[sourceId];
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (endpointDef && isLocal) {
      try {
        const tfMap = {
          '1H': { resolution: '1', sec: 3600, countback: 60 },
          '24H': { resolution: '15', sec: 86400, countback: 96 },
          '7D': { resolution: '60', sec: 7 * 86400, countback: 168 },
          '30D': { resolution: '240', sec: 30 * 86400, countback: 180 },
          '1Y': { resolution: '1D', sec: 365 * 86400, countback: 365 }
        };
        const cfg = tfMap[timeframe] || { resolution: '60', sec: 86400, countback: 100 };
        const now = Math.floor(Date.now() / 1000);
        const from = now - cfg.sec;
        const targetUrl = endpointDef.url(cfg.resolution, from, now, cfg.countback);
        const proxyUrl = this.getProxyUrl(targetUrl);
        if (proxyUrl) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);
          const res = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            const raw = this.parseCandleBars(data, { divisor: endpointDef.divisor, timeframe });
            if (raw.length > 0) {
              const maxBars = timeframe === '1Y' ? 400 : 140;
              const points = this.consolidateCandles(raw, maxBars);
              this.historyCache.set(cacheKey, points);
              if (sourceId === 'wallex') {
                this.historyCache.set(`wallex_${timeframe}`, points);
              }
              return points;
            }
          }
        }
      } catch (err) {
        console.warn(`[History] Fetch error for ${sourceId}:`, err.message);
      }
    }

    // 2. Secondary fallback from snapshot cache
    const fallbackKey = sourceId === 'wallex' ? timeframe : `${sourceId}_${timeframe}`;
    if (this.historyCache.has(fallbackKey) && this.historyCache.get(fallbackKey).length > 0) {
      return this.historyCache.get(fallbackKey);
    }
    if (this.historyCache.has(cacheKey) && this.historyCache.get(cacheKey).length > 0) {
      return this.historyCache.get(cacheKey);
    }

    const emptyDefault = [];
    emptyDefault.noData = true;
    emptyDefault.source = sourceId;
    emptyDefault.message = `داده‌های تاریخچه ${sourceId} در دسترس نیست`;
    return emptyDefault;
  }

  formatTimeLabel(date, timeframe) {
    if (timeframe === '1H' || timeframe === '24H') {
      return DATA_DATE_FORMATTERS.time24.format(date);
    }
    if (timeframe === '7D' || timeframe === '30D') {
      try {
        return DATA_DATE_FORMATTERS.faMonthDay.format(date);
      } catch (e) {
        return DATA_DATE_FORMATTERS.enMonthDay.format(date);
      }
    }
    // 1Y timeframe
    try {
      return DATA_DATE_FORMATTERS.faYearMonth.format(date);
    } catch (e) {
      return DATA_DATE_FORMATTERS.enYearMonth.format(date);
    }
  }

  // Periodic polling from real exchange API endpoints via proxy
  startLiveApiFetchers() {
    // Initial fetch right away
    this.fetchWallexPrices();
    this.fetchWallexSparkline();
    this.fetchNobitexPrices();
    this.fetchNobitexSparkline();
    this.fetchBitpinPrices();
    this.fetchBitpinSparkline();

    // Poll live prices every 6 seconds
    this.livePollTimer = setInterval(() => {
      this.fetchWallexPrices();
      this.fetchNobitexPrices();
      this.fetchBitpinPrices();
    }, 6000);

    // Refresh sparklines every 60 seconds (never clear candle historyCache)
    this.sparklinePollTimer = setInterval(() => {
      this.fetchWallexSparkline();
      this.fetchNobitexSparkline();
      this.fetchBitpinSparkline();
    }, 60000);
  }

  // Fetch live market data for Wallex USDTTMN
  async fetchWallexPrices() {
    try {
      const targetUrl = 'https://api.wallex.ir/v1/markets';
      const proxyUrl = this.getProxyUrl(targetUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const usdt = data.result?.symbols?.USDTTMN;
      if (!usdt || !usdt.stats) return;

      const bid = Math.round(Number(usdt.stats.bidPrice));
      const ask = Math.round(Number(usdt.stats.askPrice));
      const last = Math.round(Number(usdt.stats.lastPrice));
      const ch24h = Number(usdt.stats['24h_ch'] || 0);
      const vol = Math.round(Number(usdt.stats['24h_volume'] || 0));
      const high = Math.round(Number(usdt.stats['24h_highPrice'] || last));
      const low = Math.round(Number(usdt.stats['24h_lowPrice'] || last));

      const wallexRate = this.rates.get('wallex');
      if (wallexRate) {
        const newBuy = Math.max(ask, bid) || last; // user buys from ask
        const newSell = Math.min(ask, bid) || last; // user sells to bid
        if (newBuy > 0 && (newBuy !== wallexRate.buyPrice || newSell !== wallexRate.sellPrice)) {
          const dir = newBuy > wallexRate.buyPrice ? 'up' : (newBuy < wallexRate.buyPrice ? 'down' : 'none');
          wallexRate.buyPrice = newBuy;
          wallexRate.sellPrice = newSell;
          wallexRate.change24h = Number(Number(ch24h).toFixed(2));
          wallexRate.vol24h = vol;
          wallexRate.high24h = high;
          wallexRate.low24h = low;
          wallexRate.lastUpdate = new Date();
          wallexRate.lastDirection = dir;

          this.notify({
            type: 'tick',
            exchangeId: 'wallex',
            direction: dir,
            rate: wallexRate,
            stats: this.getAggregateStats()
          });
        }
      }
    } catch (err) {
      // Quietly ignore
    }
  }

  // Fetch live market stats and order rates for Nobitex USDTIRT
  async fetchNobitexPrices() {
    try {
      const targetUrl = 'https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=irt';
      const proxyUrl = this.getProxyUrl(targetUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const pair = data.stats && data.stats['usdt-irt'];
      if (!pair) return;

      // Nobitex returns IRR (Rials) -> convert to Toman by dividing by 10
      const ask = Math.round(Number(pair.bestSell || pair.latest) / 10);
      const bid = Math.round(Number(pair.bestBuy || pair.latest) / 10);
      const buyPrice = Math.max(ask, bid); // user buys from lowest ask
      const sellPrice = Math.min(ask, bid); // user sells to highest bid
      const lastPrice = Math.round(Number(pair.latest) / 10);
      const change24h = Number(pair.dayChange || 0);
      const vol24h = Math.round(Number(pair.volumeSrc || 0)); // volumeSrc is USDT!
      const high24h = Math.round(Number(pair.dayHigh) / 10);
      const low24h = Math.round(Number(pair.dayLow) / 10);

      const nobitexRate = this.rates.get('nobitex');
      if (nobitexRate && (buyPrice > 0 || lastPrice > 0)) {
        const activeBuy = buyPrice || lastPrice;
        const activeSell = sellPrice || lastPrice;
        if (activeBuy !== nobitexRate.buyPrice || activeSell !== nobitexRate.sellPrice) {
          const dir = activeBuy > nobitexRate.buyPrice ? 'up' : (activeBuy < nobitexRate.buyPrice ? 'down' : 'none');
          nobitexRate.buyPrice = activeBuy;
          nobitexRate.sellPrice = activeSell;
          nobitexRate.change24h = Number(Number(change24h).toFixed(2));
          nobitexRate.vol24h = vol24h;
          nobitexRate.high24h = high24h;
          nobitexRate.low24h = low24h;
          nobitexRate.lastUpdate = new Date();
          nobitexRate.lastDirection = dir;

          this.notify({
            type: 'tick',
            exchangeId: 'nobitex',
            direction: dir,
            rate: nobitexRate,
            stats: this.getAggregateStats()
          });
        }
      }
    } catch (err) {
      console.warn('Nobitex price fetch error:', err.message);
    }
  }

  // Fetch 24h mini sparkline for Wallex via UDF history (1-hour candles over 24h)
  async fetchWallexSparkline() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - 86400;
      const targetUrl = `https://api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=60&from=${from}&to=${now}`;
      const proxyUrl = this.getProxyUrl(targetUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) return;
      const json = await res.json();
      if (json.s === 'ok' && Array.isArray(json.c) && json.c.length > 0) {
        const prices = json.c.map(p => Math.round(Number(p)));
        const wallexRate = this.rates.get('wallex');
        if (wallexRate) {
          wallexRate.sparkline = prices;
          this.notify({
            type: 'tick',
            exchangeId: 'wallex',
            direction: 'none',
            rate: wallexRate,
            stats: this.getAggregateStats()
          });
        }
      }
    } catch (err) {
      // Ignored
    }
  }

  // Fetch 24h mini sparkline for Nobitex
  async fetchNobitexSparkline() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - 86400;
      const targetUrl = `https://apiv2.nobitex.ir/market/udf/history?symbol=USDTIRT&resolution=60&from=${from}&to=${now}`;
      const proxyUrl = this.getProxyUrl(targetUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) return;
      const json = await res.json();
      if (json.s === 'ok' && Array.isArray(json.c) && json.c.length > 0) {
        const prices = json.c.map(p => Math.round(Number(p) / 10)); // Nobitex is always IRR, divide by 10!
        const nobitexRate = this.rates.get('nobitex');
        if (nobitexRate) {
          nobitexRate.sparkline = prices;
          this.notify({
            type: 'tick',
            exchangeId: 'nobitex',
            direction: 'none',
            rate: nobitexRate,
            stats: this.getAggregateStats()
          });
        }
      }
    } catch (err) {
      // Ignored
    }
  }

  // Fetch live market data for Bitpin USDT_IRT
  async fetchBitpinPrices() {
    try {
      const targetUrl = 'https://api.bitpin.ir/v4/mkt/prices/';
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const fetchUrl = isLocal ? (this.getProxyUrl(targetUrl) || targetUrl) : targetUrl;
      const res = await fetch(fetchUrl);
      if (!res.ok) return;
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json?.results ? (Array.isArray(json.results) ? json.results : Object.values(json.results)) : []);
      const bp = list.find(p => p.code === 'USDT_IRT');
      if (!bp) return;

      const price = Math.round(Number(bp.price || bp.order_book_info?.price));
      const high = Math.round(Number(bp.order_book_info?.max || bp.price_info?.max || price));
      const low = Math.round(Number(bp.order_book_info?.min || bp.price_info?.min || price));
      const ch24h = Number((bp.price_info && bp.price_info.change != null) ? bp.price_info.change : (bp.order_book_info?.change ? bp.order_book_info.change * 100 : 0));
      let volUsdt = 0;
      if (bp.order_book_info && bp.order_book_info.amount) {
        volUsdt = Math.round(Number(bp.order_book_info.amount));
      } else if (bp.order_book_info && bp.order_book_info.value && price > 0) {
        volUsdt = Math.round(Number(bp.order_book_info.value) / price);
      } else {
        const existingBp = this.rates.get('bitpin');
        volUsdt = (existingBp && existingBp.vol24h) || 0;
      }

      const bpRate = this.rates.get('bitpin');
      if (bpRate && price > 0) {
        if (price !== bpRate.buyPrice) {
          const dir = price > bpRate.buyPrice ? 'up' : 'down';
          bpRate.buyPrice = price;
          bpRate.sellPrice = price;
          bpRate.change24h = Number(Number(ch24h).toFixed(2));
          bpRate.high24h = high;
          bpRate.low24h = low;
          bpRate.vol24h = volUsdt;
          bpRate.lastUpdate = new Date();
          bpRate.lastDirection = dir;

          this.notify({
            type: 'tick',
            exchangeId: 'bitpin',
            direction: dir,
            rate: bpRate,
            stats: this.getAggregateStats()
          });
        }
      }
    } catch (err) {
      // Ignored
    }
  }

  // Fetch 24h mini sparkline for Bitpin
  async fetchBitpinSparkline() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - 86400;
      const targetUrl = `https://api.bitpin.ir/v1/mkt/tv/get_bars/?symbol=USDT_IRT&res=60&from=${from}&to=${now}`;
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const fetchUrl = isLocal ? (this.getProxyUrl(targetUrl) || targetUrl) : targetUrl;
      const res = await fetch(fetchUrl);
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        const prices = json.map(p => Math.round(Number(p.close)));
        const bpRate = this.rates.get('bitpin');
        if (bpRate) {
          bpRate.sparkline = prices;
          this.notify({
            type: 'tick',
            exchangeId: 'bitpin',
            direction: 'none',
            rate: bpRate,
            stats: this.getAggregateStats()
          });
        }
      }
    } catch (err) {
      // Ignored
    }
  }
}

window.dataAdapter = new DataAdapter();
