# Reward Maximizer - Claude Context File

## Project Overview

**Reward Maximizer** is a Chrome extension (Manifest v3) that helps users maximize credit card rewards by syncing, comparing, and stacking offers across multiple credit card portals and cashback platforms.

**Version:** 2.0.0
**Repository Structure:** Chrome Extension
**Tech Stack:** Vanilla JavaScript, Chrome Extension APIs, Chrome Storage API

---

## Core Functionality

### What It Does
1. **Scrapes credit card offers** from multiple bank portals (Amex, Chase, Citi, Capital One, Discover, BofA, US Bank)
2. **Tracks cashback platforms** (Rakuten, Capital One Shopping, TopCashback)
3. **Compares offer values** across cards using point valuations
4. **Identifies stacking opportunities** (card offer + cashback portal)
5. **Shows non-intrusive banners** on merchant websites when you have active offers
6. **Provides centralized dashboard** to view all offers organized by merchant, card, or category

### Key Features
- **Automatic offer detection** - Auto-scrapes when navigating to portal offer pages
- **Smart deduplication** - Merges offers from same source+merchant
- **Live merchant alerts** - Shows banner on merchant websites (e.g., aldo.com) with best card to use
- **Point value calculator** - Compares cash back vs points using custom valuations
- **Export functionality** - CSV/JSON export for analysis
- **Category classification** - Auto-categorizes merchants (dining, travel, gas, etc.)

---

## Architecture

### File Structure

```
Reward Maximizer/
├── manifest.json                      # Chrome extension config (v3)
├── background/
│   └── service-worker.js             # Background worker: badge updates, offer storage, merchant detection
├── content/
│   ├── content-main.js               # Router for scraper scripts on portal sites
│   ├── merchant-banner.js            # Shows offers on merchant websites (NEW)
│   ├── utils.js                      # Shared utilities for content scripts
│   └── scrapers/                     # Portal-specific scrapers
│       ├── amex.js                   # American Express scraper (715 lines)
│       ├── chase.js                  # Chase scraper (453 lines)
│       ├── citi.js                   # Citi scraper (168 lines)
│       ├── capital-one.js            # Capital One scraper (188 lines)
│       ├── discover.js               # Discover scraper (160 lines)
│       ├── rakuten.js                # Rakuten scraper (198 lines)
│       ├── bofa.js                   # Bank of America scraper (161 lines)
│       └── usbank.js                 # US Bank scraper (162 lines)
├── popup/
│   ├── popup.html                    # Main UI
│   ├── popup.js                      # Popup controller (520 lines)
│   └── popup.css                     # Styling
├── settings/
│   ├── settings.html
│   ├── settings.js
│   └── settings.css
├── lib/
│   ├── storage.js                    # Chrome storage abstraction (360 lines)
│   ├── categories.js                 # Merchant categorization (289 lines)
│   ├── valuation.js                  # Point value calculator (276 lines)
│   └── export.js                     # Export functionality
└── data/
    └── defaults.js                   # Default point values for 30+ cards
```

---

## Data Model

### Offer Object Structure
```javascript
{
  id: "rmx_[timestamp]_[random]",           // Unique ID
  merchant: "Merchant Name",                  // e.g., "Aldo", "Best Buy"
  value: "$20 cash back" or "5% back",       // Offer value string
  source: "amex|chase|citi|...",             // Source portal
  expiry: "Check portal" or "2025-03-15",    // Expiration date
  merchantCategory: "shopping|dining|...",    // Auto-detected category
  valueType: "percent|fixed|multiplier",      // Type of offer
  optedInAt: "2025-01-15T10:30:00.000Z",     // When user opted in
  status: "active"                            // Offer status
}
```

### Storage Keys (Chrome Local Storage)
- `rmx_offers` - Array of all offers
- `rmx_settings` - User preferences
- `rmx_sync_history` - Last sync timestamps per source
- `rmx_user_cards` - User's selected cards
- `rmx_point_values` - Custom point valuations

### Deduplication Logic
- Composite key: `${source}-${merchant.toLowerCase()}`
- Updates existing offer if same source+merchant found
- Implemented in `lib/storage.js:100-179`

---

## Key Components

### 1. Background Service Worker (`background/service-worker.js`)
**Responsibilities:**
- Badge management (shows "✓" on portals, offer count on merchants)
- Detects merchant websites and checks for matching offers
- Handles cross-tab communication
- Manages offer storage and deduplication

**Key Functions:**
- `checkMerchantOffers(hostname, tabId)` - Detects if current site has offers (line 200)
- `saveOffersToStorage(offers, source)` - Saves scraped offers (line 76)
- `updateBadge(count)` - Updates extension badge (line 58)

### 2. Merchant Banner (`content/merchant-banner.js`) - NEW
**Responsibilities:**
- Runs on ALL websites (except portal sites)
- Checks if current merchant has active offers
- Shows non-intrusive banner with best card recommendation
- Handles stacking partner display (Rakuten, Capital One Shopping)
- Provides helpful guidance to view details in popup

