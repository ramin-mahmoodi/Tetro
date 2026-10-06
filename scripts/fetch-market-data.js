/**
 * TETRO MARKET DATA SYNC SCRIPT
 * Runs periodically (e.g. via GitHub Actions every 10 minutes)
 * Fetches live exchange rates and candle history, saving to data/market.json
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'market.json');

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

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*'
};

async function safeFetchJson(targetUrl, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(targetUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[WARN] ${targetUrl} returned HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (text.trim().startsWith('<')) {
      console.warn(`[WARN] ${targetUrl} returned HTML instead of JSON`);
      return null;
    }
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[ERROR] Fetch failed for ${targetUrl}:`, err.message);
    return null;
  }
}

async function fetchWallexPrices() {
  // 1. Primary: Real-time Spot Markets API (matches orderbook & tradingview UDF candles exactly)
  const fData = await safeFetchJson('https://api.wallex.ir/v1/markets');
  if (fData && fData.result && fData.result.symbols && fData.result.symbols.USDTTMN) {
    const usdt = fData.result.symbols.USDTTMN;
    if (usdt.stats) {
      const ask = Math.round(Number(usdt.stats.askPrice || usdt.stats.lastPrice));
      const bid = Math.round(Number(usdt.stats.bidPrice || usdt.stats.lastPrice));
      const buyPrice = Math.max(ask, bid); // user buys from ask
      const sellPrice = Math.min(ask, bid); // user sells to bid
      const high = Math.round(Number(usdt.stats['24h_highPrice'] || buyPrice));
      const low = Math.round(Number(usdt.stats['24h_lowPrice'] || sellPrice));
      return {
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        change24h: Number(usdt.stats['24h_ch'] || 0),
        high24h: Math.max(high, buyPrice),
        low24h: Math.min(low, sellPrice),
        vol24h: Math.round(Number(usdt.stats['24h_volume'] || 0)) // USDT volume!
      };
    }
  }

  // 2. Fallback: coin-prices-list
  const data = await safeFetchJson('https://wallex.ir/api/coin-prices-list?v=1&keys=USDT');
  if (data && data.result && data.result.markets && data.result.markets[0]) {
    const m = data.result.markets[0];
    const tmn = m.quotes && m.quotes.TMN;
    if (tmn && tmn.price) {
      const price = Math.round(Number(tmn.price));
      return {
        buyPrice: price,
        sellPrice: price,
        change24h: Number(tmn.change24h || 0),
        high24h: Math.round(Number(tmn.dailyHighPrice || price)),
        low24h: Math.round(Number(tmn.dailyLowPrice || price)),
        vol24h: 0
      };
    }
  }

  return null;
}

async function fetchNobitexPrices() {
  const data = await safeFetchJson('https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=irt');
  if (data && data.stats && data.stats['usdt-irt']) {
    const pair = data.stats['usdt-irt'];
    const ask = Math.round(Number(pair.bestSell || pair.latest) / 10);
    const bid = Math.round(Number(pair.bestBuy || pair.latest) / 10);
    const buyPrice = Math.max(ask, bid); // user buys from lowest ask
    const sellPrice = Math.min(ask, bid); // user sells to highest bid
    return {
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      change24h: Number(pair.dayChange || 0),
      high24h: Math.round(Number(pair.dayHigh || 0) / 10),
      low24h: Math.round(Number(pair.dayLow || 0) / 10),
      vol24h: Math.round(Number(pair.volumeSrc || 0)) // volumeSrc is USDT!
    };
  }
  return null;
}

async function fetchAbanTetherPrices() {
  const json = await safeFetchJson('https://api.abantether.com/manager/coins/data');
  if (json && Array.isArray(json.data)) {
    const usdt = json.data.find(c => c.symbol === 'USDT');
    if (usdt) {
      const pBuy = Math.round(Number(usdt.price_buy));
      const pSell = Math.round(Number(usdt.price_sell));
      const buyPrice = Math.max(pBuy, pSell);
      const sellPrice = Math.min(pBuy, pSell);
      const rawVolToman = Number(usdt.volume24h || 0);
      const volUsdt = (buyPrice > 0 && rawVolToman > 0) ? Math.round(rawVolToman / buyPrice) : 0;
      return {
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        change24h: Number(usdt.percent_change_24h || 0),
        high24h: Math.round(Number(usdt.high_24h || buyPrice)),
        low24h: Math.round(Number(usdt.low_24h || sellPrice)),
        vol24h: volUsdt // Converted to USDT
      };
    }
  }
  return null;
}

async function fetchRamzinexPrices() {
  const json = await safeFetchJson('https://publicapi.ramzinex.ir/exchange/api/v1.0/exchange/pairs');
  if (json && Array.isArray(json.data)) {
    const p11 = json.data.find(p => p.pair_id === 11);
    if (p11 && p11.financial && p11.financial.last24h) {
      const ask = Math.round(Number(p11.sell) / 10);
      const bid = Math.round(Number(p11.buy) / 10);
      const buyPrice = Math.max(ask, bid);
      const sellPrice = Math.min(ask, bid);
      const high = Math.round(Number(p11.financial.last24h.highest) / 10);
      const low = Math.round(Number(p11.financial.last24h.lowest) / 10);
      const volUsdt = Math.round(Number(p11.financial.last24h.base_volume || 0)); // base_volume is USDT
      return {
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        change24h: Number(p11.financial.last24h.change_percent || 0),
        high24h: Math.max(high, buyPrice),
        low24h: Math.min(low, sellPrice),
        vol24h: volUsdt
      };
    }
  }
  return null;
}

/**
 * Mathematically sound OHLCV candle consolidation (downsampling).
 * Instead of discarding samples (which loses highs, lows, and volume),
 * this groups raw candles into contiguous time buckets and consolidates:
 * - open: first candle's open
 * - high: maximum of all highs
 * - low: minimum of all lows
 * - close: last candle's close
 * - volume: sum of all volumes
 * - time: last candle's timestamp
 */
