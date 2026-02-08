# Reward Maximizer v3.0 — Enhanced Data Extraction Layer

## Technical Requirements Document

**Purpose:** This document defines the requirements for upgrading Reward Maximizer's offer extraction and activation system from pure DOM scraping to a smarter, faster, more resilient architecture. This document is intended to be consumed by an AI coding agent (Claude Code) working on the codebase.

**Important:** Read the entire document before writing any code. Understand the full architecture, constraints, and goals first.

---

## 1. Project Context

### What Reward Maximizer Is

Reward Maximizer is a Chrome extension (Manifest V3) that helps users aggregate and activate credit card reward offers from multiple bank portals. The user logs into their bank website in their normal browser, and the extension detects the portal, extracts available offers, optionally activates them, and stores the data locally for cross-portal comparison and merchant-site alerts.

### Current Architecture

The extension currently uses **hand-coded DOM scrapers** for each bank portal. Content scripts are injected on bank websites (defined in `manifest.json`), and each scraper:

1. Scrolls the page to trigger lazy-loading of offer cards
2. Queries DOM elements using CSS selectors (e.g., `[data-testid="commerce-tile"]` for Chase, `button[data-testid="merchantOfferListAddButton"]` for Amex)
3. Extracts merchant names, offer values, and expiration dates by parsing `aria-label` attributes, `textContent`, and element classes
4. Activates offers by programmatically clicking "Add" / "Activate" buttons in the DOM
5. Stores cleaned offer data in `chrome.storage.local`

The scrapers live in `content/scrapers/` with one file per portal:
- `amex.js` — American Express Offers
- `chase.js` — Chase Offers
- `citi.js` — Citi Offers
- `capital-one.js` — Capital One Offers
- `discover.js` — Discover Offers
- `bofa.js` — Bank of America Offers
- `usbank.js` — US Bank Offers
- `rakuten.js` — Rakuten Cashback

The coordinator is `content/content-main.js`, which detects the current site, selects the scraper, and handles messaging with the service worker (`background/service-worker.js`).

### The Problem with DOM Scraping

1. **Fragile:** Bank portals change their HTML structure (class names, `data-testid` values, layout) every 1-3 months. Each change breaks the corresponding scraper and requires a manual code update.
2. **Slow:** Scrapers must scroll to trigger lazy-loading, wait for DOM mutations, then iterate through elements one by one. Chase's scraper uses a click-navigate-back loop that processes offers sequentially.
3. **Incomplete:** The DOM often doesn't render all available data. Offers may have metadata (minimum spend thresholds, exact merchant category codes, eligible card IDs) that the bank's frontend knows about but doesn't display visually.
4. **Limited activation:** Some banks hide an offer from the UI after it's added to one card. The DOM approach cannot add the same offer to multiple eligible cards because the button disappears. However, the underlying data layer may allow this.

---

## 2. Goal: Hybrid Data Extraction Architecture

### The Core Insight

Modern bank portals are Single Page Applications (SPAs). The visible offer cards that users see are rendered by JavaScript after the browser fetches structured data from backend API endpoints. The page's own JavaScript makes network requests (via `fetch()` or `XMLHttpRequest`) to internal APIs, receives JSON responses containing all offer data, and then renders that data into the DOM.

**This means the structured data is already flowing through the browser before it ever becomes DOM elements.** If we can observe those network responses, we get clean, structured, complete offer data without touching the DOM at all.

### Desired Behavior

Build a **hybrid extraction system** with two layers:

