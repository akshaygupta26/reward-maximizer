# Reward Maximizer - Manual Testing Checklist

Use this checklist before submitting to Chrome Web Store. Test on a **fresh Chrome profile** with no cached data.

---

## Installation & Onboarding

- [ ] Load unpacked extension in `chrome://extensions/` with no errors
- [ ] Welcome/onboarding page opens automatically on first install
- [ ] Onboarding page displays correctly (features, card selection)
- [ ] "Get Started" button saves selections and closes onboarding
- [ ] Extension icon appears in toolbar with correct icon
- [ ] Right-click extension icon → Options opens settings page
- [ ] Extension loads with empty state (no offers, no errors in console)

## Scraper Testing

Test each portal by navigating to its offers page and clicking "Sync" in the popup.

### American Express
- [ ] Navigate to Amex offers page
- [ ] Offers are scraped and saved
- [ ] Merchant names are extracted correctly
- [ ] Offer values (%, $, multiplier) are parsed correctly

### Chase
- [ ] Navigate to Chase offers page
- [ ] Offers are scraped and saved
- [ ] Lazy-loaded offers are captured (scroll handling works)

### Citi
- [ ] Navigate to Citi offers page
- [ ] Offers are scraped and saved

### Capital One
- [ ] Navigate to Capital One offers page
- [ ] Offers are scraped and saved

### Discover
- [ ] Navigate to Discover offers page
- [ ] Offers are scraped and saved

### Bank of America
- [ ] Navigate to BofA offers page
- [ ] Offers are scraped and saved

### US Bank
- [ ] Navigate to US Bank offers page
- [ ] Offers are scraped and saved

### Rakuten
- [ ] Navigate to Rakuten page
- [ ] Modal-based scraping works (clicks "See All" buttons)
- [ ] Offers from multiple sections are captured

### Cross-Scraper
- [ ] Sync 3+ portals — offers accumulate, no duplicates within same source
- [ ] Same merchant from different sources creates separate entries
- [ ] Re-syncing same portal updates existing offers (no duplicates)

## Popup UI

### Views
- [ ] "By Merchant" view groups offers correctly
- [ ] "By Card" view groups by card issuer
- [ ] "By Category" view groups by category (dining, travel, etc.)
- [ ] Switching views preserves search/filter state

### Search & Filters
- [ ] Search box filters offers by merchant name
- [ ] Category filter pills work correctly
- [ ] Clear search restores all offers
- [ ] Offer count updates when filtering

### Auto-Detection
- [ ] Open popup while on merchant website (e.g., nike.com)
- [ ] Search box auto-populates with merchant name
- [ ] Matching offers are shown automatically

### Sync Buttons
- [ ] Each portal sync button navigates to correct URL
- [ ] Auto-sync triggers when landing on portal offers page
- [ ] Badge shows "✓" on portal sites

### Display
- [ ] "BEST" badge appears on highest-value offer
- [ ] "+STACK" badge appears when stacking is possible
- [ ] Offer values display correctly (%, $, multiplier)
- [ ] Expiry dates show when available
- [ ] Empty state shows helpful message

## Export
- [ ] CSV export downloads file with correct data
- [ ] JSON export downloads file with correct data
- [ ] Export includes all current offers
- [ ] Exported file opens correctly in spreadsheet/editor

## Merchant Banner

Test by visiting merchant websites after syncing offers.

- [ ] Banner appears within 2 seconds on matching merchant site
- [ ] Banner shows correct card recommendation
- [ ] Banner shows stacking partner when available
- [ ] "Details" button shows tooltip pointing to extension icon
- [ ] "×" button dismisses banner
- [ ] Banner does NOT show on portal sites (amex.com, chase.com, etc.)
- [ ] Banner re-appears on SPA navigation (URL change without page reload)
- [ ] Banner does not conflict with page layout
- [ ] Banner is responsive on narrow windows

### Cross-Site Testing
Test banner on at least 10 different merchant websites:
- [ ] bestbuy.com
- [ ] nike.com
- [ ] target.com
- [ ] amazon.com
- [ ] starbucks.com
- [ ] homedepot.com
- [ ] macys.com
- [ ] nordstrom.com
- [ ] sephora.com
- [ ] costco.com

## Settings Page

- [ ] Card selection checkboxes work
- [ ] Custom point values can be edited and saved
- [ ] Reset point values to defaults works
- [ ] Notification preferences toggle correctly
- [ ] Default view selection persists
- [ ] Clear all offers works (with confirmation)
- [ ] Import backup (JSON) restores data
- [ ] Export backup (JSON) downloads file
- [ ] Privacy Policy link opens correct URL
- [ ] Terms of Service link opens correct URL
- [ ] Disclaimer banner is visible

## Edge Cases

- [ ] Extension works with no internet connection (cached offers display)
- [ ] Empty offers list shows appropriate empty state
- [ ] Very long merchant names don't break layout
- [ ] Offers with missing values show "See details" or fallback
- [ ] Rapidly clicking sync doesn't create duplicates
- [ ] Uninstall extension → reinstall → onboarding shows again
- [ ] Extension works in incognito mode (if enabled)
- [ ] No errors in `chrome://extensions/` error log

## Performance

- [ ] Extension memory usage < 50 MB (check in Chrome Task Manager)
- [ ] Popup opens within 1 second
- [ ] Banner loads within 2 seconds on merchant sites
- [ ] No noticeable page slowdown with extension enabled
- [ ] Scrolling in popup is smooth with 100+ offers

## Production Readiness

- [ ] `DEBUG = false` in `lib/debug.js`
- [ ] No `console.log` output in production mode (check on 3 different sites)
- [ ] `debug.error()` and `debug.warn()` still visible for critical issues
- [ ] No `alert()` calls in production code paths
- [ ] All icons load correctly (16, 48, 128)
- [ ] manifest.json has correct version number
- [ ] Description is under 132 characters

---

**Last tested:** ____-__-__
**Tested by:** _______________
**Chrome version:** _______________
**OS:** _______________
**Result:** ☐ PASS / ☐ FAIL (notes: _______________)
