// Capital One Shopping Portal Tracker
// Capital One doesn't have click-to-activate offers - users must shop through their portal
// This scraper tracks available cashback rates and helps redirect users through the portal

const CapitalOneScraper = {
  source: 'capital-one',
  shoppingUrl: 'https://www.capitaloneshopping.com/',
  portalBaseUrl: 'https://www.capitaloneshopping.com/s/',

  // Capital One Shopping page - scrape available rates
  needsNavigation() {
    // For Capital One, we scrape rates from the shopping portal
    // No traditional "offers page" to navigate to
    return false;
  },

  getOffersUrl() {
    return this.shoppingUrl;
  },

  async scrape() {
    const host = window.location.hostname.toLowerCase();

    // On Capital One Shopping site - scrape merchant rates
    if (host.includes('capitaloneshopping.com')) {
      return await this.scrapeShoppingPortal();
    }

    // On any other site - check if cashback available
    return await this.checkCurrentSite();
  },

  // Scrape cashback rates from Capital One Shopping portal
  async scrapeShoppingPortal() {
    await this.scrollToLoad();
    const offers = this.collectMerchantRates();

    const cleaned = offers.map(offer => ({
      merchant: offer.merchant,
      value: offer.value,
      expiry: 'Ongoing',
      merchantCategory: this.detectCategory(offer.merchant),
      valueType: 'percent',
      portalUrl: offer.portalUrl,
      timestamp: Date.now()
    }));

    return { offers: cleaned, added: 0, totalFound: cleaned.length };
  },

  async scrollToLoad() {
    for (let i = 0; i < 5; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(800);
    }
    window.scrollTo(0, 0);
  },

  collectMerchantRates() {
    const offers = [];
    const seen = new Set();

    // Selectors for Capital One Shopping merchant cards
    const cardSelectors = [
      '[class*="merchant-card"]',
      '[class*="MerchantCard"]',
      '[class*="store-card"]',
      '[class*="StoreCard"]',
      '[data-testid*="merchant"]',
      '[data-testid*="store"]',
      'a[href*="/s/"]'
    ].join(', ');

    const cards = document.querySelectorAll(cardSelectors);

    cards.forEach(card => {
      const merchant = this.extractMerchant(card);
      const value = this.extractCashbackRate(card);
      const portalUrl = this.extractPortalUrl(card);

      if (!merchant || seen.has(merchant.toLowerCase())) return;
      seen.add(merchant.toLowerCase());

      offers.push({ merchant, value, portalUrl });
    });

    return offers;
  },

  extractMerchant(card) {
    const selectors = [
      '[class*="merchant-name"]',
      '[class*="store-name"]',
      '[class*="name"]',
      'h3', 'h4', 'strong'
    ];

    for (const sel of selectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent.trim() && !el.textContent.includes('%')) {
        return el.textContent.trim();
      }
    }

    // Try to extract from link text
    if (card.tagName === 'A') {
      const text = card.textContent.trim();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines[0] && !lines[0].includes('%')) return lines[0];
    }

    return null;
  },

  extractCashbackRate(card) {
    const text = card.textContent || '';
    const match = text.match(/(\d+(?:\.\d+)?%)\s*(?:cash\s*)?back/i);
    if (match) return match[1] + ' back';

    const percentMatch = text.match(/(\d+(?:\.\d+)?%)/);
    if (percentMatch) return percentMatch[1] + ' back';

    return 'See details';
  },

  extractPortalUrl(card) {
    // Find the shopping link
    if (card.tagName === 'A' && card.href) {
      return card.href;
    }

    const link = card.querySelector('a[href*="/s/"], a[href*="shop"]');
    if (link) return link.href;

    return null;
  },

  // Check if current site has Capital One cashback available
  async checkCurrentSite() {
    const currentHost = window.location.hostname.replace('www.', '').toLowerCase();

    // This would ideally check against a cached list of merchants
    // For now, we'll check for CO Shopping extension presence
    const coShoppingPresent = document.querySelector(
      '[class*="capitalone"], [id*="capitalone"], [data-capitalone]'
    );

    if (coShoppingPresent) {
      const rateEl = document.querySelector(
        '[class*="cashback"], [class*="rate"], [class*="reward"]'
      );
      const rate = rateEl ? rateEl.textContent.trim() : null;

      return {
        available: true,
        merchant: currentHost,
        rate: rate,
        portalUrl: this.portalBaseUrl + currentHost.split('.')[0]
      };
    }

    return {
      available: false,
      merchant: currentHost
    };
  },

  // Generate portal redirect URL for a merchant
  getPortalUrl(merchantName) {
    const slug = merchantName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return this.portalBaseUrl + slug;
  },

  detectCategory(merchantName) {
    if (typeof Categories !== 'undefined') return Categories.detectCategory(merchantName);
    return 'other';
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

if (typeof window !== 'undefined') {
  window.CapitalOneScraper = CapitalOneScraper;
}
