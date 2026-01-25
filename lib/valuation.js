// Point valuation engine - calculates actual dollar value of offers

const Valuation = {
  // Parse offer value string and extract numeric value and type
  parseOfferValue(valueStr) {
    if (!valueStr) return { type: 'unknown', amount: 0 };

    const str = valueStr.toLowerCase().trim();

    // Check for points multiplier (e.g., "5x points", "3x MR")
    const multiplierMatch = str.match(/(\d+(?:\.\d+)?)\s*x/i);
    if (multiplierMatch) {
      return {
        type: 'multiplier',
        amount: parseFloat(multiplierMatch[1]),
        raw: valueStr
      };
    }

    // Check for percentage (e.g., "5% back", "10% off")
    const percentMatch = str.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch) {
      return {
        type: 'percent',
        amount: parseFloat(percentMatch[1]),
        raw: valueStr
      };
    }

    // Check for dollar amount (e.g., "$10 back", "$50 statement credit")
    const dollarMatch = str.match(/\$(\d+(?:\.\d+)?)/);
    if (dollarMatch) {
      return {
        type: 'fixed',
        amount: parseFloat(dollarMatch[1]),
        raw: valueStr
      };
    }

    // Check for cents back (e.g., "10 cents per gallon")
    const centsMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:cents?|¢)/i);
    if (centsMatch) {
      return {
        type: 'cents',
        amount: parseFloat(centsMatch[1]),
        raw: valueStr
      };
    }

    return { type: 'unknown', amount: 0, raw: valueStr };
  },

  // Calculate dollar value per dollar spent
  calculateValuePerDollar(offer, cardId, customPointValues = {}, defaultPointValues = {}) {
    const parsed = this.parseOfferValue(offer.value);

    // Get the point value (cpp) for this card
    const cpp = customPointValues[cardId] || defaultPointValues[cardId] || 1.0;

    switch (parsed.type) {
      case 'percent':
        // Direct percentage: 5% = $0.05 per dollar
        return parsed.amount / 100;

      case 'multiplier':
        // Points multiplier: 5x * 1 base point * cpp
        // Assumes base earn rate of 1 point per dollar
        return (parsed.amount * cpp) / 100;

      case 'fixed':
        // Fixed dollar amount - can't calculate per-dollar without spend requirement
        // Return a flag indicating it's fixed
        return {
          type: 'fixed',
          totalValue: parsed.amount,
          displayValue: `$${parsed.amount} back`
        };

      case 'cents':
        // Cents per unit (like gas) - return as-is
        return {
          type: 'perUnit',
          centsPerUnit: parsed.amount,
          displayValue: `${parsed.amount}¢/gal`
        };

      default:
        return 0;
    }
  },

  // Format value for display
  formatValueDisplay(valuePerDollar) {
    if (typeof valuePerDollar === 'object') {
      return valuePerDollar.displayValue || 'See details';
    }

    if (valuePerDollar === 0) return 'See details';

    // Convert to cents for cleaner display
    const cents = valuePerDollar * 100;
    if (cents >= 1) {
      return `${cents.toFixed(1)}¢/$`;
    }
    return `${(cents).toFixed(2)}¢/$`;
  },

  // Compare offers and find the best one
  findBestOffer(offers, customPointValues = {}, defaultPointValues = {}) {
    if (!offers || offers.length === 0) return null;

    let bestOffer = null;
    let bestValue = -1;

    for (const offer of offers) {
      const cardId = this.getCardIdForSource(offer.source, offer.cardId);
      const value = this.calculateValuePerDollar(offer, cardId, customPointValues, defaultPointValues);

      // Skip fixed/per-unit values for comparison
      if (typeof value === 'object') continue;

      if (value > bestValue) {
        bestValue = value;
        bestOffer = offer;
      }
    }

    return bestOffer ? { offer: bestOffer, value: bestValue } : null;
  },

  // Map source to card ID (default card for each issuer)
  getCardIdForSource(source, specificCardId) {
    if (specificCardId) return specificCardId;

    const sourceToDefaultCard = {
      'amex': 'amex-mr-gold',
      'chase': 'chase-ur-csp',
      'citi': 'citi-ty-premier',
      'capital-one': 'capital-one-venture',
      'discover': 'discover-it',
      'bofa': 'bofa-premium-rewards',
      'usbank': 'usbank-altitude-reserve',
      'rakuten': 'rakuten',
      'capital-one-shopping': 'capital-one-shopping'
    };

    return sourceToDefaultCard[source] || source;
  },

  // Calculate total stacked value
  calculateStackedValue(cardOffer, stackingOffers, customPointValues = {}, defaultPointValues = {}) {
    const cardId = this.getCardIdForSource(cardOffer.source, cardOffer.cardId);
    const cardValue = this.calculateValuePerDollar(cardOffer, cardId, customPointValues, defaultPointValues);

    if (typeof cardValue === 'object') {
      return { type: 'fixed', offers: [cardOffer, ...stackingOffers] };
    }

    let totalValue = cardValue;
    const stackedWith = [];

    for (const stackOffer of stackingOffers) {
      const stackId = this.getCardIdForSource(stackOffer.source);
      const stackValue = this.calculateValuePerDollar(stackOffer, stackId, customPointValues, defaultPointValues);

      if (typeof stackValue !== 'object') {
        totalValue += stackValue;
        stackedWith.push({
          source: stackOffer.source,
          value: stackValue,
          offer: stackOffer
        });
      }
    }

    return {
      totalValue,
      cardValue,
      stackedWith,
      cardOffer,
      displayValue: this.formatValueDisplay(totalValue)
    };
  },

  // Find best combination (card + stacking partners)
  findBestCombination(merchantOffers, stackingOffers, customPointValues = {}, defaultPointValues = {}) {
    if (!merchantOffers || merchantOffers.length === 0) {
      return null;
    }

    // Filter out stacking partners from card offers
    const cardOffers = merchantOffers.filter(o =>
      !['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
    );

    const stackPartners = [
      ...stackingOffers,
      ...merchantOffers.filter(o =>
        ['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
      )
    ];

    let bestCombo = null;
    let bestTotal = -1;

    for (const cardOffer of cardOffers) {
      const combo = this.calculateStackedValue(
        cardOffer,
        stackPartners,
        customPointValues,
        defaultPointValues
      );

      if (combo.totalValue > bestTotal) {
        bestTotal = combo.totalValue;
        bestCombo = combo;
      }
    }

    // Also check stacking partners alone (if no card offers)
    if (stackPartners.length > 0 && (!bestCombo || bestTotal === 0)) {
      let stackOnlyValue = 0;
      for (const sp of stackPartners) {
        const val = this.calculateValuePerDollar(
          sp,
          this.getCardIdForSource(sp.source),
          customPointValues,
          defaultPointValues
        );
        if (typeof val !== 'object') {
          stackOnlyValue += val;
        }
      }

      if (stackOnlyValue > bestTotal) {
        bestCombo = {
          totalValue: stackOnlyValue,
          cardValue: 0,
          stackedWith: stackPartners.map(sp => ({
            source: sp.source,
            value: this.calculateValuePerDollar(sp, this.getCardIdForSource(sp.source), customPointValues, defaultPointValues),
            offer: sp
          })),
          cardOffer: null,
          displayValue: this.formatValueDisplay(stackOnlyValue)
        };
      }
    }

    return bestCombo;
  },

  // Sort offers by value (for display)
  sortOffersByValue(offers, customPointValues = {}, defaultPointValues = {}) {
    return [...offers].sort((a, b) => {
      const aCardId = this.getCardIdForSource(a.source, a.cardId);
      const bCardId = this.getCardIdForSource(b.source, b.cardId);

      const aValue = this.calculateValuePerDollar(a, aCardId, customPointValues, defaultPointValues);
      const bValue = this.calculateValuePerDollar(b, bCardId, customPointValues, defaultPointValues);

      // Put numeric values first, then objects
      if (typeof aValue === 'object' && typeof bValue !== 'object') return 1;
      if (typeof aValue !== 'object' && typeof bValue === 'object') return -1;
      if (typeof aValue === 'object' && typeof bValue === 'object') return 0;

      return bValue - aValue;
    });
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Valuation };
}
