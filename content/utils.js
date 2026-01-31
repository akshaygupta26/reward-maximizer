// Shared utilities for content scripts

const ContentUtils = {
  // Wait for specified milliseconds
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Check if element is visible
  isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  },

  // Find button by text content
  findButtonByText(texts = [], container = document) {
    const buttons = Array.from(container.querySelectorAll('button, a, [role="button"]'));
    const lowered = texts.map(t => t.toLowerCase());

    return buttons.find(btn => {
      const content = (
        (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '')
      ).toLowerCase().trim();
      return lowered.some(needle => content.includes(needle));
    });
  },

  // Find all buttons matching text
  findAllButtonsByText(texts = [], container = document) {
    const buttons = Array.from(container.querySelectorAll('button, a, [role="button"]'));
    const lowered = texts.map(t => t.toLowerCase());

    return buttons.filter(btn => {
      const content = (
        (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '')
      ).toLowerCase().trim();
      return lowered.some(needle => content.includes(needle));
    });
  },

  // Scroll element into view with options
  async scrollIntoView(el, options = {}) {
    const { behavior = 'smooth', block = 'center', waitAfter = 150 } = options;
    if (!el) return;

    el.scrollIntoView({ behavior, block });
    await this.wait(waitAfter);
  },

  // Scroll to bottom of page to load lazy content
  async scrollToLoadAll(options = {}) {
    const { maxPasses = 10, waitBetween = 1000, countFn = null } = options;

    let lastCount = 0;

    for (let i = 0; i < maxPasses; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(waitBetween);

      if (countFn) {
        const currentCount = countFn();
        if (currentCount <= lastCount) break;
        lastCount = currentCount;
      }
    }

    window.scrollTo(0, 0);
  },

  // Safe click with scroll
  async safeClick(el, options = {}) {
    const { scrollFirst = true, waitBefore = 150, waitAfter = 500 } = options;

    if (!el || !this.isVisible(el)) return false;

    try {
      if (scrollFirst) {
        await this.scrollIntoView(el, { waitAfter: waitBefore });
      }

      el.click();
      await this.wait(waitAfter);
      return true;
    } catch (err) {
      debug.warn('[Reward Maximizer] click failed', err);
      return false;
    }
  },

  // Extract text from element with fallbacks
  extractText(el, selectors = [], fallback = '') {
    if (!el) return fallback;

    // Try selectors first
    for (const selector of selectors) {
      const found = el.querySelector(selector);
      if (found && found.textContent.trim()) {
        return found.textContent.trim();
      }
    }

    // Try element itself
    if (el.textContent.trim()) {
      return el.textContent.trim();
    }

    return fallback;
  },

  // Extract value from offer text (percentage, dollar amount, multiplier)
  extractOfferValue(text) {
    if (!text) return null;

    // Try percentage first
    const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch) {
      return {
        raw: text,
        type: 'percent',
        amount: parseFloat(percentMatch[1])
      };
    }

    // Try dollar amount
    const dollarMatch = text.match(/\$(\d+(?:\.\d+)?)/);
    if (dollarMatch) {
      return {
        raw: text,
        type: 'fixed',
        amount: parseFloat(dollarMatch[1])
      };
    }

    // Try multiplier
    const multiplierMatch = text.match(/(\d+(?:\.\d+)?)\s*x/i);
    if (multiplierMatch) {
      return {
        raw: text,
        type: 'multiplier',
        amount: parseFloat(multiplierMatch[1])
      };
    }

    return { raw: text, type: 'unknown', amount: 0 };
  },

  // Parse expiry date from various formats
  parseExpiryDate(text) {
    if (!text) return null;

    // Try common date formats
    const formats = [
      // "Expires 3/15/2024" or "Exp 03/15/24"
      /(?:expires?|exp\.?)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      // "Valid through March 15, 2024"
      /(?:valid|through|until|by)\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i,
      // "Ends 3/15"
      /(?:ends?)\s*(\d{1,2}\/\d{1,2})/i,
      // Just a date pattern
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
      // Month Day, Year
      /([A-Za-z]+\s+\d{1,2},?\s*\d{4})/
    ];

    for (const pattern of formats) {
      const match = text.match(pattern);
      if (match) {
        try {
          const parsed = new Date(match[1]);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
        } catch {
          // Continue to next pattern
        }
        return match[1]; // Return raw match if can't parse
      }
    }

    return 'Check portal';
  },

  // Generate unique offer ID
  generateOfferId(source, merchant, value) {
    const key = `${source}-${merchant}-${value}`.toLowerCase().replace(/\s+/g, '-');
    return key + '-' + Date.now().toString(36);
  },

  // Check if we're on a specific page type
  isOnPage(patterns) {
    const url = window.location.href.toLowerCase();
    return patterns.some(p => url.includes(p.toLowerCase()));
  },

  // Wait for element to appear
  async waitForElement(selector, options = {}) {
    const { timeout = 5000, interval = 100 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(selector);
      if (el && this.isVisible(el)) {
        return el;
      }
      await this.wait(interval);
    }

    return null;
  },

  // Wait for elements to stop changing (loading complete)
  async waitForStable(countFn, options = {}) {
    const { timeout = 10000, interval = 500, stableCount = 2 } = options;
    const startTime = Date.now();
    let lastCount = 0;
    let stableChecks = 0;

    while (Date.now() - startTime < timeout) {
      const currentCount = countFn();

      if (currentCount === lastCount) {
        stableChecks++;
        if (stableChecks >= stableCount) {
          return true;
        }
      } else {
        stableChecks = 0;
        lastCount = currentCount;
      }

      await this.wait(interval);
    }

    return false;
  },

  // Create a mutation observer for dynamic content
  observeChanges(targetSelector, callback, options = {}) {
    const { subtree = true, childList = true, attributes = false } = options;

    const target = document.querySelector(targetSelector);
    if (!target) return null;

    const observer = new MutationObserver((mutations) => {
      callback(mutations);
    });

    observer.observe(target, { subtree, childList, attributes });
    return observer;
  },

  // Send message to popup/background
  sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  },

  // Log with prefix
  log(...args) {
    debug.log('[Reward Maximizer]', ...args);
  },

  warn(...args) {
    debug.warn('[Reward Maximizer]', ...args);
  },

  error(...args) {
    debug.error('[Reward Maximizer]', ...args);
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentUtils };
}
