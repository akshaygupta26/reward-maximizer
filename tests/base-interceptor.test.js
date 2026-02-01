global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const { BaseInterceptor } = require('../content/interceptors/base-interceptor.js');

describe('BaseInterceptor', () => {
  describe('MESSAGE_TYPE', () => {
    test('has unique identifier', () => {
      expect(BaseInterceptor.MESSAGE_TYPE).toBe('RMX_INTERCEPTOR_BRIDGE');
    });
  });

  describe('generateMainWorldScript', () => {
    test('returns string containing fetch/XHR/message type/portal', () => {
      const script = BaseInterceptor.generateMainWorldScript({
        portal: 'chase',
        urlPatterns: ['/offers', '/commerce'],
        captureActivation: true
      });
      expect(typeof script).toBe('string');
      expect(script).toContain('fetch');
      expect(script).toContain('XMLHttpRequest');
      expect(script).toContain('RMX_INTERCEPTOR_BRIDGE');
      expect(script).toContain('chase');
    });

    test('includes URL patterns', () => {
      const script = BaseInterceptor.generateMainWorldScript({
        portal: 'amex',
        urlPatterns: ['/api/offers', '/enrollment']
      });
      expect(script).toContain('/api/offers');
      expect(script).toContain('/enrollment');
    });
  });

  describe('normalizeOffer', () => {
    test('produces full offer from complete raw data', () => {
      const result = BaseInterceptor.normalizeOffer({
        merchant: 'TestStore',
        value: '$20 cash back',
        expiry: '03/15/2026',
        offerId: 'offer_123',
        activationUrl: '/api/activate',
        eligibleCards: ['card1', 'card2'],
        minSpend: 50,
        maxReward: 100,
        status: 'available'
      }, 'chase');
      expect(result.merchant).toBe('TestStore');
      expect(result.value).toBe('$20 cash back');
      expect(result.expiry).toBe('03/15/2026');
      expect(result.valueType).toBe('fixed');
      expect(result.offerId).toBe('offer_123');
      expect(result.eligibleCards).toEqual(['card1', 'card2']);
      expect(result.timestamp).toBeDefined();
    });

    test('defaults new fields to null when missing', () => {
      const result = BaseInterceptor.normalizeOffer({ merchant: 'Store', value: '5% back' }, 'amex');
      expect(result.offerId).toBeNull();
      expect(result.activationUrl).toBeNull();
      expect(result.eligibleCards).toBeNull();
      expect(result.minSpend).toBeNull();
      expect(result.maxReward).toBeNull();
      expect(result.status).toBeNull();
    });

    test('detects valueType correctly', () => {
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: '5% back' }, 's').valueType).toBe('percent');
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: '$20 off' }, 's').valueType).toBe('fixed');
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: '3x points' }, 's').valueType).toBe('multiplier');
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: 'See details' }, 's').valueType).toBe('unknown');
    });
  });

  describe('parseMessageFromMainWorld', () => {
    test('returns null for invalid messages', () => {
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: { type: 'WRONG' } })).toBeNull();
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: 'string' })).toBeNull();
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: null })).toBeNull();
      expect(BaseInterceptor.parseMessageFromMainWorld(null)).toBeNull();
    });

    test('returns payload for valid messages', () => {
      const result = BaseInterceptor.parseMessageFromMainWorld({
        data: {
          type: 'RMX_INTERCEPTOR_BRIDGE',
          portal: 'chase',
          action: 'offers_captured',
          payload: [{ merchant: 'Test' }]
        }
      });
      expect(result.portal).toBe('chase');
      expect(result.action).toBe('offers_captured');
      expect(result.payload).toEqual([{ merchant: 'Test' }]);
    });
  });

  describe('sanitize', () => {
    test('strips HTML tags', () => {
      expect(BaseInterceptor.sanitize('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello');
      expect(BaseInterceptor.sanitize('<b>Bold</b> text')).toBe('Bold text');
    });

    test('handles non-string inputs', () => {
      expect(BaseInterceptor.sanitize(42)).toBe(42);
      expect(BaseInterceptor.sanitize(null)).toBe(null);
      expect(BaseInterceptor.sanitize(undefined)).toBe(undefined);
    });

    test('truncates long strings', () => {
      const long = 'a'.repeat(600);
      expect(BaseInterceptor.sanitize(long).length).toBe(500);
    });
  });

  describe('assessDataQuality', () => {
    test('returns true when >50% populated', () => {
      expect(BaseInterceptor.assessDataQuality({ merchant: 'Store', value: '$20 back', expiry: '03/15/2026' })).toBe(true);
      expect(BaseInterceptor.assessDataQuality({ merchant: 'Store', value: '$20 back', expiry: 'Check portal' })).toBe(true);
    });

    test('returns false when <=50% populated', () => {
      expect(BaseInterceptor.assessDataQuality({ merchant: 'Store' })).toBe(false);
      expect(BaseInterceptor.assessDataQuality({ merchant: 'Unknown', value: 'See details' })).toBe(false);
    });

    test('returns false for null/empty', () => {
      expect(BaseInterceptor.assessDataQuality(null)).toBe(false);
      expect(BaseInterceptor.assessDataQuality({})).toBe(false);
    });
  });

  describe('generateActivationScript', () => {
    test('returns string containing fetch and portal', () => {
      const script = BaseInterceptor.generateActivationScript({
        url: '/api/activate', method: 'POST', headers: {}, body: { id: 1 }, portal: 'chase'
      });
      expect(typeof script).toBe('string');
      expect(script).toContain('/api/activate');
      expect(script).toContain('chase');
      expect(script).toContain('activation_result');
    });
  });
});
