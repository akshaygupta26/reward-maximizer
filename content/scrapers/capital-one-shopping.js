// Capital One Shopping Extension Detector
// Detects if CO Shopping extension is present and extracts available rates

const CapitalOneShoppingScraper = {
  source: 'capital-one-shopping',

  needsNavigation() {
    return false;
  },

  getOffersUrl() {
    return 'https://www.capitaloneshopping.com/';
  },

  async scrape() {
    // This scraper primarily detects the CO Shopping extension on shopping sites
    // and extracts the cashback rate it shows
    return await this.checkCurrentSite();
  },

  async checkCurrentSite() {
    // Look for Capital One Shopping extension indicators
    const indicators = [
      '[class*="capitalone-shopping"]',
      '[class*="CapitalOneShopping"]',
      '[id*="capitalone-shopping"]',
      '[data-capitalone-shopping]',
      'iframe[src*="capitaloneshopping"]',
      '#cns-ext-root',
      '#cns-notification',
      '[class*="cns-"]'
    ];

    let extensionPresent = false;
    let cashbackInfo = null;

    for (const selector of indicators) {
      const el = document.querySelector(selector);
      if (el) {
        extensionPresent = true;

        // Try to extract rate from the extension UI
        const rateEl = el.querySelector(
          '[class*="rate"], [class*="cashback"], [class*="reward"], [class*="percent"]'
        );
        if (rateEl) {
          const text = rateEl.textContent.trim();
          const rateMatch = text.match(/(\d+(?:\.\d+)?%)/);
          if (rateMatch) {
            cashbackInfo = {
              rate: rateMatch[1],
              displayText: text
            };
          }
        }
        break;
      }
    }

    // Also check for shadow DOM (some extensions use this)
    if (!extensionPresent) {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          const shadowIndicators = el.shadowRoot.querySelectorAll(
            '[class*="capitalone"], [class*="cns-"]'
          );
          if (shadowIndicators.length > 0) {
            extensionPresent = true;
            break;
          }
        }
      }
    }

    const currentHost = window.location.hostname.replace('www.', '').toLowerCase();
    const merchantName = currentHost.split('.')[0];

    if (extensionPresent) {
      const offer = {
        merchant: merchantName,
        value: cashbackInfo?.rate ? cashbackInfo.rate + ' back' : 'Available',
        expiry: 'Ongoing',
        merchantCategory: this.detectCategory(merchantName),
        valueType: 'percent',
        extensionDetected: true,
        timestamp: Date.now()
      };

      return {
        offers: [offer],
        added: 0,
        totalFound: 1,
        extensionPresent: true,
        cashbackInfo
      };
    }

    return {
      offers: [],
      added: 0,
      totalFound: 0,
      extensionPresent: false
    };
  },

  // Check if extension offers better rate than current
  compareWithExtension(currentOffer) {
    // This would be called to compare card offers with CO Shopping rate
    // Returns recommendation on which to use or if they stack
    return {
      canStack: true, // CO Shopping stacks with credit card offers
      recommendation: 'Use both for maximum savings'
    };
  },

  detectCategory(merchantName) {
    if (typeof Categories !== 'undefined') return Categories.detectCategory(merchantName);
    return 'other';
  }
};

if (typeof window !== 'undefined') {
  window.CapitalOneShoppingScraper = CapitalOneShoppingScraper;
}
