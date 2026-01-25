// Rakuten Cashback Scraper
// Scrapes available cashback rates from Rakuten

const RakutenScraper = {
  source: 'rakuten',
  offersUrl: 'https://www.rakuten.com/stores',

  needsNavigation() {
    return false;
  },

  getOffersUrl() {
    return this.offersUrl;
  },

  async scrape() {
    const host = window.location.hostname.toLowerCase();

    if (host.includes('rakuten.com')) {
      return await this.scrapeRakutenSite();
    }

    // On other sites, check for Rakuten button/extension
    return await this.checkCurrentSite();
  },

  async scrapeRakutenSite() {
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
    for (let i = 0; i < 10; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(1000);
    }
    window.scrollTo(0, 0);
  },

  collectMerchantRates() {
    const offers = [];
    const seen = new Set();

    const cardSelectors = [
      '[class*="store-card"]',
      '[class*="StoreCard"]',
      '[class*="merchant-tile"]',
      '[class*="MerchantTile"]',
      '[data-testid*="store"]',
      '[data-testid*="merchant"]',
      'a[href*="/stores/"]'
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

    // Also look for featured deals
    const featuredSelectors = [
      '[class*="featured"]',
      '[class*="deal"]',
      '[class*="promo"]'
    ].join(', ');

    document.querySelectorAll(featuredSelectors).forEach(card => {
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
      '[class*="store-name"]',
      '[class*="merchant-name"]',
      '[class*="StoreName"]',
      '[class*="name"]',
      'h3', 'h4', 'strong',
      'img[alt]'
    ];

    for (const sel of selectors) {
      const el = card.querySelector(sel);
      if (el) {
        // Check for alt text on images
        if (el.tagName === 'IMG' && el.alt) {
          return el.alt.trim();
        }
        const text = el.textContent.trim();
        if (text && !text.includes('%') && text.length < 100) {
          return text;
        }
      }
    }

    return null;
  },

  extractCashbackRate(card) {
    const text = card.textContent || '';

    // Look for various cashback patterns
    const patterns = [
      /(\d+(?:\.\d+)?%)\s*Cash\s*Back/i,
      /Up\s*to\s*(\d+(?:\.\d+)?%)/i,
      /(\d+(?:\.\d+)?%)\s*back/i,
      /(\d+(?:\.\d+)?%)/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1] + ' Cash Back';
    }

    // Check for dollar amounts
    const dollarMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(?:Cash\s*Back|back|bonus)/i);
    if (dollarMatch) return '$' + dollarMatch[1] + ' back';

    return 'See details';
  },

  extractPortalUrl(card) {
    if (card.tagName === 'A' && card.href) {
      return card.href;
    }

    const link = card.querySelector('a[href*="/stores/"], a[href*="shop"]');
    if (link) return link.href;

    return null;
  },

  async checkCurrentSite() {
    // Check for Rakuten button presence
    const rakutenPresent = document.querySelector(
      '[class*="rakuten"], [id*="rakuten"], [data-rakuten], #ebates-notif'
    );

    if (rakutenPresent) {
      const rateEl = document.querySelector(
        '[class*="cashback"], [class*="rate"], [class*="Cash Back"]'
      );
      const rate = rateEl ? rateEl.textContent.trim() : null;

      const currentHost = window.location.hostname.replace('www.', '');

      return {
        available: true,
        merchant: currentHost,
        rate: rate,
        portalUrl: 'https://www.rakuten.com/stores/' + currentHost.split('.')[0]
      };
    }

    return { available: false };
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
  window.RakutenScraper = RakutenScraper;
}
