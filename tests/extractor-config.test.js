const ExtractorConfig = require('../lib/extractor-config');

describe('ExtractorConfig', () => {
  beforeEach(() => {
    ExtractorConfig.useInterceptors = true;
  });

  test('has correct default properties', () => {
    expect(ExtractorConfig.useInterceptors).toBe(true);
    expect(ExtractorConfig.interceptorTimeout).toBe(12000);
    expect(ExtractorConfig.activationDelay).toBe(1000);
    expect(ExtractorConfig.maxConcurrentActivations).toBe(1);
    expect(ExtractorConfig.logRawResponses).toBe(false);
  });

  test('has all 9 portals configured', () => {
    const keys = Object.keys(ExtractorConfig.portals);
    expect(keys).toHaveLength(9);
    expect(keys).toEqual(expect.arrayContaining([
      'amex', 'chase', 'citi', 'capital-one', 'bofa',
      'discover', 'usbank', 'rakuten', 'capital-one-shopping',
    ]));
  });

  test('bank portals have interceptor enabled', () => {
    for (const p of ['amex', 'chase', 'citi', 'capital-one', 'bofa', 'discover', 'usbank']) {
      expect(ExtractorConfig.portals[p].interceptor).toBe(true);
      expect(ExtractorConfig.portals[p].fallbackToScraper).toBe(true);
    }
  });

  test('cashback portals have interceptor disabled', () => {
    for (const p of ['rakuten', 'capital-one-shopping']) {
      expect(ExtractorConfig.portals[p].interceptor).toBe(false);
      expect(ExtractorConfig.portals[p].fallbackToScraper).toBe(true);
    }
  });

  describe('isInterceptorEnabled', () => {
    test('returns true for enabled portals', () => {
      expect(ExtractorConfig.isInterceptorEnabled('amex')).toBe(true);
      expect(ExtractorConfig.isInterceptorEnabled('chase')).toBe(true);
    });

    test('returns false for disabled portals', () => {
      expect(ExtractorConfig.isInterceptorEnabled('rakuten')).toBe(false);
    });

    test('returns false when master toggle is off', () => {
      ExtractorConfig.useInterceptors = false;
      expect(ExtractorConfig.isInterceptorEnabled('amex')).toBe(false);
    });

    test('returns false for unknown portal', () => {
      expect(ExtractorConfig.isInterceptorEnabled('nonexistent')).toBe(false);
    });
  });

  describe('isFallbackEnabled', () => {
    test('returns true for configured portals', () => {
      expect(ExtractorConfig.isFallbackEnabled('amex')).toBe(true);
    });

    test('returns true for unknown portal', () => {
      expect(ExtractorConfig.isFallbackEnabled('nonexistent')).toBe(true);
    });
  });

  describe('getRandomizedDelay', () => {
    test('returns values within ±30% range over 50 iterations', () => {
      for (let i = 0; i < 50; i++) {
        const delay = ExtractorConfig.getRandomizedDelay();
        expect(delay).toBeGreaterThanOrEqual(700);
        expect(delay).toBeLessThanOrEqual(1300);
      }
    });
  });
});