function consolidateCandles(rawCandles, maxBars = 140) {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];
  if (rawCandles.length <= maxBars) {
    return rawCandles;
  }
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
      volume: volume
    });
  }
  return result;
}

/**
 * Computes true aggregate market candles across all active exchanges for a timeframe.
 * Aligns candles into time buckets, averaging open, close, and taking envelope high, low, and sum of volume.
 */
function computeAggregateCandles(exchangeCandlesMap, tf) {
  const tfIntervalMs = {
    '1H': 60 * 1000,
    '24H': 15 * 60 * 1000,
    '7D': 60 * 60 * 1000,
    '30D': 4 * 60 * 60 * 1000,
    '1Y': 24 * 60 * 60 * 1000
  };
  const intervalMs = tfIntervalMs[tf] || (60 * 1000);
  const buckets = new Map();

  Object.keys(exchangeCandlesMap).forEach(sourceKey => {
    const series = exchangeCandlesMap[sourceKey];
    if (Array.isArray(series)) {
      series.forEach(pt => {
        const bucketTime = Math.floor(pt.time / intervalMs) * intervalMs;
        if (!buckets.has(bucketTime)) buckets.set(bucketTime, []);
        buckets.get(bucketTime).push(pt);
      });
    }
  });

  const sortedTimes = Array.from(buckets.keys()).sort((a, b) => a - b);
  return sortedTimes.map(t => {
    const pts = buckets.get(t);
    const avgOpen = Math.round(pts.reduce((s, p) => s + p.open, 0) / pts.length);
    const avgClose = Math.round(pts.reduce((s, p) => s + p.close, 0) / pts.length);
    const maxHigh = Math.max(...pts.map(p => p.high));
    const minLow = Math.min(...pts.map(p => p.low));
    const totalVol = Math.round(pts.reduce((s, p) => s + (p.volume || 0), 0));
    return {
      time: t,
      open: avgOpen,
      high: Math.max(maxHigh, avgOpen, avgClose),
      low: Math.min(minLow, avgOpen, avgClose),
      close: avgClose,
      price: avgClose,
      volume: totalVol
    };
  });
}

const COMMON_TF_MAP = {
  '1H': { resolution: '1', res: '1', sec: 3600, countback: 60 },
  '24H': { resolution: '15', res: '15', sec: 86400, countback: 96 },
  '7D': { resolution: '60', res: '60', sec: 7 * 86400, countback: 168 },
  '30D': { resolution: '240', res: '240', sec: 30 * 86400, countback: 180 },
  '1Y': { resolution: '1D', res: '1D', sec: 365 * 86400, countback: 365 }
};

function parseCandlesFromUdf(json, { divisor = 1, timeframe = '24H' } = {}) {
  if (!json || json.s !== 'ok' || !Array.isArray(json.t) || !Array.isArray(json.c) || json.t.length === 0) {
    return null;
  }
  const timeMap = new Map();
  const nowMs = Date.now();
  for (let i = 0; i < json.t.length; i++) {
    const rawTime = json.t[i] * 1000;
    if (!rawTime || isNaN(rawTime) || rawTime > nowMs + 5 * 60 * 1000) continue;
    const o = Math.round(Number(json.o ? json.o[i] : json.c[i]) / divisor);
    const h = Math.round(Number(json.h ? json.h[i] : json.c[i]) / divisor);
    const l = Math.round(Number(json.l ? json.l[i] : json.c[i]) / divisor);
    const c = Math.round(Number(json.c[i]) / divisor);
    const v = Math.round(Number(json.v ? json.v[i] : 0));
    timeMap.set(rawTime, {
      time: rawTime,
      open: o,
      high: Math.max(h, o, c),
      low: Math.min(l, o, c),
      close: c,
      price: c,
      volume: v
    });
  }
  const raw = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
  const maxBars = timeframe === '1Y' ? 400 : (timeframe === '24H' ? 96 : 140);
  return consolidateCandles(raw, maxBars);
}

