// Chase Offers Scraper
// Based on proven approach from https://github.com/s-money-git/Chase-Add-Offers

const ChaseScraper = {
  source: 'chase',
  offersUrl: 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
  originalUrl: null, // Store original URL for navigation back
  isRunning: false,

  log(...args) {
    debug.log('[RMX-Chase]', ...args);
  },

  // Check if we need to navigate to offers page
  needsNavigation() {
    const url = window.location.href.toLowerCase();
    const isOnOffers = url.includes('offers') ||
                       url.includes('merchantoffers') ||
                       url.includes('offer-hub') ||
                       url.includes('deal');
    this.log('needsNavigation:', { url, isOnOffers });
    return !isOnOffers;
  },

  // Get the offers page URL
  getOffersUrl() {
    return this.offersUrl;
  },

  // Main scrape function
  async scrape() {
    try {
      this.log('Starting Chase scrape...');
      this.log('Current URL:', window.location.href);

      // Store the original URL for reliable navigation back
      this.originalUrl = window.location.href;
      this.isRunning = true;

      // Wait for page to load
      await this.wait(2000);

      // Scroll to load all offers
      await this.scrollToLoad();

      // Collect offers from the page (first pass - get all offer data)
      const offers = this.collectOffers();
      this.log('Collected', offers.length, 'offers to display');

      // Auto opt-in by clicking + buttons (using proven click-and-return method)
      const added = await this.clickAndReturn();

      // Clean offers for storage (remove any DOM references)
      const cleaned = offers.map(offer => ({
        merchant: offer.merchant,
        value: offer.value,
        expiry: offer.expiry || 'Check portal',
        merchantCategory: this.detectCategory(offer.merchant),
        valueType: this.parseValueType(offer.value),
        timestamp: Date.now()
      }));

      this.log('Scrape complete:', cleaned.length, 'offers,', added, 'opted in');
      return { offers: cleaned, added, totalFound: cleaned.length };
    } catch (err) {
      debug.error('[RMX-Chase] Scrape failed:', err);
      return { offers: [], added: 0, totalFound: 0 };
    }
  },

  // Click offers one at a time with navigation (proven approach)
  async clickAndReturn(attempts = 0) {
    if (!this.isRunning) {
      this.log('Stopped');
      return 0;
    }

    // Find all add buttons
    const buttons = document.querySelectorAll('[data-cy="commerce-tile-button"], [data-testid="commerce-tile-button"]');

    if (buttons.length === 0) {
      if (attempts < 3) {
        this.log(`No buttons detected. Retrying (${attempts + 1}/3)...`);
        await this.wait(2000);
        return this.clickAndReturn(attempts + 1);
      } else {
        this.log('All offers added!');
        return 0;
      }
    }

    const offersLeft = buttons.length;
    this.log(`Offers remaining: ${offersLeft}`);

    // Click the first button
    const button = buttons[0];
    const tile = button.closest('[data-testid="commerce-tile"], [data-cy="commerce-tile"]');
    const offerName = tile ? (tile.getAttribute('aria-label') || 'Unknown').split(' ').slice(4, -3).join(' ') : 'Unknown';

    this.log(`Clicking offer: ${offerName}`);

    try {
      // Try direct click first
      if (button && typeof button.click === 'function') {
        button.click();
      } else {
        // Fallback: dispatch click event
        this.log('Using fallback click method');
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        button.dispatchEvent(clickEvent);
      }
    } catch (error) {
      this.log('Error clicking button:', error);
      if (attempts < 3) {
        this.log(`Click failed. Retrying (${attempts + 1}/3)...`);
        await this.wait(1000);
        return this.clickAndReturn(attempts + 1);
      }
      return 0;
    }

    // Wait for navigation (randomized 800-1300ms)
    const backDelay = Math.floor(Math.random() * 500) + 800;
    await this.wait(backDelay);

    // Navigate back to offers page
    this.log('Returning to offers page...');
    window.location.href = this.originalUrl;

    // Wait for page reload (randomized 800-1300ms)
    const reloadDelay = Math.floor(Math.random() * 500) + 800;
    await this.wait(reloadDelay);

    // Continue to next offer
    if (this.isRunning) {
      const added = await this.clickAndReturn(0);
      return added + 1;
    }

    return 1;
  },

  // Stop the scraping process
  stop() {
    this.isRunning = false;
    this.log('Scraping stopped by user');
  },

  // Scroll to load all lazy-loaded offers
  async scrollToLoad() {
    this.log('Loading all offers via scroll...');
    let lastCount = 0;
    const maxPasses = 15; // More passes for large offer lists

    for (let i = 0; i < maxPasses; i++) {
      // Scroll down
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(800);

      // Count current tiles
      const currentCount = document.querySelectorAll('[data-testid="commerce-tile"], [data-cy="commerce-tile"]').length;
      this.log(`Scroll pass ${i + 1}: ${currentCount} tiles found`);

      if (currentCount <= lastCount) {
        // No new tiles loaded, we're done
        break;
      }
      lastCount = currentCount;
    }

    // Scroll back to top
    window.scrollTo(0, 0);
    await this.wait(500);
  },

  // Collect all offers from the page
  collectOffers() {
    const offers = [];
    const seen = new Set();

    this.log('Looking for commerce-tile elements...');

    // PRIMARY: Find all commerce tiles (Chase's offer cards)
    const tiles = document.querySelectorAll('[data-testid="commerce-tile"], [data-cy="commerce-tile"]');
    this.log('Found', tiles.length, 'commerce-tile elements');

    tiles.forEach((tile, index) => {
      // Extract from aria-label first (most reliable)
      // Format: "3 of 72 LensDirect $20 cash back"
      const ariaLabel = tile.getAttribute('aria-label') || '';
      this.log(`Tile ${index} aria-label:`, ariaLabel);

      // Try to extract merchant and value from aria-label
      let merchant = null;
      let value = null;

      // Parse aria-label: "X of Y MerchantName Value"
      const ariaMatch = ariaLabel.match(/^\d+\s+of\s+\d+\s+(.+?)\s+(\$\d+.*?|\d+%.*?)$/i);
      if (ariaMatch) {
        merchant = ariaMatch[1].trim();
        value = ariaMatch[2].trim();
        this.log(`Tile ${index} parsed from aria:`, { merchant, value });
      }

      // Fallback: Extract from DOM elements
      if (!merchant) {
        merchant = this.extractMerchantFromTile(tile);
      }
      if (!value) {
        value = this.extractValueFromTile(tile);
      }

      this.log(`Tile ${index} final:`, { merchant, value });

      // Skip if no merchant or duplicate
      if (!merchant) {
        this.log(`Tile ${index}: skipping - no merchant found`);
        return;
      }

      const key = merchant.toLowerCase();
      if (seen.has(key)) {
        this.log(`Tile ${index}: skipping - duplicate merchant`);
        return;
      }
      seen.add(key);

      // Extract expiry if available
      const expiry = this.extractExpiryFromTile(tile);

      offers.push({
        merchant,
        value: value || 'See details',
        expiry
      });

      this.log(`Tile ${index}: added offer -`, merchant, '|', value);
    });

    // FALLBACK: Try offerTileGridItemContainer if no commerce-tiles found
    if (offers.length === 0) {
      this.log('No commerce-tiles found, trying fallback selectors...');
      const containers = document.querySelectorAll('.offerTileGridItemContainer, [class*="offerTile"]');
      this.log('Found', containers.length, 'fallback containers');

      containers.forEach((container, index) => {
        const tile = container.querySelector('[data-testid="commerce-tile"], [data-cy="commerce-tile"], [role="button"]');
        if (!tile) return;

        const ariaLabel = tile.getAttribute('aria-label') || '';
        let merchant = null;
        let value = null;

        const ariaMatch = ariaLabel.match(/^\d+\s+of\s+\d+\s+(.+?)\s+(\$\d+.*?|\d+%.*?)$/i);
        if (ariaMatch) {
          merchant = ariaMatch[1].trim();
          value = ariaMatch[2].trim();
        }

        if (!merchant) merchant = this.extractMerchantFromTile(container);
        if (!value) value = this.extractValueFromTile(container);

        if (!merchant) return;

        const key = merchant.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        offers.push({
          merchant,
          value: value || 'See details',
          expiry: this.extractExpiryFromTile(container)
        });
      });
    }

    return offers;
  },

  // Extract merchant name from tile DOM
  extractMerchantFromTile(tile) {
    // Priority 1: mds-body-small-heavier class (Chase's merchant name element)
    const merchantSpan = tile.querySelector('span.mds-body-small-heavier, [class*="mds-body-small-heavier"]');
    if (merchantSpan && merchantSpan.textContent.trim()) {
      const text = merchantSpan.textContent.trim();
      // Make sure it's not the value (shouldn't contain $ or %)
      if (!text.includes('$') && !text.includes('%')) {
        return text;
      }
    }

    // Priority 2: Look for specific class patterns
    const nameSelectors = [
      '[class*="merchantName"]',
      '[class*="merchant-name"]',
      '[class*="offer-title"]',
      '[class*="r9jbijk"]' // From the HTML sample
    ];

    for (const selector of nameSelectors) {
      const el = tile.querySelector(selector);
      if (el && el.textContent.trim()) {
        const text = el.textContent.trim();
        if (!text.includes('$') && !text.includes('%') && text.length < 50) {
          return text;
        }
      }
    }

    // Priority 3: First span that doesn't look like a value
    const spans = tile.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text &&
          !text.includes('$') &&
          !text.includes('%') &&
          !text.includes('back') &&
          !text.toLowerCase().includes('new') &&
          !text.toLowerCase().includes('expir') &&
          text.length > 2 &&
          text.length < 50) {
        return text;
      }
    }

    return null;
  },

  // Extract value from tile DOM
  extractValueFromTile(tile) {
    // Priority 1: mds-body-large-heavier class (Chase's value element)
    const valueSpan = tile.querySelector('span.mds-body-large-heavier, [class*="mds-body-large-heavier"]');
    if (valueSpan && valueSpan.textContent.trim()) {
      return valueSpan.textContent.trim();
    }

    // Priority 2: Look for specific class patterns
    const valueSelectors = [
      '[class*="r9jbijj"]', // From the HTML sample
      '[class*="offer-value"]',
      '[class*="cashback"]',
      '[class*="reward"]'
    ];

    for (const selector of valueSelectors) {
      const el = tile.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    // Priority 3: Look for text patterns
    const tileText = tile.textContent || '';
    const valuePatterns = [
      /(\$\d+(?:\.\d+)?\s*(?:cash\s*)?back)/i,
      /(\d+%\s*(?:cash\s*)?back)/i,
      /(\d+x\s*points?)/i,
      /(earn\s+\$\d+)/i,
      /(earn\s+\d+%)/i
    ];

    for (const pattern of valuePatterns) {
      const match = tileText.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  },

  // Extract expiry from tile DOM
  extractExpiryFromTile(tile) {
    // Look for expiry-related text
    const tileText = tile.textContent || '';

    const expiryPatterns = [
      /expires?\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
      /valid\s*(?:through|until)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
      /ends?\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i
    ];

    for (const pattern of expiryPatterns) {
      const match = tileText.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Look for expiry elements
    const expirySelectors = [
      '[class*="expir"]',
      '[class*="valid"]',
      '[class*="date"]',
      'time'
    ];

    for (const selector of expirySelectors) {
      const el = tile.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    return 'Check portal';
  },

  // Detect merchant category
  detectCategory(merchantName) {
    if (typeof Categories !== 'undefined') {
      return Categories.detectCategory(merchantName);
    }
    return 'other';
  },

  // Parse value type
  parseValueType(value) {
    if (!value) return 'unknown';
    if (value.includes('%')) return 'percent';
    if (value.includes('$')) return 'fixed';
    if (/\d+x/i.test(value)) return 'multiplier';
    return 'unknown';
  },

  // Utility: wait
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Wait for offers to be visible on page
  async waitForOffers(timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const tiles = document.querySelectorAll('[data-testid="commerce-tile"], [data-cy="commerce-tile"]');
      if (tiles.length > 0) {
        this.log('Offers loaded:', tiles.length, 'tiles');
        return true;
      }
      await this.wait(200);
    }

    this.log('Timeout waiting for offers');
    return false;
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.ChaseScraper = ChaseScraper;
}