**Primary Layer — Network Response Observation:**
- Passively observe the API responses that the bank's own frontend receives
- Extract structured offer data (JSON) from these responses
- Use this data for offer collection (merchant name, value, expiry, offer IDs, eligible cards, activation endpoints)
- Use discovered API patterns to perform offer activation directly via network requests (using the user's existing authenticated session)

**Fallback Layer — Existing DOM Scrapers:**
- If the primary layer fails to capture data (e.g., the bank changed their API endpoints or response format, or the page uses a data-fetching pattern we didn't anticipate), fall back gracefully to the existing DOM scrapers
- The DOM scrapers should continue to work as they do today — they are battle-tested and functional
- Log a warning when falling back so we can investigate and update the primary layer

### Key Principles

1. **The user experience does not change.** User still logs into their bank, the extension still syncs, the popup and merchant banner still work identically. This is an under-the-hood upgrade.
2. **Never store or transmit credentials.** We operate entirely within the user's existing authenticated browser session. We don't ask for bank logins, we don't proxy requests through any server, we don't touch cookies directly. We leverage the fact that our content script runs in the same origin as the bank page.
3. **Respect the user's session.** All network requests for activation must use the same cookies/headers the bank's own frontend would use. We are automating what the user would do manually, not bypassing any authentication.
4. **Prefer observation over injection.** The ideal pattern is to *listen* to network traffic the page is already generating, not to *create* new requests for data collection. New requests should only be made for offer activation (which is something the user explicitly triggered).
5. **The fallback must always work.** The DOM scrapers are the safety net. They should remain functional and up-to-date independently of the primary layer.

---

## 3. Technical Approach: Network Response Observation

### How This Should Work Conceptually

When a bank portal page loads, its JavaScript makes API calls to fetch offer data. A Chrome extension content script can observe these calls by wrapping the browser's native `fetch` and `XMLHttpRequest` APIs *before* the page's own scripts run. This is sometimes called "monkey-patching" or "intercepting" the network layer at the JavaScript level.

**Important Manifest V3 considerations:**
- Content scripts in MV3 run in an isolated world by default. To intercept `fetch`/`XMLHttpRequest` on the *page's* execution context (the "main world"), the content script may need to inject a script into the page's main world. This can be done via `chrome.scripting.executeScript` with `world: 'MAIN'`, or by injecting a `<script>` element.
- Alternatively, the `chrome.webRequest` or `chrome.declarativeNetRequest` APIs can observe network requests from the service worker, but MV3's `declarativeNetRequest` is more limited for reading response bodies. Investigate what's available and choose the most robust approach.
- The extension already has `<all_urls>` in `host_permissions` and specific bank domains listed, so permission shouldn't be a blocker.

### What to Capture

For each bank portal, the observation layer should capture API responses that contain:
- **Offer list data:** The complete set of available offers, including merchant name, offer value/description, expiration date, offer ID, activation status, eligible cards
- **Activation responses:** Confirmation payloads when an offer is successfully activated
- **Card/account identifiers:** Which cards/accounts the user has (needed for multi-card activation)

### How to Identify the Right API Calls

Use heuristics to identify which network requests carry offer data:
- URL path patterns (e.g., paths containing `/offers`, `/deals`, `/rewards`, `/commerce`, `/merchant`)
- Response content type (`application/json`)
- Response body structure (arrays of objects with merchant-like fields)
- Known endpoint patterns per bank (these will need to be discovered via manual investigation and hardcoded as hints)

### Implementation Pattern

For each bank portal, create a new module (suggested location: `content/interceptors/`) that:

1. **Injects an observer** into the page's main world that wraps `fetch` and/or `XMLHttpRequest`
2. **Filters responses** by URL pattern and content type to find offer-related API calls
3. **Extracts and normalizes** the JSON data into the standard offer format the extension already uses:
   ```javascript
   {
     merchant: String,       // Merchant display name
     value: String,          // e.g., "$20 cash back" or "5% back"
     expiry: String,         // e.g., "03/15/2026" or "Check portal"
     merchantCategory: String, // from Categories.detectCategory()
     valueType: String,      // "percent", "fixed", "multiplier", or "unknown"
     timestamp: Number,      // Date.now()
     // NEW fields the primary layer can provide:
     offerId: String|null,   // Internal offer identifier from the API
     activationUrl: String|null, // API endpoint to activate this offer
     eligibleCards: Array|null,  // Card IDs this offer can be added to
     minSpend: Number|null,  // Minimum spend threshold if available
     maxReward: Number|null, // Maximum reward cap if available
     status: String|null     // "available", "activated", "expired", etc.
   }
   ```
4. **Communicates captured data** back to the content script's isolated world (via `window.postMessage` or `CustomEvent`) for storage
5. **Provides an activation function** that can make API requests to activate offers, using the session that's already authenticated in the browser

### Activation via API

For offer activation, the interceptor should:
1. Observe the activation request that the bank's own UI makes when a user manually clicks "Add to Card" (capture the URL, method, headers, and request body)
2. Replicate this request pattern programmatically for batch activation
3. Support activating the same offer across multiple eligible cards (if the API supports a card identifier parameter)
4. Include appropriate delays between activation requests to avoid rate limiting (suggest 500-1500ms randomized intervals)
5. Return success/failure status for each activation attempt

---

## 4. Portal-Specific Guidance

Below is what we know about each portal. The implementation will need to discover and document the actual API endpoints and response formats through investigation. These notes provide starting points.

### 4.1 American Express (`amex.js` → `amex-interceptor.js`)

**Current DOM approach:** Queries `button[data-testid="merchantOfferListAddButton"]`, walks up to parent card containers, extracts merchant name from `aria-label` / title attributes, extracts value from card text content. Activates by clicking add buttons one at a time.

**What to look for in network traffic:**
- Amex's offers page (`americanexpress.com/us/credit-cards/category/offer/all/`) is a React SPA
- When the page loads available offers, it likely fetches from an internal API that returns a JSON array of offer objects
- Each offer object probably contains: merchant name, offer description, offer ID, activation status, eligible card member tokens, expiry date, terms
- The "Add to Card" action likely sends a POST request with the offer ID and a card/account identifier
- **Multi-card activation opportunity:** Amex allows the same offer on multiple personal cards, but the DOM hides the offer after adding to one card. The API likely accepts a card identifier, allowing sequential activation calls for different cards using the same offer ID.

**Priority:** HIGH — Amex is the most popular portal and the multi-card activation is a major feature unlock.

### 4.2 Chase (`chase.js` → `chase-interceptor.js`)

**Current DOM approach:** Queries `[data-testid="commerce-tile"]`, parses `aria-label` attributes using regex (`/^\d+\s+of\s+\d+\s+(.+?)\s+(\$\d+.*?|\d+%.*?)$/i`). Activates via a click-and-navigate-back loop using `[data-cy="commerce-tile-button"]`.

**What to look for in network traffic:**
- Chase's offer hub (`secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub`) is a React/Angular SPA
- The offer list is populated by an API call that returns JSON with all available offers
- Each offer likely has: merchant name, reward amount/type, offer ID, activation status, expiry
- The activation button click triggers an API call (likely POST) with offer ID and possibly account number
- Chase is known to use `commerce-tile` data attributes, suggesting a well-structured data layer

**Priority:** HIGH — Second most popular portal, and the current click-navigate-return pattern is very slow.

### 4.3 Citi (`citi.js` → `citi-interceptor.js`)

**Current DOM approach:** Uses broad selectors (`[class*="offer-card"]`, `[class*="tile"]`), extracts merchant from heading elements, finds "Activate" buttons by text matching.

**What to look for in network traffic:**
- Citi's offers page (`online.citi.com/US/ag/merchantoffers`) loads offers via API
- Look for XHR/fetch calls returning offer arrays after page load
- Activation is likely a POST with offer ID

**Priority:** MEDIUM

### 4.4 Capital One (`capital-one.js` → `capital-one-interceptor.js`)

**Current DOM approach:** Handles both Capital One card offers and Capital One Shopping.

**What to look for in network traffic:**
- Capital One's dashboard loads offers asynchronously
- Capital One Shopping (`capitaloneshopping.com`) has its own API for cashback rates
- These are two distinct systems with different APIs

**Priority:** MEDIUM

### 4.5 Bank of America (`bofa.js` → `bofa-interceptor.js`)

**Current DOM approach:** Queries BofA-specific offer elements.

**What to look for in network traffic:**
- BofA's offers page loads deal data via API calls
- Look for endpoints related to `BankAmeriDeals` or similar branding

**Priority:** MEDIUM

### 4.6 Discover (`discover.js` → `discover-interceptor.js`)

**Current DOM approach:** Extracts from Discover's offers page.

**Priority:** LOW — Smaller user base for this portal.

### 4.7 US Bank (`usbank.js` → `usbank-interceptor.js`)

**Current DOM approach:** Extracts from US Bank's deals page.

**Priority:** LOW — Smaller user base.

### 4.8 Rakuten (`rakuten.js` → `rakuten-interceptor.js`)

**Current DOM approach:** Scrapes merchant cashback rates from Rakuten's store listings. Uses selectors like `[class*="store-card"]` and `a[href*="/stores/"]`.

**What to look for in network traffic:**
- Rakuten is a cashback portal, not a card-linked offer system
- Their store directory likely has an API that returns merchant names and cashback percentages
- Activation model is different — Rakuten uses affiliate click-through, not offer activation

**Priority:** LOW — Different model, DOM scraping may be sufficient here.

---

## 5. Architecture & File Structure

### Proposed File Organization

```
content/
├── interceptors/              # NEW — Primary extraction layer
│   ├── base-interceptor.js    # Shared interception utilities
│   ├── amex-interceptor.js    # Amex-specific API patterns
│   ├── chase-interceptor.js   # Chase-specific API patterns
│   ├── citi-interceptor.js    # Citi-specific API patterns
│   ├── capital-one-interceptor.js
│   ├── bofa-interceptor.js
│   ├── discover-interceptor.js
│   ├── usbank-interceptor.js
│   └── rakuten-interceptor.js
├── scrapers/                  # EXISTING — Fallback extraction layer
│   ├── amex.js
│   ├── chase.js
│   ├── citi.js
│   └── ... (unchanged)
├── content-main.js            # MODIFIED — Orchestrates primary + fallback
├── merchant-banner.js         # UNCHANGED
└── utils.js                   # May need additions for network utilities
```

### Base Interceptor Module (`base-interceptor.js`)

This shared module should provide:

1. **`injectMainWorldScript(code)`** — Utility to inject JavaScript into the page's main world execution context (needed to wrap `fetch`/`XMLHttpRequest` in the page's context, not the isolated content script world)

2. **`createFetchObserver(urlPatterns, callback)`** — Sets up passive observation of `fetch()` calls matching URL patterns. Calls `callback` with the response body when a match is found. Must handle both `Response.json()` and `Response.text()` consumption without breaking the page's own response handling (clone the response before reading).

3. **`createXHRObserver(urlPatterns, callback)`** — Same as above but for `XMLHttpRequest`. Some bank portals may use XHR instead of fetch.

4. **`bridgeToContentScript(data)`** — Sends captured data from the main world back to the content script's isolated world (via `window.postMessage` with a unique message type identifier to avoid collisions with the page's own messages).