**Flow:**
1. Script loads on page
2. Extracts merchant name from hostname (e.g., "aldo" from "www.aldoshoes.com")
3. Queries storage for matching offers
4. If match found, shows gradient banner in top-right
5. Banner shows: "Use your [Card] for [Offer]" + optional stacking offer
6. Click "Details" → Shows tooltip guiding user to click extension icon
7. User can dismiss banner with × button

**Important:** Uses fuzzy matching to handle merchant name variations

**UX Improvements:**
- Clear actionable message: "Use your Amex card for $20 cash back"
- Stacking hints: "💡 Stack with Rakuten for 5% extra cashback"
- Helpful tooltip when clicking Details button
- Pulse animation to draw attention to extension icon

### 3. Scrapers (`content/scrapers/*.js`)
**Pattern:** Each scraper follows this structure:
```javascript
const [Name]Scraper = {
  source: 'source-name',
  offersUrl: 'portal-url',
  needsNavigation() { /* Check if redirect needed */ },
  async scrape() { /* Main extraction logic */ },
  collectOffers() { /* Parse DOM for offers */ },
  extractMerchant(element) { /* Get merchant name */ },
  extractValue(element) { /* Get offer value */ }
};
```

**Key Features:**
- Automatic opt-in (clicks "Add Offer" buttons)
- Lazy loading handling (scrolls and waits for dynamic content)
- Multiple CSS selector fallbacks for robustness
- Auto-sync on portal navigation

### 4. Popup (`popup/popup.js`)
**View Modes:**
- By Merchant (default) - Groups by store, shows best offer + stacking
- By Card - Groups by card issuer
- By Category - Groups by merchant category

**Features:**
- Full-text search
- Category filters
- Sync buttons for each portal
- Export to CSV/JSON
- Shows "BEST" and "+STACK" badges
- **Merchant Auto-Detection** - Automatically detects current website and filters offers (NEW)

**Merchant Auto-Detection Flow:**
1. Popup opens
2. Gets current tab URL
3. Extracts merchant name using fuzzy matching
4. Finds matching offers in storage
5. Auto-populates search box with merchant name
6. Highlights search box briefly with yellow background
7. Shows success message: "Found X offer(s) for [Merchant]"

**Result:** When you're on aldo.com and open the popup, it automatically shows Aldo offers!

---

## Development Workflow

### Testing Locally
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `Reward Maximizer` directory
5. Extension should load with no errors

### Testing Merchant Banner
1. Add offers from any portal (go to Amex/Chase offers page and sync)
2. Visit a merchant website (e.g., bestbuy.com if you have Best Buy offers)
3. Banner should auto-appear in top-right within 1-2 seconds
4. Check browser console for `[RMX Merchant Banner]` logs

### Debugging
**Enable debug logs:**
- Storage logs: `lib/storage.js:14` set `debug: true`
- All content scripts log to console with prefixes: `[RMX...]`

**Common issues:**
- Banner not showing → Check merchant name matching in `merchant-banner.js:47`
- Scraper not working → Check CSS selectors in scraper file
- Offers not saving → Check `lib/storage.js` logs for errors

---

## Important Implementation Notes

### Merchant Name Matching
The extension uses **fuzzy matching** to detect merchants:
```javascript
// From merchant-banner.js:47
const hostname = window.location.hostname.replace('www.', '').toLowerCase();
const merchantName = hostname.split('.')[0]; // "aldo" from "aldo.com"

// Match logic
offerMerchant.includes(merchantName) ||
merchantName.includes(offerMerchant) ||
offerMerchant.replace(/[^a-z0-9]/g, '') === merchantName.replace(/[^a-z0-9]/g, '')
```

This handles variations like:
- "Aldo" vs "aldo.com"
- "Best Buy" vs "bestbuy.com"
- "Target.com" vs "target"

### Stacking Logic
**Card offers** (cannot stack with each other):
- amex, chase, citi, capital-one, discover, bofa, usbank

**Stacking partners** (can stack with card offers):
- rakuten, capital-one-shopping, topcashback

**Best strategy:** Use best card offer + best stacking partner

### Point Valuations
Default values in `data/defaults.js` (can be customized in settings):
```javascript
{
  'amex-mr': 1.8,        // Amex Membership Rewards
  'chase-ur': 1.5,       // Chase Ultimate Rewards
  'citi-typ': 1.4,       // Citi ThankYou Points
  'capital-one-miles': 1.5,
  'discover-cashback': 1.0
}
```

Used by `lib/valuation.js` to compare offers and calculate cents-per-dollar (cpp)

---

## Known Issues & Edge Cases

