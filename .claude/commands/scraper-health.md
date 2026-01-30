---
description: Analyze all scraper files for structural correctness, CSS selector fragility, URL consistency, and implementation completeness
allowed-tools: Read, Grep, Glob, Bash(ls:*), Bash(wc:*)
---

# Scraper Health Monitor

Analyze the health of all portal scrapers in the Reward Maximizer Chrome extension. If $ARGUMENTS is provided and non-empty, only analyze the scraper whose filename or source name matches that argument.

## Instructions

### 1. Read All Scraper Files

Read every `.js` file in `content/scrapers/`. The project root is the directory containing `manifest.json`.

### 2. Required Properties Check

For each scraper object, verify these properties/methods exist:

| Property | Type | Required |
|---|---|---|
| `source` | string | YES |
| `offersUrl` | string | YES |
| `needsNavigation()` | function | YES |
| `getOffersUrl()` | function | YES |
| `scrape()` | async function | YES |
| `collectOffers()` | function | YES |
| `extractMerchant()` | function | YES |
| `extractValue()` | function | YES |
| `extractExpiry()` | function | RECOMMENDED |
| `detectCategory()` | function | RECOMMENDED |
| `wait()` | utility | RECOMMENDED |

Mark each as PRESENT, MISSING, or STUB (has TODO/placeholder content).

### 3. CSS Selector Fragility Analysis

Extract every CSS selector string from each scraper (look for `querySelector`, `querySelectorAll`, string literals used as selectors). Classify each as:

- **STABLE**: Uses `[data-testid="..."]`, `[aria-label="..."]`, tag names, or IDs
- **MODERATE**: Uses class names that appear semantic (e.g., `.offer-card`, `.merchant-name`)
- **FRAGILE**: Uses auto-generated or hash-based class names (e.g., `[class*="_listViewRow"]`, classes with underscores + random suffixes), deeply nested combinators (3+ levels)

List the top 3 most fragile selectors per scraper.

### 4. Portal URL Consistency

- Read `manifest.json` and extract all `host_permissions`
- For each scraper's `offersUrl`, verify the domain is covered by host_permissions
- Read `content/content-main.js` and verify it has routing for each scraper in `detectSite()` AND `getScraper()`
- Check `manifest.json` `content_scripts` includes the scraper file for the correct match patterns

### 5. Implementation Completeness

Classify each scraper as:
- **FULL**: Complete `scrape()`, `collectOffers()`, extraction methods with real CSS selectors, and error handling
- **PARTIAL**: Has core methods but missing some extraction logic, error handling, or edge cases
- **STUB**: Has the structure but methods contain TODO comments, placeholder returns, or minimal logic

### 6. Additional Checks

- Count lines of code per scraper
- Check if scraper uses `try-catch` error handling in `scrape()`
- Check if scraper handles lazy loading (scroll-to-load patterns)
- Check if scraper has deduplication logic in `collectOffers()`
- Check for `console.log` vs `debug.log` usage (production readiness)

### 7. Health Score

Assign each scraper a score out of 100:
- Required properties present: 30 points (5 per required property, 6 required)
- CSS selector stability: 20 points (deduct 5 per FRAGILE selector, max deduction 20)
- URL/routing consistency: 15 points (5 for host_permissions, 5 for content-main routing, 5 for manifest content_scripts)
- Implementation completeness: 20 points (FULL=20, PARTIAL=10, STUB=0)
- Error handling: 10 points
- Production readiness (no console.log): 5 points

## Output Format

```
╔══════════════════════════════════════════════════════╗
║           SCRAPER HEALTH REPORT                      ║
║           Reward Maximizer                           ║
╚══════════════════════════════════════════════════════╝

Overall Health: XX/100 (average across all scrapers)

┌─────────────────────────────────────────────────────┐
│ SCRAPER: [filename]                                  │
│ Source: [name] | Lines: XXX | Score: XX/100          │
├─────────────────────────────────────────────────────┤
│ Properties: (list with checkmarks)                   │
│ Implementation: FULL / PARTIAL / STUB                │
│ Error Handling: Yes/No                               │
│ Lazy Loading: Yes/No                                 │
│ Deduplication: Yes/No                                │
│ Production Ready: Yes / No (X console.log remaining) │
│                                                      │
│ Fragile Selectors:                                   │
│   (list top 3)                                       │
│                                                      │
│ URL Routing:                                         │
│   (host_permissions, content-main, manifest checks)  │
└─────────────────────────────────────────────────────┘

(repeat for each scraper)

RECOMMENDATIONS:
1. [Highest priority]
2. [Second priority]
...
```
