// Bank of America BankAmeriDeals Scraper

const BofAScraper = {
  source: 'bofa',
  offersUrl: 'https://www.bankofamerica.com/credit-cards/deals-and-offers/',

  needsNavigation() {
    const path = window.location.href.toLowerCase();
    return !path.includes('deals') && !path.includes('offers') && !path.includes('bankamerideals');
  },

  getOffersUrl() {
    return this.offersUrl;
  },

  async scrape() {
    await this.expandOffers();
    const offers = this.collectOffers();
    let added = 0;

    for (const offer of offers) {
      if (offer.button && document.contains(offer.button)) {
        try {
          offer.button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.wait(200);
          offer.button.click();
          added++;
          await this.wait(1000);
        } catch (err) {
          console.warn('[Reward Maximizer] Failed to click BofA offer:', err);
        }
      }
    }

    const cleaned = offers.map(offer => ({
      merchant: offer.merchant,
      value: offer.value,
      expiry: offer.expiry,
      merchantCategory: this.detectCategory(offer.merchant),
      valueType: this.parseValueType(offer.value),
      timestamp: Date.now()
    }));

    return { offers: cleaned, added, totalFound: cleaned.length };
  },

  async expandOffers() {
    const expandBtn = this.findButtonByText(['view all', 'see all', 'show more', 'load more']);
    if (expandBtn) {
      try {
        expandBtn.click();
        await this.wait(1500);
      } catch (err) {}
    }
    await this.scrollToLoad();
  },

  async scrollToLoad() {
    for (let i = 0; i < 8; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(800);
    }
    window.scrollTo(0, 0);
  },

  collectOffers() {
    const offers = [];
    const seen = new Set();

    const cardSelectors = [
      '[class*="deal-card"]',
      '[class*="offer-card"]',
      '[class*="DealCard"]',
      '[class*="OfferCard"]',
      '[data-testid*="deal"]',
      '[data-testid*="offer"]',
      'li[class*="deal"]',
      'li[class*="offer"]'
    ].join(', ');

    const cards = document.querySelectorAll(cardSelectors);

    cards.forEach(card => {
      const merchant = this.extractMerchant(card);
      const value = this.extractValue(card);
      const expiry = this.extractExpiry(card);
      const button = this.findActivateButton(card);

      if (!merchant || seen.has(merchant.toLowerCase())) return;
      if (!button) return;

      seen.add(merchant.toLowerCase());
      offers.push({ merchant, value, expiry, button });
    });

    return offers;
  },

  findActivateButton(card) {
    if (!card) return null;

    const buttons = Array.from(card.querySelectorAll('button, a, [role="button"]'));
    return buttons.find(btn => {
      const text = (btn.innerText || btn.textContent || '').toLowerCase();
      const isActivate = /activate|add|get deal|add to card|save/.test(text);
      const isAlready = /activated|added|saved/.test(text);
      return isActivate && !isAlready;
    });
  },

  extractMerchant(card) {
    const selectors = ['h3', 'h4', 'strong', '[class*="merchant"]', '[class*="brand"]', '[class*="name"]', '[class*="title"]'];
    for (const sel of selectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent.trim() && !el.textContent.includes('%')) {
        return el.textContent.trim();
      }
    }
    return null;
  },

  extractValue(card) {
    const text = card.textContent || '';
    const match = text.match(/(\d+%\s*(?:cash\s*back)?|\$\d+(?:\.\d+)?(?:\s*(?:back|bonus|credit))?)/i);
    return match ? match[1] : 'See details';
  },

  extractExpiry(card) {
    const text = card.textContent || '';
    const match = text.match(/(?:expires?|ends?|valid)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
    return match ? match[1] : 'Check portal';
  },

  detectCategory(merchantName) {
    if (typeof Categories !== 'undefined') return Categories.detectCategory(merchantName);
    return 'other';
  },

  parseValueType(value) {
    if (!value) return 'unknown';
    if (value.includes('%')) return 'percent';
    if (value.includes('$')) return 'fixed';
    return 'unknown';
  },

  findButtonByText(texts) {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    return buttons.find(btn => {
      const content = (btn.innerText || '').toLowerCase();
      return texts.some(t => content.includes(t.toLowerCase()));
    });
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

if (typeof window !== 'undefined') {
  window.BofAScraper = BofAScraper;
}
