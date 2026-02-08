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
│   ├── content-main.js                # Hybrid extraction orchestrator (interceptor + scraper)
│   ├── merchant-banner.js             # Offer alerts on merchant websites
│   ├── utils.js
│   ├── interceptors/                  # Network API observation layer
│   │   ├── base-interceptor.js        # Shared: fetch/XHR wrapping, postMessage bridge, sanitization
│   │   ├── chase-interceptor.js       # Chase API response parser
│   │   ├── amex-interceptor.js        # Amex API parser (multi-card support)
│   │   ├── citi-interceptor.js        # Citi API parser
│   │   ├── capital-one-interceptor.js # Capital One API parser
│   │   ├── bofa-interceptor.js        # BofA API parser
│   │   ├── discover-interceptor.js    # Discover API parser
│   │   └── usbank-interceptor.js      # US Bank API parser
│   └── scrapers/                      # DOM scrapers (fallback)
├── popup/                             # popup.html, popup.js, popup.css
├── settings/                          # settings.html, settings.js, settings.css
├── lib/
│   ├── storage.js                     # Chrome storage abstraction, deduplication
│   ├── debug.js                       # Centralized logging (DEBUG flag)
│   ├── categories.js                  # Merchant categorization
│   ├── valuation.js                   # Point value calculator
│   ├── export.js                      # CSV/JSON export
│   ├── extractor-config.js            # Per-portal feature flags, timing config
│   └── interceptor-health.js          # Per-portal health tracking (success/failure counts)
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
  status: "active",
  // New fields from interceptor layer (nullable, backward-compatible)
  offerId: null,             // Portal-specific offer ID
  activationUrl: null,       // Direct API activation endpoint
  eligibleCards: null,        // Array of card tokens (Amex multi-card)
  minSpend: null,            // Minimum spend threshold (number)
  maxReward: null            // Maximum reward cap (number)
}
```

**Storage Keys:** `rmx_offers`, `rmx_settings`, `rmx_sync_history`, `rmx_user_cards`, `rmx_point_values`, `rmx_interceptor_health`

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

### Hybrid Extraction (Interceptor + Scraper)
`content-main.js` orchestrates a two-tier extraction: interceptor first (observes API responses via fetch/XHR wrapping), DOM scraper fallback if interceptor times out or returns no data. Controlled by `lib/extractor-config.js` per-portal flags. Health tracked in `lib/interceptor-health.js`.

**Flow:** Page loads → interceptor injects main-world script at `document_start` → script wraps `fetch`/`XMLHttpRequest` → API responses matching URL patterns are cloned and bridged via `window.postMessage` → content script parses offers → if no data within timeout, falls back to DOM scraper.

**Key config:** `ExtractorConfig.portals[name].interceptor` (enable/disable), `ExtractorConfig.interceptorTimeoutMs` (default 8000ms), `ExtractorConfig.portals[name].fallbackToScraper` (default true).

### Scraper Pattern (Fallback)
Each scraper implements: `source`, `offersUrl`, `needsNavigation()`, `scrape()`, `collectOffers()`, `extractMerchant()`, `extractValue()`. All `scrape()` methods wrapped in try-catch returning `{ offers: [], added: 0, totalFound: 0 }` on failure.

### Debug System
`lib/debug.js` — single `DEBUG` flag. `debug.log/info` silent when false; `debug.warn/error` always visible. Set `DEBUG = false` before CWS submission.

**Log prefixes:** `[RMX-Orchestrator]` (content-main.js), `[RMX-Interceptor-{Portal}]` (interceptors), `[RMX-Scraper]` (scrapers), `[RMX-Storage]` (storage).

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

**Unit tests:** 177 tests across 10 suites (Jest) — `npm test` (173 passing, 4 pre-existing failures)
- `tests/valuation.test.js` (28), `tests/categories.test.js` (16), `tests/storage.test.js` (15), `tests/merchant-matching.test.js` (18)
- `tests/extractor-config.test.js` (11), `tests/base-interceptor.test.js` (15), `tests/interceptor-health.test.js` (8)
- `tests/chase-interceptor.test.js` (10), `tests/amex-interceptor.test.js` (8), `tests/interceptor-fallback.test.js` (14)

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

**Last Updated:** 2026-02-01

### TODO (Next Session)
- **Live API endpoint discovery** — Interceptors use heuristic URL patterns and field names. Log into each portal with `ExtractorConfig.logRawResponses = true` to discover actual API shapes, then refine `urlPatterns` and `_parse*Offer()` field mappings per portal.
- **Amex multi-card activation** — `AmexInterceptor.activateAll()` is a skeleton. Implement once activation endpoint is discovered.
- **Chase post-opt-in auto-populate** — After opt-in completes, offers should auto-save without requiring a second manual sync.

### Recent Updates
- **Bug fixes from live Chase testing (2026-02-01):**
  - Fixed Chase dirty offer values — added `cleanValue()` to `content/scrapers/chase.js` stripping status text ("X days left", "Success", "Added", etc.)
  - Fixed merchant banner subdomain bug — `merchant-banner.js` and `popup.js` now extract domain name correctly from subdomains (e.g., "lululemon" from "shop.lululemon.com")
  - Fixed sync stop not persisting — `content-main.js` now persists `_syncStopped` flag in localStorage so it survives page reloads during Chase click-and-return flow
  - Fixed popup sync progress cleanup — `popup.js` now clears `rmx_sync_progress` from storage after sync completes and properly resets button states
- **Network interceptor layer** — Added hybrid extraction architecture: API response observation (fetch/XHR wrapping) as primary method, DOM scrapers as fallback. 7 portal interceptors, shared base utilities, per-portal feature flags, health tracking. 66 new tests (143 total). Bank portal content scripts now run at `document_start`. See `docs/plans/2026-02-01-network-interceptor-layer.md` for full design.
- Added Rakuten referral link, Buy Me a Coffee tip jar, affiliate disclosures (v2.1.0)
- Fixed Rakuten scraper for redesigned stores page (v2.1.0)
