# Code Cleanup Guide - Debug System

## ✅ Setup Complete

The debug system has been set up and integrated into all scripts:
- ✅ Created `lib/debug.js` with centralized debug utilities
- ✅ Added to all content scripts in manifest.json
- ✅ Added to popup.html and settings.html
- ✅ Added to background service worker
- ✅ Updated storage.js to use debug utility

## ⚠️ Note on Current Console Logs (2026-01-28)

During recent debugging sessions, additional `console.log()` statements were added to:
- `popup/popup.js` - Extensive logging for sync flow debugging
- `lib/storage.js` - Detailed logging for save operations
- `content/content-main.js` - Auto-sync and navigation logging

These should be replaced with `debug.log()` before production, or removed if temporary.

## 🎯 How It Works

### Development Mode (Current)
In `lib/debug.js`, line 11:
```javascript
const DEBUG = true;  // ← Currently enabled
```

With `DEBUG = true`:
- All `debug.log()` calls show in console
- All `debug.info()` calls show in console
- `debug.warn()` and `debug.error()` always show (even in production)

### Production Mode (For Chrome Web Store)
Change line 11 in `lib/debug.js`:
```javascript
const DEBUG = false;  // ← Set to false before publishing
```

With `DEBUG = false`:
- All `debug.log()` calls are silenced
- All `debug.info()` calls are silenced
- `debug.warn()` and `debug.error()` still show (for critical issues)

## 🔄 Migration Guide

### Replace console.log with debug.log

**Before:**
```javascript
console.log('[RMX Scraper] Found 10 offers');
console.log('Syncing offers...', offers);
```

**After:**
```javascript
debug.log('[RMX Scraper] Found 10 offers');
debug.log('Syncing offers...', offers);
```

### Replace console.log with prefix using debug.info

**Before:**
```javascript
console.log('[RMX Scraper]', 'Found offers:', count);
```

**After:**
```javascript
debug.info('[RMX Scraper]', 'Found offers:', count);
```

### Keep critical errors visible

**Before:**
```javascript
console.error('[RMX Error]', error);
console.warn('[RMX Warning]', warning);
```

**After:**
```javascript
debug.error('[RMX Error]', error);  // Always visible
debug.warn('[RMX Warning]', warning);  // Always visible
```

## 📋 Files to Update

### High Priority (User-Facing Scripts)
1. ✅ `lib/storage.js` - Already updated
2. ✅ `background/service-worker.js` - Partially updated (importScripts added)
3. ⏳ `content/scrapers/amex.js` - Replace all console.log
4. ⏳ `content/scrapers/chase.js` - Replace all console.log
5. ⏳ `content/scrapers/citi.js` - Replace all console.log
6. ⏳ `content/scrapers/capital-one.js` - Replace all console.log
7. ⏳ `content/scrapers/discover.js` - Replace all console.log
8. ⏳ `content/scrapers/bofa.js` - Replace all console.log
9. ⏳ `content/scrapers/usbank.js` - Replace all console.log
10. ⏳ `content/scrapers/rakuten.js` - Replace all console.log
11. ⏳ `content/merchant-banner.js` - Replace all console.log
12. ⏳ `content/content-main.js` - Replace all console.log
13. ⏳ `popup/popup.js` - Replace all console.log
14. ⏳ `settings/settings.js` - Replace all console.log

### Medium Priority (Library Files)
15. ⏳ `lib/categories.js` - Check for console.log
16. ⏳ `lib/valuation.js` - Check for console.log
17. ⏳ `lib/export.js` - Check for console.log
18. ⏳ `content/utils.js` - Check for console.log

## 🛠️ Quick Find & Replace

### Find All console.log Instances
Use this command to find all console.log calls:
```bash
grep -r "console.log" --include="*.js" .
```

### Count Remaining console.log Instances
```bash
grep -r "console.log" --include="*.js" . | wc -l
```

## 🎨 Advanced Debug Features

### Grouping Logs
```javascript
debug.group('Scraping Amex Offers', () => {
  debug.log('Found', offers.length, 'offers');
  debug.log('Processing each offer...');
});
```

### Performance Timing
```javascript
debug.time('Scrape Duration');
// ... scraping code ...
debug.timeEnd('Scrape Duration');  // Shows elapsed time
```

### Table Display (for arrays of objects)
```javascript
debug.table(offers);  // Shows offers in a nice table format
```

### Conditional Debugging
```javascript
if (debug.isEnabled()) {
  // Only run expensive debug code in development
  const analysis = analyzeOffers(offers);
  debug.log('Analysis:', analysis);
}
```

## ✅ Before Publishing to Chrome Web Store

1. **Set DEBUG to false:**
   - Open `lib/debug.js`
   - Change line 11: `const DEBUG = false;`

2. **Verify no console.log remains:**
   ```bash
   grep -r "console.log" --include="*.js" . | grep -v debug.js | grep -v node_modules
   ```

3. **Test the extension:**
   - Load in Chrome
   - Check console - should see NO debug.log messages
   - Should still see warnings and errors (if any)

4. **Package for submission:**
   - Create ZIP of extension folder
   - Submit to Chrome Web Store

5. **After submission, revert for development:**
   - Change back to `const DEBUG = true;`
   - Continue developing with debug logs enabled

## 🚀 Next Steps

1. Systematically update all scrapers (highest priority)
2. Update UI scripts (popup, settings)
3. Update utility libraries
4. Test with DEBUG=true (should work as normal)
5. Test with DEBUG=false (should be silent except errors)
6. Add proper error handling with try-catch blocks
7. Package for Chrome Web Store with DEBUG=false

---

**Last Updated:** January 26, 2026
**Status:** Debug infrastructure complete, file migration in progress
