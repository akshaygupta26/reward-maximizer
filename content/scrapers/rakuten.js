// Rakuten Cashback Scraper
// Scrapes available cashback rates from Rakuten

const RakutenScraper = {
  source: 'rakuten',
  offersUrl: 'https://www.rakuten.com/stores/all',
  // Logging helper
  log(...args) {
    debug.log('[RMX-Rakuten]', ...args);
  },

  needsNavigation() {
    return false;
  },

  getOffersUrl() {
    return this.offersUrl;
  },

  async scrape() {
    try {
      this.log('=== Starting Rakuten scrape ===');
      const host = window.location.hostname.toLowerCase();
      this.log('Current hostname:', host);

      if (host.includes('rakuten.com')) {
        this.log('On Rakuten site - scraping merchant rates');
        return await this.scrapeRakutenSite();
      }

      this.log('On external site - checking for Rakuten button');
      return await this.checkCurrentSite();
    } catch (err) {
      debug.error('[RMX-Rakuten] Scrape failed:', err);
      return { offers: [], added: 0, totalFound: 0 };
    }
  },

  async scrapeRakutenSite() {
    this.log('Scrolling to load lazy content...');
    await this.scrollToLoad();

    const offers = this.collectMerchantRates();
    this.log('Collected', offers.length, 'offers from page');

    return this.formatOffers(offers);
  },

  formatOffers(offers) {
    const cleaned = offers.map(offer => ({
      merchant: offer.merchant,
      value: offer.value,
      expiry: 'Ongoing',
      merchantCategory: this.detectCategory(offer.merchant),
      valueType: 'percent',
      portalUrl: offer.portalUrl,
      timestamp: Date.now()
    }));

    this.log('Total cleaned offers:', cleaned.length);
    if (cleaned.length > 0) {
      this.log('Sample offer:', cleaned[0]);
    }

    const result = { offers: cleaned, added: 0, totalFound: cleaned.length };
    debug.log('[RMX-Rakuten] RETURNING TO POPUP:', JSON.stringify({
      offersCount: result.offers.length,
      sample: result.offers[0]
    }));
    return result;
  },

  async scrollToLoad() {
    for (let i = 0; i < 5; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(1000);
    }
    window.scrollTo(0, 0);
    await this.wait(500);
  },

  collectMerchantRates() {
    const offers = [];
    const seen = new Set();

    // Primary selector: store cards are <a role="group" class="chakra-link">
    const storeCards = document.querySelectorAll('a[role="group"].chakra-link');
    this.log('Found store cards (a[role="group"]):', storeCards.length);

    storeCards.forEach((card, index) => {
      const merchant = this.extractMerchant(card);
      const value = this.extractCashbackRate(card);
      const portalUrl = card.href || null;

      if (index < 3) {
        this.log(`Card ${index}:`, { merchant, value, portalUrl });
      }

      if (!merchant || seen.has(merchant.toLowerCase())) return;
      seen.add(merchant.toLowerCase());

      offers.push({ merchant, value, portalUrl });
    });

    // Fallback: if primary selector found nothing, try broader selectors
    if (offers.length === 0) {
      this.log('Primary selector found nothing, trying fallbacks...');
      const fallbackCards = document.querySelectorAll(
        'a.chakra-link[href*="rakuten.com/"], [role="group"][class*="chakra"]'
      );
      this.log('Fallback cards found:', fallbackCards.length);

      fallbackCards.forEach((card, index) => {
        const merchant = this.extractMerchant(card);
        const value = this.extractCashbackRate(card);
        const portalUrl = card.tagName === 'A' ? card.href : null;

        if (!merchant || seen.has(merchant.toLowerCase())) return;
        seen.add(merchant.toLowerCase());

        offers.push({ merchant, value, portalUrl });
      });
    }

    this.log('Total unique merchants collected:', offers.length);
    return offers;
  },

  extractMerchant(card) {
    // Method 1: img alt text (most reliable — always present)
    const img = card.querySelector('img[alt*="Rakuten"]');
    if (img && img.alt) {
      const name = img.alt.replace(/\s*-\s*Rakuten coupons and Cash Back/i, '').trim();
      if (name) return name;
    }

    // Method 2: first span that doesn't contain "%" or "Cash Back"
    const spans = card.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text && text.length < 80 && !text.includes('%') && !text.includes('Cash Back') && !text.includes('was ')) {
        return text;
      }
    }

    // Method 3: any img alt text
    const anyImg = card.querySelector('img[alt]');
    if (anyImg && anyImg.alt) {
      return anyImg.alt.trim();
    }

    return null;
  },

  extractCashbackRate(card) {
    const text = card.textContent || '';

    // Look for "Up to X% Cash Back" first (more specific)
    const upToMatch = text.match(/Up\s*to\s*(\d+(?:\.\d+)?%)\s*Cash\s*Back/i);
    if (upToMatch) return 'Up to ' + upToMatch[1] + ' Cash Back';

    // Then "X% Cash Back"
    const cashbackMatch = text.match(/(\d+(?:\.\d+)?%)\s*Cash\s*Back/i);
    if (cashbackMatch) return cashbackMatch[1] + ' Cash Back';

    // Then just percentage
    const percentMatch = text.match(/(\d+(?:\.\d+)?%)\s*back/i);
    if (percentMatch) return percentMatch[1] + ' Cash Back';

    // Dollar amounts
    const dollarMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(?:Cash\s*Back|back|bonus)/i);
    if (dollarMatch) return '$' + dollarMatch[1] + ' back';

    return 'See details';
  },

  async checkCurrentSite() {
    this.log('Checking for Rakuten button/extension on page...');
    const rakutenPresent = document.querySelector(
      '[class*="rakuten"], [id*="rakuten"], [data-rakuten], #ebates-notif'
    );

    this.log('Rakuten extension present:', !!rakutenPresent);

    if (rakutenPresent) {
      const rateEl = document.querySelector(
        '[class*="cashback"], [class*="rate"], [class*="Cash Back"]'
      );
      const rate = rateEl ? rateEl.textContent.trim() : null;
      this.log('Detected cashback rate:', rate);

      const currentHost = window.location.hostname.replace('www.', '');
      this.log('Current merchant:', currentHost);

      return {
        available: true,
        merchant: currentHost,
        rate: rate,
        portalUrl: 'https://www.rakuten.com/stores/' + currentHost.split('.')[0]
      };
    }

    this.log('No Rakuten button found on page');
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
  debug.log('[RMX-Rakuten] Scraper loaded successfully');
}
