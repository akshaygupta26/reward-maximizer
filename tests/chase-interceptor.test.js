global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
const { BaseInterceptor: RealBase } = require('../content/interceptors/base-interceptor.js');
global.BaseInterceptor = {
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
  generateMainWorldScript: jest.fn(() => 'mock_script'),
  normalizeOffer: jest.fn(raw => ({ ...raw, normalized: true })),
  sanitize: jest.fn(v => v),
  findOfferArray: RealBase.findOfferArray.bind(RealBase),
};
global.Categories = { detectCategory: jest.fn(() => 'shopping') };
global.ExtractorConfig = { logRawResponses: false };

const { ChaseInterceptor } = require('../content/interceptors/chase-interceptor.js');

// Helper: build a real Chase API response shape
function makeChaseResponse(offers, accountId) {
  return {
    customerOffers: [{
      digitalAccountIdentifier: accountId || 1042655050,
      offers: offers
    }]
  };
}

// Helper: build a single Chase offer in real API format
function makeChaseOffer(overrides) {
  return {
    offerIdentifier: 'CDLX:1000230024:1000230024-c',
    offerStatusName: 'NEW',
    merchantDetails: { merchantName: 'QDOBA' },
    offerDetails: {
      offerStartTimestamp: '2026-01-19T05:00:00Z',
      offerEndTimestamp: '2026-02-18T04:59:59Z',
      remainingDaysCount: 16,
      offerOptions: [{
        offerRewardTypeCode: 'PERCENTAGE',
        offerAmount: 7.0,
        maximumRewardOfferAmount: 4.0,
        minimumSpendingAmount: 0.0
      }]
    },
    offerDisplayDetails: {
      shortMessageText: 'Earn 7% cash back!',
      offerHeaderText: '7% cash back'
    },
    offerCategories: [{ offerCategoryName: 'FOOD' }],
    ...overrides
  };
}

describe('ChaseInterceptor', () => {
  beforeEach(() => jest.clearAllMocks());

  test('has correct portal and source', () => {
    expect(ChaseInterceptor.portal).toBe('chase');
    expect(ChaseInterceptor.source).toBe('chase');
  });

  test('urlPatterns contains customer-offers', () => {
    const joined = ChaseInterceptor.urlPatterns.join(' ');
    expect(joined).toContain('customer-offers');
  });

  describe('parseOffers — real API schema', () => {
    test('extracts from customerOffers[0].offers', () => {
      const response = makeChaseResponse([
        makeChaseOffer(),
        makeChaseOffer({ merchantDetails: { merchantName: 'Target' }, offerIdentifier: 'CDLX:2' })
      ]);
      const offers = ChaseInterceptor.parseOffers(response, { url: '/customer-offers' });
      expect(offers.length).toBe(2);
      expect(BaseInterceptor.normalizeOffer).toHaveBeenCalledTimes(2);
    });

    test('extracts merchant name from merchantDetails.merchantName', () => {
      const response = makeChaseResponse([makeChaseOffer()]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.merchant).toBe('QDOBA');
    });

    test('extracts value from offerHeaderText', () => {
      const response = makeChaseResponse([makeChaseOffer()]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.value).toBe('7% cash back');
    });

    test('falls back to shortMessageText when no offerHeaderText', () => {
      const offer = makeChaseOffer();
      offer.offerDisplayDetails.offerHeaderText = null;
      const response = makeChaseResponse([offer]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.value).toBe('Earn 7% cash back!');
    });

    test('extracts offerId from offerIdentifier', () => {
      const response = makeChaseResponse([makeChaseOffer()]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.offerId).toBe('CDLX:1000230024:1000230024-c');
    });

    test('extracts status from offerStatusName', () => {
      const response = makeChaseResponse([
        makeChaseOffer({ offerStatusName: 'ACTIVATED' })
      ]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.status).toBe('ACTIVATED');
    });

    test('formats expiry from offerEndTimestamp', () => {
      const response = makeChaseResponse([makeChaseOffer()]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      // Date formatting depends on local timezone; just verify it's a date pattern
      expect(call.expiry).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    test('extracts minSpend and maxReward from offerOptions', () => {
      const offer = makeChaseOffer();
      offer.offerDetails.offerOptions = [{
        offerRewardTypeCode: 'DOLLAR',
        offerAmount: 10.0,
        maximumRewardOfferAmount: 10.0,
        minimumSpendingAmount: 99.0
      }];
      const response = makeChaseResponse([offer]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.minSpend).toBe(99);
      expect(call.maxReward).toBe(10);
    });

    test('preserves minSpend/maxReward of 0', () => {
      const response = makeChaseResponse([makeChaseOffer()]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.minSpend).toBe(0);
      expect(call.maxReward).toBe(4);
    });

    test('extracts category from offerCategories', () => {
      const response = makeChaseResponse([makeChaseOffer()]);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.merchantCategory).toBe('food');
    });

    test('extracts eligibleCards from digitalAccountIdentifier', () => {
      const response = makeChaseResponse([makeChaseOffer()], 9876543);
      ChaseInterceptor.parseOffers(response, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.eligibleCards).toEqual(['9876543']);
    });
  });

  describe('parseOffers — edge cases', () => {
    test('extracts from top-level array', () => {
      const offers = ChaseInterceptor.parseOffers([
        makeChaseOffer()
      ], {});
      expect(offers.length).toBe(1);
    });

    test('returns empty for unrecognized format', () => {
      expect(ChaseInterceptor.parseOffers({ random: 'data' }, {})).toEqual([]);
    });

    test('handles null/undefined', () => {
      expect(ChaseInterceptor.parseOffers(null, {})).toEqual([]);
      expect(ChaseInterceptor.parseOffers(undefined, {})).toEqual([]);
    });

    test('skips entries without merchantDetails.merchantName', () => {
      const response = makeChaseResponse([
        makeChaseOffer({ merchantDetails: {} }),
        makeChaseOffer({ merchantDetails: { merchantName: 'Valid' } })
      ]);
      const offers = ChaseInterceptor.parseOffers(response, {});
      expect(offers.length).toBe(1);
    });
  });

  describe('isOfferResponse', () => {
    test('true for customer-offers URLs', () => {
      expect(ChaseInterceptor.isOfferResponse({ url: '/digital-customer-targeted-offers/v3/customer-offers?offer-count=' })).toBe(true);
    });

    test('true for digital-offers URLs', () => {
      expect(ChaseInterceptor.isOfferResponse({ url: '/digital-offers/v2/offers' })).toBe(true);
    });

    test('false for unrelated URLs', () => {
      expect(ChaseInterceptor.isOfferResponse({ url: '/api/accounts/balance' })).toBe(false);
    });
  });
});
