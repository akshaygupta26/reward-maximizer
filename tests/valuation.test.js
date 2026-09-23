const { Valuation } = require('../lib/valuation');
const { DEFAULT_POINT_VALUES } = require('../data/defaults');

describe('Valuation', () => {
  describe('parseOfferValue', () => {
    test('parses percentage offers', () => {
      const result = Valuation.parseOfferValue('5% back');
      expect(result.type).toBe('percent');
      expect(result.amount).toBe(5);
    });

    test('parses decimal percentages', () => {
      const result = Valuation.parseOfferValue('2.5% cashback');
      expect(result.type).toBe('percent');
      expect(result.amount).toBe(2.5);
    });

    test('parses multiplier offers', () => {
      const result = Valuation.parseOfferValue('5x points');
      expect(result.type).toBe('multiplier');
      expect(result.amount).toBe(5);
    });

    test('parses fixed dollar offers', () => {
      const result = Valuation.parseOfferValue('$20 statement credit');
      expect(result.type).toBe('fixed');
      expect(result.amount).toBe(20);
    });

    test('parses cents offers', () => {
      const result = Valuation.parseOfferValue('10 cents per gallon');
      expect(result.type).toBe('cents');
      expect(result.amount).toBe(10);
    });

    test('returns unknown for empty string', () => {
      const result = Valuation.parseOfferValue('');
      expect(result.type).toBe('unknown');
      expect(result.amount).toBe(0);
    });

    test('returns unknown for null', () => {
      const result = Valuation.parseOfferValue(null);
      expect(result.type).toBe('unknown');
      expect(result.amount).toBe(0);
    });

    test('returns unknown for non-string values', () => {
      expect(() => Valuation.parseOfferValue(5)).not.toThrow();
      expect(Valuation.parseOfferValue(5).type).toBe('unknown');
    });

    test('returns unknown for "Check portal"', () => {
      const result = Valuation.parseOfferValue('Check portal');
      expect(result.type).toBe('unknown');
      expect(result.amount).toBe(0);
    });

    test('multiplier takes priority over percentage when both present', () => {
      // "3x" is checked before "%"
      const result = Valuation.parseOfferValue('3x MR points');
      expect(result.type).toBe('multiplier');
      expect(result.amount).toBe(3);
    });
  });

  describe('calculateValuePerDollar', () => {
    test('percent offer returns fraction', () => {
      const offer = { value: '5% back', source: 'amex' };
      const result = Valuation.calculateValuePerDollar(offer, 'amex-mr-gold', {}, DEFAULT_POINT_VALUES);
      expect(result).toBe(0.05);
    });

    test('multiplier offer uses point valuation', () => {
      const offer = { value: '5x points', source: 'amex' };
      // amex-mr-gold = 1.10 cpp => 5 * 1.10 / 100 = 0.055
      const result = Valuation.calculateValuePerDollar(offer, 'amex-mr-gold', {}, DEFAULT_POINT_VALUES);
      expect(result).toBeCloseTo(0.055);
    });

    test('fixed offer returns object with totalValue', () => {
      const offer = { value: '$20 back', source: 'amex' };
      const result = Valuation.calculateValuePerDollar(offer, 'amex-mr-gold', {}, DEFAULT_POINT_VALUES);
      expect(result.type).toBe('fixed');
      expect(result.totalValue).toBe(20);
    });

    test('custom point values override defaults', () => {
      const offer = { value: '5x points', source: 'amex' };
      const custom = { 'amex-mr-gold': 2.0 };
      // 5 * 2.0 / 100 = 0.10
      const result = Valuation.calculateValuePerDollar(offer, 'amex-mr-gold', custom, DEFAULT_POINT_VALUES);
      expect(result).toBeCloseTo(0.10);
    });

    test('unknown offer returns 0', () => {
      const offer = { value: 'Check portal', source: 'amex' };
      const result = Valuation.calculateValuePerDollar(offer, 'amex-mr-gold', {}, DEFAULT_POINT_VALUES);
      expect(result).toBe(0);
    });
  });

  describe('findBestOffer', () => {
    test('returns null for empty array', () => {
      expect(Valuation.findBestOffer([])).toBeNull();
    });

    test('returns null for null input', () => {
      expect(Valuation.findBestOffer(null)).toBeNull();
    });

    test('finds best percentage offer', () => {
      const offers = [
        { value: '3% back', source: 'amex', merchant: 'Test' },
        { value: '5% back', source: 'chase', merchant: 'Test' },
        { value: '2% back', source: 'citi', merchant: 'Test' },
      ];
      const result = Valuation.findBestOffer(offers, {}, DEFAULT_POINT_VALUES);
      expect(result.offer.value).toBe('5% back');
      expect(result.value).toBe(0.05);
    });

    test('returns single offer', () => {
      const offers = [{ value: '3% back', source: 'amex', merchant: 'Test' }];
      const result = Valuation.findBestOffer(offers, {}, DEFAULT_POINT_VALUES);
      expect(result.offer.value).toBe('3% back');
    });

    test('skips fixed offers in comparison', () => {
      const offers = [
        { value: '$100 back', source: 'amex', merchant: 'Test' },
        { value: '2% back', source: 'chase', merchant: 'Test' },
      ];
      const result = Valuation.findBestOffer(offers, {}, DEFAULT_POINT_VALUES);
      expect(result.offer.value).toBe('2% back');
    });
  });

  describe('sortOffersByValue', () => {
    test('sorts highest value first', () => {
      const offers = [
        { value: '2% back', source: 'citi', merchant: 'A' },
        { value: '5% back', source: 'chase', merchant: 'B' },
        { value: '3% back', source: 'amex', merchant: 'C' },
      ];
      const sorted = Valuation.sortOffersByValue(offers, {}, DEFAULT_POINT_VALUES);
      expect(sorted[0].value).toBe('5% back');
      expect(sorted[1].value).toBe('3% back');
      expect(sorted[2].value).toBe('2% back');
    });

    test('puts fixed offers after percentage offers', () => {
      const offers = [
        { value: '$50 back', source: 'amex', merchant: 'A' },
        { value: '1% back', source: 'chase', merchant: 'B' },
      ];
      const sorted = Valuation.sortOffersByValue(offers, {}, DEFAULT_POINT_VALUES);
      expect(sorted[0].value).toBe('1% back');
      expect(sorted[1].value).toBe('$50 back');
    });

    test('does not mutate original array', () => {
      const offers = [
        { value: '2% back', source: 'citi', merchant: 'A' },
        { value: '5% back', source: 'chase', merchant: 'B' },
      ];
      Valuation.sortOffersByValue(offers, {}, DEFAULT_POINT_VALUES);
      expect(offers[0].value).toBe('2% back');
    });
  });

  describe('findBestCombination', () => {
    test('returns null for empty offers', () => {
      expect(Valuation.findBestCombination([], [], {}, DEFAULT_POINT_VALUES)).toBeNull();
    });

    test('combines card offer with stacking partner', () => {
      const merchantOffers = [
        { value: '5% back', source: 'amex', merchant: 'Nike' },
        { value: '3% back', source: 'rakuten', merchant: 'Nike' },
      ];
      const result = Valuation.findBestCombination(merchantOffers, [], {}, DEFAULT_POINT_VALUES);
      expect(result).not.toBeNull();
      expect(result.totalValue).toBeGreaterThan(0.05);
      expect(result.cardOffer.source).toBe('amex');
    });

    test('picks best card when multiple available', () => {
      const merchantOffers = [
        { value: '3% back', source: 'amex', merchant: 'Nike' },
        { value: '5% back', source: 'chase', merchant: 'Nike' },
      ];
      const result = Valuation.findBestCombination(merchantOffers, [], {}, DEFAULT_POINT_VALUES);
      expect(result.cardOffer.source).toBe('chase');
    });
  });

  describe('getCardIdForSource', () => {
    test('returns specific card ID if provided', () => {
      expect(Valuation.getCardIdForSource('amex', 'amex-mr-platinum')).toBe('amex-mr-platinum');
    });

    test('returns default card for source', () => {
      expect(Valuation.getCardIdForSource('amex')).toBe('amex-mr-gold');
      expect(Valuation.getCardIdForSource('chase')).toBe('chase-ur-csp');
    });

    test('returns source as fallback', () => {
      expect(Valuation.getCardIdForSource('unknown-source')).toBe('unknown-source');
    });
  });
});
