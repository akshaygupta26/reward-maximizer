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
│   ├── chase-api-interceptor.js       # MAIN world script: fetch/XHR capture + replay for Chase API discovery
│   ├── batch-optin.js                 # Fast sequential offer activation with MutationObserver + progress reporting
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
├── shared/
│   └── theme.css                      # Design tokens (CSS custom properties), dark premium theme
├── onboarding/                        # First-run 5-step wizard (welcome.html, onboarding.css, onboarding.js)
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

### Chase Self-Discovering API Activation
Chase scraper uses a separate MAIN world script (`content/chase-api-interceptor.js`, registered via manifest `"world": "MAIN"`) for self-discovering activation. Flow: ping interceptor → start capture → click ONE offer → capture POST/PUT requests → analyze for activation API (URL, headers, body template, offer ID field) → stop capture → navigate back → replay template for all remaining offers in batches of 5 via `window.postMessage`. Falls back to optimized `history.back()` click-and-navigate if discovery fails. Communication channel: `rmx-chase-api`.

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

**Unit tests:** 177 tests across 10 suites (Jest) — `npm test` (174 passing, 3 pre-existing failures)
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
- No data exfiltration, no debugger, no localhost, all console.log gated behind DEBUG flag
- `<all_urls>` justification: "Required to display merchant offer alerts on any shopping website"

**URLs:**
- Privacy Policy: https://gorgeous-torte-f0c7c0.netlify.app/privacy.html
- Terms: https://gorgeous-torte-f0c7c0.netlify.app/terms.html
- Website: https://gorgeous-torte-f0c7c0.netlify.app/
- Support: rewardmaximizer@gmail.com

**Roadmap & future features:** See `docs/ROADMAP.md`

---

**Last Updated:** 2026-03-12

### TODO (Next Session)
- **Live Chase API discovery testing** — Log into Chase, trigger sync, watch console for `[RMX-Chase]` Phase 1/2/3 logs. Verify: interceptor ready → discovery captures activation API → replay activates remaining offers. If discovery fails, confirm fallback click-and-navigate works at ~1s/offer.
- **Live batch opt-in testing** — Test BatchOptIn on actual Amex portal (requires login). Verify MutationObserver timing, progress reporting, and in-place clicking.
- **Live scraping tests** — Test scrapers on actual bank portals (requires login). Amex, Chase, Citi, BofA, etc.
- **Banner dismiss persistence** — ✅ DONE (verified 2026-09-22): dismiss state already uses `sessionStorage` (`rmx_banner_dismissed`), survives SPA nav + page reloads within the tab session; SPA MutationObserver preserves dismiss on URL change.
- **Live API endpoint discovery (other portals)** — Interceptors use heuristic URL patterns and field names. Log into each portal with `ExtractorConfig.logRawResponses = true` to discover actual API shapes.
- **Amex multi-card activation** — `AmexInterceptor.activateAll()` is a skeleton. Implement once activation endpoint is discovered.
- **Chase post-opt-in auto-populate** — After opt-in completes, offers should auto-save without requiring a second manual sync.

### Recent Updates
- **Bug-squash pass #1 (2026-09-22, hema/bug-squash-1):**
  - Fixed null-merchant crash: one malformed offer (missing `merchant`) used to throw inside `Array.filter` and kill all matching. Guards added in `merchant-banner.js` (`checkForOffers`), `service-worker.js` (`saveOffersToStorage` drops them with a warn, `checkStackingOpportunities`, `checkMerchantOffers`).
  - Fixed stacking-only banner: when only cashback-portal offers match (no card offer), the banner title was empty. Now leads with "Earn $X cashback via Rakuten".
  - Rakuten referral prompt now shows on stacking-only banners too (was gated behind having a card offer).
  - Fixed badge/banner mismatch on subdomains: `service-worker.js checkMerchantOffers` used `hostname.split('.')[0]` ("shop" from shop.lululemon.com) while the banner used second-to-last part. SW now mirrors the banner's extraction + 3-char substring guard, so badge counts agree with the banner.
  - Verified TODO "Banner dismiss persistence" was already fixed (sessionStorage); marked done.
  - Tests: 185/185 passing (2 new regression tests for malformed-offer guard).
- **Chase self-discovering API interception (2026-03-12):** New 3-phase activation for Chase offers:
  - **Phase 1 — API Discovery:** Created `content/chase-api-interceptor.js` (MAIN world via manifest `"world": "MAIN"`) that patches fetch/XHR to capture outgoing POST/PUT/PATCH requests. Chase scraper clicks ONE offer, captures the activation API call, extracts offer ID field and request template.
  - **Phase 2 — API Replay:** Replays captured template for all remaining offers in batches of 5 via postMessage to MAIN world. Expected: ~5-10s for 70 offers vs 3-5 min before.
  - **Phase 3 — Fallback:** If discovery fails, uses optimized click-and-navigate with `history.back()` (~1s/offer) instead of full URL reload.
  - Updated `manifest.json` with separate MAIN world content_scripts entry for Chase.
  - Updated `popup.js` to handle new progress phases: `discovering`, `activating`, `fallback`.
  - Existing `ChaseInterceptor` (response observation) and `BatchOptIn` remain for other portals. All 350 tests pass (no new failures).
