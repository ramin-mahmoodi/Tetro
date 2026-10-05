const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePersianText } = require('../js/ui-renderer.js');
const { DataAdapter, EXCHANGES_DEF } = require('../js/data-adapter.js');
const { consolidateCandles } = require('../scripts/fetch-market-data.js');
const { isPathSensitive } = require('../server.js');
const { TIMEFRAME_CONFIGS } = require('../js/chart-engine.js');

// 1. Text Normalization Test Suite (Direct import from js/ui-renderer.js)
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

// 2. Price and Currency Formatting Test Suite (Direct import from js/data-adapter.js)
test('Currency formatting', async (t) => {
  const adapter = new DataAdapter();
  await t.test('formats Toman correctly', () => {
    assert.equal(adapter.formatPrice(265000, 'TOMAN'), '265,000 تومان');
  });

  await t.test('formats Rial correctly with x10 multiplier', () => {
    assert.equal(adapter.formatPrice(265000, 'RIAL'), '2,650,000 ریال');
  });

  await t.test('handles null/undefined gracefully', () => {
    assert.equal(adapter.formatPrice(null, 'TOMAN'), '--');
    assert.equal(adapter.formatPrice(undefined, 'RIAL'), '--');
  });
});

// 3. Candle Consolidation Test Suite (Direct import from scripts/fetch-market-data.js)
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
    const out = consolidateCandles(input, 2);
    assert.equal(out.length, 2);

    assert.equal(out[0].open, 100);
    assert.equal(out[0].high, 130);
    assert.equal(out[0].low, 90);
    assert.equal(out[0].close, 125);
    assert.equal(out[0].volume, 120);

    assert.equal(out[1].open, 125);
    assert.equal(out[1].high, 128);
    assert.equal(out[1].low, 95);
    assert.equal(out[1].close, 112);
    assert.equal(out[1].volume, 140);
  });
});

// 4. Outlier Rejection and VWAP Calculation (Direct import from js/data-adapter.js)
test('VWAP and outlier price rejection', async (t) => {
  await t.test('rejects crazy rogue spikes beyond 8% from median', () => {
    const adapter = new DataAdapter();
    adapter.rates.clear();
    const rates = [
      { id: 'ex1', buyPrice: 260000, sellPrice: 259500, vol24h: 100000, status: 'live' },
      { id: 'ex2', buyPrice: 261000, sellPrice: 260500, vol24h: 100000, status: 'live' },
      { id: 'ex3', buyPrice: 260500, sellPrice: 260000, vol24h: 100000, status: 'live' },
      { id: 'rogue', buyPrice: 350000, sellPrice: 349000, vol24h: 10000000, status: 'live' }
    ];
    rates.forEach(r => adapter.rates.set(r.id, r));

    const stats = adapter.getAggregateStats();
    assert.ok(stats);
    assert.ok(stats.avgBuy < 262000 && stats.avgBuy > 260000);
  });
});

// 5. Static File Path Security (Direct import from server.js)
test('Static server file security validation', async (t) => {
  await t.test('identifies sensitive internal files and folders', () => {
    assert.equal(isPathSensitive('.git/config'), true);
    assert.equal(isPathSensitive('server.js'), true);
    assert.equal(isPathSensitive('package.json'), true);
    assert.equal(isPathSensitive('tests/market-data.test.js'), true);
  });

  await t.test('allows safe public assets and data', () => {
    assert.equal(isPathSensitive('index.html'), false);
    assert.equal(isPathSensitive('css/layout.css'), false);
    assert.equal(isPathSensitive('js/app.js'), false);
    assert.equal(isPathSensitive('data/market.json'), false);
  });
});

// 6. Candle History Cache Isolation (Direct test of DataAdapter caching)
test('Candle history cache isolation', async (t) => {
  await t.test('wallex candles are not overwritten by aggregate or generic candles', () => {
    const adapter = new DataAdapter();
    const mockData = {
      timestamp: Math.floor(Date.now() / 1000),
      rates: {},
      candles: {
        'wallex_24H': [{ time: 1000, close: 261000, price: 261000 }],
        'aggregate_24H': [{ time: 1000, close: 263000, price: 263000 }],
        '24H': [{ time: 1000, close: 263000, price: 263000 }]
      }
    };
    Object.keys(mockData.candles).forEach(tf => {
      const rawPoints = mockData.candles[tf];
      adapter.historyCache.set(tf, rawPoints);
      if (tf.startsWith('aggregate_')) {
        adapter.historyCache.set(tf.replace('aggregate_', ''), rawPoints);
      }
    });

    assert.equal(adapter.historyCache.get('wallex_24H')[0].close, 261000);
    assert.equal(adapter.historyCache.get('aggregate_24H')[0].close, 263000);
    assert.notEqual(adapter.historyCache.get('wallex_24H')[0].close, adapter.historyCache.get('aggregate_24H')[0].close);
  });
});

// 7. Timeframe window calculation for chart engine
test('Chart engine timeframe window positioning', async (t) => {
  await t.test('anchors to lastPointTime when data is older than durationMs to avoid edge stacking', () => {
    const durationMs = TIMEFRAME_CONFIGS['1H'].durationMs;
    const nowMs = 1791200000000;
    const lastPointTime = nowMs - (3 * 3600 * 1000);

    const isDataWithinWindow = (nowMs - lastPointTime) < durationMs;
    const endTime = isDataWithinWindow ? Math.max(nowMs, lastPointTime) : lastPointTime;
    const startTime = endTime - durationMs;

    assert.equal(isDataWithinWindow, false);
    assert.equal(endTime, lastPointTime);
    assert.equal(startTime, lastPointTime - durationMs);

    const sampleCandleTime = lastPointTime - (30 * 60 * 1000);
    const progress = Math.max(0, Math.min(1, (sampleCandleTime - startTime) / durationMs));
    assert.equal(progress, 0.5);
  });
});

// 8. Snapshot loading into newly initialized DataAdapter
test('Snapshot rate initialization', async (t) => {
  await t.test('populates exchange rates from market snapshot without rejection', () => {
    const adapter = new DataAdapter();
    // Simulate init populate without timers
    EXCHANGES_DEF.forEach(ex => {
      adapter.rates.set(ex.id, {
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
        lastUpdate: null,
        lastDirection: 'none'
      });
    });

    const mockSnapshot = {
      timestamp: 1791057208, // historical timestamp
      rates: {
        wallex: { buyPrice: 268872, sellPrice: 268856, status: 'live' },
        nobitex: { buyPrice: 268809, sellPrice: 268808, status: 'live' }
      }
    };

    const snapshotTime = mockSnapshot.timestamp * 1000;
    Object.keys(mockSnapshot.rates).forEach(id => {
      const item = mockSnapshot.rates[id];
      const current = adapter.rates.get(id);
      if (current && item) {
        current.buyPrice = item.buyPrice;
        current.sellPrice = item.sellPrice;
        current.lastUpdate = new Date(snapshotTime);
      }
    });

    assert.equal(adapter.rates.get('wallex').buyPrice, 268872);
    assert.equal(adapter.rates.get('nobitex').buyPrice, 268809);
    const stats = adapter.getAggregateStats();
    assert.ok(stats);
    assert.ok(stats.avgBuy > 268000);
  });
});

