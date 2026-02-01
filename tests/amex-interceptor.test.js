global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
global.BaseInterceptor = {
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
  generateMainWorldScript: jest.fn(() => 'mock_script'),
  normalizeOffer: jest.fn(raw => ({ ...raw, normalized: true })),
  sanitize: jest.fn(v => v),
};
global.Categories = { detectCategory: jest.fn(() => 'shopping') };
global.ExtractorConfig = { logRawResponses: false };

const { AmexInterceptor } = require('../content/interceptors/amex-interceptor.js');

describe('AmexInterceptor', () => {
  beforeEach(() => jest.clearAllMocks());

  test('has correct portal and source', () => {
    expect(AmexInterceptor.portal).toBe('amex');
    expect(AmexInterceptor.source).toBe('amex');
  });

  test('urlPatterns contains offers/enrollment', () => {
    const joined = AmexInterceptor.urlPatterns.join(' ');
    expect(joined).toMatch(/offer|enroll/i);
  });

  describe('parseOffers', () => {
    test('extracts from {offers: [...]}', () => {
      const offers = AmexInterceptor.parseOffers({
        offers: [
          { name: 'Starbucks', description: 'Earn 5% back', offerId: 'a1', cardTokens: ['c1', 'c2'] },
          { name: 'Amazon', description: '$20 credit', offerId: 'a2' }
        ]
      }, { url: '/offers' });
      expect(offers.length).toBe(2);
    });

    test('extracts eligibleCards from cardTokens', () => {
      AmexInterceptor.parseOffers({
        offers: [{ name: 'Test', description: '5% back', cardTokens: ['card1', 'card2'] }]
      }, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.eligibleCards).toEqual(['card1', 'card2']);
    });

    test('extracts eligibleCards from eligibleCardMemberTokens', () => {
      AmexInterceptor.parseOffers({
        offers: [{ name: 'Test', description: '5% back', eligibleCardMemberTokens: ['t1'] }]
      }, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.eligibleCards).toEqual(['t1']);
    });

    test('returns empty for non-offer responses', () => {
      expect(AmexInterceptor.parseOffers({ user: {} }, {})).toEqual([]);
    });

    test('handles null', () => {
      expect(AmexInterceptor.parseOffers(null, {})).toEqual([]);
    });

    test('finds nested arrays via heuristic', () => {
      const offers = AmexInterceptor.parseOffers({
        deep: { nested: { list: [{ name: 'Deep', description: '$10 back' }] } }
      }, {});
      expect(offers.length).toBe(1);
    });
  });
});