### Current Limitations
1. **No backend** - All data stored locally (designed for future migration)
2. **Merchant matching** - May miss variations in merchant names (e.g., "Aldo Shoes" vs "Aldo")
3. **Offer expiration** - Most portals don't show expiry, defaults to "Check portal"
4. **Auto-opt-in** - Only works on portals that don't require confirmation dialogs

### Edge Cases Handled
- SPA navigation - Banner re-checks on URL change via MutationObserver
- Portal site exclusion - Banner doesn't show on credit card portal sites
- Duplicate offers - Deduplication by source+merchant
- Missing data - Graceful fallbacks for missing merchant names, values, etc.

---

## Future Enhancements (Roadmap)

### Planned Features
- [ ] Backend API integration for multi-device sync
- [ ] Browser notifications when offers match browsing
- [ ] Auto-activate cashback portals (e.g., Rakuten browser button)
- [ ] Historical tracking (track which offers were used)
- [ ] Smart recommendations based on spending patterns
- [ ] Support for more portals (Wells Fargo, Barclays, etc.)

### Technical Debt
- Migrate from Chrome Storage to backend API
- Add TypeScript for better type safety
- Implement proper error tracking (Sentry)
- Add unit tests for scrapers
- Improve merchant name matching with ML/fuzzy search

---

## Common Tasks

### Adding a New Portal Scraper
1. Create `content/scrapers/[portal-name].js`
2. Implement scraper pattern (see existing scrapers)
3. Add to `manifest.json` content_scripts
4. Add host permissions to `manifest.json`
5. Update `content-main.js` to detect new portal
6. Add default point values to `data/defaults.js`

### Debugging Merchant Detection
1. Open merchant website (e.g., aldo.com)
2. Open DevTools console
3. Look for: `[RMX Merchant Banner] Checking for offers matching: aldo`
4. Check if offers were found: `[RMX Merchant Banner] Found X offers`
5. If no match, check offer merchant names in storage: `chrome.storage.local.get('rmx_offers')`

### Updating Point Values
1. Go to Settings page
2. Click "Custom Point Values"
3. Update cpp for each card program
4. Save (stored in `rmx_point_values`)
5. Popup will recalculate offer rankings

---

## Contact & Support

**Critical Files:**
- `manifest.json` - Extension config
- `background/service-worker.js` - Background logic
- `content/merchant-banner.js` - Merchant website alerts
- `lib/storage.js` - Data persistence

**When debugging:**
- Check browser console for error logs
- Check `chrome://extensions/` for extension errors
- Verify permissions in manifest.json
- Test in incognito mode to rule out conflicts

---

## Recent Changes

### v2.0.0 (Current)
- ✅ Added merchant banner feature for automatic offer alerts
- ✅ Updated manifest to run on all URLs
- ✅ Improved merchant name matching with fuzzy logic
- ✅ Added stacking partner display in banner
- ✅ Mobile-responsive banner design
- ✅ **Merchant auto-detection in popup** - Automatically filters to current site's offers
- ✅ **Improved banner UX** - Clear card recommendations and helpful tooltips
- ✅ **Seamless workflow** - Banner → Tooltip → Extension Icon → Auto-filtered popup

---

## Chrome Web Store Production Readiness

### Current Status: 70% Ready

**What Works:**
- ✅ Core functionality (scraping, storage, merchant detection)
- ✅ Manifest v3 compliance
- ✅ Clean UI/UX
- ✅ Mobile-responsive design
- ✅ No external dependencies

**What's Missing for Publication:**

### CRITICAL (Must-Have Before Publishing)

#### 1. Legal & Privacy Requirements
**Status:** ✅ 100% Complete
**Effort:** Complete
```
Completed:
- [x] Privacy Policy (REQUIRED by Chrome Web Store) ✅
      - What data is collected (offers, settings, sync history - all local)
      - Where data is stored (locally in Chrome storage, never transmitted)
      - No data sent to external servers
      - No tracking or analytics
      - GDPR/CCPA compliance sections
      - Support email: rewardmaximizer@gmail.com

- [x] Terms of Service ✅
      - Disclaimer: "Not affiliated with Amex, Chase, Citi, etc."
      - "Use at your own risk" language
      - Compliance with bank portal terms of service
      - User responsibility for automated clicking
      - Limitation of liability ($10 cap)
      - No warranties disclaimer

- [x] Disclaimer in extension ✅
      - Added to settings page with warning banner
      - Clear statement about not being affiliated with banks

- [x] Public website deployed ✅
      - Privacy Policy URL: https://gorgeous-torte-f0c7c0.netlify.app/privacy.html
      - Terms of Service URL: https://gorgeous-torte-f0c7c0.netlify.app/terms.html
      - Hosted on Netlify (free tier, SSL/HTTPS enabled)

Files:
- ✅ /legal/PRIVACY.md (comprehensive markdown version)
- ✅ /legal/privacy.html (styled HTML version)
- ✅ /legal/TERMS.md (comprehensive markdown version)
- ✅ /legal/terms.html (styled HTML version)
- ✅ /website/ folder with public-facing versions
- ✅ DEPLOYMENT_URLS.md (all URLs for reference)
- ✅ Updated settings.html with legal section and links
```

