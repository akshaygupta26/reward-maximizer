const storageData = {};
global.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get: jest.fn((keys, cb) => {
        const result = {};
        keys.forEach(k => { if (storageData[k]) result[k] = storageData[k]; });
        cb(result);
      }),
      set: jest.fn((obj, cb) => {
        Object.assign(storageData, obj);
        if (cb) cb();
      })
    }
  }
};
global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const { InterceptorHealth } = require('../lib/interceptor-health.js');

describe('InterceptorHealth', () => {
  beforeEach(() => {
    Object.keys(storageData).forEach(k => delete storageData[k]);
    global.chrome.runtime.lastError = null;
    jest.clearAllMocks();
  });

  test('STORAGE_KEY is rmx_interceptor_health', () => {
    expect(InterceptorHealth.STORAGE_KEY).toBe('rmx_interceptor_health');
  });

  test('recordSuccess stores interceptor method and resets failures', async () => {
    await InterceptorHealth.recordSuccess('chase', 42);
    const health = storageData.rmx_interceptor_health;
    expect(health.chase.lastMethod).toBe('interceptor');
    expect(health.chase.lastOfferCount).toBe(42);
    expect(health.chase.consecutiveInterceptorFailures).toBe(0);
    expect(health.chase.lastTimestamp).toBeDefined();
  });

  test('recordFallback stores scraper method and increments failures', async () => {
    await InterceptorHealth.recordFallback('amex', 'no_matching_responses');
    const health = storageData.rmx_interceptor_health;
    expect(health.amex.lastMethod).toBe('scraper');
    expect(health.amex.consecutiveInterceptorFailures).toBe(1);
    expect(health.amex.lastError).toBe('no_matching_responses');
  });

  test('consecutive failures increment correctly', async () => {
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordFallback('chase', 'parse_error');
    const health = storageData.rmx_interceptor_health;
    expect(health.chase.consecutiveInterceptorFailures).toBe(3);
  });

  test('recordSuccess resets consecutive failures', async () => {
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordSuccess('chase', 50);
    const health = storageData.rmx_interceptor_health;
    expect(health.chase.consecutiveInterceptorFailures).toBe(0);
  });

  test('getHealth returns data for known portal', async () => {
    await InterceptorHealth.recordSuccess('chase', 10);
    const result = await InterceptorHealth.getHealth('chase');
    expect(result.lastMethod).toBe('interceptor');
    expect(result.lastOfferCount).toBe(10);
  });

  test('getHealth returns null for unknown portal', async () => {
    const result = await InterceptorHealth.getHealth('unknown');
    expect(result).toBeNull();
  });

  test('getAllHealth returns full health object', async () => {
    await InterceptorHealth.recordSuccess('chase', 10);
    await InterceptorHealth.recordFallback('amex', 'err');
    const all = await InterceptorHealth.getAllHealth();
    expect(all.chase).toBeDefined();
    expect(all.amex).toBeDefined();
  });

  test('storage API errors are contained', async () => {
    global.chrome.runtime.lastError = { message: 'storage unavailable' };
    await expect(InterceptorHealth.recordSuccess('chase', 1)).resolves.toBeUndefined();
    expect(global.debug.error).toHaveBeenCalled();
  });
});