5. **`makeAuthenticatedRequest(url, options)`** — Makes a network request from the page's main world context, inheriting the user's authenticated session (cookies, CSRF tokens, etc.). Used for offer activation. This function should be injected into the main world.

6. **`normalizeOffer(rawOffer, source)`** — Converts raw API response data into the standard offer format used by the rest of the extension.

### Integration with `content-main.js`

Modify the existing coordinator to:

1. On page load on a bank portal, initialize the corresponding interceptor
2. Wait for the interceptor to capture offer data (with a reasonable timeout, suggest 10-15 seconds)
3. If the interceptor successfully captures data, use that data and skip the DOM scraper
4. If the interceptor times out or captures no data, fall back to the DOM scraper
5. Log which extraction method was used for debugging
6. The `handleScrapeRequest` function should work identically from the popup/service worker's perspective — the caller doesn't need to know which layer provided the data

```
Extraction flow (conceptual — implement as you see fit):

User loads bank portal
  → content-main.js initializes
  → Start interceptor for this portal
  → Interceptor wraps fetch/XHR in main world
  → Bank page makes its normal API calls
  → Interceptor captures offer data from API responses
  → Data bridged back to content script
  → Offers normalized and stored

If user triggers sync from popup:
  → Check if interceptor already has captured data
  → If yes: use captured data, activate via API
  → If no: fall back to DOM scraper
  → Return results to popup either way
```