#### 2. Chrome Web Store Listing
**Status:** ❌ Not started
**Effort:** 2-3 days
```
Required:
- [ ] Detailed Description (200-500 words)
      Current: "Sync and stack credit card offers for maximum rewards..."
      Need: Feature highlights, how it works, supported cards

- [ ] Screenshots (minimum 1, recommend 5)
      - Popup showing offers by merchant
      - Merchant banner on website
      - Offers by card view
      - Export functionality
      - Settings page
      Size: 1280x800 or 640x400

- [ ] Promotional Images
      - Small tile: 440x280 (REQUIRED)
      - Large tile: 920x680 (optional)
      - Marquee: 1400x560 (optional)

- [ ] Icons (all sizes)
      - 16x16 (HAVE: need to verify)
      - 48x48 (HAVE: need to verify)
      - 128x128 (HAVE: need to verify)

- [ ] Support Information
      - Support email (REQUIRED)
      - Website or documentation URL (optional)

- [ ] Category Selection
      Recommend: "Shopping" or "Productivity"
```

#### 3. User Consent & Onboarding
**Status:** ❌ Not started
**Effort:** 2-3 days
```
Required:
- [ ] First-run dialog
      - Welcome message
      - Explain what extension does
      - Request permission confirmation
      - Link to privacy policy
      - "Get Started" button

- [ ] Permissions explanation
      Why we need <all_urls>: "To show offer alerts on merchant websites"
      Why we need storage: "To save your offers locally"
      Why we need tabs: "To detect which website you're on"

- [ ] Quick tutorial (optional but recommended)
      - Step 1: Go to your credit card portal
      - Step 2: Click sync button
      - Step 3: Visit merchant websites to see alerts

Implementation:
- Create /onboarding/welcome.html
- Update background/service-worker.js to detect first install
- Show welcome page on first run
```

#### 4. Code Cleanup
**Status:** ⚠️ Infrastructure complete, migration in progress
**Effort:** 3-4 days remaining
```
Completed:
- [x] Debug system infrastructure ✅
      - Created lib/debug.js with centralized debug utility
      - Single DEBUG flag controls all logging (set to true for dev)
      - Integrated into all content scripts, popup, settings, service worker
      - Created CODE_CLEANUP_GUIDE.md with migration instructions

In Progress:
- [ ] Replace all console.log statements with debug.log
      Files to update: 18 JavaScript files
      - 8 scraper files (amex, chase, citi, capital-one, discover, bofa, usbank, rakuten)
      - content-main.js, merchant-banner.js, utils.js
      - popup.js, settings.js
      - background/service-worker.js (partially done)
      - lib files (categories.js, valuation.js, export.js)
      Estimate: ~100+ console.log calls to replace

- [ ] Add proper error handling
      - Wrap all scraper functions in try-catch
      - Graceful degradation when scraping fails
      - Use debug.error() for critical errors (always visible)
      - Use debug.warn() for warnings (always visible)

- [ ] Production readiness
      - Set DEBUG = false in lib/debug.js before Chrome Web Store submission
      - Verify no console.log remains (except in debug.js)
      - Test with DEBUG=false to ensure silent operation

- [ ] Polish (optional)
      - Add version number to popup footer (v2.0.0)
      - Minify code (reduces size, harder to copy)

Next Step: Systematically replace console.log in all files (see CODE_CLEANUP_GUIDE.md)
```

#### 5. Testing
**Status:** ⚠️ Needs comprehensive testing
**Effort:** 3-5 days
```
Required:
- [ ] Fresh profile testing
      Load extension in new Chrome profile (no cached data)
      Test all features from scratch

- [ ] Cross-site testing
      Test merchant banner on 20+ different websites
      Verify no conflicts with other extensions

- [ ] Scraper reliability
      Test each portal (Amex, Chase, Citi, etc.)
      Verify offers are saved correctly
      Check for duplicate handling

- [ ] Edge cases
      - No internet connection
      - Empty offers list
      - Invalid merchant names
      - Portal site changes (scrapers break)

- [ ] Performance
      - Check memory usage (<50 MB ideal)
      - Ensure banner loads within 2 seconds
      - No page slowdowns

Test Checklist:
- [ ] Install on fresh Chrome profile
- [ ] Sync offers from 3+ portals
- [ ] Visit 10+ merchant websites
- [ ] Test all view modes (merchant/card/category)
- [ ] Test search and filters
- [ ] Test export (CSV/JSON)
- [ ] Uninstall and verify data cleanup
```

---

### RECOMMENDED (Should-Have for Quality Launch)

