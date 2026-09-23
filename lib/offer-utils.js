// Shared offer validation, deduplication, and display helpers.
// This file is loaded by the service worker, content scripts, and extension pages.

const OfferUtils = {
  PORTAL_IDS: [
    'amex',
    'chase',
    'citi',
    'capital-one',
    'discover',
    'bofa',
    'usbank',
    'rakuten',
    'capital-one-shopping',
    'topcashback'
  ],

  normalizeSource(source) {
    return typeof source === 'string' ? source.trim().toLowerCase() : '';
  },

  normalizeMerchant(merchant) {
    return typeof merchant === 'string' ? merchant.trim().toLowerCase() : '';
  },

  isValidOffer(offer) {
    return !!offer &&
      typeof offer === 'object' &&
      !Array.isArray(offer) &&
      this.normalizeMerchant(offer.merchant).length > 0;
  },

  filterValidOffers(offers) {
    return Array.isArray(offers) ? offers.filter(offer => this.isValidOffer(offer)) : [];
  },

  normalizeOfferRecords(offers) {
    return this.filterValidOffers(offers).map(offer => ({
      ...offer,
      merchant: offer.merchant.trim(),
      ...(typeof offer.source === 'string' ? { source: this.normalizeSource(offer.source) } : {})
    }));
  },

  // NUL is used as a delimiter so a source/merchant pair cannot collide on a dash.
  getOfferKey(source, merchant) {
    const normalizedMerchant = this.normalizeMerchant(merchant);
    if (!normalizedMerchant) return null;
    return `${this.normalizeSource(source)}\u0000${normalizedMerchant}`;
  },

  uniqueStrings(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean))];
  },

  normalizePortalIds(values) {
    const knownPortals = new Set(this.PORTAL_IDS);
    return [...new Set(this.uniqueStrings(values)
      .map(portal => portal.toLowerCase())
      .filter(portal => knownPortals.has(portal)))];
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character]));
  }
};

if (typeof window !== 'undefined') {
  window.OfferUtils = OfferUtils;
}

if (typeof globalThis !== 'undefined') {
  globalThis.OfferUtils = OfferUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OfferUtils };
}
