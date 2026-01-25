// Chase Offers Scraper
// Updated for Chase's commerce-tile based UI

const ChaseScraper = {
  source: 'chase',
  offersUrl: 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
  debug: true,

  log(...args) {
    if (this.debug) {
      console.log('[RMX-Chase]', ...args);
    }
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
    this.log('Starting Chase scrape...');
    this.log('Current URL:', window.location.href);

    // Store the offers page URL for returning after clicks
    this.offersPageUrl = window.location.href;

    // Wait for page to load
    await this.wait(2000);

    // Scroll to load all offers
    await this.scrollToLoad();

    // Collect offers from the page (first pass - get all offer data)
    const offers = this.collectOffers();
    this.log('Collected', offers.length, 'offers');

    // Auto opt-in by clicking + buttons
    // After each click, Chase navigates away - we immediately go back
    const added = await this.optInToOffers();

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
  },

  // Opt-in to offers by clicking + buttons
  async optInToOffers() {
    let added = 0;
    const maxAttempts = 100; // Safety limit
    let attempts = 0;
    const clickedIds = new Set(); // Track which offers we've clicked

    while (attempts < maxAttempts) {
      attempts++;

      // Find all + buttons that haven't been clicked yet
      const addButtons = document.querySelectorAll('[data-testid="commerce-tile-button"], [data-cy="commerce-tile-button"]');
      this.log(`Attempt ${attempts}: Found ${addButtons.length} add buttons`);

      let clickedOne = false;

      for (const btn of addButtons) {
        // Get the parent tile to find its ID
        const tile = btn.closest('[data-testid="commerce-tile"], [data-cy="commerce-tile"]');
        if (!tile) continue;

        const tileId = tile.id || tile.getAttribute('aria-label') || '';

        // Skip if already clicked
        if (clickedIds.has(tileId)) continue;

        // Check if this offer is already activated (look for visual indicators)
        const isActivated = this.isOfferActivated(tile);
        if (isActivated) {
          this.log(`Skipping ${tileId}: already activated`);
          clickedIds.add(tileId);
          continue;
        }

        try {
          this.log(`Clicking offer: ${tileId}`);

          // Find the actual clickable element
          // The data-testid is on SVG, so we need to find clickable parent or the tile itself
          let clickTarget = btn.closest('div[role="button"], button, a') || btn.parentElement || tile;

          // Scroll into view
          clickTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
          await this.wait(100);

          // Dispatch a proper click event (works on any element including SVG parents)
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          clickTarget.dispatchEvent(clickEvent);
          clickedIds.add(tileId);
          added++;
          clickedOne = true;

          // Wait briefly for the opt-in to register
          await this.wait(500);

          // Check if we navigated away (URL changed to offer-activated)
          if (window.location.href.includes('offer-activated')) {
            this.log('Navigated to confirmation page, going back...');

            // Go back to offers page
            window.history.back();

            // Wait for offers to reload
            await this.waitForOffers(5000);

            // If still not on offers page, force navigate
            if (!window.location.href.includes('offer-hub') && !window.location.href.includes('merchantOffers')) {
              this.log('Forcing navigation back to offers page');
              window.location.href = this.offersPageUrl;
              await this.waitForOffers(5000);
            }
          }

          // Wait for page to stabilize before next click
          await this.wait(500);

          // Break to re-query DOM (elements may have changed)
          break;

        } catch (err) {
          this.log('Error clicking button:', err.message);
        }
      }

      // If we didn't click anything this round, we're done
      if (!clickedOne) {
        this.log('No more buttons to click');
        break;
      }
    }

    this.log(`Opted in to ${added} offers`);
    return added;
  },

  // Check if an offer is already activated
  isOfferActivated(tile) {
    if (!tile) return false;

    // Check aria-label for "added" or "activated" indicators
    const ariaLabel = (tile.getAttribute('aria-label') || '').toLowerCase();
    if (ariaLabel.includes('added') || ariaLabel.includes('activated') || ariaLabel.includes('saved')) {
      return true;
    }

    // Check for checkmark icon or "Added" text
    const tileText = (tile.textContent || '').toLowerCase();
    if (tileText.includes('added to card') || tileText.includes('offer saved')) {
      return true;
    }

    // Check for visual state change (button might change to checkmark)
    const btn = tile.querySelector('[data-testid="commerce-tile-button"], [data-cy="commerce-tile-button"]');
    if (btn) {
      const btnSvg = btn.querySelector('svg');
      if (btnSvg) {
        // Check if SVG is a checkmark (different path than +)
        const path = btnSvg.querySelector('path');
        if (path) {
          const d = path.getAttribute('d') || '';
          // + icon has "M17" in path, checkmark typically has different pattern
          if (!d.includes('M17') && !d.includes('h-2') && d.includes('l') || d.includes('L')) {
            // Likely a checkmark
            return true;
          }
        }
      }
    }

    return false;
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
