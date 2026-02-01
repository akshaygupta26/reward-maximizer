// content/interceptors/chase-interceptor.js
//
// Chase Offers API Observation Layer
//
// Chase offer hub (secure.chase.com/web/auth/dashboard#/dashboard/offerHub/index)
// renders inside an iframe. The main API endpoint is:
//   GET .../digital-customer-targeted-offers/v3/customer-offers
//
// Response shape:
//   { customerOffers: [{ offers: [...], digitalAccountIdentifier, ... }],
//     vendorCategories: [...], digitalProfileAccounts: [...] }
//
// Each offer has: offerIdentifier, offerStatusName (NEW|SERVED|ACTIVATED),
//   merchantDetails.merchantName, offerDetails.offerOptions[0] (amounts),
//   offerDisplayDetails.offerHeaderText (clean value like "7% cash back"),
//   offerCategories[0].offerCategoryName

const ChaseInterceptor = {
  portal: 'chase',
  source: 'chase',

  // URL substrings to match for offer-related API calls
  urlPatterns: [
    'customer-offers',
    'digital-customer-targeted-offers',
    'digital-offers',
    '/dso/'
  ],

  // Activation URL patterns
  activationPatterns: [
    '/activate',
    '/enroll',
    '/add-offer'
  ],

  _injected: false,

  /**
   * Inject the main-world observer script via <script> element.
   */
  inject(nonce) {
    if (this._injected) return;

    const allPatterns = [...this.urlPatterns, ...this.activationPatterns];
    const script = BaseInterceptor.generateMainWorldScript({
      portal: this.portal,
      urlPatterns: allPatterns,
      captureActivation: true,
      nonce: nonce || ''
    });

    try {
      const scriptEl = document.createElement('script');
      scriptEl.textContent = script;
      (document.head || document.documentElement).appendChild(scriptEl);
      scriptEl.remove();
      this._injected = true;
      debug.log('[RMX-Interceptor-Chase] Observer injected into main world');
    } catch (err) {
      debug.warn('[RMX-Interceptor-Chase] Script injection failed (CSP?):', err.message);
    }
  },

  async init(nonce) {
    this.inject(nonce);
  },

  /**
   * Parse offer data from a captured Chase API response.
   * Tries multiple known/suspected field name patterns.
   */
  parseOffers(payload, meta) {
    if (!payload) return [];

    const offers = [];

    try {
      let rawOffers = this._extractOfferArray(payload);
      if (!rawOffers || rawOffers.length === 0) return [];

      if (typeof ExtractorConfig !== 'undefined' && ExtractorConfig.logRawResponses) {
        debug.log('[RMX-Interceptor-Chase] Raw sample:', JSON.stringify(rawOffers[0]).substring(0, 500));
      }

      for (const raw of rawOffers) {
        const parsed = this._parseChaseOffer(raw);
        if (parsed) {
          offers.push(BaseInterceptor.normalizeOffer(parsed, this.source));
        }
      }
    } catch (err) {
      debug.warn('[RMX-Interceptor-Chase] Parse error:', err);
    }

    debug.log(`[RMX-Interceptor-Chase] Parsed ${offers.length} offers from API response`);
    return offers;
  },

  /**
   * Check if a URL looks like an offer response.
   */
  isOfferResponse(meta) {
    if (!meta || !meta.url) return false;
    const lower = meta.url.toLowerCase();
    return this.urlPatterns.some(p => lower.includes(p.toLowerCase()));
  },

  /**
   * Extract the offer array from the Chase API response.
   * Primary path: customerOffers[0].offers
   */
  _extractOfferArray(payload) {
    if (Array.isArray(payload)) return payload;

    // Primary: customerOffers[0].offers
    if (Array.isArray(payload.customerOffers) && payload.customerOffers.length > 0) {
      const account = payload.customerOffers[0];
      // Stash account-level metadata for use in _parseChaseOffer
      this._currentAccountId = account.digitalAccountIdentifier || null;
      if (Array.isArray(account.offers)) return account.offers;
    }

    // Fallback for other response shapes
    if (Array.isArray(payload.offers)) return payload.offers;
    return BaseInterceptor.findOfferArray(payload);
  },

  /**
   * Parse a single Chase offer from the customer-offers API.
   * Field names match the real v3/customer-offers response schema.
   */
  _parseChaseOffer(raw) {
    if (!raw || typeof raw !== 'object') return null;

    // merchantDetails.merchantName is the primary merchant field
    const details = raw.merchantDetails || {};
    const merchant = details.merchantName || null;
    if (!merchant) return null;

    const display = raw.offerDisplayDetails || {};
    const offerOpts = raw.offerDetails || {};
    const options = (offerOpts.offerOptions && offerOpts.offerOptions[0]) || {};

    // offerHeaderText is the cleanest value: "7% cash back", "$10 cash back"
    const value = display.offerHeaderText || display.shortMessageText || 'See details';

    // Expiry from offerEndTimestamp (ISO), or remainingDaysCount
    let expiry = offerOpts.offerEndTimestamp || 'Check portal';
    if (expiry !== 'Check portal') {
      try {
        const d = new Date(expiry);
        expiry = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
      } catch (e) { /* keep raw */ }
    }

    const offerId = raw.offerIdentifier || null;
    const status = raw.offerStatusName || null; // NEW, SERVED, ACTIVATED

    // Account from parent-level stash
    const eligibleCards = this._currentAccountId ? [String(this._currentAccountId)] : null;

    const minSpend = options.minimumSpendingAmount ?? null;
    const maxReward = options.maximumRewardOfferAmount ?? null;

    // Category from offerCategories
    const category = (raw.offerCategories && raw.offerCategories[0])
      ? raw.offerCategories[0].offerCategoryName : null;

    return {
      merchant,
      value,
      expiry,
      offerId,
      activationUrl: null, // Chase uses session-bound activation, not direct URLs
      eligibleCards,
      minSpend: minSpend != null ? Number(minSpend) : null,
      maxReward: maxReward != null ? Number(maxReward) : null,
      status,
      merchantCategory: category ? category.toLowerCase() : null
    };
  },

  /**
   * Activate offers via API. TODO: implement after discovering Chase's activation endpoint.
   */
  async activateAll(offers) {
    debug.log('[RMX-Interceptor-Chase] API activation not yet implemented, deferring to DOM scraper');
    return 0;
  }
};

if (typeof window !== 'undefined') {
  window.ChaseInterceptor = ChaseInterceptor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChaseInterceptor };
}