#### 6. Settings Page Completion
**Status:** ✅ Complete
**Effort:** Complete
```
Completed features:
- [x] Custom point values UI ✅
      - Input fields for each card program
      - Save/reset buttons
      - Real-time value updates

- [x] Notification preferences ✅
      - Toggle for auto opt-in
      - Toggle for stacking alerts

- [x] Default view selection ✅
      - Dropdown: By Merchant / By Card / By Category

- [x] Data management ✅
      - Clear all offers button
      - Import/export backup (JSON)
      - Reset point valuations to defaults

- [x] Settings button fixed ✅
      - Added options_ui to manifest.json
      - Settings now accessible from popup gear icon
      - Can also right-click extension icon → Options

- [x] Legal section added ✅
      - Links to Privacy Policy and Terms of Service
      - Disclaimer about not being affiliated with banks

Files:
- ✅ settings/settings.html (complete with all UI)
- ✅ settings/settings.js (fully implemented)
- ✅ settings/settings.css (styled)
- ✅ manifest.json (options_ui configured)
```

#### 7. Analytics (Optional, with User Consent)
**Status:** ❌ Not implemented
**Effort:** 1-2 days
```
Recommended:
- [ ] Add Google Analytics or Plausible
      - Track extension installs
      - Track feature usage (which portals synced most)
      - Track errors (scraper failures)

- [ ] User consent
      - Ask permission on first run
      - Toggle in settings
      - No tracking if user opts out

- [ ] Privacy-first approach
      - No personal data collection
      - No tracking across websites
      - Only aggregate usage stats

Implementation:
- Add analytics.js wrapper
- Update privacy policy
- Add consent dialog to onboarding
```

#### 8. Error Tracking
**Status:** ❌ Not implemented
**Effort:** 1 day
```
Recommended:
- [ ] Sentry or Rollbar integration
      - Catch scraper errors
      - Track unhandled exceptions
      - Get notified when things break

- [ ] Custom error reporting
      - "Report a bug" button in popup
      - Pre-fill with error details
      - Send to support email

Benefits:
- Know when scrapers break (portals change HTML)
- Fix issues before users report them
- Better debugging with stack traces
```

#### 9. Rate Limiting & Safety
**Status:** ❌ Not implemented
**Effort:** 1-2 days
```
Recommended:
- [ ] Rate limiting on scrapers
      - Max 1 sync per portal per hour
      - Prevent spam clicking sync buttons
      - Add cooldown timers

- [ ] Randomized delays
      - Already implemented in Chase scraper
      - Add to other scrapers (800-1300ms)
      - Makes automation less detectable

- [ ] Graceful degradation
      - If scraper fails, show cached offers
      - Don't break entire extension

- [ ] User warnings
      - "Syncing too frequently may trigger security alerts"
      - Suggest manual opt-in if automation fails
```

---

### NICE-TO-HAVE (Future Enhancements)

#### 10. Advanced Features
```
- [ ] Offer expiration tracking
      - Parse expiry dates from portals
      - Show "Expires in 3 days" warnings
      - Notification when offers expire soon

- [ ] Usage tracking
      - Mark offers as "used"
      - Track which offers provided value
      - Personal ROI calculator

- [ ] Smart recommendations
      - "Based on your spending, consider this offer"
      - Category-based suggestions
      - Stacking optimizer

- [ ] Browser notifications
      - Alert when new offers match saved merchants
      - Remind to sync portals weekly
```

#### 11. Multi-Browser Support
```
- [ ] Firefox version
      - Convert chrome.* to browser.* API
      - Test on Firefox
      - Publish to Firefox Add-ons
      Effort: 1 week

- [ ] Edge version
      - Should work with minimal changes (Chromium-based)
      - Publish to Edge Add-ons
      Effort: 2-3 days
```

---

### Publication Timeline

**Minimum Viable Publish (Critical Only):**
```
Week 1: Legal & Documentation
- Days 1-2: Write privacy policy and terms
- Days 3-4: Create store listing (description, screenshots)
- Day 5: Add first-run consent dialog

Week 2: Code & Testing
- Days 1-2: Code cleanup (remove logs, add error handling)
- Days 3-5: Comprehensive testing on fresh profile

Week 3: Submission & Review
- Day 1: Create promotional images
- Day 2: Submit to Chrome Web Store
- Days 3-7: Respond to review feedback (if any)

Total: 2-3 weeks to publication
```

**Recommended Quality Launch (Critical + Recommended):**
```
Weeks 1-2: Same as above

Week 3: Features & Polish
- Days 1-2: Complete settings page
- Days 3-4: Add analytics (with consent)
- Day 5: Add error tracking

Week 4: Beta Testing
- Days 1-2: Recruit 10-20 beta testers
- Days 3-5: Fix bugs from beta feedback

Week 5: Final Polish & Launch
- Days 1-2: Final testing
- Days 3-4: Create video demo (optional)
- Day 5: Submit to Chrome Web Store

Total: 4-5 weeks to publication
```

---

