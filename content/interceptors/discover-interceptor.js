// content/interceptors/discover-interceptor.js
//
// Discover Offers API Observation Layer
//
// This interceptor observes the API responses that populate the offer tiles.
//
// API patterns (heuristic — refine after live observation with DEBUG=true):
// - GET requests containing offer-related URL patterns
// - JSON responses with arrays of offer objects
// - POST requests for offer activation

const DiscoverInterceptor = {
  portal: 'discover',
  source: 'discover',

  // URL substrings to match for offer-related API calls
  urlPatterns: [
    '/offers',
    '/deals',
    '/cashback-bonus',
    '/rewards'
  ],

  // Activation URL patterns
  activationPatterns: [
    '/activate',
    '/claim',
    '/add-deal'
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
      debug.log('[RMX-Interceptor-Discover] Observer injected into main world');
    } catch (err) {
      debug.warn('[RMX-Interceptor-Discover] Script injection failed (CSP?):', err.message);
    }
  },

  async init(nonce) {
    this.inject(nonce);
  },

  /**
   * Parse offer data from a captured API response.
   * Tries multiple known/suspected field name patterns.
   */
  parseOffers(payload, meta) {
    if (!payload) return [];

    const offers = [];

    try {
      let rawOffers = this._extractOfferArray(payload);
      if (!rawOffers || rawOffers.length === 0) return [];

      if (typeof ExtractorConfig !== 'undefined' && ExtractorConfig.logRawResponses) {
        debug.log('[RMX-Interceptor-Discover] Raw sample:', JSON.stringify(rawOffers[0]).substring(0, 500));
      }

      for (const raw of rawOffers) {
        const parsed = this._parseDiscoverOffer(raw);
        if (parsed) {
          offers.push(BaseInterceptor.normalizeOffer(parsed, this.source));
        }
      }
    } catch (err) {
      debug.warn('[RMX-Interceptor-Discover] Parse error:', err);
    }

    debug.log(`[RMX-Interceptor-Discover] Parsed ${offers.length} offers from API response`);
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
   * Extract the offer array from various response shapes.
   */
  _extractOfferArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.offers)) return payload.offers;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.cashbackOffers)) return payload.cashbackOffers;
    if (Array.isArray(payload.offerList)) return payload.offerList;
    return BaseInterceptor.findOfferArray(payload);
  },

  /**
   * Parse a single offer from the API.
   * Field names are heuristic — update after observing real responses.
   */
  _parseDiscoverOffer(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const merchant = raw.merchantName || raw.merchant || raw.name ||
                     raw.merchantDisplayName || raw.brandName || raw.storeName || null;
    if (!merchant) return null;

    const value = raw.rewardValue || raw.reward || raw.value ||
                  raw.offerDescription || raw.description ||
                  raw.cashBack || raw.discount || null;

    const expiry = raw.expirationDate || raw.expiry || raw.endDate ||
                   raw.validThrough || raw.expires || 'Check portal';

    const offerId = raw.offerId || raw.id || raw.offerKey || raw.offerIdentifier || null;
    const activationUrl = raw.activationUrl || raw.enrollUrl || raw.addUrl || null;

    let eligibleCards = null;
    if (Array.isArray(raw.eligibleCards)) eligibleCards = raw.eligibleCards;
    else if (raw.accountId) eligibleCards = [raw.accountId];
    else if (raw.cardId) eligibleCards = [raw.cardId];

    const minSpend = raw.minSpend ?? raw.minimumSpend ?? raw.spendThreshold ?? null;
    const maxReward = raw.maxReward ?? raw.rewardCap ?? raw.maximumReward ?? null;
    const status = raw.activationStatus || raw.status || raw.offerStatus || null;

    return {
      merchant,
      value: value || 'See details',
      expiry,
      offerId,
      activationUrl,
      eligibleCards,
      minSpend: minSpend != null ? Number(minSpend) : null,
      maxReward: maxReward != null ? Number(maxReward) : null,
      status
    };
  },

  /**
   * Activate offers via API. TODO: implement after discovering activation endpoint.
   */
  async activateAll(offers) {
    debug.log('[RMX-Interceptor-Discover] API activation not yet implemented, deferring to DOM scraper');
    return 0;
  }
};

if (typeof window !== 'undefined') {
  window.DiscoverInterceptor = DiscoverInterceptor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DiscoverInterceptor };
}
