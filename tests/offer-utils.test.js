const { OfferUtils } = require('../lib/offer-utils');

describe('OfferUtils', () => {
  test('filters null and malformed offers without throwing', () => {
    const offers = OfferUtils.filterValidOffers([
      null,
      undefined,
      { merchant: null },
      { merchant: 42 },
      { merchant: '  Nike  ' }
    ]);

    expect(offers).toEqual([{ merchant: '  Nike  ' }]);
  });

  test('normalizes stored merchant and source fields for consistent matching', () => {
    expect(OfferUtils.normalizeOfferRecords([
      { merchant: '  Nike  ', source: ' AMEX ' }
    ])).toEqual([{ merchant: 'Nike', source: 'amex' }]);
  });

  test('uses one case- and whitespace-insensitive composite key', () => {
    expect(OfferUtils.getOfferKey('AMEX', '  Nike '))
      .toBe(OfferUtils.getOfferKey('amex', 'nike'));
  });

  test('uses an unambiguous delimiter for composite keys', () => {
    expect(OfferUtils.getOfferKey('a-b', 'c'))
      .not.toBe(OfferUtils.getOfferKey('a', 'b-c'));
  });

  test('normalizes selected portal IDs and drops unknown values', () => {
    expect(OfferUtils.normalizePortalIds([' AMEX ', 'amex', 'not-a-portal', null, 'RAKUTEN', 'TopCashback']))
      .toEqual(['amex', 'rakuten', 'topcashback']);
  });

  test('escapes HTML special characters', () => {
    expect(OfferUtils.escapeHtml('<img src=x onerror=alert(1)> & "offer"'))
      .toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;offer&quot;');
  });
});