### Chrome Web Store Review Process

**What to Expect:**
1. **Initial Review:** 1-3 days (sometimes up to 1 week)
2. **Common Rejection Reasons:**
   - Missing or inadequate privacy policy
   - Overly broad permissions without justification
   - Misleading description or screenshots
   - Trademark issues (using bank logos without permission)
   - Violation of automation policies

3. **How to Pass Review:**
   - ✅ Clear privacy policy explaining all permissions
   - ✅ Detailed description of what extension does
   - ✅ Disclaimer about not being affiliated with banks
   - ✅ Don't use bank logos in promotional images
   - ✅ Honest screenshots (no fake data)

4. **After Approval:**
   - Extension goes live immediately
   - Can push updates anytime (re-review for major changes)
   - Monitor user reviews and ratings
   - Respond to user feedback quickly

---

### Post-Launch Priorities

**Week 1-2 After Launch:**
```
- [ ] Monitor error rates (if tracking enabled)
- [ ] Respond to user reviews
- [ ] Fix critical bugs immediately
- [ ] Track which portals users sync most
- [ ] Gather feature requests
```

**Month 1-3:**
```
- [ ] Iterate based on user feedback
- [ ] Add most-requested features
- [ ] Improve scraper reliability
- [ ] Optimize performance
- [ ] Build user community (Reddit, Discord?)
```

**Month 3-6:**
```
- [ ] Evaluate backend need (if 500+ active users)
- [ ] Consider premium features
- [ ] Expand to Firefox/Edge
- [ ] Partner with content creators (YouTubers, bloggers)
```

---

### Known Risks & Mitigation

**Risk 1: Bank portals change HTML structure**
```
Impact: Scrapers break, offers stop syncing
Frequency: Every 1-3 months per portal
Mitigation:
- Error tracking to detect failures fast
- Fallback to manual opt-in instructions
- Community reporting (GitHub issues)
- Regular monitoring of portal changes
```

**Risk 2: Banks update Terms of Service**
```
Impact: Automated scraping may violate new ToS
Frequency: Rare but possible
Mitigation:
- Periodic ToS review (quarterly)
- Add manual mode as fallback
- Clear user disclaimers
- Monitor for cease-and-desist letters
```

**Risk 3: Chrome Web Store policy changes**
```
Impact: Extension could be removed
Frequency: Rare for established extensions
Mitigation:
- Follow all current policies strictly
- Stay updated on policy announcements
- Have alternative distribution (GitHub, website)
```

**Risk 4: Low adoption rate**
```
Impact: Time invested doesn't yield users
Likelihood: Medium (niche product)
Mitigation:
- Start with small launch (friends, Reddit)
- Gather feedback before big marketing push
- Validate demand before building backend
- Keep costs low (no server infrastructure yet)
```

---

### Success Metrics

**Month 1 Goals:**
- [ ] 100+ installs
- [ ] 4.0+ star rating
- [ ] <5% uninstall rate
- [ ] 10+ positive reviews

**Month 3 Goals:**
- [ ] 500+ active users
- [ ] 4.5+ star rating
- [ ] Featured in Chrome Web Store search results
- [ ] Mentioned in credit card communities (Reddit, blogs)

**Month 6 Goals:**
- [ ] 2,000+ active users
- [ ] Evaluate backend/cross-platform need
- [ ] Consider monetization (premium features, donations)

---

### Backend/Scaling Considerations (Future)

**When to Build Backend:**
- ✅ 500+ active users requesting cross-device sync
- ✅ Users asking for mobile app
- ✅ Offer sharing/community features requested

**Recommended Approach:**
1. **Phase 1:** Supabase + PWA (6 weeks, $25/month)
   - Fastest to market
   - Test demand without big investment

2. **Phase 2:** React Native app (10-12 weeks)
   - Build if PWA proves demand
   - iOS + Android from one codebase

3. **Phase 3:** Scale infrastructure (if 10K+ users)
   - Migrate to Node.js + PostgreSQL
   - More cost-effective at scale

**Estimated Costs:**
- Development time: 200-400 hours
- Monthly hosting: $25-100 (Supabase/Firebase)
- Annual maintenance: 50-100 hours

**Monetization Options (if backend added):**
- Premium tier: $3-5/month (unlimited offers, mobile app, notifications)
- Free tier: Chrome extension only, basic features
- Target: 5-10% conversion to premium

---

---

## 🎯 Next Session - Start Here

**Priority 1: Code Cleanup (3-4 days)**
1. Replace all console.log calls with debug.log
   - See CODE_CLEANUP_GUIDE.md for instructions
   - Start with scrapers (highest priority): amex.js, chase.js, citi.js, etc.
   - Then UI files: popup.js, settings.js, merchant-banner.js
   - Then libraries: categories.js, valuation.js, export.js
   - Command to find remaining: `grep -r "console.log" --include="*.js" . | grep -v debug.js`