- **Batch opt-in engine + Chase API activation (2026-03-12):** Created `content/batch-optin.js` — shared fast sequential activation for Amex & Chase DOM scraper fallback. Uses MutationObserver-based DOM stabilization (resolves in ~150-300ms vs old 1000ms fixed waits). Reports real-time progress to popup via `chrome.runtime.sendMessage`. Chase primary path now uses API activation: interceptor captures `digitalInteractionDestUrlText` from Chase API, `activateAll()` fires Image beacon GETs to `reco.chase.com` click-tracking in batches of 10 with progress reporting. Bypass/TODO removed — activation now live. Chase `clickAndReturn()` removed entirely. Popup shows live progress ("Chase: 12/47 activated (25%) — Aldo"). All 177 tests pass (including 4 previously-failing `activateAll` tests).
- **Dark premium UI redesign (2026-03-12):** Complete visual overhaul across all 4 surfaces — dark glassmorphism theme with `shared/theme.css` design tokens (`--rmx-*` CSS custom properties).
  - **Phase 0 — Shared theme:** Created `shared/theme.css` with all design tokens (backgrounds, glass surfaces, accents, brand colors, radii, shadows, typography, transitions). Updated `manifest.json` web_accessible_resources.
  - **Phase 1 — Onboarding wizard:** Rewrote from single-scroll page to 5-step wizard (Welcome → How It Works → Select Cards → Privacy → All Set). New `onboarding.css`, full wizard state machine in `onboarding.js` with slide transitions, step validation, keyboard nav. Moved inline script to JS (CSP fix). Added `rmx_banner_enabled`, `rmx_auto_sync` storage keys.
  - **Phase 2 — Popup dashboard:** Complete `popup.css` rewrite. Glass merchant cards, translucent brand-colored sync buttons/source badges, emerald values, indigo filter chips. Fixed 5 inline style assignments in `popup.js`. Added missing `.capital-one-shopping`/`.topcashback` badge styles + `.export-menu`, `.card-view-header`, `.card-view-merchant`, `.overflow-text` CSS classes.
  - **Phase 3 — Settings page:** Complete `settings.css` rewrite. Glass section cards, indigo-tinted portal checkboxes, accent gradient toggles/buttons. Moved BMAC card and valuation header inline styles to CSS classes.
  - **Phase 4 — Merchant banner:** Rewrote `injectStyles()` to dark glass pill (`rgba(15,23,42,0.92)`, `backdrop-filter: blur(20px)`, 16px radius). Added `getSourceColor()` for brand-colored source names, `@supports not (backdrop-filter)` fallback. 40x40 gradient icon, 28x28 glass close button.
- **Automated integration testing (2026-02-18):**
  - 56/56 automated tests passed via Chrome DevTools Protocol
  - Sections tested: Onboarding, Popup UI, Settings, Deduplication, Sync Navigation, Import/Export, Export, Edge Cases, Production Readiness
  - Merchant banner tested on live sites: Nike (banner appears with Amex recommendation + Rakuten stacking), AmEx (no banner, correct exclusion), Wikipedia (no banner, correct no-match)
  - Fixed production blockers: DEBUG=false, logRawResponses=false, base-interceptor.js console.logs gated behind RMX_DEBUG
- **Bug fixes from live Chase testing (2026-02-01):**
  - Fixed Chase dirty offer values — added `cleanValue()` to `content/scrapers/chase.js` stripping status text ("X days left", "Success", "Added", etc.)
  - Fixed merchant banner subdomain bug — `merchant-banner.js` and `popup.js` now extract domain name correctly from subdomains (e.g., "lululemon" from "shop.lululemon.com")
  - Fixed sync stop not persisting — `content-main.js` now persists `_syncStopped` flag in localStorage so it survives page reloads during Chase click-and-return flow
  - Fixed popup sync progress cleanup — `popup.js` now clears `rmx_sync_progress` from storage after sync completes and properly resets button states
- **Network interceptor layer** — Added hybrid extraction architecture: API response observation (fetch/XHR wrapping) as primary method, DOM scrapers as fallback. 7 portal interceptors, shared base utilities, per-portal feature flags, health tracking. 66 new tests (143 total). Bank portal content scripts now run at `document_start`. See `docs/plans/2026-02-01-network-interceptor-layer.md` for full design.
- Added Rakuten referral link, Buy Me a Coffee tip jar, affiliate disclosures (v2.1.0)
- Fixed Rakuten scraper for redesigned stores page (v2.1.0)