### Manifest Changes

The `manifest.json` will need to be updated to include the new interceptor files in the appropriate `content_scripts` entries. Each bank portal's content script array should include:
- `lib/debug.js` (existing)
- `lib/categories.js` (existing)
- `content/utils.js` (existing)
- `content/interceptors/base-interceptor.js` (NEW)
- `content/interceptors/{bank}-interceptor.js` (NEW)
- `content/scrapers/{bank}.js` (existing, kept as fallback)
- `content/content-main.js` (existing, modified)

---

## 6. Implementation Phases

### Phase 1: Infrastructure (Do This First)

- Build `base-interceptor.js` with the core utilities (main world injection, fetch/XHR observation, message bridging, authenticated request helper)
- Modify `content-main.js` to support the dual-layer pattern (try interceptor first, fall back to scraper)
- Add comprehensive logging via the existing `debug.js` system so we can see which layer is active and what data it captures
- Test the infrastructure on one portal before expanding

### Phase 2: Chase Interceptor (First Real Implementation)

- Chase is a good first target because:
  - The current DOM scraper is the slowest (click-navigate-return loop)
  - Chase uses standard React patterns with clear data-fetching
  - The improvement will be most visible to users (seconds vs. minutes)
- Build `chase-interceptor.js`
- Discover and document Chase's offer API endpoints and response format
- Implement offer collection via API response observation
- Implement offer activation via API replication
- Validate that fallback to `chase.js` DOM scraper works when interceptor fails
- Compare extracted data between both methods to verify correctness