function parseCandlesFromArray(arr, { divisor = 1, timeframe = '24H', timeInMs = false } = {}) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const timeMap = new Map();
  const nowMs = Date.now();
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    let rawTime = item.time;
    if (typeof rawTime === 'string') rawTime = new Date(rawTime).getTime();
    else if (typeof rawTime === 'number' && !timeInMs && rawTime < 1e11) rawTime *= 1000;
    if (!rawTime || isNaN(rawTime) || rawTime > nowMs + 5 * 60 * 1000) continue;

    const o = Math.round(Number(item.open != null ? item.open : item.close) / divisor);
    const h = Math.round(Number(item.high != null ? item.high : item.close) / divisor);
    const l = Math.round(Number(item.low != null ? item.low : item.close) / divisor);
    const c = Math.round(Number(item.close) / divisor);
    const v = Math.round(Number(item.volume || 0));

    timeMap.set(rawTime, {
      time: rawTime,
      open: o,
      high: Math.max(h, o, c),
      low: Math.min(l, o, c),
      close: c,
      price: c,
      volume: v
    });
  }
  const raw = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
  const maxBars = timeframe === '1Y' ? 400 : (timeframe === '24H' ? 96 : 140);
  return consolidateCandles(raw, maxBars);
}

async function fetchWallexCandles(timeframe) {
  const cfg = COMMON_TF_MAP[timeframe];
  if (!cfg) return null;
  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=${cfg.resolution}&from=${from}&to=${now}`;
  const json = await safeFetchJson(url);
  return parseCandlesFromUdf(json, { divisor: 1, timeframe });
}

async function fetchAbanTetherCandles(timeframe) {
  const cfg = COMMON_TF_MAP[timeframe];
  if (!cfg) return null;
  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://api.abantether.com/otc_reporting/tradingview/history?symbol=USDT%2FIRT&resolution=${cfg.resolution}&from=${from}&to=${now}&countback=${cfg.countback}`;
  const json = await safeFetchJson(url);
  return parseCandlesFromUdf(json, { divisor: 1, timeframe });
}

async function fetchRamzinexCandles(timeframe) {
  const cfg = COMMON_TF_MAP[timeframe];
  if (!cfg) return null;
  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://publicapi.ramzinex.ir/exchange/api/v1.0/exchange/chart/tv/v2.0/history?symbol=USDTIRR&resolution=${cfg.resolution}&from=${from}&to=${now}&countback=${cfg.countback}`;
  const json = await safeFetchJson(url);
  return parseCandlesFromUdf(json, { divisor: 10, timeframe });
}

function parseTetherlandTime(dtStr) {
  const s = dtStr.trim();
  if (s.includes(' ')) {
    const parts = s.split(' ');
    let tm = parts[1];
    if (tm.length === 2) tm = tm + ':00';
    return new Date(`${parts[0]}T${tm}:00+03:30`).getTime();
  } else {
    return new Date(`${s}T00:00:00+03:30`).getTime();
  }
}

async function fetchTetherLandPrices() {
  const [currJson, volJson] = await Promise.all([
    safeFetchJson('https://service.tetherland.com/api/v4/currencies'),
    safeFetchJson('https://market.tetherland.com/prices')
  ]);

  if (currJson && (currJson.buy_price || currJson.price)) {
    const pBuy = Math.round(Number(currJson.buy_price || currJson.price));
    const pSell = Math.round(Number(currJson.sell_price || currJson.price));
    const buyPrice = Math.max(pBuy, pSell);
    const sellPrice = Math.min(pBuy, pSell);
    const high = Math.round(Number(currJson.last24hMax || buyPrice));
    const low = Math.round(Number(currJson.last24hMin || sellPrice));
    const change = Number(currJson.diff24d || 0);

    let vol = 0;
    if (volJson && volJson.data && volJson.data.markets && volJson.data.markets.USDTTMN && volJson.data.markets.USDTTMN['24h_volume']) {
      const rawToman = Number(volJson.data.markets.USDTTMN['24h_volume']);
      if (rawToman > 0 && buyPrice > 0) {
        vol = Math.round(rawToman / buyPrice);
      }
    }

    return {
      buyPrice,
      sellPrice,
      change24h: change,
      high24h: Math.max(high, buyPrice),
      low24h: Math.min(low, sellPrice),
      vol24h: vol // In USDT
    };
  }
  return null;
}

