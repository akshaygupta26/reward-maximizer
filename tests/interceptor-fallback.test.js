global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const ExtractorConfig = require('../lib/extractor-config.js');
const { BaseInterceptor } = require('../content/interceptors/base-interceptor.js');

describe('Interceptor Fallback Integration', () => {
  describe('ExtractorConfig toggles', () => {
    test('master toggle disables all interceptors', () => {
      const orig = ExtractorConfig.useInterceptors;
      ExtractorConfig.useInterceptors = false;
      expect(ExtractorConfig.isInterceptorEnabled('chase')).toBe(false);
      expect(ExtractorConfig.isInterceptorEnabled('amex')).toBe(false);
      ExtractorConfig.useInterceptors = orig;
    });

    test('rakuten interceptor disabled by default', () => {
      expect(ExtractorConfig.isInterceptorEnabled('rakuten')).toBe(false);
    });

    test('capital-one-shopping interceptor disabled by default', () => {
      expect(ExtractorConfig.isInterceptorEnabled('capital-one-shopping')).toBe(false);
    });

    test('fallback enabled for all portals', () => {
      ['amex', 'chase', 'citi', 'capital-one', 'bofa', 'discover', 'usbank', 'rakuten'].forEach(p => {
        expect(ExtractorConfig.isFallbackEnabled(p)).toBe(true);
      });
    });

    test('fallback defaults to true for unknown portals', () => {
      expect(ExtractorConfig.isFallbackEnabled('nonexistent')).toBe(true);
    });
  });

  describe('BaseInterceptor message filtering', () => {
    test('rejects foreign message types', () => {
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: { type: 'OTHER_EXT' } })).toBeNull();
    });

    test('rejects non-object data', () => {
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: 'string' })).toBeNull();
    });

    test('accepts valid interceptor messages', () => {
      const result = BaseInterceptor.parseMessageFromMainWorld({
        data: { type: 'RMX_INTERCEPTOR_BRIDGE', portal: 'chase', action: 'api_response', payload: [] }
      });
      expect(result.portal).toBe('chase');
    });
  });

  describe('Data quality assessment', () => {
    test('accepts fully populated offers', () => {
      expect(BaseInterceptor.assessDataQuality({
        merchant: 'Target', value: '5% back', expiry: '03/15/2026'
      })).toBe(true);
    });

    test('rejects placeholder-only offers', () => {
      expect(BaseInterceptor.assessDataQuality({
        merchant: 'Unknown', value: 'See details', expiry: 'Check portal'
      })).toBe(false);
    });

    test('accepts 2 of 3 real fields', () => {
      expect(BaseInterceptor.assessDataQuality({
        merchant: 'Target', value: '$20 back', expiry: 'Check portal'
      })).toBe(true);
    });
  });

  describe('Interceptor empty handling', () => {
    // Set up mocks for portal interceptors that need global.BaseInterceptor
    beforeAll(() => {
      global.BaseInterceptor = {
        normalizeOffer: jest.fn(r => r),
        MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
        generateMainWorldScript: jest.fn(() => ''),
      };
      global.ExtractorConfig = { logRawResponses: false };
    });

    test('Chase handles null/empty', () => {
      jest.resetModules();
      const { ChaseInterceptor } = require('../content/interceptors/chase-interceptor.js');
      expect(ChaseInterceptor.parseOffers(null, {})).toEqual([]);
      expect(ChaseInterceptor.parseOffers({}, {})).toEqual([]);
    });

    test('Amex handles null/empty', () => {
      jest.resetModules();
      const { AmexInterceptor } = require('../content/interceptors/amex-interceptor.js');
      expect(AmexInterceptor.parseOffers(null, {})).toEqual([]);
      expect(AmexInterceptor.parseOffers({}, {})).toEqual([]);
    });
  });

  describe('InterceptorHealth tracking', () => {
    const storageData = {};
    beforeEach(() => {
      Object.keys(storageData).forEach(k => delete storageData[k]);
      global.chrome = {
        storage: {
          local: {
            get: jest.fn((keys, cb) => {
              const result = {};
              keys.forEach(k => { if (storageData[k]) result[k] = storageData[k]; });
              cb(result);
            }),
            set: jest.fn((obj, cb) => { Object.assign(storageData, obj); if (cb) cb(); })
          }
        }
      };
    });

    test('tracks failures then resets on success', async () => {
      jest.resetModules();
      const { InterceptorHealth } = require('../lib/interceptor-health.js');
      await InterceptorHealth.recordFallback('chase', 'timeout');
      await InterceptorHealth.recordFallback('chase', 'no_data');
      let health = await InterceptorHealth.getHealth('chase');
      expect(health.consecutiveInterceptorFailures).toBe(2);

      await InterceptorHealth.recordSuccess('chase', 72);
      health = await InterceptorHealth.getHealth('chase');
      expect(health.consecutiveInterceptorFailures).toBe(0);
      expect(health.lastMethod).toBe('interceptor');
    });
  });
});
