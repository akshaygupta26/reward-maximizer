// Capital One Shopping Deals Scraper
// Scrapes deals/cashback offers from capitaloneshopping.com

const CapitalOneShoppingScraper = {
  source: 'capital-one-shopping',
  offersUrl: 'https://www.capitaloneshopping.com/',

  log(...args) {
    debug.log('[RMX-CapitalOneShopping]', ...args);
  },

  needsNavigation() {
    return false;
  },

  getOffersUrl() {
    return this.offersUrl;
  },

  async scrape() {
    try {
      this.log('Starting scrape on', window.location.href);
      await this.scrollToLoadAll();
      const offers = this.collectOffers();
      this.log('Found', offers.length, 'offers');

      const cleaned = offers.map(offer => ({
        merchant: offer.merchant,
        value: offer.value,
        expiry: 'Check portal',
        merchantCategory: typeof Categories !== 'undefined'
          ? Categories.detectCategory(offer.merchant)
          : 'other',
        valueType: offer.valueType,
        timestamp: Date.now()
      }));

      return { offers: cleaned, added: 0, totalFound: cleaned.length };
    } catch (err) {
      debug.error('[RMX-CapitalOneShopping] Scrape failed:', err);
      return { offers: [], added: 0, totalFound: 0 };
    }
  },

  async scrollToLoadAll() {
    const maxScrolls = 30;
    let previousCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      const currentCount = document.querySelectorAll('.deal-list-item, [data-test-merchant-name]').length;
      this.log(`Scroll ${i + 1}: ${currentCount} items`);

      if (currentCount > 0 && currentCount === previousCount) {
        this.log('No new items loaded, stopping scroll');
        break;
      }

      previousCount = currentCount;
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(1200);
    }

    window.scrollTo(0, 0);
  },

  collectOffers() {
    const offers = [];
    const seen = new Set();

    // Primary: deal list items with data attributes
    const items = document.querySelectorAll('.deal-list-item, [data-test-merchant-name]');
    this.log('Found', items.length, 'deal items via primary selectors');

    items.forEach(item => {
      const merchant = this.extractMerchant(item);
      if (!merchant) return;

      const key = merchant.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const { value, valueType } = this.extractValue(item);
      if (!value) return;

      offers.push({ merchant, value, valueType });
    });

    this.log('Collected', offers.length, 'unique offers');
    return offers;
  },

  extractMerchant(item) {
    // Most stable: data attribute
    const dataName = item.getAttribute('data-test-merchant-name');
    if (dataName) return dataName.trim();

    // Fallback: testid element
    const testIdEl = item.querySelector('[data-testid="deal-item-merchant-name"]');
    if (testIdEl) return testIdEl.textContent.trim();

    // Fallback: heading elements
    for (const sel of ['h3', 'h4', 'strong']) {
      const el = item.querySelector(sel);
      if (el && el.textContent.trim() && !el.textContent.includes('%') && !el.textContent.includes('$')) {
        return el.textContent.trim();
      }
    }

    return null;
  },

  extractValue(item) {
    // Look for the bold value span (e.g., "+ up to $150 Back")
    const boldSpans = item.querySelectorAll('.text-base.font-bold span, .font-bold span');
    for (const span of boldSpans) {
      const text = span.textContent.trim();
      const parsed = this.parseValue(text);
      if (parsed) return parsed;
    }

    // Fallback: search all text content for value patterns
    const fullText = item.textContent || '';
    const parsed = this.parseValue(fullText);
    if (parsed) return parsed;

    return { value: null, valueType: null };
  },

  parseValue(text) {
    // Clean up: remove leading +, trim
    const cleaned = text.replace(/^\+\s*/, '').trim();

    // "$X Back" or "up to $X Back"
    const fixedMatch = cleaned.match(/(?:up\s+to\s+)?\$(\d+(?:\.\d+)?)\s*(?:cash\s*)?back/i);
    if (fixedMatch) {
      const prefix = /up\s+to/i.test(cleaned) ? 'Up to ' : '';
      return {
        value: `${prefix}$${fixedMatch[1]} back`,
        valueType: 'fixed'
      };
    }

    // "X% back" or "up to X% back"
    const percentMatch = cleaned.match(/(?:up\s+to\s+)?(\d+(?:\.\d+)?)%\s*(?:cash\s*)?back/i);
    if (percentMatch) {
      const prefix = /up\s+to/i.test(cleaned) ? 'Up to ' : '';
      return {
        value: `${prefix}${percentMatch[1]}% back`,
        valueType: 'percent'
      };
    }

    return null;
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

if (typeof window !== 'undefined') {
  window.CapitalOneShoppingScraper = CapitalOneShoppingScraper;
  debug.log('[RMX-CapitalOneShopping] Scraper loaded successfully');
}
