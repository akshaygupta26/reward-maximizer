// American Express Offers Scraper
// With extensive logging for debugging

const AmexScraper = {
  source: 'amex',
  offersUrl: 'https://global.americanexpress.com/offers/eligible',
  // Logging helper
  log(...args) {
    debug.log('[RMX-Amex]', ...args);
  },

  // Check if we need to navigate to offers page
  needsNavigation() {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const url = window.location.href.toLowerCase();

    // Check if we're on any offers-related page
    const isOnOffersPage = path.includes('/offers') || url.includes('/offers');

    // Also check if there are any merchant offer buttons on the page
    const hasOfferButtons = document.querySelectorAll('button[data-testid="merchantOfferListAddButton"]').length > 0;

    this.log('needsNavigation check:', { path, isOnOffersPage, hasOfferButtons });

    // Don't redirect if we're on offers page OR if we can see offer buttons
    return !isOnOffersPage && !hasOfferButtons;
  },

  // Get the offers page URL
  getOffersUrl() {
    return this.offersUrl;
  },

  // Main scrape function
  async scrape() {
    try {
      this.log('Starting Amex scrape...');
      this.log('Current URL:', window.location.href);

      // Wait for page to stabilize
      await this.wait(2000);

      // Expand and load all offers
      await this.expandOffers();

      // First pass: collect all offer data WITHOUT clicking
      const offers = this.collectOffers();
      this.log(`Found ${offers.length} merchant offers to process`);

      // Store collected offer data (without button references)
      const collectedOffers = offers.map(offer => ({
        merchant: offer.merchant,
        value: offer.value,
        expiry: offer.expiry,
        merchantCategory: this.detectCategory(offer.merchant),
        valueType: this.parseValueType(offer.value),
        timestamp: Date.now()
      }));

      // Second pass: batch opt-in using fast sequential engine
      let added = 0;
      try {
        const batchResult = await BatchOptIn.run({
          source: 'amex',

          findButtons: () => {
            return Array.from(
              document.querySelectorAll('button[data-testid="merchantOfferListAddButton"]')
            );
          },

          isAlreadyAdded: (btn) => {
            if (btn.disabled) return true;
            const text = (btn.textContent || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            return text.includes('added') || title.includes('added');
          },

          getMerchantName: (btn) => {
            const card = AmexScraper.findCardForButton(btn);
            const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
            return AmexScraper.extractMerchant(card, label) || 'Unknown';
          },

          minDelay: 250,       // Amex handles fast clicks well
          maxDelay: 1500,      // Timeout if DOM never stabilizes
          scrollToButton: true  // Amex needs scroll for lazy-loaded offers
        });

        added = batchResult.added;
      } catch (batchErr) {
        this.log('BatchOptIn failed, offers still collected:', batchErr);
      }

      this.log(`Scrape complete: ${collectedOffers.length} offers found, ${added} clicked`);
      return { offers: collectedOffers, added, totalFound: collectedOffers.length };
    } catch (err) {
      debug.error('[RMX-Amex] Scrape failed:', err);
      return { offers: [], added: 0, totalFound: 0 };
    }
  },

  // Expand offers by clicking "View All" and scrolling
  async expandOffers() {
    this.log('Expanding offers...');

    // Look for tab/filter to show "Available" or "Eligible" offers
    const availableTab = document.querySelector(
      '[data-testid*="available"], [data-testid*="eligible"], ' +
      'button[aria-label*="available" i], button[aria-label*="eligible" i]'
    );

    if (availableTab && this.isVisible(availableTab)) {
      this.log('Found available/eligible tab, clicking...');
      availableTab.click();
      await this.wait(1500);
    }

    // Look for "View All" or "See All" buttons
    const viewAllBtn = this.findButtonByText(['view all offers', 'see all offers', 'view all', 'see all']);
    if (viewAllBtn && this.isVisible(viewAllBtn)) {
      this.log('Found View All button, clicking...');
      try {
        viewAllBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.wait(300);
        viewAllBtn.click();
        await this.wait(1500);
      } catch (err) {
        this.log('Unable to click View All:', err);
      }
    }

    await this.loadAllOffers();
  },

  // Scroll to load all lazy-loaded offers
  async loadAllOffers() {
    this.log('Loading all offers via scroll...');
    let lastCount = 0;
    const maxPasses = 10;

    for (let i = 0; i < maxPasses; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(1000);

      const currentCount = this.countMerchantOfferCards();
      this.log(`Scroll pass ${i + 1}: ${currentCount} offer cards found`);
      if (currentCount <= lastCount) break;
      lastCount = currentCount;
    }

    window.scrollTo(0, 0);
    await this.wait(500);
  },

  // Count merchant offer cards (not feature tiles)
  countMerchantOfferCards() {
    return document.querySelectorAll(this.getMerchantCardSelector()).length;
  },

  // Get selector for actual merchant offer cards
  getMerchantCardSelector() {
    return [
      // Amex list view row (the actual offer container based on user's HTML)
      '[class*="_listViewRow"]',
      '[class*="listViewRow"]',
      // Generic offer containers
      '[data-testid="offer-card"]',
      '[data-testid*="merchant-offer"]',
      '[class*="offer-card"]',
      '[class*="OfferCard"]'
    ].join(', ');
  },

  // Collect all available merchant offers
  collectOffers() {
    const offers = [];
    const seen = new Set();

    this.log('Collecting offers...');

    // PRIMARY APPROACH: Find all merchantOfferListAddButton buttons first
    const addButtons = document.querySelectorAll('button[data-testid="merchantOfferListAddButton"]');
    this.log(`Found ${addButtons.length} merchantOfferListAddButton buttons`);

    if (addButtons.length > 0) {
      addButtons.forEach((btn, index) => {
        if (btn.disabled) {
          this.log(`Skipping button ${index}: disabled`);
          return;
        }

        // Find the parent card/container for this button
        const card = this.findCardForButton(btn);
        this.log(`Button ${index} card:`, card?.className || card?.tagName || 'no card found');

        // Skip if this looks like an Amex feature card
        if (this.isFeatureCard(card)) {
          this.log(`Skipping button ${index}: parent is a feature card`);
          return;
        }

        const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
        const merchant = this.extractMerchant(card, label);
        const value = this.extractValue(card, label);
        const expiry = this.extractExpiry(card);

        this.log(`Button ${index} extracted:`, { merchant, value, expiry });

        // Accept offers even with generic merchant name if we have a value
        if (!value || value === 'See details') {
          this.log(`Skipping button ${index}: no value found`);
          return;
        }

        const id = `${merchant}|${value}`.toLowerCase();
        if (seen.has(id)) {
          this.log(`Skipping button ${index}: duplicate`);
          return;
        }
        seen.add(id);

        this.log(`Adding offer ${index}:`, { merchant, value, expiry });
        offers.push({ merchant, value, expiry, button: btn });
      });
    }

    // FALLBACK: Try card-based approach if button approach found nothing
    if (!offers.length) {
      this.log('No offers found via buttons, trying card-based approach...');

      const cards = document.querySelectorAll(this.getMerchantCardSelector());
      this.log(`Found ${cards.length} potential offer cards`);

      cards.forEach((card, index) => {
        if (this.isFeatureCard(card)) {
          this.log(`Skipping card ${index}: feature card`);
          return;
        }

        const btn = this.findAddButtonInCard(card);
        if (!btn) {
          this.log(`Skipping card ${index}: no button`);
          return;
        }

        const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
        const merchant = this.extractMerchant(card, label);
        const value = this.extractValue(card, label);
        const expiry = this.extractExpiry(card);

        if (!value || value === 'See details') return;

        const id = `${merchant}|${value}`.toLowerCase();
        if (seen.has(id)) return;
        seen.add(id);

        this.log(`Found valid offer (card approach) ${index}:`, { merchant, value, expiry });
        offers.push({ merchant, value, expiry, button: btn });
      });
    }

    this.log(`Total offers collected: ${offers.length}`);
    return offers;
  },

  // Check if a card is an Amex feature card (not a merchant offer)
  isFeatureCard(card) {
    if (!card) return false; // Changed: don't reject if no card, let extraction try

    // If card contains a merchantOfferListAddButton, it's definitely an offer card
    if (card.querySelector && card.querySelector('button[data-testid="merchantOfferListAddButton"]')) {
      this.log('isFeatureCard: contains merchantOfferListAddButton, NOT a feature card');
      return false;
    }

    const cardText = (card.textContent || '').toLowerCase();

    // Only check for explicit feature keywords that would NEVER appear in merchant offers
    const definiteFeatureKeywords = [
      'send & split',
      'send and split',
      'pay it plan it',
      'check your balance',
      'make a payment',
      'view statements',
      'account services',
      'card benefits',
      'member since',
      'credit score',
      'refer a friend',
      'add additional card',
      'request credit limit',
      'manage cards',
      'set up autopay',
      'go paperless',
      'manage alerts',
      'travel notification'
    ];

    for (const keyword of definiteFeatureKeywords) {
      if (cardText.includes(keyword)) {
        this.log(`isFeatureCard: found keyword "${keyword}", IS a feature card`);
        return true;
      }
    }

    // Check for feature-related data attributes
    const cardHtml = card.outerHTML?.substring(0, 500).toLowerCase() || '';
    if (cardHtml.includes('data-testid="feature-') ||
        cardHtml.includes('data-testid="benefit-') ||
        cardHtml.includes('data-testid="service-')) {
      this.log('isFeatureCard: found feature testid, IS a feature card');
      return true;
    }

    this.log('isFeatureCard: NOT a feature card');
    return false;
  },

  // Check if button is specifically for a merchant offer (not a feature)
  isMerchantOfferButton(btn, card = null) {
    if (!btn || btn.disabled) return false;

    const textRaw = (btn.innerText || btn.textContent || '').trim();
    const text = textRaw.toLowerCase();
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const href = (btn.getAttribute('href') || '').toLowerCase();
    const className = (btn.className || '').toLowerCase();

    this.log('Checking button:', { textRaw, testId, title, aria, className });

    // EXACT MATCH: This is the Amex merchant offer add button
    if (testId === 'merchantofferlistaddbutton') {
      this.log('Found exact merchantOfferListAddButton match!');
      return true;
    }

    // Exclude navigation links and feature buttons
    const excludePatterns = [
      'send', 'split', 'pay it', 'plan it', 'payment', 'statement',
      'balance', 'service', 'benefit', 'manage', 'settings', 'profile',
      'refer', 'credit score', 'alert', 'notification', 'autopay',
      'apply now', 'learn more', 'view details', 'see terms',
      'customer service', 'help', 'contact', 'chat',
      '/send', '/pay', '/plan', '/statements', '/payments'
    ];

    for (const pattern of excludePatterns) {
      if (text.includes(pattern) || aria.includes(pattern) ||
          href.includes(pattern) || title.includes(pattern)) {
        return false;
      }
    }

    // Check for positive indicators of merchant offer button
    const isAddToCard = /add to card|add to list|add offer/i.test(text) ||
                        /add to card|add to list|add offer/i.test(aria) ||
                        /add to card|add to list|add offer/i.test(title);

    const hasAddTestId = /merchantoffer|offer.*add|add.*offer/i.test(testId);

    // Check if it's a plus button (SVG icon) with add-related attributes
    const hasSvgPlus = btn.querySelector('svg path[d*="45.5 21.5"]') !== null ||
                       btn.querySelector('svg') !== null && className.includes('icon');
    const isPlusButton = hasSvgPlus && (hasAddTestId || title.includes('add'));

    // The aria-label often contains merchant name for real offers
    const ariaHasMerchant = aria.includes('add') &&
      (aria.includes('offer') || /add .+ to/i.test(aria));

    const isValid = isAddToCard || isPlusButton || ariaHasMerchant || hasAddTestId;

    // Also check it's not already added
    const isAlreadyAdded = /added|saved|enrolled|activated/i.test(text) ||
                           /added|saved|enrolled|activated/i.test(aria) ||
                           /added|saved|enrolled|activated/i.test(title);

    this.log('Button validation result:', { isAddToCard, hasAddTestId, isPlusButton, isValid, isAlreadyAdded });

    return isValid && !isAlreadyAdded;
  },

  // Find the parent card element for a button
  findCardForButton(btn) {
    if (!btn) return null;

    // PRIORITY 1: Look for Amex's _listViewRow class (the main offer container)
    const listViewRow = btn.closest('[class*="_listViewRow"], [class*="listViewRow"]');
    if (listViewRow) {
      this.log('Found card via _listViewRow class');
      return listViewRow;
    }

    // PRIORITY 2: Walk up looking for any reasonable container
    let node = btn.parentElement;
    let depth = 0;
    const maxDepth = 10;

    while (node && depth < maxDepth) {
      const className = (node.className || '').toLowerCase();

      // Look for row/card/container patterns
      if (className.includes('row') || className.includes('card') ||
          className.includes('offer') || className.includes('tile') ||
          className.includes('item')) {
        // Make sure it's a substantial container (has the merchant name)
        if (node.querySelector('h3, img[alt]')) {
          this.log(`Found card via className at depth ${depth}`);
          return node;
        }
      }

      node = node.parentElement;
      depth++;
    }

    // PRIORITY 3: Try closest with various selectors
    const closest = btn.closest('[class*="Row"], [class*="row"], article, li, [class*="offer"], [class*="card"]');
    if (closest) {
      this.log('Found card via closest selector');
      return closest;
    }

    // Last resort: go up several levels
    let parent = btn.parentElement;
    for (let i = 0; i < 6 && parent; i++) {
      parent = parent.parentElement;
    }
    this.log('Using fallback parent');
    return parent || btn.parentElement;
  },

  // Find add button within a card
  findAddButtonInCard(card) {
    if (!card) return null;

    this.log('Looking for add button in card...');

    // PRIORITY: Look for the exact Amex merchant offer button
    const exactMatch = card.querySelector('button[data-testid="merchantOfferListAddButton"]');
    if (exactMatch && !exactMatch.disabled) {
      this.log('Found exact merchantOfferListAddButton in card');
      return exactMatch;
    }

    // Try specific selectors
    const selectors = [
      'button[data-testid*="merchantOffer"]',
      'button[data-testid*="AddButton"]',
      'button[title*="add to list" i]',
      'button[title*="add to card" i]',
      'button[aria-label*="add to card" i]',
      'button[aria-label*="add offer" i]',
      'a[aria-label*="add to card" i]',
      'a[aria-label*="add offer" i]'
    ];

    for (const selector of selectors) {
      const btn = card.querySelector(selector);
      if (btn && !btn.disabled) {
        this.log(`Found button via selector: ${selector}`);
        if (this.isMerchantOfferButton(btn, card)) {
          return btn;
        }
      }
    }

    // Look for button with SVG plus icon
    const svgButtons = card.querySelectorAll('button svg, button[class*="icon"]');
    for (const svgOrBtn of svgButtons) {
      const btn = svgOrBtn.closest('button');
      if (btn && this.isMerchantOfferButton(btn, card)) {
        this.log('Found SVG icon button');
        return btn;
      }
    }

    // General search through all buttons
    const allButtons = Array.from(card.querySelectorAll('button, a'));
    const found = allButtons.find(el => this.isMerchantOfferButton(el, card));
    if (found) {
      this.log('Found button via general search');
    }
    return found;
  },

  // Extract merchant name
  extractMerchant(card, label) {
    if (!card) {
      this.log('extractMerchant: no card provided');
      return 'Amex Offer';
    }

    this.log('extractMerchant: searching in card', card.tagName);

    // PRIORITY 1: Look for h3.heading-sans-small-medium > span (exact Amex structure)
    const h3Span = card.querySelector('h3.heading-sans-small-medium span, h3[class*="heading"] span');
    if (h3Span && h3Span.textContent.trim()) {
      const name = h3Span.textContent.trim();
      this.log(`extractMerchant: found via h3 span: "${name}"`);
      return name;
    }

    // PRIORITY 2: Look for img alt attribute (merchant logo)
    const img = card.querySelector('img[alt]');
    if (img && img.alt && img.alt.length > 1 && img.alt.length < 50) {
      this.log(`extractMerchant: found via img alt: "${img.alt}"`);
      return img.alt;
    }

    // PRIORITY 3: Look for h3 directly
    const h3 = card.querySelector('h3');
    if (h3 && h3.textContent.trim()) {
      const name = h3.textContent.trim();
      if (!name.includes('%') && !name.includes('$') && name.length < 50) {
        this.log(`extractMerchant: found via h3: "${name}"`);
        return name;
      }
    }

    // PRIORITY 4: Try other heading elements
    const headings = card.querySelectorAll('h2, h4, h5, strong');
    for (const heading of headings) {
      const name = heading.textContent.trim();
      if (name && !name.includes('%') && !name.includes('$') &&
          name.length > 1 && name.length < 50 &&
          !this.isFeatureText(name) && !name.includes('Earn') && !name.includes('Terms')) {
        this.log(`extractMerchant: found via heading: "${name}"`);
        return name;
      }
    }

    // PRIORITY 5: Try data-testid selectors
    const merchantSelectors = [
      '[data-testid*="merchant"]',
      '[data-testid*="name"]',
      '[data-testid*="title"]'
    ];

    for (const selector of merchantSelectors) {
      const el = card.querySelector(selector);
      if (el && el.textContent.trim()) {
        const name = el.textContent.trim();
        if (!name.includes('%') && !name.includes('$') && name.length < 50) {
          this.log(`extractMerchant: found via ${selector}: "${name}"`);
          return name;
        }
      }
    }

    this.log('extractMerchant: no merchant found, using default');
    return 'Amex Offer';
  },

  // Check if text is a feature (not merchant) name
  isFeatureText(text) {
    const lower = text.toLowerCase();
    const featureTexts = [
      'send', 'split', 'pay it', 'plan it', 'payment', 'balance',
      'statement', 'benefit', 'service', 'member', 'card'
    ];
    return featureTexts.some(f => lower.includes(f));
  },

  // Extract offer value
  extractValue(card, label) {
    if (!card) {
      this.log('extractValue: no card provided');
      return 'See details';
    }

    this.log('extractValue: searching in card');

    // PRIORITY 1: Look for the overflowText div with body class (Amex specific structure)
    // The value is in: <div data-testid="overflowTextContainer" class="...body..."><span>Earn 8% back...</span></div>
    const overflowContainers = card.querySelectorAll('[data-testid="overflowTextContainer"]');
    for (const container of overflowContainers) {
      const text = container.textContent.trim();
      // Skip if this is the merchant name (no % or $)
      if (/\d+%|\$\d+/i.test(text)) {
        this.log(`extractValue: found via overflowTextContainer: "${text}"`);
        return text;
      }
    }

    // PRIORITY 2: Look for span/div containing "Earn X% back" or similar
    const bodyElements = card.querySelectorAll('.body, [class*="body"], span, div');
    for (const el of bodyElements) {
      const text = el.textContent.trim();
      if (/earn\s+\d+%|get\s+\d+%|\d+%\s*back|\$\d+\s*back/i.test(text) && text.length < 150) {
        this.log(`extractValue: found via body element: "${text}"`);
        return text;
      }
    }

    // PRIORITY 3: Search card text for value pattern
    const cardText = card.textContent || '';
    const patterns = [
      /(Earn\s+\d+%\s*back[^.]*)/i,
      /(Get\s+\d+%\s*back[^.]*)/i,
      /(\d+%\s*back[^,]*(?:up to[^,]*)?)/i,
      /(\$\d+(?:\.\d+)?\s*(?:back|off|credit|statement credit)[^,]*)/i,
      /(\d+x\s*(?:points?|membership\s*rewards?)[^,]*)/i
    ];

    for (const pattern of patterns) {
      const match = cardText.match(pattern);
      if (match) {
        this.log(`extractValue: found via pattern: "${match[1].trim()}"`);
        return match[1].trim();
      }
    }

    this.log('extractValue: no value found');
    return 'See details';
  },

  // Extract expiry date
  extractExpiry(card) {
    if (!card) return 'Check portal';

    // PRIORITY 1: Look for p.body-small with "Expires" (Amex specific structure)
    // <p class="false color-text-subtle body-small">Expires 3/20/26</p>
    const paragraphs = card.querySelectorAll('p.body-small, p[class*="body-small"], p[class*="subtle"]');
    for (const p of paragraphs) {
      const text = p.textContent.trim();
      if (text.toLowerCase().includes('expir')) {
        this.log(`extractExpiry: found via paragraph: "${text}"`);
        return text;
      }
    }

    // PRIORITY 2: Look for any element with expiry text
    const allElements = card.querySelectorAll('p, span, div');
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (/expires?\s*\d/i.test(text) && text.length < 50) {
        this.log(`extractExpiry: found via element: "${text}"`);
        return text;
      }
    }

    // PRIORITY 3: Search card text for expiry pattern
    const cardText = card.textContent || '';
    const dateMatch = cardText.match(/(Expires?\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
    if (dateMatch) {
      this.log(`extractExpiry: found via pattern: "${dateMatch[1]}"`);
      return dateMatch[1];
    }

    this.log('extractExpiry: no expiry found');
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

  // Utility: find button by text
  findButtonByText(texts = []) {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const lowered = texts.map(t => t.toLowerCase());

    return buttons.find(btn => {
      const content = (
        (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '')
      ).toLowerCase().trim();
      return lowered.some(needle => content.includes(needle));
    });
  },

  // Utility: check visibility
  isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 &&
           style.visibility !== 'hidden' &&
           style.display !== 'none';
  },

  // Utility: wait
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.AmexScraper = AmexScraper;
}