async function fetchTetherLandCandles(timeframe) {
  let url = '';
  if (timeframe === '1H' || timeframe === '24H') {
    url = 'https://service.tetherland.com/api/v5/chart?rate=1&mode=m';
  } else if (timeframe === '7D') {
    url = 'https://service.tetherland.com/api/v5/chart?rate=7&mode=h';
  } else if (timeframe === '30D') {
    url = 'https://service.tetherland.com/api/v5/chart?rate=30&mode=h';
  } else if (timeframe === '1Y') {
    url = 'https://service.tetherland.com/api/v5/chart?rate=365&mode=d';
  } else {
    return null;
  }

  const json = await safeFetchJson(url);
  if (!json || !json.data || !Array.isArray(json.data.prices) || json.data.prices.length === 0) {
    return null;
  }

  const raw = [...json.data.prices].reverse();
  const parsed = [];
  let lastTime = 0;

  for (const item of raw) {
    const t = parseTetherlandTime(item.datetime);
    if (t > lastTime) {
      parsed.push({ time: t, price: Math.round(Number(item.price)) });
      lastTime = t;
    }
  }

  if (parsed.length === 0) return null;

  if (timeframe === '1H') {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const recent = parsed.filter(p => p.time >= oneHourAgo);
    if (recent.length === 0) {
      const lastP = parsed[parsed.length - 1];
      return [
        { time: oneHourAgo, open: lastP.price, high: lastP.price, low: lastP.price, close: lastP.price, price: lastP.price, volume: 0 },
        { time: now, open: lastP.price, high: lastP.price, low: lastP.price, close: lastP.price, price: lastP.price, volume: 0 }
      ];
    }
    return recent.map(p => ({
      time: p.time,
      open: p.price,
      high: p.price,
      low: p.price,
      close: p.price,
      price: p.price,
      volume: 0
    }));
  }

  const rawCandles = parsed.map(p => ({
    time: p.time,
    open: p.price,
    high: p.price,
    low: p.price,
    close: p.price,
    price: p.price,
    volume: 0
  }));

  const maxBars = timeframe === '1Y' ? 400 : 140;
  return consolidateCandles(rawCandles, maxBars);
}

async function fetchTabdealPrices() {
  const dynJson = await safeFetchJson('https://api-web.tabdeal.org/r/plots/currencies/dynamic-info/');
  const usdtDyn = dynJson && dynJson.currencies && dynJson.currencies.USDT && dynJson.currencies.USDT.IRT;
  if (usdtDyn) {
    const price = Math.round(Number(usdtDyn.price));
    const high24 = Math.round(Number(usdtDyn.high_24 || price));
    const low24 = Math.round(Number(usdtDyn.low_24 || price));
    const change24 = Number(Number(usdtDyn.change_percent_24 || 0).toFixed(2));

    return {
      buyPrice: price,
      sellPrice: price,
      change24h: change24,
      high24h: Math.max(high24, price),
      low24h: Math.min(low24, price),
      vol24h: 0
    };
  }
  return null;
}

async function fetchTabdealCandles(timeframe) {
  const cfg = COMMON_TF_MAP[timeframe];
  if (!cfg) return null;
  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://api-web.tabdeal.org/r/plots/history/?first_currency_symbol=USDT&second_currency_symbol=IRT&from=${from}&to=${now}&resolution=${cfg.resolution}&countback=${cfg.countback}&symbol=USDT_IRT`;
  const json = await safeFetchJson(url);
  return parseCandlesFromArray(json?.data, { divisor: 1, timeframe });
}

async function fetchExirPrices() {
  const json = await safeFetchJson('https://api.exir.io/v2/ticker?symbol=usdt-irt');
  if (json && (json.last || json.close)) {
    const price = Math.round(Number(json.last || json.close));
    const open = Math.round(Number(json.open || price));
    const high = Math.round(Number(json.high || price));
    const low = Math.round(Number(json.low || price));
    const change = open > 0 ? Number((((price - open) / open) * 100).toFixed(2)) : 0;
    const volUsdt = Math.round(Number(json.volume || 0)); // USDT volume!

    return {
      buyPrice: price,
      sellPrice: price,
      change24h: change,
      high24h: Math.max(high, price),
      low24h: Math.min(low, price),
      vol24h: volUsdt,
      time: json.time
    };
  }
  return null;
}

async function fetchExirCandles(timeframe) {
  const cfg = COMMON_TF_MAP[timeframe];
  if (!cfg) return null;
  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://api.exir.io/v2/chart?symbol=usdt-irt&resolution=${cfg.resolution}&from=${from}&to=${now}`;
  const json = await safeFetchJson(url);
  if (!Array.isArray(json)) return null;
  const filtered = json.filter(c => {
    const t = Math.floor(new Date(c.time).getTime() / 1000);
    return t >= from && t <= now + 300;
  });
  return parseCandlesFromArray(filtered, { divisor: 1, timeframe });
}