2. Add try-catch error handling to all scrapers
   - Wrap scrape() functions in try-catch
   - Use debug.error() for critical errors
   - Graceful fallback when scraping fails

3. Test with DEBUG=false to ensure production readiness

**Priority 2: Logo/Icons (1 day)**
- Save logo as 16x16, 48x48, 128x128 PNG files
- Add to /icons/ folder
- Update manifest.json icons section

**Priority 3: Screenshots (1-2 days)**
- Take 5 screenshots for Chrome Web Store
- Create 440x280 promotional tile (required)
- Optional: Create larger promotional images

**Files Ready to Push:**
- 2 commits staged and committed
- Run `git push` to sync to remote

---

## Recent Updates

### 2026-01-26 - Major Progress: Legal, Website, Debug System

**Session Summary:** Completed all legal requirements, deployed public website, and implemented production-ready debug system.

#### Legal Documents Completed ✅ (100%)
- ✅ Created comprehensive Privacy Policy (PRIVACY.md + privacy.html)
  - GDPR/CCPA compliance sections
  - Support email: rewardmaximizer@gmail.com
  - Covers all Chrome Web Store requirements
  - No data collection, 100% local storage
- ✅ Created comprehensive Terms of Service (TERMS.md + terms.html)
  - Not affiliated disclaimer with all financial institutions
  - Automated actions acknowledgment
  - Use at your own risk language
  - Limitation of liability ($10 cap)
  - No warranties disclaimer
  - Third-party ToS compliance requirements

#### Settings & UI Fixes ✅ (100%)
- ✅ Fixed settings button - added `options_ui` to manifest.json
  - Now accessible via gear icon in popup
  - Also accessible via right-click extension → Options
- ✅ Added legal section to settings page
  - Links to Privacy Policy and Terms of Service
  - Disclaimer banner about not being affiliated with banks
  - Styled to match extension design
- ✅ Settings page fully functional
  - Card selection, point valuations, preferences
  - Data management (import/export/clear)
  - All features tested and working

#### Website Deployed ✅ (100%)
- ✅ Created `/website` folder with standalone HTML files
  - index.html - Landing page with features, supported cards, how it works
  - privacy.html - Standalone privacy policy (works independently)
  - terms.html - Standalone terms of service
  - README.md - Deployment instructions
  - All pages mobile-responsive and cross-linked
- ✅ **DEPLOYED TO NETLIFY:** https://gorgeous-torte-f0c7c0.netlify.app/
  - Privacy Policy: https://gorgeous-torte-f0c7c0.netlify.app/privacy.html ← For Chrome Web Store
  - Terms of Service: https://gorgeous-torte-f0c7c0.netlify.app/terms.html
  - All pages verified working with WebFetch ✅
  - SSL/HTTPS enabled, global CDN
- ✅ Created DEPLOYMENT_URLS.md for easy reference

#### Debug System Infrastructure ✅ (100%)
- ✅ Created lib/debug.js - Centralized debug utility
  - Single `DEBUG = true/false` toggle controls all logging
  - `debug.log()` / `debug.info()` - Silent in production (DEBUG=false)
  - `debug.warn()` / `debug.error()` - Always visible for critical issues
  - Advanced features: grouping, timing, performance monitoring, tables
- ✅ Integrated debug.js into entire extension
  - Added to all content scripts in manifest.json (8 scrapers + merchant banner)
  - Added to popup.html and settings.html
  - Added importScripts to background service worker
  - Updated lib/storage.js to use debug utility
- ✅ Created CODE_CLEANUP_GUIDE.md
  - Migration guide for replacing console.log
  - List of all files needing updates (18 files total)
  - Production deployment instructions
  - Advanced debug features documentation

#### Git Commits
- ✅ Commit 1: Legal documents, website, settings fixes (12 files, 2,561 insertions)
- ✅ Commit 2: Debug system infrastructure (7 files, 322 insertions)
- 📦 Both commits ready to push

---

**Production Status:** 90% ready for Chrome Web Store (up from 70%)

**Completed (90%):**
- Legal & Website: 100% ✅
- Settings: 100% ✅
- Debug Infrastructure: 100% ✅
- Extension Features: 100% ✅

**Remaining (10%):**
1. **Code Cleanup** (3-4 days) - 0%
   - Replace ~100+ console.log calls with debug.log (18 files)
   - Add proper try-catch error handling to all scrapers
   - Remove any remaining debug flags
   - Set DEBUG=false before submission
   - Add version number to popup footer

2. **Screenshots & Store Listing** (2-3 days) - 30%
   - ✅ Description text ready
   - ❌ Take 5 screenshots (1280x800 or 640x400)
     * Popup showing offers by merchant
     * Merchant banner on website
     * Offers by card view
     * Settings page with legal section
     * Export functionality demo
   - ❌ Create promotional images
     * Small tile: 440x280 (REQUIRED)
     * Large tile: 920x680 (optional)
     * Marquee: 1400x560 (optional)
   - ❌ Logo/icons in multiple sizes
     * 16x16, 48x48, 128x128 (have design, need to save files)