### Phase 3: Amex Interceptor (Highest Feature Value)

- Amex is the highest-value target because:
  - Largest number of offers per user
  - Multi-card activation is a major feature unlock (not possible via DOM)
  - Amex's React SPA likely has clean API patterns
- Build `amex-interceptor.js`
- Implement multi-card activation if the API supports card identifiers
- This becomes the first "premium-worthy" feature

### Phase 4: Remaining Portals

- Build interceptors for Citi, Capital One, BofA, Discover, US Bank
- Rakuten may not need an interceptor — evaluate whether DOM scraping is sufficient given its simpler model
- Each portal interceptor follows the same pattern established in Phases 2-3

---

## 7. Error Handling & Resilience

### Failure Modes to Handle

1. **Interceptor captures no data** (API endpoint changed, page uses a new data-fetching pattern)
   → Fall back to DOM scraper immediately. Log a structured warning: `{ event: 'interceptor_miss', portal: 'chase', reason: 'no_matching_responses', timestamp }`

2. **Interceptor captures data but it's in an unexpected format** (API response schema changed)
   → Attempt to parse what we can. If the normalized result has fewer than 50% of fields populated, fall back to DOM scraper. Log the raw response snippet for debugging.

3. **Activation API returns an error** (rate limited, session expired, offer already activated)
   → Return a per-offer status. Don't abort the entire batch for one failure. Fall back to DOM click for that specific offer if API activation fails.

4. **Main world injection fails** (CSP blocks inline scripts on the page)
   → Fall back to DOM scraper entirely. Some bank pages may have strict CSP that prevents main world script injection. This is a known limitation — document it.

5. **Race condition between interceptor and scraper** (both try to run simultaneously)
   → The orchestrator in `content-main.js` should be the single decision-maker. Only one path runs at a time. Use a state machine or promise chain, not parallel execution.

### Health Monitoring

Add a simple health tracking object that records, per portal:
- Last successful extraction method (`interceptor` or `scraper`)
- Last extraction timestamp
- Number of consecutive interceptor failures
- Last error message

Store this in `chrome.storage.local` alongside existing data. This data will be useful for future features (e.g., notifying the user if a portal has been failing for multiple days, or a future admin dashboard).

---

## 8. Security Considerations

### What We Must NOT Do

- **Never send any data to external servers.** All processing is local. No analytics, no telemetry, no cloud sync in this version.
- **Never store raw API responses** that might contain sensitive account data (account numbers, balances, personal information). Only store the normalized offer data.
- **Never persist authentication tokens, cookies, or session identifiers.** We use the browser's existing session in-flight only.
- **Never modify the bank page's functionality** beyond observing its network traffic and (when user-initiated) making activation requests. The page should work normally whether our extension is installed or not.

### Content Security Policy