async function fetchBitpinPrices() {
  let json = await safeFetchJson('https://api.bitpin.ir/v4/mkt/prices/', 12000);
  if (!json) {
    json = await safeFetchJson('https://api.bitpin.org/v4/mkt/prices/', 12000);
  }
  const list = Array.isArray(json) ? json : (json?.results ? (Array.isArray(json.results) ? json.results : Object.values(json.results)) : []);
  if (list.length > 0) {
    const usdt = list.find(p => p.code === 'USDT_IRT');
    if (usdt) {
      const price = Math.round(Number(usdt.price || (usdt.order_book_info && usdt.order_book_info.price)));
      const high = Math.round(Number((usdt.order_book_info && usdt.order_book_info.max) || (usdt.price_info && usdt.price_info.max) || price));
      const low = Math.round(Number((usdt.order_book_info && usdt.order_book_info.min) || (usdt.price_info && usdt.price_info.min) || price));
      const change = Number((usdt.price_info && usdt.price_info.change != null) ? usdt.price_info.change : (usdt.order_book_info && usdt.order_book_info.change ? usdt.order_book_info.change * 100 : 0));
      let volUsdt = 0;
      if (usdt.order_book_info && usdt.order_book_info.amount) {
        volUsdt = Math.round(Number(usdt.order_book_info.amount));
      } else if (usdt.order_book_info && usdt.order_book_info.value && price > 0) {
        volUsdt = Math.round(Number(usdt.order_book_info.value) / price);
      }

      return {
        buyPrice: price,
        sellPrice: price,
        change24h: Number(change.toFixed(2)),
        high24h: Math.max(high, price),
        low24h: Math.min(low, price),
        vol24h: volUsdt
      };
    }
  }
  return null;
}

async function fetchBitpinCandles(timeframe) {
  const cfg = COMMON_TF_MAP[timeframe];
  if (!cfg) return null;
  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  let url = `https://api.bitpin.ir/v1/mkt/tv/get_bars/?symbol=USDT_IRT&res=${cfg.res}&from=${from}&to=${now}`;
  let json = await safeFetchJson(url, 10000);
  if (!json || !Array.isArray(json)) {
    url = `https://api.bitpin.org/v1/mkt/tv/get_bars/?symbol=USDT_IRT&res=${cfg.res}&from=${from}&to=${now}`;
    json = await safeFetchJson(url, 10000);
  }
  return parseCandlesFromArray(json, { divisor: 1, timeframe, timeInMs: true });
}

