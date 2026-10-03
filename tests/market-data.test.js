const test = require('node:test');
const assert = require('node:assert/strict');

// 1. Text Normalization Test Suite
function normalizePersianText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[\u064A\u0649]/g, '\u06CC') // Arabic Yeh / Alef Maksura -> Persian Yeh (ی)
    .replace(/\u0643/g, '\u06A9') // Arabic Kaf -> Persian Kaf (ک)
    .replace(/[\u0622\u0623\u0625]/g, '\u0627') // Alef with Madda/Hamza -> Alef (ا)
    .replace(/\u0629/g, '\u0647') // Teh Marbuta -> Heh (ه)
    .replace(/[\u200C\u200D\u200E\u200F\u00A0]/g, '') // Remove ZWNJ, ZWJ, non-breaking space
    .replace(/[\s\-_]/g, '') // remove whitespace and dashes
    .trim();
}

test('Persian and Arabic search text normalization', async (t) => {
  await t.test('converts Arabic Yeh (ي) and Alef Maksura (ى) to Persian Yeh (ی)', () => {
    assert.equal(normalizePersianText('صرافي'), normalizePersianText('صرافی'));
    assert.equal(normalizePersianText('تبديل'), normalizePersianText('تبدیل'));
  });

  await t.test('converts Arabic Kaf (ك) to Persian Kaf (ک)', () => {
    assert.equal(normalizePersianText('نوبيتكس'), normalizePersianText('نوبیتکس'));
    assert.equal(normalizePersianText('والكس'), normalizePersianText('والکس'));
  });

  await t.test('normalizes Alef forms (آ, أ, إ -> ا) and removes ZWNJ', () => {
    assert.equal(normalizePersianText('آبان‌تتر'), normalizePersianText('ابان تتر'));
    assert.equal(normalizePersianText('آبان تتر'), normalizePersianText('آبان‌تتر'));
  });

  await t.test('handles whitespace and case insensitivity', () => {
    assert.equal(normalizePersianText('  BitPin  '), 'bitpin');
    assert.equal(normalizePersianText('WALLEX'), 'wallex');
  });
});

// 2. Price and Currency Formatting Test Suite
function formatPrice(rawToman, currency = 'TOMAN') {
  if (rawToman == null) return '--';
  if (currency === 'RIAL') {
    return (rawToman * 10).toLocaleString('en-US') + ' ریال';
  }
  return rawToman.toLocaleString('en-US') + ' تومان';
}

test('Currency formatting', async (t) => {
  await t.test('formats Toman correctly', () => {
    assert.equal(formatPrice(265000, 'TOMAN'), '265,000 تومان');
  });

  await t.test('formats Rial correctly with x10 multiplier', () => {
    assert.equal(formatPrice(265000, 'RIAL'), '2,650,000 ریال');
  });

  await t.test('handles null/undefined gracefully', () => {
    assert.equal(formatPrice(null, 'TOMAN'), '--');
    assert.equal(formatPrice(undefined, 'RIAL'), '--');
  });
});

// 3. Candle Consolidation Test Suite
function consolidateCandles(rawCandles, maxBars = 140) {
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
      volume: volume
    });
  }
  return result;
}

test('Candle downsampling and consolidation', async (t) => {
  await t.test('preserves series within maxBars limit without change', () => {
    const input = [
      { time: 1000, open: 10, high: 15, low: 8, close: 12, volume: 100 },
      { time: 2000, open: 12, high: 18, low: 11, close: 16, volume: 150 }
    ];
    const out = consolidateCandles(input, 5);
    assert.equal(out.length, 2);
    assert.deepEqual(out, input);
  });

  await t.test('accurately consolidates open, high, low, close, and volume sum across buckets', () => {
    const input = [
      { time: 1000, open: 100, high: 120, low: 90, close: 110, volume: 50 },
      { time: 2000, open: 110, high: 130, low: 105, close: 125, volume: 70 },
      { time: 3000, open: 125, high: 128, low: 95, close: 102, volume: 80 },
      { time: 4000, open: 102, high: 115, low: 99, close: 112, volume: 60 }
    ];
    // maxBars = 2 will bucket size = ceil(4/2) = 2
    const out = consolidateCandles(input, 2);
    assert.equal(out.length, 2);

    // Bucket 1 (points 0, 1): open=100, high=130, low=90, close=125, volume=120
    assert.equal(out[0].open, 100);
    assert.equal(out[0].high, 130);
    assert.equal(out[0].low, 90);
    assert.equal(out[0].close, 125);
    assert.equal(out[0].volume, 120);

    // Bucket 2 (points 2, 3): open=125, high=128, low=95, close=112, volume=140
    assert.equal(out[1].open, 125);
    assert.equal(out[1].high, 128);
    assert.equal(out[1].low, 95);
    assert.equal(out[1].close, 112);
    assert.equal(out[1].volume, 140);
  });
});

