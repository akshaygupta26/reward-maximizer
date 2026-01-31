// Rakuten Cashback Scraper
// Scrapes available cashback rates from Rakuten

const RakutenScraper = {
  source: 'rakuten',
  offersUrl: 'https://www.rakuten.com/stores',
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
      // On other sites, check for Rakuten button/extension
      return await this.checkCurrentSite();
    } catch (err) {
      debug.error('[RMX-Rakuten] Scrape failed:', err);
      return { offers: [], added: 0, totalFound: 0 };
    }
  },

  async scrapeRakutenSite() {
    this.log('Scrolling to load lazy content...');
    await this.scrollToLoad();

    // First check if we're already in a modal view
    const inModal = document.querySelector('.chakra-modal__body');
    if (inModal) {
      this.log('Already in modal view, scraping directly...');
      const offers = this.collectMerchantRatesFromModal();
      return this.formatOffers(offers);
    }

    // Try to click "See All" buttons to open modals
    this.log('Looking for "See All" buttons...');
    const seeAllButtons = Array.from(document.querySelectorAll('a.chakra-button'))
      .filter(btn => btn.textContent.includes('See All'));

    this.log('Found', seeAllButtons.length, '"See All" buttons');

    let allOffers = [];

    // If we found See All buttons, iterate through ALL of them
    if (seeAllButtons.length > 0) {
      for (let i = 0; i < seeAllButtons.length; i++) {
        this.log(`Clicking "See All" button ${i + 1} of ${seeAllButtons.length}...`);

        // Click the button to open modal
        seeAllButtons[i].click();
        await this.wait(2000); // Wait for modal to open

        // Scrape from the modal
        const offers = this.collectMerchantRatesFromModal();
        this.log(`Collected ${offers.length} offers from modal ${i + 1}`);
        allOffers = allOffers.concat(offers);

        // Close the modal to return to original state
        await this.closeModal();
        await this.wait(1000); // Wait for modal to close
      }

      this.log('=== Scraping complete, returned to original page ===');
    } else {
      // Fallback: try collecting from main page
      this.log('No "See All" buttons found, trying main page...');
      const offers = this.collectMerchantRates();
      this.log('Collected', offers.length, 'offers from main page');
      allOffers = allOffers.concat(offers);
    }

    return this.formatOffers(allOffers);
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

    this.log('Using card selectors:', cardSelectors);
    const cards = document.querySelectorAll(cardSelectors);
    this.log('Found merchant cards:', cards.length);

    cards.forEach((card, index) => {
      const merchant = this.extractMerchant(card);
      const value = this.extractCashbackRate(card);
      const portalUrl = this.extractPortalUrl(card);

      if (index < 3) { // Log first 3 for debugging
        this.log(`Card ${index}:`, { merchant, value, portalUrl });
      }

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

    this.log('Looking for featured deals with selectors:', featuredSelectors);
    const featuredCards = document.querySelectorAll(featuredSelectors);
    this.log('Found featured cards:', featuredCards.length);

    featuredCards.forEach(card => {
      const merchant = this.extractMerchant(card);
      const value = this.extractCashbackRate(card);
      const portalUrl = this.extractPortalUrl(card);

      if (!merchant || seen.has(merchant.toLowerCase())) return;
      seen.add(merchant.toLowerCase());

      offers.push({ merchant, value, portalUrl });
    });

    this.log('Total unique merchants collected:', offers.length);
    return offers;
  },

  collectMerchantRatesFromModal() {
    try {
    this.log('=== Scraping from modal ===');
    const offers = [];
    const seen = new Set();

    // Find the modal body
    const modalBody = document.querySelector('.chakra-modal__body');
    if (!modalBody) {
      this.log('ERROR: Modal body not found');
      return offers;
    }

    this.log('Modal body found, looking for merchant links...');

    // Find all merchant links in the modal
    const merchantLinks = modalBody.querySelectorAll('a.chakra-link');
    this.log('Found merchant links in modal:', merchantLinks.length);

    merchantLinks.forEach((link, index) => {
      // Extract merchant name from img alt attribute
      const img = link.querySelector('img[alt]');
      let merchant = null;

      if (img && img.alt) {
        // Remove the " - Rakuten coupons and Cash Back" suffix
        merchant = img.alt.replace(/ - Rakuten coupons and Cash Back/i, '').trim();
      }

      // Extract cashback percentage from the span (multiple selectors for resilience)
      const cashbackSpan = link.querySelector('span.css-1o3lf2p')
        || link.querySelector('[class*="cashback"], [class*="rate"], [class*="percent"]');
      let value = 'See details';

      if (cashbackSpan) {
        value = cashbackSpan.textContent.trim();
      } else {
        // Fallback: search link text for cashback pattern
        const linkText = link.textContent || '';
        const rateMatch = linkText.match(/(\d+(?:\.\d+)?%)\s*Cash\s*Back/i)
          || linkText.match(/(\d+(?:\.\d+)?%)/);
        if (rateMatch) value = rateMatch[1] + ' Cash Back';
      }

      // Extract portal URL
      const portalUrl = link.href;

      if (index < 3) { // Log first 3 for debugging
        this.log(`Modal merchant ${index}:`, { merchant, value, portalUrl });
      }

      if (!merchant || seen.has(merchant.toLowerCase())) return;
      seen.add(merchant.toLowerCase());

      offers.push({ merchant, value, portalUrl });
    });

    this.log('Total unique merchants from modal:', offers.length);
    return offers;
    } catch (err) {
      debug.error('[RMX-Rakuten] collectMerchantRatesFromModal failed:', err);
      return [];
    }
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
    this.log('Checking for Rakuten button/extension on page...');
    // Check for Rakuten button presence
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

  async closeModal() {
    this.log('Closing modal...');

    // Try multiple selectors for the close button
    const closeSelectors = [
      '.chakra-modal__close-btn',
      'button[aria-label="Close"]',
      '[data-testid="modal-close"]',
      '.chakra-modal__header button'
    ];

    for (const selector of closeSelectors) {
      const closeButton = document.querySelector(selector);
      if (closeButton) {
        this.log('Found close button with selector:', selector);
        closeButton.click();
        return;
      }
    }

    // Fallback: try pressing ESC key to close modal
    this.log('No close button found, trying ESC key...');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
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
