// Storage abstraction layer - designed for future backend migration
// Currently uses Chrome's local storage, can be swapped for backend API later

// Use existing debug utility if available, otherwise create fallback
const debugUtil = (typeof window !== 'undefined' && window.debug) ? window.debug : {
  log: () => {},
  info: () => {},
  error: console.error,
  warn: console.warn
};

const offerUtils = typeof OfferUtils !== 'undefined'
  ? OfferUtils
  : (typeof module !== 'undefined' && module.exports && typeof require === 'function'
    ? require('./offer-utils').OfferUtils
    : null);

const StorageKeys = {
  OFFERS: 'rmx_offers',
  SETTINGS: 'rmx_settings',
  SYNC_HISTORY: 'rmx_sync_history',
  PORTAL_LINKS: 'rmx_portal_links',
  USER_CARDS: 'rmx_user_cards',
  SELECTED_PORTALS: 'rmx_selected_portals',
  POINT_VALUES: 'rmx_point_values',
  INTERCEPTOR_HEALTH: 'rmx_interceptor_health'
};

const Storage = {
  log(...args) {
    debugUtil.info('[RMX-Storage]', ...args);
  },

  error(...args) {
    debugUtil.error('[RMX-Storage ERROR]', ...args);
  },

  // Generate unique ID for offers
  generateId() {
    return 'rmx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  },

  // Check if chrome.storage is available
  isStorageAvailable() {
    const available = typeof chrome !== 'undefined' &&
                      chrome.storage &&
                      chrome.storage.local;
    if (!available) {
      this.error('Chrome storage NOT available!');
    }
    return available;
  },

  _read(keys, fallback = {}) {
    if (!this.isStorageAvailable()) return Promise.resolve(fallback);

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime?.lastError) {
            this.error('storage get error:', chrome.runtime.lastError.message);
            resolve(fallback);
            return;
          }
          resolve(result || fallback);
        });
      } catch (err) {
        this.error('storage get exception:', err);
        resolve(fallback);
      }
    });
  },

  _write(items) {
    if (!this.isStorageAvailable()) return Promise.resolve(false);

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime?.lastError) {
            this.error('storage set error:', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (err) {
        this.error('storage set exception:', err);
        resolve(false);
      }
    });
  },

  _clear() {
    if (!this.isStorageAvailable()) return Promise.resolve(false);

    return new Promise((resolve) => {
      try {
        chrome.storage.local.clear(() => {
          if (chrome.runtime?.lastError) {
            this.error('storage clear error:', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (err) {
        this.error('storage clear exception:', err);
        resolve(false);
      }
    });
  },

  // Get all offers
  async getOffers() {
    this.log('getOffers called');

    if (!this.isStorageAvailable()) {
      return [];
    }

    const result = await this._read([StorageKeys.OFFERS], {});
    const storedOffers = result[StorageKeys.OFFERS];
    const offers = offerUtils ? offerUtils.normalizeOfferRecords(storedOffers) :
      (Array.isArray(storedOffers) ? storedOffers.filter(Boolean) : []);
    if (Array.isArray(storedOffers) && offers.length !== storedOffers.length) {
      this.log('getOffers: ignored', storedOffers.length - offers.length, 'malformed offers');
    }
    this.log('getOffers: retrieved', offers.length, 'offers');
    return offers;
  },

  // Save a single offer (with deduplication)
  async saveOffer(offer) {
    if (!offerUtils || !offerUtils.isValidOffer(offer) || !offerUtils.normalizeSource(offer.source)) {
      this.error('saveOffer: invalid offer or source');
      return null;
    }

    const offers = await this.getOffers();
    const source = offerUtils.normalizeSource(offer.source);
    const key = offerUtils.getOfferKey(source, offer.merchant);
    const existingIndex = offers.findIndex(o => offerUtils.getOfferKey(o.source, o.merchant) === key);

    const offerWithMeta = {
      ...offer,
      source,
      id: offer.id || this.generateId(),
      optedInAt: offer.optedInAt || new Date().toISOString(),
      status: offer.status || 'active'
    };

    if (existingIndex >= 0) {
      // Update existing offer
      offers[existingIndex] = { ...offers[existingIndex], ...offerWithMeta };
    } else {
      // Add new offer
      offers.push(offerWithMeta);
    }

    const saved = await this._write({ [StorageKeys.OFFERS]: offers });
    return saved ? offerWithMeta : null;
  },

  // Save multiple offers (batch)
  async saveOffers(newOffers, source) {
    debug.log('[RMX-Storage] ========== saveOffers START ==========');
    debug.log('[RMX-Storage] saveOffers called with', newOffers?.length, 'offers from', source);
    debug.log('[RMX-Storage] Sample offer:', newOffers?.[0]);
    this.log('saveOffers called with', newOffers?.length, 'offers from', source);

    if (!this.isStorageAvailable()) {
      debug.error('[RMX-Storage] ERROR: storage not available');
      this.error('saveOffers: storage not available');
      return { added: 0, updated: 0, total: 0 };
    }

    if (!newOffers || !Array.isArray(newOffers) || newOffers.length === 0 ||
        !offerUtils || !offerUtils.normalizeSource(source)) {
      debug.error('[RMX-Storage] ERROR: invalid or empty offers array', newOffers);
      this.error('saveOffers: invalid or empty offers array');
      return { added: 0, updated: 0, total: 0 };
    }

    const offers = await this.getOffers();
    this.log('saveOffers: existing offers:', offers.length);

    const existingMap = new Map();

    offers.forEach(o => {
      const key = offerUtils.getOfferKey(o.source, o.merchant);
      if (key) existingMap.set(key, o);
    });

    let added = 0;
    let updated = 0;
    const normalizedSource = offerUtils.normalizeSource(source);

    newOffers.forEach((offer, idx) => {
      if (!offerUtils.isValidOffer(offer)) {
        this.log(`saveOffers: skipping offer ${idx} - no merchant name`);
        return;
      }

      const key = offerUtils.getOfferKey(normalizedSource, offer.merchant);
      this.log('saveOffers: processing offer:', offer.merchant, '| value:', offer.value);

      const offerWithMeta = {
        ...offer,
        source: normalizedSource,
        id: offer.id || this.generateId(),
        optedInAt: offer.optedInAt || new Date().toISOString(),
        status: offer.status || 'active'
      };

      if (existingMap.has(key)) {
        const existing = existingMap.get(key);
        existingMap.set(key, { ...existing, ...offerWithMeta });
        updated++;
      } else {
        existingMap.set(key, offerWithMeta);
        added++;
      }
    });

    const mergedOffers = Array.from(existingMap.values());
    debug.log('[RMX-Storage] Merging complete. Total:', mergedOffers.length, 'Added:', added, 'Updated:', updated);
    this.log('saveOffers: merged total:', mergedOffers.length, '| added:', added, '| updated:', updated);

    debug.log('[RMX-Storage] Calling chrome.storage.local.set...');
    const saved = await this._write({ [StorageKeys.OFFERS]: mergedOffers });
    if (!saved) {
      return { added: 0, updated: 0, total: 0, error: 'storage_write_failed' };
    }

    debug.log('[RMX-Storage] ✅ SUCCESS - Saved', mergedOffers.length, 'offers to storage');
    this.log('saveOffers: SUCCESS - saved', mergedOffers.length, 'offers to storage');
    debug.log('[RMX-Storage] ========== saveOffers END ==========');
    return { added, updated, total: mergedOffers.length };
  },

  // Delete an offer
  async deleteOffer(offerId) {
    const offers = await this.getOffers();
    const filtered = offers.filter(o => o.id !== offerId);
    return this._write({ [StorageKeys.OFFERS]: filtered });
  },

  // Clear all offers for a specific source
  async clearOffersForSource(source) {
    const offers = await this.getOffers();
    const normalizedSource = offerUtils ? offerUtils.normalizeSource(source) : source;
    const filtered = offers.filter(o => o.source !== normalizedSource);
    return (await this._write({ [StorageKeys.OFFERS]: filtered })) ? filtered.length : 0;
  },

  // Get user's selected cards
  async getUserCards() {
    const result = await this._read([StorageKeys.USER_CARDS], {});
    return Array.isArray(result[StorageKeys.USER_CARDS]) ? result[StorageKeys.USER_CARDS] : [];
  },

  // Set user's selected cards
  async setUserCards(cards) {
    const value = Array.isArray(cards) ? cards : [];
    return await this._write({ [StorageKeys.USER_CARDS]: value }) ? value : null;
  },

  // Selected portal IDs are separate from individual card IDs. Older versions
  // stored portals in rmx_user_cards, so read that key as a migration fallback
  // without rewriting or deleting it.
  async getSelectedPortals() {
    const result = await this._read([StorageKeys.SELECTED_PORTALS], {});
    if (Array.isArray(result[StorageKeys.SELECTED_PORTALS])) {
      return offerUtils
        ? offerUtils.normalizePortalIds(result[StorageKeys.SELECTED_PORTALS])
        : result[StorageKeys.SELECTED_PORTALS];
    }

    const legacy = await this.getUserCards();
    return offerUtils ? offerUtils.normalizePortalIds(legacy) : legacy;
  },

  async setSelectedPortals(portals) {
    const value = offerUtils ? offerUtils.normalizePortalIds(portals) : [];
    return await this._write({ [StorageKeys.SELECTED_PORTALS]: value }) ? value : null;
  },

  // Get custom point valuations
  async getPointValues() {
    const result = await this._read([StorageKeys.POINT_VALUES], {});
    return result[StorageKeys.POINT_VALUES] && typeof result[StorageKeys.POINT_VALUES] === 'object'
      ? result[StorageKeys.POINT_VALUES]
      : {};
  },

  // Set custom point valuations
  async setPointValues(values) {
    const value = values && typeof values === 'object' ? values : {};
    await this._write({ [StorageKeys.POINT_VALUES]: value });
    return value;
  },

  // Get all settings
  async getSettings() {
    const result = await this._read([StorageKeys.SETTINGS], {});
    const defaults = {
      notifications: true,
      autoOptIn: true,
      showStackingAlerts: true,
      defaultView: 'byMerchant'
    };
    return { ...defaults, ...(result[StorageKeys.SETTINGS] || {}) };
  },

  // Save settings
  async setSettings(settings) {
    const value = settings && typeof settings === 'object' ? settings : {};
    await this._write({ [StorageKeys.SETTINGS]: value });
    return value;
  },

  // Get sync history (when each source was last synced)
  async getSyncHistory() {
    const result = await this._read([StorageKeys.SYNC_HISTORY], {});
    return result[StorageKeys.SYNC_HISTORY] && typeof result[StorageKeys.SYNC_HISTORY] === 'object'
      ? result[StorageKeys.SYNC_HISTORY]
      : {};
  },

  // Update sync history for a source
  async updateSyncHistory(source) {
    const history = await this.getSyncHistory();
    history[source] = new Date().toISOString();

    await this._write({ [StorageKeys.SYNC_HISTORY]: history });
    return history;
  },

  // Get portal links (for Capital One tracking)
  async getPortalLinks() {
    const result = await this._read([StorageKeys.PORTAL_LINKS], {});
    return Array.isArray(result[StorageKeys.PORTAL_LINKS]) ? result[StorageKeys.PORTAL_LINKS] : [];
  },

  // Add a portal link activation
  async addPortalLink(link) {
    const links = await this.getPortalLinks();
    links.push({
      ...link,
      id: this.generateId(),
      activatedAt: new Date().toISOString()
    });

    await this._write({ [StorageKeys.PORTAL_LINKS]: links });
    return links;
  },

  // Export all data (for backup/export)
  async exportAllData() {
    const result = await this._read(null, {});
    const selectedPortals = await this.getSelectedPortals();
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      offers: offerUtils ? offerUtils.normalizeOfferRecords(result[StorageKeys.OFFERS]) :
        (Array.isArray(result[StorageKeys.OFFERS]) ? result[StorageKeys.OFFERS] : []),
      settings: result[StorageKeys.SETTINGS] || {},
      userCards: result[StorageKeys.USER_CARDS] || [],
      selectedPortals,
      pointValues: result[StorageKeys.POINT_VALUES] || {},
      syncHistory: result[StorageKeys.SYNC_HISTORY] || {},
      portalLinks: result[StorageKeys.PORTAL_LINKS] || []
    };
  },

  // Import data from backup
  async importData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

    const importObj = {};
    if (Array.isArray(data.offers)) {
      importObj[StorageKeys.OFFERS] = offerUtils
        ? offerUtils.filterValidOffers(data.offers)
        : data.offers.filter(Boolean);
    }
    if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
      importObj[StorageKeys.SETTINGS] = data.settings;
    }
    if (Array.isArray(data.userCards)) {
      importObj[StorageKeys.USER_CARDS] = data.userCards;
    }
    if (Array.isArray(data.selectedPortals)) {
      importObj[StorageKeys.SELECTED_PORTALS] = offerUtils
        ? offerUtils.normalizePortalIds(data.selectedPortals)
        : data.selectedPortals;
    }
    if (data.pointValues && typeof data.pointValues === 'object' && !Array.isArray(data.pointValues)) {
      importObj[StorageKeys.POINT_VALUES] = data.pointValues;
    }
    if (data.syncHistory && typeof data.syncHistory === 'object' && !Array.isArray(data.syncHistory)) {
      importObj[StorageKeys.SYNC_HISTORY] = data.syncHistory;
    }
    if (Array.isArray(data.portalLinks)) {
      importObj[StorageKeys.PORTAL_LINKS] = data.portalLinks;
    }

    return Object.keys(importObj).length > 0 ? this._write(importObj) : false;
  },

  // Clear all data
  async clearAllData() {
    return this._clear();
  }
};

// Export for use in browser (extension popup/options pages)
if (typeof window !== 'undefined') {
  window.Storage = Storage;
  window.StorageKeys = StorageKeys;
}

// Export for use in Node.js modules (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Storage, StorageKeys };
}
