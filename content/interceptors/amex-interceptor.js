// content/interceptors/amex-interceptor.js
//
// American Express Offers API Observation Layer
//
// Amex offers page (americanexpress.com/us/credit-cards/category/offer/all/)
// is a React SPA. Key feature unlock: multi-card activation via API.
// The DOM hides offers after adding to one card, but the API likely accepts
// a card token parameter for sequential activation across cards.

const AmexInterceptor = {
  portal: 'amex',
  source: 'amex',

  urlPatterns: [
    '/offers',
    '/enrollment',
    '/eligible',
    '/merchant-offer',
    '/merchantoffer',
    '/card-offers',
    '/rewards/offers'
  ],

  activationPatterns: [
    '/activate',
    '/enroll',
    '/add-offer',
    '/save-offer',
    '/opt-in'
  ],

  _injected: false,

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
      debug.log('[RMX-Interceptor-Amex] Observer injected into main world');
    } catch (err) {
      debug.warn('[RMX-Interceptor-Amex] Script injection failed:', err.message);
    }
  },

  async init(nonce) {
    this.inject(nonce);
  },

  parseOffers(payload, meta) {
    if (!payload) return [];

    const offers = [];

    try {
      let rawOffers = this._extractOfferArray(payload);
      if (!rawOffers || rawOffers.length === 0) return [];

      if (typeof ExtractorConfig !== 'undefined' && ExtractorConfig.logRawResponses) {
        debug.log('[RMX-Interceptor-Amex] Raw sample:', JSON.stringify(rawOffers[0]).substring(0, 500));
      }

      for (const raw of rawOffers) {
        const parsed = this._parseAmexOffer(raw);
        if (parsed) {
          offers.push(BaseInterceptor.normalizeOffer(parsed, this.source));
        }
      }
    } catch (err) {
      debug.warn('[RMX-Interceptor-Amex] Parse error:', err);
    }

    debug.log(`[RMX-Interceptor-Amex] Parsed ${offers.length} offers`);
    return offers;
  },

  _extractOfferArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.offers)) return payload.offers;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.eligibleOffers)) return payload.eligibleOffers;
    if (Array.isArray(payload.merchantOffers)) return payload.merchantOffers;
    return BaseInterceptor.findOfferArray(payload);
  },

  /**
   * Parse a single Amex offer. Supports multi-card via cardTokens/eligibleCardMemberTokens.
   */
  _parseAmexOffer(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const merchant = raw.name || raw.merchantName || raw.merchant ||
                     raw.brandName || raw.storeName || null;
    if (!merchant) return null;

    const value = raw.description || raw.offerDescription || raw.value ||
                  raw.rewardValue || raw.headline || null;

    const expiry = raw.expiryDate || raw.endDate || raw.expirationDate ||
                   raw.validThrough || 'Check portal';

    const offerId = raw.offerId || raw.id || raw.offerKey || null;
    const activationUrl = raw.enrollmentUrl || raw.activateUrl || raw.activationUrl || null;

    // Multi-card: extract eligible card tokens
    let eligibleCards = null;
    if (Array.isArray(raw.cardTokens)) eligibleCards = raw.cardTokens;
    else if (Array.isArray(raw.eligibleCardMemberTokens)) eligibleCards = raw.eligibleCardMemberTokens;
    else if (Array.isArray(raw.eligibleCards)) eligibleCards = raw.eligibleCards;

    const minSpend = raw.minimumSpend ?? raw.spendThreshold ?? raw.minSpend ?? null;
    const maxReward = raw.maximumReward ?? raw.rewardCap ?? raw.maxReward ?? null;
    const status = raw.status || (raw.enrolled ? 'activated' : 'available') || null;

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
   * Multi-card activation via API.
   * TODO: Implement after discovering Amex activation endpoint format.
   * Expected: POST offerId + cardToken for each eligible card.
   */
  async activateAll(offers) {
    debug.log('[RMX-Interceptor-Amex] API activation not yet implemented');
    return 0;
  }
};

if (typeof window !== 'undefined') {
  window.AmexInterceptor = AmexInterceptor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AmexInterceptor };
}
