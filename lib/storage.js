// Storage abstraction layer - designed for future backend migration
// Currently uses Chrome's local storage, can be swapped for backend API later

const StorageKeys = {
  OFFERS: 'rmx_offers',
  SETTINGS: 'rmx_settings',
  SYNC_HISTORY: 'rmx_sync_history',
  PORTAL_LINKS: 'rmx_portal_links',
  USER_CARDS: 'rmx_user_cards',
  POINT_VALUES: 'rmx_point_values'
};

const Storage = {
  debug: true,

  log(...args) {
    if (this.debug) {
      console.log('[RMX-Storage]', ...args);
    }
  },

  error(...args) {
    console.error('[RMX-Storage ERROR]', ...args);
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

  // Get all offers
  async getOffers() {
    this.log('getOffers called');

    if (!this.isStorageAvailable()) {
      return [];
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([StorageKeys.OFFERS], (result) => {
          if (chrome.runtime.lastError) {
            this.error('getOffers chrome error:', chrome.runtime.lastError.message);
            resolve([]);
            return;
          }
          const offers = result[StorageKeys.OFFERS] || [];
          this.log('getOffers: retrieved', offers.length, 'offers');
          resolve(offers);
        });
      } catch (err) {
        this.error('getOffers exception:', err);
        resolve([]);
      }
    });
  },

  // Save a single offer (with deduplication)
  async saveOffer(offer) {
    const offers = await this.getOffers();
    const existingIndex = offers.findIndex(o =>
      o.source === offer.source &&
      o.merchant.toLowerCase() === offer.merchant.toLowerCase()
    );

    const offerWithMeta = {
      ...offer,
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

    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.OFFERS]: offers }, () => {
        resolve(offerWithMeta);
      });
    });
  },

  // Save multiple offers (batch)
  async saveOffers(newOffers, source) {
    this.log('saveOffers called with', newOffers?.length, 'offers from', source);

    if (!this.isStorageAvailable()) {
      this.error('saveOffers: storage not available');
      return { added: 0, updated: 0, total: 0 };
    }

    if (!newOffers || !Array.isArray(newOffers) || newOffers.length === 0) {
      this.error('saveOffers: invalid or empty offers array');
      return { added: 0, updated: 0, total: 0 };
    }

    const offers = await this.getOffers();
    this.log('saveOffers: existing offers:', offers.length);

    const existingMap = new Map();

    offers.forEach(o => {
      const key = `${o.source}-${(o.merchant || '').toLowerCase()}`;
      existingMap.set(key, o);
    });

    let added = 0;
    let updated = 0;

    newOffers.forEach((offer, idx) => {
      if (!offer || !offer.merchant) {
        this.log(`saveOffers: skipping offer ${idx} - no merchant name`);
        return;
      }

      const key = `${source}-${offer.merchant.toLowerCase()}`;
      this.log('saveOffers: processing offer:', offer.merchant, '| value:', offer.value);

      const offerWithMeta = {
        ...offer,
        source,
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
    this.log('saveOffers: merged total:', mergedOffers.length, '| added:', added, '| updated:', updated);

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [StorageKeys.OFFERS]: mergedOffers }, () => {
          if (chrome.runtime.lastError) {
            this.error('saveOffers chrome error:', chrome.runtime.lastError.message);
            resolve({ added: 0, updated: 0, total: 0, error: chrome.runtime.lastError.message });
            return;
          }
          this.log('saveOffers: SUCCESS - saved', mergedOffers.length, 'offers to storage');

          // Verify the save worked by reading back
          chrome.storage.local.get([StorageKeys.OFFERS], (verifyResult) => {
            const savedCount = (verifyResult[StorageKeys.OFFERS] || []).length;
            this.log('saveOffers: VERIFIED -', savedCount, 'offers in storage after save');
          });

          resolve({ added, updated, total: mergedOffers.length });
        });
      } catch (err) {
        this.error('saveOffers exception:', err);
        resolve({ added: 0, updated: 0, total: 0, error: err.message });
      }
    });
  },

  // Delete an offer
  async deleteOffer(offerId) {
    const offers = await this.getOffers();
    const filtered = offers.filter(o => o.id !== offerId);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.OFFERS]: filtered }, () => {
        resolve(true);
      });
    });
  },

  // Clear all offers for a specific source
  async clearOffersForSource(source) {
    const offers = await this.getOffers();
    const filtered = offers.filter(o => o.source !== source);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.OFFERS]: filtered }, () => {
        resolve(filtered.length);
      });
    });
  },

  // Get user's selected cards
  async getUserCards() {
    return new Promise((resolve) => {
      chrome.storage.local.get([StorageKeys.USER_CARDS], (result) => {
        resolve(result[StorageKeys.USER_CARDS] || []);
      });
    });
  },

  // Set user's selected cards
  async setUserCards(cards) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.USER_CARDS]: cards }, () => {
        resolve(cards);
      });
    });
  },

  // Get custom point valuations
  async getPointValues() {
    return new Promise((resolve) => {
      chrome.storage.local.get([StorageKeys.POINT_VALUES], (result) => {
        resolve(result[StorageKeys.POINT_VALUES] || {});
      });
    });
  },

  // Set custom point valuations
  async setPointValues(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.POINT_VALUES]: values }, () => {
        resolve(values);
      });
    });
  },

  // Get all settings
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([StorageKeys.SETTINGS], (result) => {
        resolve(result[StorageKeys.SETTINGS] || {
          notifications: true,
          autoOptIn: true,
          showStackingAlerts: true,
          defaultView: 'byMerchant'
        });
      });
    });
  },

  // Save settings
  async setSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.SETTINGS]: settings }, () => {
        resolve(settings);
      });
    });
  },

  // Get sync history (when each source was last synced)
  async getSyncHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get([StorageKeys.SYNC_HISTORY], (result) => {
        resolve(result[StorageKeys.SYNC_HISTORY] || {});
      });
    });
  },

  // Update sync history for a source
  async updateSyncHistory(source) {
    const history = await this.getSyncHistory();
    history[source] = new Date().toISOString();

    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.SYNC_HISTORY]: history }, () => {
        resolve(history);
      });
    });
  },

  // Get portal links (for Capital One tracking)
  async getPortalLinks() {
    return new Promise((resolve) => {
      chrome.storage.local.get([StorageKeys.PORTAL_LINKS], (result) => {
        resolve(result[StorageKeys.PORTAL_LINKS] || []);
      });
    });
  },

  // Add a portal link activation
  async addPortalLink(link) {
    const links = await this.getPortalLinks();
    links.push({
      ...link,
      id: this.generateId(),
      activatedAt: new Date().toISOString()
    });

    return new Promise((resolve) => {
      chrome.storage.local.set({ [StorageKeys.PORTAL_LINKS]: links }, () => {
        resolve(links);
      });
    });
  },

  // Export all data (for backup/export)
  async exportAllData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (result) => {
        const exportData = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          offers: result[StorageKeys.OFFERS] || [],
          settings: result[StorageKeys.SETTINGS] || {},
          userCards: result[StorageKeys.USER_CARDS] || [],
          pointValues: result[StorageKeys.POINT_VALUES] || {},
          syncHistory: result[StorageKeys.SYNC_HISTORY] || {},
          portalLinks: result[StorageKeys.PORTAL_LINKS] || []
        };
        resolve(exportData);
      });
    });
  },

  // Import data from backup
  async importData(data) {
    return new Promise((resolve) => {
      const importObj = {};
      if (data.offers) importObj[StorageKeys.OFFERS] = data.offers;
      if (data.settings) importObj[StorageKeys.SETTINGS] = data.settings;
      if (data.userCards) importObj[StorageKeys.USER_CARDS] = data.userCards;
      if (data.pointValues) importObj[StorageKeys.POINT_VALUES] = data.pointValues;
      if (data.syncHistory) importObj[StorageKeys.SYNC_HISTORY] = data.syncHistory;
      if (data.portalLinks) importObj[StorageKeys.PORTAL_LINKS] = data.portalLinks;

      chrome.storage.local.set(importObj, () => {
        resolve(true);
      });
    });
  },

  // Clear all data
  async clearAllData() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve(true);
      });
    });
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Storage, StorageKeys };
}
