global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
global.BaseInterceptor = {
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
  generateMainWorldScript: jest.fn(() => 'mock_script'),
  normalizeOffer: jest.fn(raw => ({ ...raw, normalized: true })),
  sanitize: jest.fn(v => v),
};
global.Categories = { detectCategory: jest.fn(() => 'shopping') };
global.ExtractorConfig = { logRawResponses: false };

const { ChaseInterceptor } = require('../content/interceptors/chase-interceptor.js');

describe('ChaseInterceptor', () => {
  beforeEach(() => jest.clearAllMocks());

  test('has correct portal and source', () => {
    expect(ChaseInterceptor.portal).toBe('chase');
    expect(ChaseInterceptor.source).toBe('chase');
  });

  test('urlPatterns contains relevant patterns', () => {
    const joined = ChaseInterceptor.urlPatterns.join(' ');
    expect(joined).toMatch(/offer|commerce/i);
  });

  describe('parseOffers', () => {
    test('extracts from {offers: [...]}', () => {
      const offers = ChaseInterceptor.parseOffers({
        offers: [
          { merchantName: 'Store1', rewardValue: '$20 back', offerId: 'o1' },
          { merchantName: 'Store2', rewardValue: '5% back', offerId: 'o2' }
        ]
      }, { url: '/offers' });
      expect(offers.length).toBe(2);
      expect(BaseInterceptor.normalizeOffer).toHaveBeenCalledTimes(2);
    });

    test('extracts from top-level array', () => {
      const offers = ChaseInterceptor.parseOffers([
        { merchantName: 'Direct', rewardValue: '$10 back' }
      ], { url: '/offers' });
      expect(offers.length).toBe(1);
    });

    test('returns empty for unrecognized format', () => {
      expect(ChaseInterceptor.parseOffers({ random: 'data' }, {})).toEqual([]);
    });

    test('handles null/undefined', () => {
      expect(ChaseInterceptor.parseOffers(null, {})).toEqual([]);
      expect(ChaseInterceptor.parseOffers(undefined, {})).toEqual([]);
    });

    test('skips entries without merchant name', () => {
      const offers = ChaseInterceptor.parseOffers({
        offers: [
          { rewardValue: '$20 back' }, // no merchant
          { merchantName: 'Valid', rewardValue: '$10 back' }
        ]
      }, {});
      expect(offers.length).toBe(1);
    });

    test('finds nested offer arrays via heuristic', () => {
      const offers = ChaseInterceptor.parseOffers({
        wrapper: {
          inner: {
            items: [{ merchantName: 'Nested', rewardValue: '$5 back' }]
          }
        }
      }, {});
      expect(offers.length).toBe(1);
    });
  });

  describe('isOfferResponse', () => {
    test('true for offer-related URLs', () => {
      expect(ChaseInterceptor.isOfferResponse({ url: '/api/commerce/offers' })).toBe(true);
      expect(ChaseInterceptor.isOfferResponse({ url: '/merchantOffers/list' })).toBe(true);
    });

    test('false for unrelated URLs', () => {
      expect(ChaseInterceptor.isOfferResponse({ url: '/api/accounts/balance' })).toBe(false);
    });
  });
});
