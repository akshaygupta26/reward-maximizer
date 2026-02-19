const ExtractorConfig = {
  useInterceptors: true,
  portals: {
    amex:                  { interceptor: true,  fallbackToScraper: true },
    chase:                 { interceptor: true,  fallbackToScraper: true },
    citi:                  { interceptor: true,  fallbackToScraper: true },
    'capital-one':         { interceptor: true,  fallbackToScraper: true },
    bofa:                  { interceptor: true,  fallbackToScraper: true },
    discover:              { interceptor: true,  fallbackToScraper: true },
    usbank:                { interceptor: true,  fallbackToScraper: true },
    rakuten:               { interceptor: false, fallbackToScraper: true },
    'capital-one-shopping':{ interceptor: false, fallbackToScraper: true },
  },
  interceptorTimeout: 12000,
  activationDelay: 1000,
  maxConcurrentActivations: 1,
  logRawResponses: false,

  isInterceptorEnabled(portal) {
    if (!this.useInterceptors) return false;
    const cfg = this.portals[portal];
    if (!cfg) return false;
    return !!cfg.interceptor;
  },

  isFallbackEnabled(portal) {
    const cfg = this.portals[portal];
    if (!cfg) return true;
    return !!cfg.fallbackToScraper;
  },

  getRandomizedDelay() {
    const jitter = 0.7 + Math.random() * 0.6;
    return Math.round(this.activationDelay * jitter);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExtractorConfig };
}
if (typeof window !== 'undefined') {
  window.ExtractorConfig = ExtractorConfig;
}
