// lib/interceptor-health.js
//
// Per-portal extraction health tracking.
// Records which method was last used (interceptor vs scraper),
// consecutive failures, and timestamps.

const InterceptorHealth = {
  STORAGE_KEY: 'rmx_interceptor_health',

  async _getAll() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get([this.STORAGE_KEY], result => {
          if (chrome.runtime?.lastError) {
            if (typeof debug !== 'undefined') {
              debug.error('[RMX-Health] Storage read failed:', chrome.runtime.lastError.message);
            }
            resolve({});
            return;
          }
          resolve(result?.[this.STORAGE_KEY] || {});
        });
      } catch (error) {
        if (typeof debug !== 'undefined') debug.error('[RMX-Health] Storage read failed:', error);
        resolve({});
      }
    });
  },

  async _save(health) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [this.STORAGE_KEY]: health }, () => {
          if (chrome.runtime?.lastError) {
            if (typeof debug !== 'undefined') {
              debug.error('[RMX-Health] Storage write failed:', chrome.runtime.lastError.message);
            }
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (error) {
        if (typeof debug !== 'undefined') debug.error('[RMX-Health] Storage write failed:', error);
        resolve(false);
      }
    });
  },

  async recordSuccess(portal, offerCount) {
    const health = await this._getAll();
    health[portal] = {
      ...(health[portal] || {}),
      lastMethod: 'interceptor',
      lastTimestamp: new Date().toISOString(),
      lastOfferCount: offerCount,
      consecutiveInterceptorFailures: 0,
      lastError: null
    };
    await this._save(health);

    if (typeof debug !== 'undefined') {
      debug.log(`[RMX-Health] ${portal}: interceptor success, ${offerCount} offers`);
    }
  },

  async recordFallback(portal, reason) {
    const health = await this._getAll();
    const existing = health[portal] || { consecutiveInterceptorFailures: 0 };
    health[portal] = {
      ...existing,
      lastMethod: 'scraper',
      lastTimestamp: new Date().toISOString(),
      consecutiveInterceptorFailures: (existing.consecutiveInterceptorFailures || 0) + 1,
      lastError: reason
    };
    await this._save(health);

    if (typeof debug !== 'undefined') {
      debug.warn(`[RMX-Health] ${portal}: fallback to scraper (${reason}), failures: ${health[portal].consecutiveInterceptorFailures}`);
    }
  },

  async getHealth(portal) {
    const health = await this._getAll();
    return health[portal] || null;
  },

  async getAllHealth() {
    return this._getAll();
  }
};

if (typeof window !== 'undefined') {
  window.InterceptorHealth = InterceptorHealth;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InterceptorHealth };
}
