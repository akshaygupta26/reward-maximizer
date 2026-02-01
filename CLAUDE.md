# Reward Maximizer - Claude Context File

## Rules

- **Always update CLAUDE.md after any change.** Update relevant sections (TODO, recent updates) to reflect current state.

---

## Project Overview

**Reward Maximizer** is a Chrome extension (Manifest v3) that helps users maximize credit card rewards by syncing, comparing, and stacking offers across multiple credit card portals and cashback platforms.

**Version:** 2.1.0 | **Tech Stack:** Vanilla JS, Chrome Extension APIs, Chrome Storage API

**Core Features:** Scrapes offers from 7 bank portals (Amex, Chase, Citi, Capital One, Discover, BofA, US Bank) + 3 cashback platforms (Rakuten, Capital One Shopping, TopCashback). Compares values using point valuations, identifies stacking opportunities, shows merchant banners, and provides a centralized dashboard. Includes Rakuten referral links and Buy Me a Coffee tip jar for monetization.

---

## Architecture

```
Reward Maximizer/
├── manifest.json
├── service-worker.js                   # Badge updates, offer storage, merchant detection
├── content/
│   ├── content-main.js                # Router for scraper scripts
│   ├── merchant-banner.js             # Offer alerts on merchant websites
│   ├── utils.js
│   └── scrapers/                      # amex, chase, citi, capital-one, discover, rakuten, bofa, usbank
├── popup/                             # popup.html, popup.js, popup.css
├── settings/                          # settings.html, settings.js, settings.css
├── lib/
│   ├── storage.js                     # Chrome storage abstraction, deduplication
│   ├── debug.js                       # Centralized logging (DEBUG flag)
│   ├── categories.js                  # Merchant categorization
│   ├── valuation.js                   # Point value calculator
│   └── export.js                      # CSV/JSON export
├── data/defaults.js                   # Default point values
├── data/referral.js                   # Rakuten referral URL, BMAC URL, disclosure text
├── onboarding/                        # First-run welcome page
├── legal/                             # Privacy policy, terms of service
└── icons/                             # Extension icons + promo images
```

---

## Data Model

### Offer Object
```javascript
{
  id: "rmx_[timestamp]_[random]",
  merchant: "Merchant Name",
  value: "$20 cash back" or "5% back",
  source: "amex|chase|citi|capital-one|discover|bofa|usbank|rakuten",
  expiry: "Check portal" or "2025-03-15",
  merchantCategory: "shopping|dining|travel|gas|...",
  valueType: "percent|fixed|multiplier",
  optedInAt: "ISO timestamp",
  status: "active"
}
```

**Storage Keys:** `rmx_offers`, `rmx_settings`, `rmx_sync_history`, `rmx_user_cards`, `rmx_point_values`

**Deduplication:** Composite key `${source}-${merchant.toLowerCase()}` in `lib/storage.js:100-179`

---

## Key Implementation Details

### Merchant Name Matching
```javascript
// merchant-banner.js — fuzzy matching
const merchantName = hostname.replace('www.', '').split('.')[0]; // "aldo" from "www.aldo.com"
offerMerchant.includes(merchantName) ||
merchantName.includes(offerMerchant) ||
offerMerchant.replace(/[^a-z0-9]/g, '') === merchantName.replace(/[^a-z0-9]/g, '')
```
**Known limitations:** May miss "Aldo Shoes" vs "Aldo"; substring matching can cause false positives ("Target" matches "targetprocess.com"); empty merchant matches everything.

### Stacking Logic
- **Card offers** (cannot stack with each other): amex, chase, citi, capital-one, discover, bofa, usbank
- **Stacking partners** (can stack with card offers): rakuten, capital-one-shopping, topcashback

### Point Valuations
Default in `data/defaults.js`: amex-mr: 1.8, chase-ur: 1.5, citi-typ: 1.4, capital-one-miles: 1.5, discover-cashback: 1.0

### Scraper Pattern
Each scraper implements: `source`, `offersUrl`, `needsNavigation()`, `scrape()`, `collectOffers()`, `extractMerchant()`, `extractValue()`. All `scrape()` methods wrapped in try-catch returning `{ offers: [], added: 0, totalFound: 0 }` on failure.

### Debug System
`lib/debug.js` — single `DEBUG` flag. `debug.log/info` silent when false; `debug.warn/error` always visible. Set `DEBUG = false` before CWS submission.

---

## Development & Debugging

**Load extension:** Chrome → `chrome://extensions/` → Developer mode → Load unpacked

**Debug logs:** All scripts use `[RMX-*]` prefixes. Set `DEBUG = true` in `lib/debug.js`.

**Common issues:**
- Banner not showing → Check matching in `merchant-banner.js:47`
- Scraper failing → Check CSS selectors in scraper file
- Offers not saving → Check `lib/storage.js` logs

### Adding a New Scraper
1. Create `content/scrapers/[name].js` following existing pattern
2. Add to `manifest.json` content_scripts
3. Update `content-main.js` to detect new portal
4. Add default point values to `data/defaults.js`

---

## Known Limitations
1. All data stored locally (no backend)
2. Merchant matching misses some name variations
3. Most portals don't expose expiry dates
4. Auto-opt-in only works without confirmation dialogs

**Edge cases handled:** SPA navigation (MutationObserver), portal site exclusion, deduplication, missing data fallbacks.

---

## Testing

**Unit tests:** 77 tests across 4 suites (Jest) — `npm test`
- `tests/valuation.test.js` (28), `tests/categories.test.js` (16), `tests/storage.test.js` (15), `tests/merchant-matching.test.js` (18)

**Manual testing:** See `TESTING_CHECKLIST.md`

---

## Chrome Web Store Status: READY TO SUBMIT

**All complete:** Legal (privacy policy, terms), onboarding, settings, icons, promo images, store description, code cleanup (160 console.log migrated, try-catch on all scrapers), permissions cleaned, 77 unit tests, 4 screenshots at 1280x800, DEBUG set to false, alert() calls replaced with inline UI, duplicate service-worker removed.

**Submission checklist — all passed (91% automated, remaining manual):**
- Manifest valid (MV3, semver, description under 132 chars)
- All icons & promo images present
- All permissions justified by code usage
- Privacy policy & terms accessible
- No data exfiltration, no debugger, no localhost, no console.log outside debug.js
- `<all_urls>` justification: "Required to display merchant offer alerts on any shopping website"

**URLs:**
- Privacy Policy: https://gorgeous-torte-f0c7c0.netlify.app/privacy.html
- Terms: https://gorgeous-torte-f0c7c0.netlify.app/terms.html
- Website: https://gorgeous-torte-f0c7c0.netlify.app/
- Support: rewardmaximizer@gmail.com

**Roadmap & future features:** See `docs/ROADMAP.md`

---

**Last Updated:** 2026-01-31

### Recent Updates (v2.1.0)
- Added Rakuten referral link (merchant banner, popup stacking tip, popup empty state, onboarding)
- Added Buy Me a Coffee tip jar (settings About section, popup footer, onboarding footer, support page)
- Added affiliate disclosure to privacy policy, terms of service, and settings legal section
- All referral/BMAC URLs centralized in `data/referral.js` for easy updates
- Fixed Rakuten scraper: Rakuten redesigned their stores page, old selectors (`chakra-modal__body`, `a.chakra-button`, `[class*="store-card"]`) no longer exist. New primary selector is `a[role="group"].chakra-link` with merchant name from `img[alt]` and cashback rate from text content. Updated `offersUrl` to `/stores/all`.
- Bumped version to 2.1.0