async function main() {
  console.log('[START] Fetching live market data...');

  // Read existing cache if present to avoid losing history on partial failure
  let existing = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      existing = {};
    }
  }

  const [
    wallexRates, nobitexRates, abantetherRates, ramzinexRates, tetherlandRates, tabdealRates, exirRates, bitpinRates
  ] = await Promise.all([
    fetchWallexPrices(),
    fetchNobitexPrices(),
    fetchAbanTetherPrices(),
    fetchRamzinexPrices(),
    fetchTetherLandPrices(),
    fetchTabdealPrices(),
    fetchExirPrices(),
    fetchBitpinPrices()
  ]);

  const liveResults = {
    wallex: wallexRates,
    nobitex: nobitexRates,
    abantether: abantetherRates,
    ramzinex: ramzinexRates,
    tetherland: tetherlandRates,
    tabdeal: tabdealRates,
    exir: exirRates,
    bitpin: bitpinRates
  };

  const nowIso = new Date().toISOString();
  const rates = {};

  EXCHANGES_DEF.forEach(def => {
    const live = liveResults[def.id];
    const existingRate = (existing.rates && existing.rates[def.id]) || null;
    const initialSpark = (existingRate && existingRate.sparkline) || [];

    if (live && typeof live.buyPrice === 'number' && live.buyPrice > 0) {
      // 1. Live real data successfully received
      const STALE_MAX_AGE_MS = 45 * 60 * 1000;
      const isTickerStale = live.time && (Date.now() - new Date(live.time).getTime() > STALE_MAX_AGE_MS);
      const status = isTickerStale ? 'stale' : 'live';
      const lastSuccessAt = isTickerStale ? new Date(live.time).toISOString() : nowIso;

      rates[def.id] = {
        id: def.id,
        name: def.name,
        faName: def.faName,
        status: status,
        lastSuccessAt: lastSuccessAt,
        buyPrice: live.buyPrice,
        sellPrice: live.sellPrice,
        change24h: live.change24h != null ? Number(Number(live.change24h).toFixed(2)) : 0,
        vol24h: live.vol24h || 0,
        high24h: live.high24h,
        low24h: live.low24h,
        sparkline: initialSpark
      };
      if (isTickerStale) {
        console.warn(`[STALE] Exchange ${def.name}: Ticker last trade was at ${lastSuccessAt} -> marked STALE (Market closed)`);
      } else {
        console.log(`[OK] Exchange ${def.name}: LIVE (${live.buyPrice.toLocaleString()} Toman)`);
      }
    } else if (existingRate && typeof existingRate.buyPrice === 'number' && existingRate.buyPrice > 0) {
      // 2. Live fetch failed, preserve real existing snapshot as stale
      rates[def.id] = {
        id: def.id,
        name: def.name,
        faName: def.faName,
        status: 'stale',
        lastSuccessAt: existingRate.lastSuccessAt || existing.updatedAt || nowIso,
        buyPrice: existingRate.buyPrice,
        sellPrice: existingRate.sellPrice,
        change24h: existingRate.change24h != null ? Number(Number(existingRate.change24h).toFixed(2)) : 0,
        vol24h: existingRate.vol24h || 0,
        high24h: existingRate.high24h,
        low24h: existingRate.low24h,
        sparkline: existingRate.sparkline || []
      };
      console.warn(`[WARN] Exchange ${def.name}: STALE (Preserved snapshot from ${rates[def.id].lastSuccessAt})`);
    } else {
      // 3. Failed: Never invent synthetic prices or mock data
      rates[def.id] = {
        id: def.id,
        name: def.name,
        faName: def.faName,
        status: 'failed',
        lastSuccessAt: null,
        buyPrice: null,
        sellPrice: null,
        change24h: null,
        vol24h: null,
        high24h: null,
        low24h: null,
        sparkline: []
      };
      console.error(`[ERROR] Exchange ${def.name}: FAILED (No live data and no previous snapshot)`);
    }
  });

  const liveCount = Object.values(rates).filter(r => r.status === 'live').length;
  const staleCount = Object.values(rates).filter(r => r.status === 'stale').length;
  console.log(`\n[STATUS SUMMARY] Live: ${liveCount}, Stale/Offline: ${staleCount}/${EXCHANGES_DEF.length}`);

  // Critical threshold check: abort and fail CI if too many exchanges failed completely
  if (liveCount + staleCount < 4) {
    console.error(`[CRITICAL] Only ${liveCount + staleCount}/${EXCHANGES_DEF.length} exchanges fetched successfully. Threshold is 4. Aborting without saving.`);
    process.exit(1);
  }

  // Calculate Volume-Weighted Average Price (VWAP) across all valid rates using authentic volumes
  const validRates = Object.values(rates).filter(r => typeof r.buyPrice === 'number' && r.buyPrice > 50000 && r.buyPrice < 500000);
  let basePrice = existing.basePrice || null;
  if (validRates.length > 0) {
    const ratesWithVol = validRates.filter(r => (r.vol24h || 0) > 0);
    if (ratesWithVol.length > 0) {
      const weightedSum = ratesWithVol.reduce((acc, r) => acc + (r.buyPrice * r.vol24h), 0);
      const weightTotal = ratesWithVol.reduce((acc, r) => acc + r.vol24h, 0);
      basePrice = Math.round(weightedSum / weightTotal);
    } else {
      const sum = validRates.reduce((acc, r) => acc + r.buyPrice, 0);
      basePrice = Math.round(sum / validRates.length);
    }
  }

  // Fetch candle historical sets for chart
  const timeframes = ['1H', '24H', '7D', '30D', '1Y'];
  const candles = (existing.candles && typeof existing.candles === 'object') ? existing.candles : {};

  for (const tf of timeframes) {
    console.log(`[CANDLES] Fetching Wallex ${tf}...`);
    const pts = await fetchWallexCandles(tf);
    if (pts && pts.length > 0) {
      candles[`wallex_${tf}`] = pts;
    }

    console.log(`[CANDLES] Fetching AbanTether ${tf}...`);
    const abanPts = await fetchAbanTetherCandles(tf);
    if (abanPts && abanPts.length > 0) {
      candles[`abantether_${tf}`] = abanPts;
    }

    console.log(`[CANDLES] Fetching Ramzinex ${tf}...`);
    const ramzPts = await fetchRamzinexCandles(tf);
    if (ramzPts && ramzPts.length > 0) {
      candles[`ramzinex_${tf}`] = ramzPts;
    }

    console.log(`[CANDLES] Fetching TetherLand ${tf}...`);
    const tethPts = await fetchTetherLandCandles(tf);
    if (tethPts && tethPts.length > 0) {
      candles[`tetherland_${tf}`] = tethPts;
    }

    console.log(`[CANDLES] Fetching Tabdeal ${tf}...`);
    const tabPts = await fetchTabdealCandles(tf);
    if (tabPts && tabPts.length > 0) {
      candles[`tabdeal_${tf}`] = tabPts;
    }

    console.log(`[CANDLES] Fetching Exir ${tf}...`);
    const exirPts = await fetchExirCandles(tf);
    if (exirPts && exirPts.length > 0) {
      candles[`exir_${tf}`] = exirPts;
    }

    console.log(`[CANDLES] Fetching Bitpin ${tf}...`);
    const bitpinPts = await fetchBitpinCandles(tf);
    if (bitpinPts && bitpinPts.length > 0) {
      candles[`bitpin_${tf}`] = bitpinPts;
    }

    // Compute true aggregate candles across active exchanges with fresh data
    const tfMaxAgeMs = {
      '1H': 90 * 60 * 1000,
      '24H': 48 * 3600 * 1000,
      '7D': 14 * 86400 * 1000,
      '30D': 60 * 86400 * 1000,
      '1Y': 400 * 86400 * 1000
    };
    const maxAge = tfMaxAgeMs[tf] || (48 * 3600 * 1000);
    const nowSync = Date.now();

    const isFresh = (series) => {
      if (!Array.isArray(series) || series.length === 0) return false;
      const last = series[series.length - 1];
      const t = last.time instanceof Date ? last.time.getTime() : Number(last.time);
      return (nowSync - t) <= maxAge;
    };

    const activeFeeds = {};
    if (isFresh(candles[`wallex_${tf}`])) activeFeeds.wallex = candles[`wallex_${tf}`];
    if (isFresh(candles[`abantether_${tf}`])) activeFeeds.abantether = candles[`abantether_${tf}`];
    if (isFresh(candles[`ramzinex_${tf}`])) activeFeeds.ramzinex = candles[`ramzinex_${tf}`];
    if (isFresh(candles[`tabdeal_${tf}`])) activeFeeds.tabdeal = candles[`tabdeal_${tf}`];
    if (isFresh(candles[`exir_${tf}`])) activeFeeds.exir = candles[`exir_${tf}`];
    if (isFresh(candles[`bitpin_${tf}`])) activeFeeds.bitpin = candles[`bitpin_${tf}`];

    const aggPts = computeAggregateCandles(activeFeeds, tf);
    if (aggPts && aggPts.length > 0) {
      candles[`aggregate_${tf}`] = aggPts;
    } else if (candles[`wallex_${tf}`]) {
      candles[`aggregate_${tf}`] = candles[`wallex_${tf}`];
    }
    delete candles[tf]; // Eliminate duplicate root keys
  }

  // Compute accurate 24H high & low from actual candles so table matches chart
  if (candles['abantether_24H'] && candles['abantether_24H'].length > 0 && rates.abantether && rates.abantether.buyPrice != null) {
    const abanCandles = candles['abantether_24H'];
    rates.abantether.high24h = Math.max(...abanCandles.map(p => p.high), rates.abantether.buyPrice);
    rates.abantether.low24h = Math.min(...abanCandles.map(p => p.low), rates.abantether.sellPrice);
  }

  if (candles['wallex_24H'] && candles['wallex_24H'].length > 0 && rates.wallex && rates.wallex.buyPrice != null) {
    const wallexCandles = candles['wallex_24H'];
    rates.wallex.high24h = Math.max(...wallexCandles.map(p => p.high), rates.wallex.buyPrice);
    rates.wallex.low24h = Math.min(...wallexCandles.map(p => p.low), rates.wallex.sellPrice);
  }

  if (candles['ramzinex_24H'] && candles['ramzinex_24H'].length > 0 && rates.ramzinex && rates.ramzinex.buyPrice != null) {
    const ramzCandles = candles['ramzinex_24H'];
    rates.ramzinex.high24h = Math.max(...ramzCandles.map(p => p.high), rates.ramzinex.buyPrice);
    rates.ramzinex.low24h = Math.min(...ramzCandles.map(p => p.low), rates.ramzinex.sellPrice);
  }

  if (candles['tetherland_24H'] && candles['tetherland_24H'].length > 0 && rates.tetherland && rates.tetherland.buyPrice != null) {
    const tethCandles = candles['tetherland_24H'];
    rates.tetherland.high24h = Math.max(...tethCandles.map(p => p.high), rates.tetherland.high24h || rates.tetherland.buyPrice, rates.tetherland.buyPrice);
    rates.tetherland.low24h = Math.min(...tethCandles.map(p => p.low), rates.tetherland.low24h || rates.tetherland.sellPrice, rates.tetherland.sellPrice);
  }

  if (candles['tabdeal_24H'] && candles['tabdeal_24H'].length > 0 && rates.tabdeal && rates.tabdeal.buyPrice != null) {
    const tabCandles = candles['tabdeal_24H'];
    rates.tabdeal.high24h = Math.max(...tabCandles.map(p => p.high), rates.tabdeal.high24h || rates.tabdeal.buyPrice, rates.tabdeal.buyPrice);
    rates.tabdeal.low24h = Math.min(...tabCandles.map(p => p.low), rates.tabdeal.low24h || rates.tabdeal.sellPrice, rates.tabdeal.sellPrice);
    const totalUsdtVol = tabCandles.reduce((acc, c) => acc + (c.volume || 0), 0);
    if (totalUsdtVol > 0) {
      rates.tabdeal.vol24h = Math.round(totalUsdtVol); // USDT volume (not multiplied by buyPrice)!
    }
  }

  if (candles['exir_24H'] && candles['exir_24H'].length > 0 && rates.exir && rates.exir.buyPrice != null) {
    const exirCandles = candles['exir_24H'];
    rates.exir.high24h = Math.max(...exirCandles.map(p => p.high), rates.exir.high24h || rates.exir.buyPrice, rates.exir.buyPrice);
    rates.exir.low24h = Math.min(...exirCandles.map(p => p.low), rates.exir.low24h || rates.exir.sellPrice, rates.exir.sellPrice);
  }

  if (candles['bitpin_24H'] && candles['bitpin_24H'].length > 0 && rates.bitpin && rates.bitpin.buyPrice != null) {
    const bitpinCandles = candles['bitpin_24H'];
    rates.bitpin.high24h = Math.max(...bitpinCandles.map(p => p.high), rates.bitpin.high24h || rates.bitpin.buyPrice, rates.bitpin.buyPrice);
    rates.bitpin.low24h = Math.min(...bitpinCandles.map(p => p.low), rates.bitpin.low24h || rates.bitpin.sellPrice, rates.bitpin.sellPrice);
  }

  // Ensure high24h >= buyPrice, low24h <= sellPrice, positive spread, and 2 decimal places for all exchanges
  Object.keys(rates).forEach(id => {
    const r = rates[id];
    if (r.buyPrice != null && r.sellPrice != null) {
      if (r.buyPrice < r.sellPrice) {
        const tmp = r.buyPrice;
        r.buyPrice = r.sellPrice;
        r.sellPrice = tmp;
      }
      if (r.high24h != null && r.high24h < r.buyPrice) r.high24h = r.buyPrice;
      if (r.low24h != null && r.low24h > r.sellPrice) r.low24h = r.sellPrice;
    }
    if (r.change24h != null) {
      r.change24h = Number(Number(r.change24h).toFixed(2));
    }
  });

  // Derive table 24h sparklines directly from the exact 24H candles of each exchange!
  const sparklineMap = {
    wallex: 'wallex_24H',
    bitpin: 'bitpin_24H',
    ramzinex: 'ramzinex_24H',
    abantether: 'abantether_24H',
    tetherland: 'tetherland_24H',
    tabdeal: 'tabdeal_24H',
    exir: 'exir_24H'
  };

  const CANDLE_STALE_MAX_AGE_MS = 45 * 60 * 1000;
  const nowTimestamp = Date.now();

  Object.keys(sparklineMap).forEach(id => {
    const cKey = sparklineMap[id];
    const series = candles[cKey] || candles[cKey.replace('wallex_', '')];
    if (series && Array.isArray(series) && series.length > 0 && rates[id]) {
      // 100% exact copy of the 24H candle close prices shown on the main chart!
      rates[id].sparkline = series.map(c => Math.round(Number(c.close || c.price)));

      // If the latest candle in the 24H series is older than 45 minutes, mark exchange stale/offline (e.g. night halt)
      const lastCandle = series[series.length - 1];
      const candleTime = lastCandle.time instanceof Date ? lastCandle.time.getTime() : Number(lastCandle.time);
      if (nowTimestamp - candleTime > CANDLE_STALE_MAX_AGE_MS) {
        rates[id].status = 'stale';
        rates[id].lastSuccessAt = new Date(candleTime).toISOString();
        console.warn(`[STALE] Exchange ${rates[id].name}: Last 24H candle is ${Math.round((nowTimestamp - candleTime) / 60000)} mins old -> marked STALE (Market closed)`);
      }
    }
  });

  const output = {
    updatedAt: new Date().toISOString(),
    timestamp: Math.floor(Date.now() / 1000),
    basePrice: basePrice,
    rates: rates,
    candles: candles
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[SUCCESS] Saved updated market data to ${DATA_FILE} at ${output.updatedAt}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[FATAL] Script error:', err);
    process.exit(1);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    consolidateCandles,
    computeAggregateCandles,
    parseCandlesFromArray,
    parseCandlesFromUdf,
    COMMON_TF_MAP
  };
}
