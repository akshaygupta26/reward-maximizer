# Reward Maximizer - Roadmap

## Planned Features
- [ ] Backend API integration for multi-device sync
- [ ] Browser notifications when offers match browsing
- [ ] Auto-activate cashback portals (e.g., Rakuten browser button)
- [ ] Historical tracking (track which offers were used)
- [ ] Smart recommendations based on spending patterns
- [ ] Support for more portals (Wells Fargo, Barclays, etc.)

## Technical Debt
- Migrate from Chrome Storage to backend API
- Add TypeScript for better type safety
- Implement proper error tracking (Sentry)
- Add unit tests for scrapers
- Improve merchant name matching with ML/fuzzy search

---

## Recommended Enhancements (Post-Launch)

### Analytics (Optional, with User Consent)
- Add Google Analytics or Plausible (track installs, feature usage, scraper failures)
- User consent required (first-run permission, settings toggle, no tracking if opted out)
- Privacy-first: no personal data, no cross-site tracking, aggregate stats only
- Implementation: analytics.js wrapper, update privacy policy, consent dialog in onboarding

### Error Tracking
- Sentry or Rollbar integration (catch scraper errors, unhandled exceptions)
- Custom "Report a bug" button in popup (pre-fill error details, send to support email)

### Rate Limiting & Safety
- Max 1 sync per portal per hour, cooldown timers
- Randomized delays (800-1300ms) on all scrapers (Chase already has this)
- Graceful degradation: show cached offers on scraper failure
- User warnings about syncing frequency

---

## Nice-to-Have Features

### Advanced Features
- Offer expiration tracking (parse dates, "Expires in 3 days" warnings)
- Usage tracking (mark offers as "used", personal ROI calculator)
- Smart recommendations (category-based suggestions, stacking optimizer)
- Browser notifications (new offers matching saved merchants, weekly sync reminders)

### AI-Powered Features

**Priority 1: Resilient Scraping**
- LLM-based fallback when CSS selectors break
- Try selectors first → on failure, send DOM snippet to LLM API
- Requires API key stored locally; only sends portal DOM fragments, never user data
- Cost: ~$0.01-0.05 per scrape failure

**Priority 2: Smarter Merchant Matching**
- AI-powered merchant name resolution via embeddings or LLM
- Handles "Aldo Shoes" = "ALDO" = "aldoshoes.com" without manual mapping
- Could use pre-computed mapping file or runtime embeddings

**Priority 3: Offer Value Parsing**
- LLM-based normalization of complex offer terms
- Extracts: base value, conditions, caps, minimum spend, eligible categories

**Future AI Features**
- Natural language search ("which card for groceries this week?")
- Spending-based recommendations (bank CSV import or Plaid)
- Weekly offer digest / smart summaries
- Auto-strategy optimizer for planned purchases

### Multi-Browser Support
- Firefox: Convert chrome.* to browser.* API, publish to Firefox Add-ons
- Edge: Minimal changes (Chromium-based), publish to Edge Add-ons

---

## Post-Launch Priorities

**Week 1-2:** Monitor error rates, respond to reviews, fix critical bugs, gather feature requests

**Month 1-3:** Iterate on feedback, improve scraper reliability, optimize performance, build community (Reddit, Discord)

**Month 3-6:** Evaluate backend need (if 500+ users), consider premium features, expand to Firefox/Edge, partner with content creators

---

## Backend/Scaling Considerations

**When to Build Backend:** 500+ users requesting cross-device sync, mobile app demand, or community features

**Recommended Approach:**
1. Supabase + PWA ($25/month) — test demand
2. React Native app — if PWA proves demand
3. Node.js + PostgreSQL — if 10K+ users

**Monetization Options:**
- Premium tier: $3-5/month (unlimited offers, mobile app, notifications)
- Free tier: Chrome extension only, basic features
- Target: 5-10% conversion to premium

---

## Success Metrics

**Month 1:** 100+ installs, 4.0+ stars, <5% uninstall rate, 10+ reviews
**Month 3:** 500+ active users, 4.5+ stars, featured in CWS search
**Month 6:** 2,000+ active users, evaluate backend/monetization
