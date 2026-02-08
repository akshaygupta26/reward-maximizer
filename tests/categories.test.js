const { Categories } = require('../lib/categories');

describe('Categories', () => {
  describe('detectCategory', () => {
    test('detects dining merchants', () => {
      expect(Categories.detectCategory('Starbucks')).toBe('dining');
      expect(Categories.detectCategory('Chipotle Mexican Grill')).toBe('dining');
      expect(Categories.detectCategory('DoorDash')).toBe('dining');
    });

    test('detects travel merchants', () => {
      expect(Categories.detectCategory('Delta Airlines')).toBe('travel');
      expect(Categories.detectCategory('Marriott Hotels')).toBe('travel');
      expect(Categories.detectCategory('Expedia')).toBe('travel');
    });

    test('detects gas merchants', () => {
      expect(Categories.detectCategory('Shell Gas')).toBe('gas');
      expect(Categories.detectCategory('Exxon Mobil')).toBe('gas');
    });

    test('detects grocery merchants', () => {
      expect(Categories.detectCategory('Kroger')).toBe('grocery');
      // "Whole Foods" matches "food" in dining before "whole foods" in grocery
      expect(Categories.detectCategory('Whole Foods Market')).toBe('dining');
      expect(Categories.detectCategory('Trader Joe')).toBe('grocery');
    });

    test('detects shopping merchants', () => {
      expect(Categories.detectCategory('Amazon')).toBe('shopping');
      expect(Categories.detectCategory('Nike Store')).toBe('shopping');
    });

    test('returns other for unknown merchants', () => {
      // "Acme" matches grocery keyword "acme" (Harris Teeter parent)
      expect(Categories.detectCategory('Acme Corp XYZ')).toBe('grocery');
      expect(Categories.detectCategory('Random Store 123')).toBe('other');
      expect(Categories.detectCategory('Zyxwvu Inc')).toBe('other');
    });

    test('returns other for null/empty input', () => {
      expect(Categories.detectCategory(null)).toBe('other');
      expect(Categories.detectCategory('')).toBe('other');
    });

    test('is case insensitive', () => {
      expect(Categories.detectCategory('STARBUCKS')).toBe('dining');
      expect(Categories.detectCategory('starbucks')).toBe('dining');
    });
  });

  describe('groupByCategory', () => {
    const offers = [
      { merchant: 'Starbucks', source: 'amex', value: '5% back' },
      { merchant: 'Delta', source: 'chase', value: '3x points' },
      { merchant: 'Chipotle', source: 'citi', value: '10% back' },
      { merchant: 'Unknown Co', source: 'amex', value: '$5 back' },
    ];

    test('groups offers by detected category', () => {
      const groups = Categories.groupByCategory(offers);
      expect(groups.dining).toBeDefined();
      expect(groups.dining.offers.length).toBe(2);
      expect(groups.travel).toBeDefined();
      expect(groups.travel.offers.length).toBe(1);
      expect(groups.other.offers.length).toBe(1);
    });

    test('uses merchantCategory if already set', () => {
      const offers = [
        { merchant: 'Test', source: 'amex', value: '5%', merchantCategory: 'gas' },
      ];
      const groups = Categories.groupByCategory(offers);
      expect(groups.gas).toBeDefined();
      expect(groups.gas.offers.length).toBe(1);
    });
  });

  describe('groupByMerchant', () => {
    const offers = [
      { merchant: 'Nike', source: 'amex', value: '5% back' },
      { merchant: 'Nike', source: 'rakuten', value: '3% back' },
      { merchant: 'Adidas', source: 'chase', value: '2% back' },
    ];

    test('groups offers by merchant name', () => {
      const groups = Categories.groupByMerchant(offers);
      expect(groups['nike']).toBeDefined();
      expect(groups['nike'].offers.length).toBe(2);
      expect(groups['adidas']).toBeDefined();
      expect(groups['adidas'].offers.length).toBe(1);
    });

    test('is case insensitive for grouping', () => {
      const offers = [
        { merchant: 'Nike', source: 'amex', value: '5%' },
        { merchant: 'nike', source: 'chase', value: '3%' },
      ];
      const groups = Categories.groupByMerchant(offers);
      expect(Object.keys(groups).length).toBe(1);
      expect(groups['nike'].offers.length).toBe(2);
    });
  });

  describe('groupBySource', () => {
    const offers = [
      { merchant: 'Nike', source: 'amex', value: '5%' },
      { merchant: 'Adidas', source: 'amex', value: '3%' },
      { merchant: 'Nike', source: 'chase', value: '2%' },
    ];

    test('groups offers by source', () => {
      const groups = Categories.groupBySource(offers);
      expect(groups['amex']).toBeDefined();
      expect(groups['amex'].offers.length).toBe(2);
      expect(groups['chase']).toBeDefined();
      expect(groups['chase'].offers.length).toBe(1);
    });
  });

  describe('findStackingOpportunities', () => {
    test('finds merchants with card + stacking partner offers', () => {
      const offers = [
        { merchant: 'Nike', source: 'amex', value: '5% back' },
        { merchant: 'Nike', source: 'rakuten', value: '3% back' },
        { merchant: 'Adidas', source: 'chase', value: '2% back' },
      ];
      const opps = Categories.findStackingOpportunities(offers);
      const stackable = opps.filter(o => o.stackable);
      expect(stackable.length).toBe(1);
      expect(stackable[0].merchant).toBe('Nike');
    });

    test('identifies multiple card options without stacking', () => {
      const offers = [
        { merchant: 'Nike', source: 'amex', value: '5% back' },
        { merchant: 'Nike', source: 'chase', value: '3% back' },
      ];
      const opps = Categories.findStackingOpportunities(offers);
      expect(opps.length).toBe(1);
      expect(opps[0].stackable).toBe(false);
      expect(opps[0].multipleOptions).toBe(true);
    });

    test('returns empty array when no opportunities', () => {
      const offers = [
        { merchant: 'Nike', source: 'amex', value: '5%' },
        { merchant: 'Adidas', source: 'chase', value: '3%' },
      ];
      const opps = Categories.findStackingOpportunities(offers);
      expect(opps.length).toBe(0);
    });
  });
});
