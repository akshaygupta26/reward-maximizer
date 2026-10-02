// Tests for the merchant matching logic used in merchant-banner.js
// Extracted here since the banner script runs in browser context

/**
 * Merchant matching logic from merchant-banner.js (mirrored in
 * service-worker.js checkMerchantOffers and popup detectCurrentMerchant)
 * Updated: token-aware matching + multi-part TLD handling.
 * - exact normalized match always allowed
 * - site label must equal a merchant token or all tokens concatenated
 *   ("Aldo Shoes" -> aldoshoes.com), so "Target" no longer matches
 *   targetprocess.com and "Nike" no longer matches nikecorp.com
 * - multi-part suffixes (co.uk, com.au, ...) resolve to the label before them
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.in', 'com.in', 'net.in',
  'com.br', 'com.mx', 'com.ar', 'com.co',
  'co.jp', 'com.cn', 'com.tw', 'com.sg', 'com.hk', 'co.nz', 'co.za'
]);

function extractMerchantLabel(hostname) {
  const parts = String(hostname || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length >= 2 && MULTI_PART_SUFFIXES.has(parts.slice(-2).join('.'))) {
    return parts.length >= 3 ? parts[parts.length - 3] : parts[0];
  }
  return parts.length >= 3 ? parts[parts.length - 2] : parts[0];
}

function matchesMerchant(offerMerchant, hostname) {
  const merchantName = extractMerchantLabel(hostname);
  const offerName = String(offerMerchant || '').toLowerCase();
  const normalizedSite = merchantName.replace(/[^a-z0-9]/g, '');
  const normalizedOffer = offerName.replace(/[^a-z0-9]/g, '');
  if (!normalizedSite || !normalizedOffer) return false;

  // Exact match after normalization (always allowed)
  if (normalizedOffer === normalizedSite) return true;

  // Token matching only when both sides are 3+ chars
  if (normalizedSite.length >= 3 && normalizedOffer.length >= 3) {
    const tokens = offerName.split(/[^a-z0-9]+/).filter(t => t.length >= 2);
    if (tokens.includes(normalizedSite)) return true;
    if (tokens.length > 1 && tokens.join('') === normalizedSite) return true;
  }

  return false;
}

describe('Merchant Matching', () => {
  describe('exact and substring matches', () => {
    test('"Aldo" matches aldo.com', () => {
      expect(matchesMerchant('Aldo', 'www.aldo.com')).toBe(true);
    });

    test('"Best Buy" matches bestbuy.com', () => {
      expect(matchesMerchant('Best Buy', 'www.bestbuy.com')).toBe(true);
    });

    test('"Nike" matches nike.com', () => {
      expect(matchesMerchant('Nike', 'www.nike.com')).toBe(true);
    });

    test('"Target" matches target.com', () => {
      expect(matchesMerchant('Target', 'www.target.com')).toBe(true);
    });

    test('"Amazon" matches amazon.com', () => {
      expect(matchesMerchant('Amazon', 'www.amazon.com')).toBe(true);
    });
  });

  describe('fuzzy matching', () => {
    test('"Aldo Shoes" matches aldoshoes.com via stripped comparison', () => {
      // offerName stripped: "aldoshoes", hostname: "aldoshoes" -> exact
      expect(matchesMerchant('Aldo Shoes', 'www.aldoshoes.com')).toBe(true);
    });

    test('"Home Depot" matches homedepot.com', () => {
      expect(matchesMerchant('Home Depot', 'www.homedepot.com')).toBe(true);
    });

    test('"Bed Bath & Beyond" does NOT match bedbathandbeyond.com (known limitation)', () => {
      // stripped: "bedbathbeyond" vs "bedbathandbeyond" — not equal, not substring either direction
      // This is a known limitation of the current matching logic
      expect(matchesMerchant('Bed Bath & Beyond', 'www.bedbathandbeyond.com')).toBe(false);
    });
  });

  describe('non-matches', () => {
    test('"Target" does not match targetprocess.com', () => {
      // Fixed 2026-10-02: token-aware matching requires the site label to
      // equal a merchant token (or all tokens joined), not just contain it
      expect(matchesMerchant('Target', 'www.targetprocess.com')).toBe(false);
    });

    test('"Nike" does not match nikecorp.com', () => {
      expect(matchesMerchant('Nike', 'www.nikecorp.com')).toBe(false);
    });

    test('"Walmart" does not match walgreens.com', () => {
      expect(matchesMerchant('Walmart', 'www.walgreens.com')).toBe(false);
    });

    test('"Amazon" does not match ebay.com', () => {
      expect(matchesMerchant('Amazon', 'www.ebay.com')).toBe(false);
    });
  });

  describe('short hostname protection', () => {
    test('"Expedia" does NOT match x.com (single-char hostname)', () => {
      expect(matchesMerchant('Expedia', 'x.com')).toBe(false);
    });

    test('"Express" does NOT match x.com', () => {
      expect(matchesMerchant('Express', 'x.com')).toBe(false);
    });

    test('"AT" does NOT match at.com via substring', () => {
      // "at" is 2 chars — below threshold for substring matching
      expect(matchesMerchant('AT&T', 'www.at.com')).toBe(false);
    });

    test('"HM" matches hm.com via exact normalized match', () => {
      // Exact match works regardless of length
      expect(matchesMerchant('HM', 'www.hm.com')).toBe(true);
    });
  });

  describe('subdomain handling', () => {
    test('"Lululemon" matches shop.lululemon.com', () => {
      expect(matchesMerchant('Lululemon', 'shop.lululemon.com')).toBe(true);
    });

    test('"Nike" matches store.nike.com', () => {
      expect(matchesMerchant('Nike', 'store.nike.com')).toBe(true);
    });
  });

  describe('multi-part TLD handling', () => {
    test('"Aldo" matches www.aldo.co.uk', () => {
      expect(matchesMerchant('Aldo', 'www.aldo.co.uk')).toBe(true);
    });

    test('"Aldo" matches aldo.co.uk without www', () => {
      expect(matchesMerchant('Aldo', 'aldo.co.uk')).toBe(true);
    });

    test('"Nike" matches shop.nike.com.au', () => {
      expect(matchesMerchant('Nike', 'shop.nike.com.au')).toBe(true);
    });

    test('"Target" does not match targetprocess.co.uk', () => {
      expect(matchesMerchant('Target', 'www.targetprocess.co.uk')).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('empty merchant name does not match non-empty hostname', () => {
      expect(matchesMerchant('', 'www.nike.com')).toBe(false);
    });
    test('special characters are stripped for comparison', () => {
      expect(matchesMerchant("Macy's", 'www.macys.com')).toBe(true);
    });

    test('handles hostname without www', () => {
      expect(matchesMerchant('Nike', 'nike.com')).toBe(true);
    });

    test('case insensitive matching', () => {
      expect(matchesMerchant('NIKE', 'www.nike.com')).toBe(true);
      expect(matchesMerchant('nike', 'www.NIKE.com')).toBe(true);
    });

    test('"J.Crew" matches jcrew.com via stripped comparison', () => {
      expect(matchesMerchant('J.Crew', 'www.jcrew.com')).toBe(true);
    });

    test('"H&M" matches hm.com via stripped comparison', () => {
      expect(matchesMerchant('H&M', 'www.hm.com')).toBe(true);
    });
  });

  describe('malformed offer guard (banner + service worker)', () => {
    // Mirrors the guard in merchant-banner.js checkForOffers and the
    // service-worker filters: offers without a merchant are skipped, never crashed on
    function filterOffers(offers, hostname) {
      return offers.filter(offer => {
        if (!offer || !offer.merchant) return false;
        return matchesMerchant(offer.merchant, hostname);
      });
    }

    test('null/undefined merchant offers are skipped without throwing', () => {
      const offers = [
        { merchant: 'Nike', source: 'amex', value: '10% back' },
        { merchant: null, source: 'chase', value: '5% back' },
        { merchant: undefined, source: 'citi', value: '$5 back' },
        { merchant: '', source: 'bofa', value: '$3 back' },
        null,
        undefined,
      ];
      expect(() => filterOffers(offers, 'www.nike.com')).not.toThrow();
      const matched = filterOffers(offers, 'www.nike.com');
      expect(matched).toHaveLength(1);
      expect(matched[0].merchant).toBe('Nike');
    });

    test('all-malformed offer list yields empty matches', () => {
      expect(filterOffers([{ merchant: null }], 'www.nike.com')).toHaveLength(0);
      expect(filterOffers([], 'www.nike.com')).toHaveLength(0);
    });
  });
});
