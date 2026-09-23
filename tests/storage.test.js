const { createChromeStorageMock } = require('./mocks/chrome');

// Set up chrome mock before requiring Storage
const chromeMock = createChromeStorageMock();
global.chrome = chromeMock;
global.debug = { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const { Storage, StorageKeys } = require('../lib/storage');

beforeEach(() => {
  chromeMock._reset();
});

describe('Storage', () => {
  describe('generateId', () => {
    test('returns a string', () => {
      const id = Storage.generateId();
      expect(typeof id).toBe('string');
    });

    test('starts with rmx_ prefix', () => {
      const id = Storage.generateId();
      expect(id.startsWith('rmx_')).toBe(true);
    });

    test('generates unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(Storage.generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('getOffers', () => {
    test('returns empty array when no offers stored', async () => {
      const offers = await Storage.getOffers();
      expect(offers).toEqual([]);
    });

    test('returns stored offers', async () => {
      const testOffers = [
        { id: '1', merchant: 'Nike', source: 'amex', value: '5%' },
      ];
      chromeMock.storage.local.set({ [StorageKeys.OFFERS]: testOffers });
      const offers = await Storage.getOffers();
      expect(offers.length).toBe(1);
      expect(offers[0].merchant).toBe('Nike');
    });

    test('ignores malformed stored offers without throwing', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [
          null,
          { merchant: null, source: 'chase' },
          { merchant: 42, source: 'citi' },
          { merchant: 'Nike', source: 'amex', value: '5%' }
        ]
      });

      await expect(Storage.getOffers()).resolves.toEqual([
        { merchant: 'Nike', source: 'amex', value: '5%' }
      ]);
    });
  });

  describe('saveOffers (deduplication)', () => {
    test('adds new offers', async () => {
      const newOffers = [
        { merchant: 'Nike', value: '5% back' },
        { merchant: 'Adidas', value: '3% back' },
      ];
      const result = await Storage.saveOffers(newOffers, 'amex');
      expect(result.added).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.total).toBe(2);
    });

    test('updates existing offer with same source+merchant', async () => {
      // Pre-populate
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [
          { id: 'old', merchant: 'Nike', source: 'amex', value: '3% back' },
        ],
      });

      const newOffers = [{ merchant: 'Nike', value: '5% back' }];
      const result = await Storage.saveOffers(newOffers, 'amex');
      expect(result.updated).toBe(1);
      expect(result.added).toBe(0);
      expect(result.total).toBe(1);
    });

    test('adds offer from different source for same merchant', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [
          { id: 'old', merchant: 'Nike', source: 'amex', value: '3% back' },
        ],
      });

      const newOffers = [{ merchant: 'Nike', value: '2% back' }];
      const result = await Storage.saveOffers(newOffers, 'chase');
      expect(result.added).toBe(1);
      expect(result.total).toBe(2);
    });

    test('skips offers with no merchant name', async () => {
      const newOffers = [
        { merchant: 'Nike', value: '5%' },
        { merchant: '', value: '3%' },
        { value: '2%' }, // no merchant key
      ];
      const result = await Storage.saveOffers(newOffers, 'amex');
      expect(result.added).toBe(1);
    });

    test('returns zeros for empty input', async () => {
      const result = await Storage.saveOffers([], 'amex');
      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
    });

    test('returns zeros for null input', async () => {
      const result = await Storage.saveOffers(null, 'amex');
      expect(result.added).toBe(0);
    });

    test('deduplication is case-insensitive for merchant name', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [
          { id: 'old', merchant: 'Nike', source: 'amex', value: '3% back' },
        ],
      });

      const newOffers = [{ merchant: 'nike', value: '5% back' }];
      const result = await Storage.saveOffers(newOffers, 'amex');
      expect(result.updated).toBe(1);
      expect(result.added).toBe(0);
    });

    test('deduplicates source and trimmed merchant consistently', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [
          { id: 'old', merchant: ' Nike ', source: 'AMEX', value: '3% back' }
        ]
      });

      const result = await Storage.saveOffers([{ merchant: 'nike', value: '5% back' }], 'amex');
      expect(result.updated).toBe(1);
      expect(result.added).toBe(0);
      expect((await Storage.getOffers())).toHaveLength(1);
    });

    test('normalizes source before clearing offers', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [{ id: 'old', merchant: 'Nike', source: 'AMEX' }]
      });

      await Storage.clearOffersForSource(' amex ');
      await expect(Storage.getOffers()).resolves.toEqual([]);
    });

    test('does not crash when existing storage contains null records', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [null, { merchant: null }, { merchant: 'Nike', source: 'amex' }]
      });

      await expect(Storage.saveOffers([{ merchant: 'Adidas', value: '3%' }], 'chase'))
        .resolves.toMatchObject({ added: 1, total: 2 });
    });
  });

  describe('card and portal selections', () => {
    test('stores card IDs and portal IDs independently', async () => {
      await Storage.setUserCards(['amex-mr-gold']);
      await Storage.setSelectedPortals([' AMEX ', 'rakuten', 'unknown']);

      await expect(Storage.getUserCards()).resolves.toEqual(['amex-mr-gold']);
      await expect(Storage.getSelectedPortals()).resolves.toEqual(['amex', 'rakuten']);
    });

    test('falls back to legacy portal values without overwriting card data', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.USER_CARDS]: ['chase', 'not-a-portal']
      });

      await expect(Storage.getSelectedPortals()).resolves.toEqual(['chase']);
      await expect(Storage.getUserCards()).resolves.toEqual(['chase', 'not-a-portal']);
    });
  });

  describe('deleteOffer', () => {
    test('removes offer by ID', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [
          { id: 'keep', merchant: 'Nike', source: 'amex' },
          { id: 'delete-me', merchant: 'Adidas', source: 'chase' },
        ],
      });

      await Storage.deleteOffer('delete-me');
      const offers = await Storage.getOffers();
      expect(offers.length).toBe(1);
      expect(offers[0].id).toBe('keep');
    });
  });

  describe('clearOffersForSource', () => {
    test('removes all offers for a source', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [
          { id: '1', merchant: 'Nike', source: 'amex' },
          { id: '2', merchant: 'Adidas', source: 'amex' },
          { id: '3', merchant: 'Nike', source: 'chase' },
        ],
      });

      await Storage.clearOffersForSource('amex');
      const offers = await Storage.getOffers();
      expect(offers.length).toBe(1);
      expect(offers[0].source).toBe('chase');
    });
  });

  describe('import/export round-trip', () => {
    test('exported data can be imported back', async () => {
      // Set up data
      chromeMock.storage.local.set({
        [StorageKeys.OFFERS]: [{ id: '1', merchant: 'Nike', source: 'amex', value: '5%' }],
        [StorageKeys.SETTINGS]: { notifications: true },
        [StorageKeys.POINT_VALUES]: { 'amex-mr-gold': 1.8 },
      });

      const exported = await Storage.exportAllData();
      expect(exported.offers.length).toBe(1);
      expect(exported.version).toBe('1.0');

      // Clear and reimport
      await Storage.clearAllData();
      let offers = await Storage.getOffers();
      expect(offers.length).toBe(0);

      await Storage.importData(exported);
      offers = await Storage.getOffers();
      expect(offers.length).toBe(1);
      expect(offers[0].merchant).toBe('Nike');
    });

    test('exports legacy portal selections without rewriting card data', async () => {
      chromeMock.storage.local.set({
        [StorageKeys.USER_CARDS]: ['chase', 'amex-mr-gold']
      });

      const exported = await Storage.exportAllData();
      expect(exported.selectedPortals).toEqual(['chase']);
      expect(exported.userCards).toEqual(['chase', 'amex-mr-gold']);
    });
  });
});