// 4. Outlier Rejection and VWAP Calculation
function computeAggregateStats(rates) {
  const valid = rates.filter(r => typeof r.buyPrice === 'number' && r.buyPrice > 50000 && r.buyPrice < 500000 && r.status !== 'failed');
  if (!valid.length) return null;

  const sortedBuys = valid.map(r => r.buyPrice).sort((a, b) => a - b);
  const mid = Math.floor(sortedBuys.length / 2);
  const medianBuy = sortedBuys.length % 2 !== 0 ? sortedBuys[mid] : (sortedBuys[mid - 1] + sortedBuys[mid]) / 2;

  // Exclude > 8% deviation from median
  const pool = valid.filter(r => Math.abs(r.buyPrice - medianBuy) / medianBuy <= 0.08);

  const poolWithVol = pool.filter(item => (Number(item.vol24h) || 0) > 0);
  const vwapPool = poolWithVol.length > 0 ? poolWithVol : pool;

  let totalWeight = 0;
  let weightedBuy = 0;
  let weightedSell = 0;

  vwapPool.forEach(item => {
    const vol = poolWithVol.length > 0 ? Number(item.vol24h) : 1;
    totalWeight += vol;
    weightedBuy += item.buyPrice * vol;
    weightedSell += item.sellPrice * vol;
  });

  return {
    avgBuy: totalWeight > 0 ? Math.round(weightedBuy / totalWeight) : Math.round(medianBuy),
    avgSell: totalWeight > 0 ? Math.round(weightedSell / totalWeight) : Math.round(medianBuy)
  };
}

test('VWAP and outlier price rejection', async (t) => {
  await t.test('rejects crazy rogue spikes beyond 8% from median', () => {
    const rates = [
      { id: 'ex1', buyPrice: 260000, sellPrice: 259500, vol24h: 100000, status: 'live' },
      { id: 'ex2', buyPrice: 261000, sellPrice: 260500, vol24h: 100000, status: 'live' },
      { id: 'ex3', buyPrice: 260500, sellPrice: 260000, vol24h: 100000, status: 'live' },
      { id: 'rogue', buyPrice: 350000, sellPrice: 349000, vol24h: 10000000, status: 'live' } // +34% rogue spike
    ];

    const stats = computeAggregateStats(rates);
    assert.ok(stats);
    // Median is ~260500. Rogue 350000 must be rejected despite having massive volume
    assert.ok(stats.avgBuy < 262000 && stats.avgBuy > 260000);
  });
});

// 5. Proxy Host Allowlist Security
const ALLOWED_PROXY_HOSTS = new Set([
  'api.wallex.ir',
  'wallex.ir',
  'apiv2.nobitex.ir',
  'api.abantether.com',
  'publicapi.ramzinex.ir',
  'service.tetherland.com',
  'market.tetherland.com',
  'api-web.tabdeal.org',
  'api.exir.io',
  'api.bitpin.ir'
]);

test('Proxy security validation', async (t) => {
  await t.test('allows valid Iranian exchange hostnames', () => {
    assert.equal(ALLOWED_PROXY_HOSTS.has('api.wallex.ir'), true);
    assert.equal(ALLOWED_PROXY_HOSTS.has('apiv2.nobitex.ir'), true);
    assert.equal(ALLOWED_PROXY_HOSTS.has('api.bitpin.ir'), true);
  });

  await t.test('rejects internal IP addresses and foreign domains (prevents SSRF)', () => {
    assert.equal(ALLOWED_PROXY_HOSTS.has('127.0.0.1'), false);
    assert.equal(ALLOWED_PROXY_HOSTS.has('localhost'), false);
    assert.equal(ALLOWED_PROXY_HOSTS.has('169.254.169.254'), false);
    assert.equal(ALLOWED_PROXY_HOSTS.has('evil.com'), false);
  });
});