3. **Comprehensive Testing** (3-5 days) - 0%
   - Fresh Chrome profile testing
   - Test all 8 portal scrapers
   - Cross-site merchant banner testing (20+ websites)
   - Edge cases (no internet, empty offers, invalid merchants, portal changes)
   - Performance testing (memory <50MB, banner loads <2s)
   - Test all view modes, search, filters, export

4. **First-Run Onboarding** - COMPLETE
   - /onboarding/welcome.html and onboarding.js created
   - service-worker.js onInstalled listener opens welcome page on first install

**Timeline to Launch:** 2-3 weeks (Option C - Full Polish)

**Chrome Web Store Ready:**
- ✅ Privacy Policy URL: https://gorgeous-torte-f0c7c0.netlify.app/privacy.html
- ✅ Terms of Service URL: https://gorgeous-torte-f0c7c0.netlify.app/terms.html
- ✅ Support Email: rewardmaximizer@gmail.com
- ✅ Website: https://gorgeous-torte-f0c7c0.netlify.app/

---

## Recent Updates - 2026-01-28

### ✅ Critical Bug Fixes

**1. Library Exports Fixed**
- **Issue:** Storage, Categories, Valuation, and ExportUtils were not available in browser context
- **Fix:** Added `window.Storage = Storage` exports to all lib files
- **Files:** `lib/storage.js`, `lib/categories.js`, `lib/valuation.js`, `lib/export.js`
- **Impact:** Popup and settings now load correctly without TypeErrors

**2. Rakuten Scraper - Modal Support**
- **Issue:** Rakuten page uses modals for offer lists, scraper wasn't opening them
- **Fix:** Implemented full modal scraping workflow
  - Detects and clicks all "See All" buttons
  - Scrapes from each modal (favorites, extra cashback, etc.)
  - Closes modals and returns to original page state
- **File:** `content/scrapers/rakuten.js`
- **Method:** `collectMerchantRatesFromModal()` - parses merchant links from `.chakra-modal__body`
- **Result:** Successfully scrapes 48+ offers from multiple sections

**3. Popup Initialization Bug**
- **Issue:** Offers loaded but didn't display until clicking a filter
- **Root Cause:** `filteredOffers` array never populated on initial load
- **Fix:** Added `applyFilters()` call before first render
- **File:** `popup/popup.js:33-34`
- **Impact:** All offers now display immediately on popup open

### 🎨 UI/UX Improvements

**1. Single Scrollbar Layout**
- Redesigned popup to use flexbox with fixed height (550px)
- Header, search, status, and footer are fixed (no scroll)
- Only offers container scrolls (single scrollbar experience)
- Added subtle scroll fade indicators at top/bottom
- **Files:** `popup/popup.css` (lines 9-17, 210-238)

**2. Visual Polish**
- Increased width: 380px → 400px (more content visible)
- Added hover effects on merchant cards (lift + shadow)
- Cleaner, thinner scrollbar (5px, rounded, transparent track)
- Better spacing and padding throughout
- Improved empty state design
- Focus state on search box

**3. One-Click Navigation + Auto-Sync** ⭐
- **Old Flow:** Click "Rakuten" → Error if not on rakuten.com → Manually navigate → Click again
- **New Flow:** Click "Rakuten" → Auto-navigates to offers page → Auto-syncs when loaded
- **Implementation:**
  - Popup checks if on correct portal
  - If not, navigates user automatically
  - Sets `rmx_pending_sync` flag in chrome.storage
  - Content script detects flag on page load and auto-syncs
- **Files:**
  - `popup/popup.js:195-240` - Navigation logic
  - `content/content-main.js:208-237` - Auto-sync detection
- **Portal URLs:** All 8 portals configured with direct offers URLs

### 🔧 Technical Improvements

**1. Debug Utility Conflicts**
- Fixed duplicate `debug` variable declarations
- Renamed to `debugUtil` in storage.js to avoid conflicts
- **File:** `lib/storage.js:5-9`

**2. Enhanced Logging**
- Added comprehensive console logging throughout popup and storage
- Easy to trace data flow: scraper → popup → storage
- Helpful for debugging user issues

**3. Export Functionality**
- Fixed export menu to show offer counts
- Added logging for export operations
- **File:** `popup/popup.js:491-534`

---

**Last Updated:** 2026-01-28
**Maintained By:** Development Team
**License:** Private/Proprietary
**Production Status:** Pre-launch (92% ready for Chrome Web Store)
**Support Email:** rewardmaximizer@gmail.com
**Website:** https://gorgeous-torte-f0c7c0.netlify.app/
**Privacy Policy:** https://gorgeous-torte-f0c7c0.netlify.app/privacy.html
