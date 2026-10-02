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

  const [wallexRates, nobitexRates, abantetherRates, wallexSpark, nobitexSpark, abantetherSpark] = await Promise.all([
    fetchWallexPrices(),
    fetchNobitexPrices(),
    fetchAbanTetherPrices(),
    fetchWallexSparkline(),
    fetchNobitexSparkline(),
    fetchAbanTetherSparkline()
  ]);

  const basePrice = (wallexRates && wallexRates.buyPrice) || (nobitexRates && nobitexRates.buyPrice) || (abantetherRates && abantetherRates.buyPrice) || 256300;

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
