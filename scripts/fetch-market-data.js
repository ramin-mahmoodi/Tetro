/**
 * TETRO MARKET DATA SYNC SCRIPT
 * Runs periodically (e.g. via GitHub Actions every 10 minutes)
 * Fetches live exchange rates and candle history, saving to data/market.json
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'market.json');

const EXCHANGES_DEF = [
  { id: 'nobitex', name: 'Nobitex', faName: 'نوبیتکس', baseBuy: 256350, baseSell: 256200, vol24h: 3820000, change24h: 0.55 },
  { id: 'wallex', name: 'Wallex', faName: 'والکس', baseBuy: 256300, baseSell: 256250, vol24h: 2150000, change24h: 0.53 },
  { id: 'ramzinex', name: 'Ramzinex', faName: 'رمزینکس', baseBuy: 256320, baseSell: 256190, vol24h: 1740000, change24h: 0.48 },
  { id: 'abantether', name: 'AbanTether', faName: 'آبان‌تتر', baseBuy: 256420, baseSell: 256300, vol24h: 3100000, change24h: 0.65 },
  { id: 'tetherland', name: 'TetherLand', faName: 'تترلند', baseBuy: 256380, baseSell: 256280, vol24h: 2950000, change24h: 0.58 },
  { id: 'tabdeal', name: 'Tabdeal', faName: 'تبدیل', baseBuy: 256360, baseSell: 256210, vol24h: 1420000, change24h: 0.42 },
  { id: 'exir', name: 'Exir', faName: 'اکسیر', baseBuy: 256400, baseSell: 256240, vol24h: 980000, change24h: 0.52 },
  { id: 'binance', name: 'Global USDT', faName: 'تتر جهانی', baseBuy: 256370, baseSell: 256360, vol24h: 18450000, change24h: 0.02, isGlobal: true }
];

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*'
};

async function safeFetchJson(url, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[WARN] ${url} returned HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (text.trim().startsWith('<')) {
      console.warn(`[WARN] ${url} returned HTML instead of JSON`);
      return null;
    }
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[ERROR] Fetch failed for ${url}:`, err.message);
    return null;
  }
}

async function fetchWallexPrices() {
  // 1. Primary: Real-time Spot Markets API (matches orderbook & tradingview UDF candles exactly)
  const fData = await safeFetchJson('https://api.wallex.ir/v1/markets');
  if (fData && fData.result && fData.result.symbols && fData.result.symbols.USDTTMN) {
    const usdt = fData.result.symbols.USDTTMN;
    if (usdt.stats) {
      const buyPrice = Math.round(Number(usdt.stats.askPrice || usdt.stats.lastPrice));
      const sellPrice = Math.round(Number(usdt.stats.bidPrice || usdt.stats.lastPrice));
      const high = Math.round(Number(usdt.stats['24h_highPrice'] || buyPrice));
      const low = Math.round(Number(usdt.stats['24h_lowPrice'] || sellPrice));
      return {
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        change24h: Number(usdt.stats['24h_ch'] || 0),
        high24h: Math.max(high, buyPrice),
        low24h: Math.min(low, sellPrice),
        vol24h: Math.round(Number(usdt.stats['24h_tmnVolume'] || usdt.stats['24h_volume'] || 0))
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
        high24h: Math.round(Number(tmn.dailyHighPrice || price * 1.005)),
        low24h: Math.round(Number(tmn.dailyLowPrice || price * 0.995)),
        vol24h: 2150000
      };
    }
  }

  return null;
}

async function fetchNobitexPrices() {
  const data = await safeFetchJson('https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=irt');
  if (data && data.stats && data.stats['usdt-irt']) {
    const pair = data.stats['usdt-irt'];
    const buyPrice = Math.round(Number(pair.bestBuy || pair.latest) / 10);
    const sellPrice = Math.round(Number(pair.bestSell || pair.latest) / 10);
    return {
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      change24h: Number(pair.dayChange || 0),
      high24h: Math.round(Number(pair.dayHigh || 0) / 10),
      low24h: Math.round(Number(pair.dayLow || 0) / 10),
      vol24h: Math.round(Number(pair.volumeSrc || 0))
    };
  }
  return null;
}

async function fetchAbanTetherPrices() {
  const json = await safeFetchJson('https://api.abantether.com/manager/coins/data');
  if (json && Array.isArray(json.data)) {
    const usdt = json.data.find(c => c.symbol === 'USDT');
    if (usdt) {
      return {
        buyPrice: Math.round(Number(usdt.price_buy)),
        sellPrice: Math.round(Number(usdt.price_sell)),
        change24h: Number(usdt.percent_change_24h || 0),
        high24h: Math.round(Number(usdt.high_24h || 0)),
        low24h: Math.round(Number(usdt.low_24h || 0)),
        vol24h: Math.round(Number(usdt.volume24h || 0))
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
      const buyPrice = Math.round(Number(p11.sell) / 10);
      const sellPrice = Math.round(Number(p11.buy) / 10);
      const high = Math.round(Number(p11.financial.last24h.highest) / 10);
      const low = Math.round(Number(p11.financial.last24h.lowest) / 10);
      return {
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        change24h: Number(p11.financial.last24h.change_percent || 0),
        high24h: Math.max(high, buyPrice),
        low24h: Math.min(low, sellPrice),
        vol24h: Math.round(Number(p11.financial.last24h.quote_volume) / 10)
      };
    }
  }
  return null;
}

async function fetchWallexCandles(timeframe) {
  const tfMap = {
    '1H': { resolution: '1', sec: 3600 },
    '24H': { resolution: '15', sec: 86400 },
    '7D': { resolution: '60', sec: 7 * 86400 },
    '30D': { resolution: '240', sec: 30 * 86400 },
    '1Y': { resolution: '1D', sec: 365 * 86400 }
  };
  const cfg = tfMap[timeframe];
  if (!cfg) return null;

  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=${cfg.resolution}&from=${from}&to=${now}`;
  const json = await safeFetchJson(url);

  if (json && json.s === 'ok' && Array.isArray(json.t) && Array.isArray(json.c) && json.t.length > 0) {
    const points = [];
    const step = Math.max(1, Math.floor(json.t.length / 140));
    for (let i = 0; i < json.t.length; i += step) {
      points.push({
        time: json.t[i] * 1000,
        open: Math.round(Number(json.o ? json.o[i] : json.c[i])),
        high: Math.round(Number(json.h ? json.h[i] : json.c[i])),
        low: Math.round(Number(json.l ? json.l[i] : json.c[i])),
        close: Math.round(Number(json.c[i])),
        price: Math.round(Number(json.c[i])),
        volume: Math.round(Number(json.v ? json.v[i] : 0))
      });
    }
    const lastIdx = json.t.length - 1;
    const lastTime = json.t[lastIdx] * 1000;
    if (points.length && points[points.length - 1].time !== lastTime) {
      points.push({
        time: lastTime,
        open: Math.round(Number(json.o ? json.o[lastIdx] : json.c[lastIdx])),
        high: Math.round(Number(json.h ? json.h[lastIdx] : json.c[lastIdx])),
        low: Math.round(Number(json.l ? json.l[lastIdx] : json.c[lastIdx])),
        close: Math.round(Number(json.c[lastIdx])),
        price: Math.round(Number(json.c[lastIdx])),
        volume: Math.round(Number(json.v ? json.v[lastIdx] : 0))
      });
    }
    return points;
  }
  return null;
}

async function fetchWallexSparkline() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;
  const url = `https://api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=60&from=${from}&to=${now}`;
  const json = await safeFetchJson(url);
  if (json && json.s === 'ok' && Array.isArray(json.c) && json.c.length > 0) {
    return json.c.map(p => Math.round(Number(p)));
  }
  return null;
}

async function fetchNobitexSparkline() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;
  const url = `https://apiv2.nobitex.ir/market/udf/history?symbol=USDTIRT&resolution=60&from=${from}&to=${now}`;
  const json = await safeFetchJson(url);
  if (json && json.s === 'ok' && Array.isArray(json.c) && json.c.length > 0) {
    const divisor = Number(json.c[0]) > 1000000 ? 10 : 1;
    return json.c.map(p => Math.round(Number(p) / divisor));
  }
  return null;
}

async function fetchAbanTetherSparkline() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;
  const url = `https://api.abantether.com/otc_reporting/tradingview/history?symbol=USDT%2FIRT&resolution=60&from=${from}&to=${now}&countback=24`;
  const json = await safeFetchJson(url);
  if (json && json.s === 'ok' && Array.isArray(json.c) && json.c.length > 0) {
    return json.c.map(p => Math.round(Number(p)));
  }
  return null;
}

async function fetchAbanTetherCandles(timeframe) {
  const tfMap = {
    '1H': { resolution: '1', sec: 3600, countback: 60 },
    '24H': { resolution: '15', sec: 86400, countback: 96 },
    '7D': { resolution: '60', sec: 7 * 86400, countback: 168 },
    '30D': { resolution: '240', sec: 30 * 86400, countback: 180 },
    '1Y': { resolution: '1D', sec: 365 * 86400, countback: 365 }
  };
  const cfg = tfMap[timeframe];
  if (!cfg) return null;

  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://api.abantether.com/otc_reporting/tradingview/history?symbol=USDT%2FIRT&resolution=${cfg.resolution}&from=${from}&to=${now}&countback=${cfg.countback}`;
  const json = await safeFetchJson(url);

  if (json && json.s === 'ok' && Array.isArray(json.t) && Array.isArray(json.c) && json.t.length > 0) {
    const points = [];
    const step = Math.max(1, Math.floor(json.t.length / 140));
    for (let i = 0; i < json.t.length; i += step) {
      points.push({
        time: json.t[i] * 1000,
        open: Math.round(Number(json.o ? json.o[i] : json.c[i])),
        high: Math.round(Number(json.h ? json.h[i] : json.c[i])),
        low: Math.round(Number(json.l ? json.l[i] : json.c[i])),
        close: Math.round(Number(json.c[i])),
        price: Math.round(Number(json.c[i])),
        volume: Math.round(Number(json.v ? json.v[i] : 0))
      });
    }
    const lastIdx = json.t.length - 1;
    const lastTime = json.t[lastIdx] * 1000;
    if (points.length && points[points.length - 1].time !== lastTime) {
      points.push({
        time: lastTime,
        open: Math.round(Number(json.o ? json.o[lastIdx] : json.c[lastIdx])),
        high: Math.round(Number(json.h ? json.h[lastIdx] : json.c[lastIdx])),
        low: Math.round(Number(json.l ? json.l[lastIdx] : json.c[lastIdx])),
        close: Math.round(Number(json.c[lastIdx])),
        price: Math.round(Number(json.c[lastIdx])),
        volume: Math.round(Number(json.v ? json.v[lastIdx] : 0))
      });
    }
    return points;
  }
  return null;
}

async function fetchRamzinexSparkline() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;
  const url = `https://publicapi.ramzinex.ir/exchange/api/v1.0/exchange/chart/tv/v2.0/history?symbol=USDTIRR&resolution=60&from=${from}&to=${now}&countback=24`;
  const json = await safeFetchJson(url);
  if (json && json.s === 'ok' && Array.isArray(json.c) && json.c.length > 0) {
    return json.c.map(p => Math.round(Number(p) / 10));
  }
  return null;
}

async function fetchRamzinexCandles(timeframe) {
  const tfMap = {
    '1H': { resolution: '1', sec: 3600, countback: 60 },
    '24H': { resolution: '15', sec: 86400, countback: 96 },
    '7D': { resolution: '60', sec: 7 * 86400, countback: 168 },
    '30D': { resolution: '240', sec: 30 * 86400, countback: 180 },
    '1Y': { resolution: '1D', sec: 365 * 86400, countback: 365 }
  };
  const cfg = tfMap[timeframe];
  if (!cfg) return null;

  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://publicapi.ramzinex.ir/exchange/api/v1.0/exchange/chart/tv/v2.0/history?symbol=USDTIRR&resolution=${cfg.resolution}&from=${from}&to=${now}&countback=${cfg.countback}`;
  const json = await safeFetchJson(url);

  if (json && json.s === 'ok' && Array.isArray(json.t) && Array.isArray(json.c) && json.t.length > 0) {
    const points = [];
    const step = Math.max(1, Math.floor(json.t.length / 140));
    for (let i = 0; i < json.t.length; i += step) {
      points.push({
        time: json.t[i] * 1000,
        open: Math.round(Number(json.o ? json.o[i] : json.c[i]) / 10),
        high: Math.round(Number(json.h ? json.h[i] : json.c[i]) / 10),
        low: Math.round(Number(json.l ? json.l[i] : json.c[i]) / 10),
        close: Math.round(Number(json.c[i]) / 10),
        price: Math.round(Number(json.c[i]) / 10),
        volume: Math.round(Number(json.v ? json.v[i] : 0))
      });
    }
    const lastIdx = json.t.length - 1;
    const lastTime = json.t[lastIdx] * 1000;
    if (points.length && points[points.length - 1].time !== lastTime) {
      points.push({
        time: lastTime,
        open: Math.round(Number(json.o ? json.o[lastIdx] : json.c[lastIdx]) / 10),
        high: Math.round(Number(json.h ? json.h[lastIdx] : json.c[lastIdx]) / 10),
        low: Math.round(Number(json.l ? json.l[lastIdx] : json.c[lastIdx]) / 10),
        close: Math.round(Number(json.c[lastIdx]) / 10),
        price: Math.round(Number(json.c[lastIdx]) / 10),
        volume: Math.round(Number(json.v ? json.v[lastIdx] : 0))
      });
    }
    return points;
  }
  return null;
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
    const buyPrice = Math.round(Number(currJson.buy_price || currJson.price));
    const sellPrice = Math.round(Number(currJson.sell_price || currJson.price));
    const high = Math.round(Number(currJson.last24hMax || buyPrice));
    const low = Math.round(Number(currJson.last24hMin || sellPrice));
    const change = Number(currJson.diff24d || 0);

    let vol = 2950000;
    if (volJson && volJson.data && volJson.data.markets && volJson.data.markets.USDTTMN && volJson.data.markets.USDTTMN['24h_volume']) {
      vol = Math.round(Number(volJson.data.markets.USDTTMN['24h_volume']) / 10);
    }

    return {
      buyPrice,
      sellPrice,
      change24h: change,
      high24h: Math.max(high, buyPrice),
      low24h: Math.min(low, sellPrice),
      vol24h: vol
    };
  }
  return null;
}

async function fetchTetherLandSparkline() {
  const json = await safeFetchJson('https://service.tetherland.com/api/v5/chart?rate=1&mode=h');
  if (json && json.data && Array.isArray(json.data.prices) && json.data.prices.length > 0) {
    const reversed = [...json.data.prices].reverse();
    return reversed.map(p => Math.round(Number(p.price)));
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
    let curPrice = parsed[0].price;
    for (const p of parsed) {
      if (p.time <= oneHourAgo) curPrice = p.price;
    }
    const minutePoints = [];
    for (let m = 60; m >= 0; m--) {
      const t = Math.floor((now - m * 60000) / 60000) * 60000;
      const applicable = parsed.filter(p => p.time <= t);
      const pVal = applicable.length > 0 ? applicable[applicable.length - 1].price : curPrice;
      minutePoints.push({
        time: t,
        open: pVal,
        high: pVal,
        low: pVal,
        close: pVal,
        price: pVal,
        volume: 0
      });
    }
    return minutePoints;
  }

  const points = [];
  const step = Math.max(1, Math.floor(parsed.length / 140));
  for (let i = 0; i < parsed.length; i += step) {
    const item = parsed[i];
    const prevItem = i > 0 ? parsed[i - 1] : item;
    points.push({
      time: item.time,
      open: prevItem.price,
      high: Math.max(prevItem.price, item.price),
      low: Math.min(prevItem.price, item.price),
      close: item.price,
      price: item.price,
      volume: 0
    });
  }

  const latestRaw = parsed[parsed.length - 1];
  if (points.length > 0 && points[points.length - 1].time !== latestRaw.time) {
    const prev = points[points.length - 1];
    points.push({
      time: latestRaw.time,
      open: prev.close,
      high: Math.max(prev.close, latestRaw.price),
      low: Math.min(prev.close, latestRaw.price),
      close: latestRaw.price,
      price: latestRaw.price,
      volume: 0
    });
  }

  return points;
}

async function fetchTabdealPrices() {
  const dynJson = await safeFetchJson('https://api-web.tabdeal.org/r/plots/currencies/dynamic-info/');
  const usdtDyn = dynJson && dynJson.currencies && dynJson.currencies.USDT && dynJson.currencies.USDT.IRT;
  if (usdtDyn) {
    const price = Math.round(Number(usdtDyn.price));
    const high24 = Math.round(Number(usdtDyn.high_24 || price));
    const low24 = Math.round(Number(usdtDyn.low_24 || price));
    const change24 = Number(usdtDyn.change_percent_24 || 0);

    return {
      buyPrice: price,
      sellPrice: price,
      change24h: change24,
      high24h: Math.max(high24, price),
      low24h: Math.min(low24, price),
      vol24h: 1420000
    };
  }
  return null;
}

async function fetchTabdealSparkline() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;
  const url = `https://api-web.tabdeal.org/r/plots/history/?first_currency_symbol=USDT&second_currency_symbol=IRT&from=${from}&to=${now}&resolution=60&countback=24&symbol=USDT_IRT`;
  const json = await safeFetchJson(url);
  if (json && Array.isArray(json.data) && json.data.length > 0) {
    return json.data.map(c => Math.round(Number(c.close)));
  }
  return null;
}

async function fetchTabdealCandles(timeframe) {
  const tfMap = {
    '1H': { resolution: '1', sec: 3600, countback: 60 },
    '24H': { resolution: '15', sec: 86400, countback: 96 },
    '7D': { resolution: '60', sec: 7 * 86400, countback: 168 },
    '30D': { resolution: '240', sec: 30 * 86400, countback: 180 },
    '1Y': { resolution: '1D', sec: 365 * 86400, countback: 365 }
  };
  const cfg = tfMap[timeframe];
  if (!cfg) return null;

  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.sec;
  const url = `https://api-web.tabdeal.org/r/plots/history/?first_currency_symbol=USDT&second_currency_symbol=IRT&from=${from}&to=${now}&resolution=${cfg.resolution}&countback=${cfg.countback}&symbol=USDT_IRT`;
  const json = await safeFetchJson(url);

  if (json && Array.isArray(json.data) && json.data.length > 0) {
    const raw = json.data;
    const points = [];
    const step = Math.max(1, Math.floor(raw.length / 140));
    for (let i = 0; i < raw.length; i += step) {
      const item = raw[i];
      points.push({
        time: item.time * 1000,
        open: Math.round(Number(item.open)),
        high: Math.round(Number(item.high)),
        low: Math.round(Number(item.low)),
        close: Math.round(Number(item.close)),
        price: Math.round(Number(item.close)),
        volume: Math.round(Number(item.volume || 0))
      });
    }

    const lastIdx = raw.length - 1;
    const lastTime = raw[lastIdx].time * 1000;
    if (points.length > 0 && points[points.length - 1].time !== lastTime) {
      const last = raw[lastIdx];
      points.push({
        time: lastTime,
        open: Math.round(Number(last.open)),
        high: Math.round(Number(last.high)),
        low: Math.round(Number(last.low)),
        close: Math.round(Number(last.close)),
        price: Math.round(Number(last.close)),
        volume: Math.round(Number(last.volume || 0))
      });
    }

    return points;
  }
  return null;
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
    wallexRates, nobitexRates, abantetherRates, ramzinexRates, tetherlandRates, tabdealRates,
    wallexSpark, nobitexSpark, abantetherSpark, ramzinexSpark, tetherlandSpark, tabdealSpark
  ] = await Promise.all([
    fetchWallexPrices(),
    fetchNobitexPrices(),
    fetchAbanTetherPrices(),
    fetchRamzinexPrices(),
    fetchTetherLandPrices(),
    fetchTabdealPrices(),
    fetchWallexSparkline(),
    fetchNobitexSparkline(),
    fetchAbanTetherSparkline(),
    fetchRamzinexSparkline(),
    fetchTetherLandSparkline(),
    fetchTabdealSparkline()
  ]);

  const basePrice = (wallexRates && wallexRates.buyPrice) || (nobitexRates && nobitexRates.buyPrice) || (abantetherRates && abantetherRates.buyPrice) || (ramzinexRates && ramzinexRates.buyPrice) || (tetherlandRates && tetherlandRates.buyPrice) || (tabdealRates && tabdealRates.buyPrice) || 256300;

  // Build exchange rates map
  const rates = {};
  EXCHANGES_DEF.forEach(def => {
    let item = {
      id: def.id,
      name: def.name,
      faName: def.faName,
      buyPrice: def.baseBuy,
      sellPrice: def.baseSell,
      change24h: def.change24h,
      vol24h: def.vol24h,
      high24h: Math.round(def.baseBuy * 1.01),
      low24h: Math.round(def.baseBuy * 0.99),
      sparkline: (existing.rates && existing.rates[def.id] && existing.rates[def.id].sparkline) || []
    };

    if (def.id === 'wallex' && wallexRates) {
      item = { ...item, ...wallexRates };
      if (wallexSpark) item.sparkline = wallexSpark;
    } else if (def.id === 'nobitex' && nobitexRates) {
      item = { ...item, ...nobitexRates };
      if (nobitexSpark) item.sparkline = nobitexSpark;
    } else if (def.id === 'abantether' && abantetherRates) {
      item = { ...item, ...abantetherRates };
      if (abantetherSpark) item.sparkline = abantetherSpark;
    } else if (def.id === 'ramzinex' && ramzinexRates) {
      item = { ...item, ...ramzinexRates };
      if (ramzinexSpark) item.sparkline = ramzinexSpark;
    } else if (def.id === 'tetherland' && tetherlandRates) {
      item = { ...item, ...tetherlandRates };
      if (tetherlandSpark) item.sparkline = tetherlandSpark;
    } else if (def.id === 'tabdeal' && tabdealRates) {
      item = { ...item, ...tabdealRates };
      if (tabdealSpark) item.sparkline = tabdealSpark;
    } else {
      // Offset slightly relative to active basePrice
      const diff = def.baseBuy - 256300;
      item.buyPrice = basePrice + diff;
      item.sellPrice = basePrice + diff - 80;
      item.high24h = Math.round(item.buyPrice * 1.008);
      item.low24h = Math.round(item.buyPrice * 0.992);
    }
    rates[def.id] = item;
  });

  // Fetch candle historical sets for chart
  const timeframes = ['1H', '24H', '7D', '30D', '1Y'];
  const candles = (existing.candles && typeof existing.candles === 'object') ? existing.candles : {};

  for (const tf of timeframes) {
    console.log(`[CANDLES] Fetching Wallex ${tf}...`);
    const pts = await fetchWallexCandles(tf);
    if (pts && pts.length > 0) {
      candles[tf] = pts;
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
  }

  // Compute accurate 24H high & low from actual candles so table matches chart
  if (candles['abantether_24H'] && candles['abantether_24H'].length > 0 && rates.abantether) {
    const abanCandles = candles['abantether_24H'];
    rates.abantether.high24h = Math.max(...abanCandles.map(p => p.high), rates.abantether.buyPrice);
    rates.abantether.low24h = Math.min(...abanCandles.map(p => p.low), rates.abantether.sellPrice);
  }

  if (candles['24H'] && candles['24H'].length > 0 && rates.wallex) {
    const wallexCandles = candles['24H'];
    rates.wallex.high24h = Math.max(...wallexCandles.map(p => p.high), rates.wallex.buyPrice);
    rates.wallex.low24h = Math.min(...wallexCandles.map(p => p.low), rates.wallex.sellPrice);
  }

  if (candles['ramzinex_24H'] && candles['ramzinex_24H'].length > 0 && rates.ramzinex) {
    const ramzCandles = candles['ramzinex_24H'];
    rates.ramzinex.high24h = Math.max(...ramzCandles.map(p => p.high), rates.ramzinex.buyPrice);
    rates.ramzinex.low24h = Math.min(...ramzCandles.map(p => p.low), rates.ramzinex.sellPrice);
  }

  if (candles['tetherland_24H'] && candles['tetherland_24H'].length > 0 && rates.tetherland) {
    const tethCandles = candles['tetherland_24H'];
    rates.tetherland.high24h = Math.max(...tethCandles.map(p => p.high), rates.tetherland.high24h, rates.tetherland.buyPrice);
    rates.tetherland.low24h = Math.min(...tethCandles.map(p => p.low), rates.tetherland.low24h, rates.tetherland.sellPrice);
  }

  if (candles['tabdeal_24H'] && candles['tabdeal_24H'].length > 0 && rates.tabdeal) {
    const tabCandles = candles['tabdeal_24H'];
    rates.tabdeal.high24h = Math.max(...tabCandles.map(p => p.high), rates.tabdeal.high24h, rates.tabdeal.buyPrice);
    rates.tabdeal.low24h = Math.min(...tabCandles.map(p => p.low), rates.tabdeal.low24h, rates.tabdeal.sellPrice);
    const totalUsdtVol = tabCandles.reduce((acc, c) => acc + (c.volume || 0), 0);
    if (totalUsdtVol > 0) {
      rates.tabdeal.vol24h = Math.round(totalUsdtVol * rates.tabdeal.buyPrice);
    }
  }

  // Ensure high24h >= buyPrice and low24h <= sellPrice for all exchanges
  Object.keys(rates).forEach(id => {
    const r = rates[id];
    if (r.high24h < r.buyPrice) r.high24h = r.buyPrice;
    if (r.low24h > r.sellPrice) r.low24h = r.sellPrice;
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

main().catch(err => {
  console.error('[FATAL] Script error:', err);
  process.exit(1);
});