- Some bank pages may have strict CSP headers that prevent inline script injection. The main world injection approach must handle this gracefully — either by using `chrome.scripting.executeScript` with `world: 'MAIN'` (which bypasses page CSP since it's an extension API), or by falling back to DOM scraping if injection fails.
- Our own extension pages (popup, settings, onboarding) already comply with MV3 CSP. This change should not affect those.

### Data Sanitization

- All data extracted from API responses must be sanitized before being inserted into the extension's UI (popup, merchant banner). The existing innerHTML usage in `popup.js` and `merchant-banner.js` means we must ensure no API response data can execute as HTML/JS.
- Treat all API response data as untrusted input, just as we treat DOM-scraped data.

---

## 9. Testing Strategy

### Unit Testing Per Portal

For each interceptor, validate:
- [ ] Fetch/XHR observer correctly identifies offer-related API calls by URL pattern
- [ ] Response parsing extracts all expected fields (merchant, value, expiry, offerId, etc.)
- [ ] Normalization produces valid offer objects matching the existing format
- [ ] Activation function sends correctly formatted requests
- [ ] Fallback to DOM scraper triggers when interceptor produces no results
- [ ] Fallback to DOM scraper triggers when interceptor throws an error
- [ ] Both layers produce equivalent offer data for the same set of offers (cross-validation)

### Integration Testing

- [ ] Extension loads without errors on all supported bank portals
- [ ] Offer sync works end-to-end via popup "Sync" button using primary layer
- [ ] Offer sync works end-to-end via popup "Sync" button using fallback layer
- [ ] Merchant banner correctly shows offers regardless of which layer extracted them
- [ ] No console errors in the bank page's context (our injection must not break their JS)
- [ ] Bank page functionality is unaffected (user can still navigate, click offers manually, etc.)
- [ ] Popup display is identical whether data came from interceptor or scraper

### Performance Validation

- [ ] Chase offer sync completes in under 10 seconds via interceptor (vs. current 1-2 minutes via DOM)
- [ ] Amex offer sync completes in under 10 seconds via interceptor
- [ ] Memory usage of content scripts does not increase significantly (interceptors should be lightweight observers)
- [ ] No noticeable page load delay on bank portals from our injection

---

## 10. Data Migration & Compatibility

### Storage Format

The existing offer storage format in `chrome.storage.local` (key: `rmx_offers`) must remain backward-compatible. New fields added by the interceptor layer (`offerId`, `activationUrl`, `eligibleCards`, `minSpend`, `maxReward`, `status`) should be **additive** — existing code that doesn't know about these fields should continue to work. Use `null` as the default for all new fields.

### Existing Functionality That Must Not Break

- [ ] Popup offer display and sorting (`popup/popup.js`)
- [ ] Merchant banner on non-bank websites (`content/merchant-banner.js`)
- [ ] Point valuation calculations (`lib/valuation.js`)
- [ ] Export to CSV/JSON (`lib/export.js`)
- [ ] Settings page (`settings/settings.js`)
- [ ] Category detection (`lib/categories.js`)
- [ ] Badge updates and notifications (`background/service-worker.js`)
- [ ] Sync history tracking (`lib/storage.js`)

---

## 11. Success Criteria

This project is complete when:

1. **Chase and Amex interceptors are functional** — extracting offers via API observation and activating via API replication, with DOM scraper fallback working
2. **Offer data parity** — the interceptor produces the same (or better) offer data compared to the DOM scraper for the same portal
3. **Speed improvement is measurable** — sync time for Chase drops from >60 seconds to <10 seconds
4. **Multi-card Amex activation works** — the same offer can be activated on multiple eligible Amex cards in a single sync operation (if the API supports this)
5. **Zero regressions** — all existing functionality (popup, merchant banner, export, settings) works identically
6. **Fallback is reliable** — deliberately disabling the interceptor (e.g., with a config flag) cleanly falls back to DOM scraping with no errors
7. **Code is well-documented** — each interceptor file documents the discovered API endpoints, request/response formats, and any bank-specific quirks

---

## 12. Configuration & Debug

### Feature Flags

Add a configuration object (in `lib/config.js` or similar) that controls:

```javascript
const ExtractorConfig = {
  // Master toggle for the interceptor layer
  useInterceptors: true,

  // Per-portal toggles (useful for debugging and gradual rollout)
  portals: {
    amex:        { interceptor: true, fallbackToScraper: true },
    chase:       { interceptor: true, fallbackToScraper: true },
    citi:        { interceptor: true, fallbackToScraper: true },
    'capital-one': { interceptor: true, fallbackToScraper: true },
    bofa:        { interceptor: true, fallbackToScraper: true },
    discover:    { interceptor: true, fallbackToScraper: true },
    usbank:      { interceptor: true, fallbackToScraper: true },
    rakuten:     { interceptor: false, fallbackToScraper: true }, // DOM-only by default
  },

  // Timeout before falling back to DOM scraper (ms)
  interceptorTimeout: 12000,

  // Delay between activation API calls (ms, randomized ±30%)
  activationDelay: 1000,

  // Maximum concurrent activation requests
  maxConcurrentActivations: 1,

  // Log captured API responses for debugging (disable in production)
  logRawResponses: false,
};
```

### Debug Logging

Use the existing `debug.js` infrastructure. All interceptor logging should use a consistent prefix:
- `[RMX-Interceptor-Chase]` for Chase-specific logs
- `[RMX-Interceptor-Base]` for shared infrastructure logs
- `[RMX-Orchestrator]` for the content-main.js decision logic

Key events to log:
- Interceptor initialized for portal X
- Fetch/XHR observer attached
- API response captured (URL, response size, number of offers extracted)
- Falling back to DOM scraper (reason)
- Activation request sent (offer ID, card ID)
- Activation response received (success/failure)
- Health status update

---

## 13. Open Questions for the Implementer

These are areas where you'll need to make judgment calls during implementation. Document your decisions in code comments.

1. **Main world injection method:** `chrome.scripting.executeScript` with `world: 'MAIN'` vs. injecting a `<script>` tag vs. using `chrome.debugger` API. Each has tradeoffs around CSP compatibility, timing, and reliability. Choose what works best.

2. **Response cloning strategy:** When intercepting `fetch()`, you must clone the response before reading the body, so the page's own code can still consume it. The `Response.clone()` method should work, but edge cases exist (e.g., streaming responses, opaque responses from CORS). Handle these gracefully.

3. **CSRF token handling:** Bank activation APIs almost certainly require CSRF tokens in request headers. These tokens are usually embedded in the page's HTML or set as cookies. The interceptor should observe where the page gets its CSRF tokens and replicate the same mechanism for activation requests.

4. **API versioning:** Some bank APIs include version identifiers in URL paths or headers. Capture these and replicate them in activation requests. If the version changes, that's a signal that the interceptor may need updating.

5. **Timing of injection:** The `fetch`/`XMLHttpRequest` wrappers must be in place *before* the page's JavaScript makes its first API call. This means the injection must happen very early — `"run_at": "document_start"` in the manifest may be necessary for the interceptor scripts, while the existing scrapers use `"document_idle"`. Evaluate if a `run_at` change is needed and whether it affects the scraper fallback.

---

## Appendix A: Current Scraper Entry Points

For reference, these are the current scraper objects and their `scrape()` method signatures. The interceptors should return data compatible with the same return format.

```javascript
// All scrapers return this format from scrape():
{
  offers: [
    {
      merchant: "StoreName",
      value: "$20 cash back",
      expiry: "03/15/2026",
      merchantCategory: "shopping",
      valueType: "fixed",
      timestamp: 1706000000000
    }
  ],
  added: 5,           // Number of offers activated
  totalFound: 72       // Total offers discovered
}
```

The interceptor should return the same shape, with optional additional fields as defined in Section 3.

## Appendix B: Existing Content Script Loading

Current `manifest.json` content script entries (each portal loads these scripts in order):
1. `lib/debug.js`
2. `lib/categories.js`
3. `content/utils.js`
4. `content/scrapers/{portal}.js`
5. `content/content-main.js`

All currently use `"run_at": "document_idle"`. The interceptor layer may require earlier injection — adjust as needed and document why.

## Appendix C: Storage Keys

The extension uses these `chrome.storage.local` keys (defined in `lib/storage.js`):
- `rmx_offers` — Array of all synced offers
- `rmx_user_cards` — User's selected cards
- `rmx_point_values` — Custom point valuations
- `rmx_settings` — Extension settings
- `rmx_sync_history` — When each portal was last synced
- `rmx_portal_links` — Portal link activations

Add a new key for interceptor health: `rmx_interceptor_health`
