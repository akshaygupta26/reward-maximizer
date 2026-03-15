// Chase Offers Scraper
// 3-phase activation: API Discovery → Replay → Click-and-Navigate fallback
// Based on proven approach from https://github.com/s-money-git/Chase-Add-Offers

const ChaseScraper = {
  source: 'chase',
  offersUrl: 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
  originalUrl: null,
  isRunning: false,

  // API interception state
  apiTemplate: null,

  // postMessage channel for MAIN world interceptor
  API_CHANNEL: 'rmx-chase-api',

  log(...args) {
    debug.log('[RMX-Chase]', ...args);
  },

  // Check if we need to navigate to offers page
  needsNavigation() {
    const url = window.location.href.toLowerCase();
    const isOnOffers = url.includes('offers') ||
                       url.includes('merchantoffers') ||
                       url.includes('offer-hub') ||
                       url.includes('deal');
    this.log('needsNavigation:', { url, isOnOffers });
    return !isOnOffers;
  },

  getOffersUrl() {
    return this.offersUrl;
  },

  // ============================================
  // MAIN SCRAPE METHOD — 3-phase approach
  // ============================================
  async scrape() {
    try {
      this.log('Starting Chase scrape (API Discovery mode)...');
      this.log('Current URL:', window.location.href);
      this.originalUrl = window.location.href;
      this.isRunning = true;
      this.apiTemplate = null;

      // Phase 0: Load all tiles and collect offer data
      // Wait for initial render (tiles need to exist before scrolling)
      await this.waitForOffers(5000);
      await this.scrollToLoad();
      const offers = this.collectOffers();
      this.log('Collected', offers.length, 'offers to display');

      // Clean for storage
      const cleaned = offers.map(offer => {
        const cleanedValue = this.cleanValue(offer.value);
        return {
          merchant: offer.merchant,
          value: cleanedValue,
          expiry: offer.expiry || 'Check portal',
          merchantCategory: this.detectCategory(offer.merchant),
          valueType: this.parseValueType(cleanedValue),
          timestamp: Date.now()
        };
      });

      // Check if MAIN world interceptor is available
      const interceptorReady = await this.checkInterceptorReady();
      let added = 0;

      if (interceptorReady && this.isRunning) {
        this.log('MAIN world interceptor is ready');

        // Phase 1: Discover activation API
        this.reportProgress({ phase: 'discovering', current: 0, total: offers.length });
        const discovered = await this.discoverActivationAPI();

        if (discovered && this.apiTemplate && this.isRunning) {
          this.log('API discovered! Template:', this.apiTemplate.url);

          if (this.apiTemplate.isClickTracking) {
            // Chase uses GET click-tracking (reco.chase.com) — each offer has a unique URL.
            // The discovery click triggered a customer-offers API call. Wait for the
            // BaseInterceptor to parse the response and populate the cache.
            this.log('Waiting for interceptor cache to populate from discovery API call...');
            const interceptorOffers = await this._waitForInterceptorOffers(6000);
            if (interceptorOffers && interceptorOffers.length > 0) {
              this.log(`Using ${interceptorOffers.length} interceptor offers with activation URLs`);

              // Enrich DOM-scraped offers with API expiry dates
              this._enrichOffersWithApiData(cleaned, interceptorOffers);

              added = await this._activateViaClickTracking(interceptorOffers);
              added += 1; // +1 for the discovery click
              // Check if there are still unsaved offers (API may not have returned all)
              if (this.isRunning) {
                const unsavedCount = this._countUnsavedTiles();
                if (unsavedCount > 0) {
                  this.log(`${unsavedCount} offers still unsaved after beacon activation, using click-and-navigate`);
                  this.reportProgress({ phase: 'fallback', current: added, total: added + unsavedCount });
                  added += await this.fallbackClickAndNavigate();
                }
              }
            } else {
              this.log('No per-offer activation URLs available, using fallback');
              this.reportProgress({ phase: 'fallback', current: 0, total: offers.length });
              added = await this.fallbackClickAndNavigate();
            }
          } else {
            // Standard POST/PUT API — replay with swapped offer IDs
            const remainingOffers = this.extractOfferIdsFromTiles();
            this.log(`${remainingOffers.length} offers remaining to activate`);

            if (remainingOffers.length > 0 && remainingOffers.every(o => o.offerId)) {
              const result = await this.replayActivation(remainingOffers);
              added = result.activated + 1; // +1 for the discovery click
              this.log(`API replay: ${result.activated} activated, ${result.failed} failed`);
            } else if (remainingOffers.length > 0) {
              this.log('Offer IDs not extractable from DOM, using fallback');
              this.reportProgress({ phase: 'fallback', current: 0, total: remainingOffers.length });
              added = await this.fallbackClickAndNavigate();
            }
          }
        } else if (this.isRunning) {
          // Discovery failed — fall back
          this.log('API discovery failed, using fallback');
          this.reportProgress({ phase: 'fallback', current: 0, total: offers.length });
          added = await this.fallbackClickAndNavigate();
        }
      } else if (this.isRunning) {
        // Interceptor not available — fall back
        this.log('MAIN world interceptor not available, using fallback');
        this.reportProgress({ phase: 'fallback', current: 0, total: offers.length });
        added = await this.fallbackClickAndNavigate();
      }

      this.log('Scrape complete:', cleaned.length, 'offers,', added, 'opted in');
      return { offers: cleaned, added, totalFound: cleaned.length };
    } catch (err) {
      debug.error('[RMX-Chase] Scrape failed:', err);
      return { offers: [], added: 0, totalFound: 0 };
    }
  },

  // Stop the scraping process
  stop() {
    this.isRunning = false;
    if (typeof BatchOptIn !== 'undefined') {
      BatchOptIn.stop();
    }
    this.log('Scraping stopped by user');
  },

  // ============================================
  // PHASE 1: API DISCOVERY
  // ============================================

  /**
   * Check if MAIN world interceptor is ready via postMessage ping.
   * Returns true within 2s if interceptor responds.
   */
  checkInterceptorReady() {
    return new Promise((resolve) => {
      let resolved = false;

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.channel === this.API_CHANNEL &&
            event.data?.type === 'interceptor_ready') {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('message', handler);
            resolve(true);
          }
        }
      };
      window.addEventListener('message', handler);

      // Ping the interceptor
      window.postMessage({ channel: this.API_CHANNEL, type: 'ping' }, '*');

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', handler);
          resolve(false);
        }
      }, 2000);
    });
  },

  /**
   * Click ONE offer to discover the activation API call.
   * Captures all POST/PUT/PATCH requests fired during the click.
   */
  async discoverActivationAPI() {
    this.log('=== Phase 1: API Discovery ===');

    // Tell MAIN world interceptor to start capturing
    window.postMessage({ channel: this.API_CHANNEL, type: 'start_capture' }, '*');

    // Find first clickable (unsaved) offer tile
    const tiles = document.querySelectorAll(
      '[data-testid="commerce-tile"], [data-cy="commerce-tile"]'
    );

    let targetTile = null;
    let targetButton = null;
    for (const tile of tiles) {
      const btn = this._findTileButton(tile);
      if (btn && !this.isButtonAlreadySaved(btn)) {
        targetTile = tile;
        targetButton = btn;
        break;
      }
    }

    if (!targetButton) {
      this.log('No clickable offers found for discovery');
      window.postMessage({ channel: this.API_CHANNEL, type: 'stop_capture' }, '*');
      return false;
    }

    const discoveryMerchant = this.getMerchantFromTile(targetTile);
    this.log(`Discovery: clicking offer for "${discoveryMerchant}"`);

    // Set up listener for capture completion
    const capturePromise = new Promise((resolve) => {
      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.channel === this.API_CHANNEL &&
            event.data?.type === 'capture_complete') {
          window.removeEventListener('message', handler);
          resolve(event.data.data || []);
        }
      };
      window.addEventListener('message', handler);

      // Safety timeout — don't wait forever
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 8000);
    });

    // Click the plus button (may activate inline or navigate to detail page)
    const urlBefore = window.location.href;
    this.log('Discovery target:', targetButton.tagName, targetButton.className?.substring?.(0, 60));
    this._safeClick(targetButton);

    // Wait for activation/navigation and any API calls to fire
    await this.wait(3000);

    // Stop capturing
    window.postMessage({ channel: this.API_CHANNEL, type: 'stop_capture' }, '*');

    // Get all captured requests
    const captured = await capturePromise;
    this.log(`Captured ${captured.length} requests during discovery`);

    // Only navigate back if the click caused navigation away from offers page
    const urlAfter = window.location.href;
    if (urlAfter !== urlBefore) {
      this.log('Click navigated to detail page, going back...');
      window.history.back();
      await this.wait(2000);
      await this.waitForOffers(10000);
    } else {
      this.log('Click activated inline (no navigation)');
    }

    if (!this.isRunning) return false;

    // Analyze captured requests to find the activation API
    return this.analyzeCaptures(captured, discoveryMerchant);
  },

  /**
   * Analyze captured requests to find the offer activation API call.
   * Filters out analytics/tracking, looks for offer-related keywords.
   */
  analyzeCaptures(captures, merchantName) {
    this.log('Analyzing captured requests...');

    if (!captures || captures.length === 0) {
      this.log('No requests captured — discovery failed');
      return false;
    }

    // Log all captured requests for debugging
    captures.forEach((req, i) => {
      this.log(`  Capture[${i}]: ${req.method} ${req.url.substring(0, 150)}${req.isImageBeacon ? ' (img beacon)' : ''}`);
    });

    // ---- Priority 1: reco.chase.com click-tracking GETs (known Chase activation) ----
    const recoCaptures = captures.filter(req =>
      req.url && req.url.includes('reco.chase.com')
    );

    if (recoCaptures.length > 0) {
      const reco = recoCaptures[0];
      this.log(`Found reco.chase.com click-tracking URL: ${reco.url.substring(0, 200)}`);

      // The URL contains offer-specific path segments — we need to identify which part
      // varies per offer so we can template it for replay
      this.apiTemplate = {
        url: reco.url,
        method: 'GET',
        headers: reco.headers || {},
        bodyTemplate: null,
        isClickTracking: true,
        isImageBeacon: !!reco.isImageBeacon
      };
      return true;
    }

    // ---- Priority 2: POST/PUT with offer ID in body (generic discovery) ----
    const urlIndicators = ['offer', 'save', 'activate', 'enroll', 'add',
                          'commerce', 'merchant', 'deal', 'opt', 'redeem'];
    const bodyIndicators = ['offer', 'merchant', 'save', 'activate', 'enroll'];
    const analyticsPatterns = ['analytics', 'tracking', 'log', 'beacon',
                               'pixel', 'telemetry', 'metrics', 'event-collector'];

    const candidates = captures.filter(req => {
      const url = (req.url || '').toLowerCase();
      const body = (req.body || '').toLowerCase();

      const isAnalytics = analyticsPatterns.some(p => url.includes(p));
      if (isAnalytics) return false;

      // Skip reco captures (already handled above)
      if (url.includes('reco.chase.com')) return false;

      const urlMatch = urlIndicators.some(ind => url.includes(ind));
      const bodyMatch = bodyIndicators.some(ind => body.includes(ind));

      return urlMatch || bodyMatch;
    });

    this.log(`Found ${candidates.length} candidate activation requests (non-reco)`);

    for (const req of candidates) {
      this.log(`Candidate: ${req.method} ${req.url.substring(0, 150)}`);
      this.log(`  Body preview: ${(req.body || '').substring(0, 200)}`);

      // Try to parse body as JSON to find offer ID patterns
      try {
        const bodyObj = JSON.parse(req.body);
        this.log(`  Parsed body keys: ${Object.keys(bodyObj).join(', ')}`);

        const idFields = ['offerId', 'offer_id', 'id', 'merchantOfferId',
                         'dealId', 'deal_id', 'commerceId', 'offerIdentifier'];
        for (const field of idFields) {
          if (bodyObj[field]) {
            this.log(`  Found offer ID field: ${field} = ${bodyObj[field]}`);
            this.apiTemplate = {
              url: req.url,
              method: req.method,
              headers: req.headers,
              bodyTemplate: req.body,
              offerIdField: field,
              offerIdValue: String(bodyObj[field])
            };
            return true;
          }
        }

        const deepId = this._findDeepId(bodyObj, idFields);
        if (deepId) {
          this.log(`  Found deep offer ID: ${deepId.path} = ${deepId.value}`);
          this.apiTemplate = {
            url: req.url,
            method: req.method,
            headers: req.headers,
            bodyTemplate: req.body,
            offerIdPath: deepId.path,
            offerIdValue: String(deepId.value)
          };
          return true;
        }

        this.apiTemplate = {
          url: req.url,
          method: req.method,
          headers: req.headers,
          bodyTemplate: req.body,
          offerIdField: null
        };

      } catch (e) {
        const urlIdMatch = req.url.match(/offer[s]?\/([a-zA-Z0-9_-]+)/i);
        if (urlIdMatch) {
          this.log(`  Found offer ID in URL: ${urlIdMatch[1]}`);
          this.apiTemplate = {
            url: req.url,
            method: req.method,
            headers: req.headers,
            bodyTemplate: req.body,
            urlPattern: req.url,
            offerIdInUrl: urlIdMatch[1]
          };
          return true;
        }
      }
    }

    if (this.apiTemplate) {
      this.log('API template captured (offer ID field unknown — will try string replacement)');
      return true;
    }

    return false;
  },

  /**
   * Deep search for ID fields in nested objects (max 2 levels).
   */
  _findDeepId(obj, fields, prefix, depth) {
    if (typeof prefix === 'undefined') prefix = '';
    if (typeof depth === 'undefined') depth = 0;
    if (depth > 2 || !obj || typeof obj !== 'object') return null;

    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (fields.includes(key) && obj[key]) {
        return { path, value: obj[key] };
      }
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        const found = this._findDeepId(obj[key], fields, path, depth + 1);
        if (found) return found;
      }
    }
    return null;
  },

  // ============================================
  // PHASE 2: API REPLAY
  // ============================================

  /**
   * Extract offer IDs from tile DOM elements.
   * Returns array of { element, button, offerId, merchant }.
   */
  extractOfferIdsFromTiles() {
    const tiles = document.querySelectorAll(
      '[data-testid="commerce-tile"], [data-cy="commerce-tile"]'
    );

    const offers = [];
    tiles.forEach(tile => {
      const btn = this._findTileButton(tile);
      if (!btn || this.isButtonAlreadySaved(btn)) return;

      // Try to extract offer ID from various DOM attributes
      const offerId = tile.getAttribute('data-offer-id') ||
                     tile.getAttribute('data-id') ||
                     tile.getAttribute('id') ||
                     btn.getAttribute('data-offer-id') ||
                     btn.getAttribute('data-id');

      const merchant = this.getMerchantFromTile(tile);

      offers.push({
        element: tile,
        button: btn,
        offerId: offerId,
        merchant: merchant
      });
    });

    return offers;
  },

  /**
   * Replay activation API for remaining offers in batches.
   * Uses the template captured during discovery.
   */
  async replayActivation(offerInfos) {
    if (!this.apiTemplate) return { activated: 0, failed: 0 };

    let activated = 0;
    let failed = 0;
    const BATCH_SIZE = 5;
    const total = offerInfos.length;

    this.log(`Replaying activation for ${total} offers in batches of ${BATCH_SIZE}`);

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (!this.isRunning) break;

      const batch = offerInfos.slice(i, i + BATCH_SIZE);

      // Fire batch in parallel
      const promises = batch.map(offer => this._replaySingle(offer));
      const results = await Promise.all(promises);

      results.forEach(result => {
        if (result.success) activated++;
        else failed++;
      });

      // Report progress
      this.reportProgress({
        phase: 'activating',
        current: i + batch.length,
        total: total,
        merchant: batch[batch.length - 1]?.merchant || ''
      });

      // Small delay between batches
      if (i + BATCH_SIZE < total) {
        await this.wait(500);
      }
    }

    // Report completion
    this.reportProgress({
      phase: 'complete',
      current: total,
      total: total,
      result: { added: activated, failed, skipped: 0, total }
    });

    return { activated, failed };
  },

  /**
   * Replay one activation request via MAIN world interceptor.
   */
  _replaySingle(offer) {
    return new Promise((resolve) => {
      const tpl = this.apiTemplate;
      let newBody = tpl.bodyTemplate;
      let newUrl = tpl.url;

      // Replace offer ID in template
      if (tpl.offerIdField && tpl.offerIdValue) {
        // JSON body with known top-level field
        try {
          const bodyObj = JSON.parse(newBody);
          bodyObj[tpl.offerIdField] = offer.offerId;
          newBody = JSON.stringify(bodyObj);
        } catch (e) {
          // String replacement fallback
          newBody = newBody.split(tpl.offerIdValue).join(offer.offerId);
        }
      } else if (tpl.offerIdPath && tpl.offerIdValue) {
        // Nested field — use string replacement on the serialized body
        newBody = newBody.split(tpl.offerIdValue).join(offer.offerId);
      } else if (tpl.offerIdInUrl) {
        // Offer ID is in the URL
        newUrl = tpl.url.replace(tpl.offerIdInUrl, offer.offerId);
      } else if (tpl.offerIdValue) {
        // Last resort — replace the known ID value in the body string
        newBody = newBody.split(tpl.offerIdValue).join(offer.offerId);
      }

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.channel === this.API_CHANNEL &&
            event.data?.type === 'replay_result' &&
            event.data?.data?.offerId === offer.offerId) {
          window.removeEventListener('message', handler);
          resolve(event.data.data);
        }
      };
      window.addEventListener('message', handler);

      window.postMessage({
        channel: this.API_CHANNEL,
        type: 'replay_request',
        data: {
          template: {
            url: newUrl,
            method: tpl.method,
            headers: tpl.headers,
            body: newBody
          },
          newBody: newBody,
          newUrl: newUrl,
          offerId: offer.offerId
        }
      }, '*');

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, offerId: offer.offerId, error: 'timeout' });
      }, 5000);
    });
  },

  // ============================================
  // PHASE 2b: CLICK-TRACKING ACTIVATION
  // Uses per-offer activation URLs from ChaseInterceptor
  // ============================================

  /**
   * Wait for Chase customer-offers API response from MAIN world interceptor.
   * Our MAIN world script observes responses and sends them via postMessage
   * (bypasses CSP-blocked BaseInterceptor inline script).
   * Parses offers with activation URLs directly from the API response.
   */
  async _waitForInterceptorOffers(timeout) {
    // First check if the interceptor cache was already populated (from BaseInterceptor)
    if (typeof interceptorCache !== 'undefined' && interceptorCache.chase?.ready) {
      const cached = (interceptorCache.chase.offers || []).filter(o =>
        o.activationUrl && o.status !== 'ACTIVATED'
      );
      if (cached.length > 0) {
        this.log(`Found ${cached.length} activatable offers in interceptor cache`);
        return cached;
      }
    }

    // Ask MAIN world for its cached response (may already have it from page load)
    this.log('Requesting cached API response from MAIN world...');
    const cachedResult = await this._requestCachedResponse();
    this.log('Cached response result:', cachedResult ? `got data, top keys: ${Object.keys(cachedResult).join(',')}` : 'null');
    if (cachedResult) {
      const offers = this._parseOffersFromApiResponse(cachedResult);
      if (offers && offers.length > 0) {
        this.log(`Got ${offers.length} offers from cached API response`);
        // API typically returns a small page (12). Request all if we got fewer than expected.
        if (offers.length < 50) {
          this.log(`Only ${offers.length} offers from cache — requesting all offers from API`);
          const allData = await this._requestAllOffers();
          if (allData) {
            const allOffers = this._parseOffersFromApiResponse(allData);
            if (allOffers && allOffers.length > offers.length) {
              this.log(`Got ${allOffers.length} offers from full API request (was ${offers.length})`);
              return allOffers;
            }
          }
          this.log('Full API request did not return more offers, using cached');
        }
        return offers;
      }
      this.log('Cached response had no activatable offers');
    }

    // Listen for a fresh api_response (e.g. from history.back() reload)
    this.log('Listening for fresh customer-offers API response...');
    return new Promise((resolve) => {
      let resolved = false;

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.channel !== this.API_CHANNEL) return;
        if (event.data?.type !== 'api_response') return;

        const payload = event.data.data;
        this.log('Got api_response event, payload:', payload ? `keys=${Object.keys(payload).join(',')}` : 'null');
        if (!payload) return;
        // Skip non-customerOffers responses (e.g. offer-summaries)
        if (!payload.customerOffers && !payload.offers && !Array.isArray(payload)) return;

        const offers = this._parseOffersFromApiResponse(payload);
        if (offers && offers.length > 0) {
          resolved = true;
          window.removeEventListener('message', handler);
          resolve(offers);
        }
      };

      window.addEventListener('message', handler);

      setTimeout(() => {
        if (!resolved) {
          window.removeEventListener('message', handler);
          this.log('Timed out waiting for customer-offers API response');
          resolve(null);
        }
      }, timeout);
    });
  },

  /**
   * Request cached API response from MAIN world interceptor.
   * Returns the payload or null if no cached response exists.
   */
  _requestCachedResponse() {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.channel !== this.API_CHANNEL) return;
        if (event.data?.type !== 'cached_response') return;

        window.removeEventListener('message', handler);
        resolve(event.data.data || null);
      };

      window.addEventListener('message', handler);
      window.postMessage({ channel: this.API_CHANNEL, type: 'get_cached_response' }, '*');

      // Short timeout — cache is either there or not
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 1000);
    });
  },

  /**
   * Request all offers from the API by replaying the customer-offers URL with offer-count=200.
   * Returns the parsed API response or null.
   */
  _requestAllOffers() {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.channel !== this.API_CHANNEL) return;
        if (event.data?.type !== 'all_offers_response') return;
        window.removeEventListener('message', handler);
        resolve(event.data.data || null);
      };
      window.addEventListener('message', handler);
      window.postMessage({ channel: this.API_CHANNEL, type: 'fetch_all_offers' }, '*');
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 8000);
    });
  },

  /**
   * Count tiles on page that are not yet activated/saved.
   */
  _countUnsavedTiles() {
    const tiles = document.querySelectorAll('[data-testid="commerce-tile"], [data-cy="commerce-tile"]');
    let count = 0;
    tiles.forEach(tile => {
      const btn = this._findTileButton(tile);
      if (btn && !this.isButtonAlreadySaved(btn)) count++;
    });
    return count;
  },

  /**
   * Parse Chase customer-offers API response to extract offers with activation URLs.
   * Mirrors ChaseInterceptor.parseOffers logic but runs in scraper context.
   */
  _parseOffersFromApiResponse(payload) {
    if (!payload) return null;

    // Extract offer array: customerOffers[0].offers or top-level offers
    let rawOffers = null;
    if (Array.isArray(payload.customerOffers) && payload.customerOffers.length > 0) {
      rawOffers = payload.customerOffers[0].offers;
    } else if (Array.isArray(payload.offers)) {
      rawOffers = payload.offers;
    } else if (Array.isArray(payload)) {
      rawOffers = payload;
    }

    if (!rawOffers || rawOffers.length === 0) {
      this.log('No rawOffers array found. Payload structure:', JSON.stringify(Object.keys(payload)).substring(0, 200));
      if (payload.customerOffers) {
        this.log('customerOffers exists, length:', payload.customerOffers.length,
          'first keys:', payload.customerOffers[0] ? Object.keys(payload.customerOffers[0]).join(',') : 'empty');
      }
      return null;
    }

    this.log(`Parsing ${rawOffers.length} offers from API response`);
    // Log first offer structure for debugging
    if (rawOffers[0]) {
      const sample = rawOffers[0];
      this.log('Sample offer keys:', Object.keys(sample).join(','));
      this.log('Sample activationUrl:', sample.digitalInteractionDestUrlText ? sample.digitalInteractionDestUrlText.substring(0, 100) : 'MISSING');
      this.log('Sample merchant:', sample.merchantDetails?.merchantName || 'MISSING');
      this.log('Sample status:', sample.offerStatusName || 'MISSING');
    }

    const offers = [];
    for (const raw of rawOffers) {
      if (!raw || typeof raw !== 'object') continue;

      const details = raw.merchantDetails || {};
      const merchant = details.merchantName;
      if (!merchant) continue;

      const display = raw.offerDisplayDetails || {};
      const value = display.offerHeaderText || display.shortMessageText || 'See details';
      const activationUrl = raw.digitalInteractionDestUrlText || null;
      const status = raw.offerStatusName || null;
      const offerId = raw.offerIdentifier || null;

      // Extract expiry from API data
      const offerOpts = raw.offerDetails || {};
      let expiry = offerOpts.offerEndTimestamp || null;
      if (expiry) {
        try {
          const d = new Date(expiry);
          expiry = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
        } catch (e) { expiry = null; }
      }

      offers.push({
        merchant,
        value,
        offerId,
        activationUrl,
        status,
        expiry
      });
    }

    const activatable = offers.filter(o => o.activationUrl && o.status !== 'ACTIVATED');
    this.log(`Parsed ${offers.length} offers, ${activatable.length} activatable`);

    return activatable.length > 0 ? activatable : null;
  },

  /**
   * Enrich DOM-scraped offers with expiry dates from API data.
   * Matches by merchant name (case-insensitive).
   */
  _enrichOffersWithApiData(cleaned, apiOffers) {
    if (!apiOffers || apiOffers.length === 0) return;

    // Build lookup by lowercase merchant name
    const apiByMerchant = {};
    for (const ao of apiOffers) {
      if (ao.merchant && ao.expiry) {
        apiByMerchant[ao.merchant.toLowerCase()] = ao.expiry;
      }
    }

    let enriched = 0;
    for (const offer of cleaned) {
      if (offer.expiry === 'Check portal' && offer.merchant) {
        const apiExpiry = apiByMerchant[offer.merchant.toLowerCase()];
        if (apiExpiry) {
          offer.expiry = apiExpiry;
          enriched++;
        }
      }
    }

    if (enriched > 0) {
      this.log(`Enriched ${enriched} offers with API expiry dates`);
    }
  },

  /**
   * Activate offers via Image beacon GETs to reco.chase.com click-tracking URLs.
   * Same mechanism as ChaseInterceptor.activateAll() but called from scraper context.
   */
  async _activateViaClickTracking(offers) {
    const BASE_URL = 'https://reco.chase.com/events/recoengine/public/recommendation';
    const BATCH_SIZE = 10;
    let activated = 0;

    this.log(`Activating ${offers.length} offers via click-tracking`);

    for (let i = 0; i < offers.length; i += BATCH_SIZE) {
      if (!this.isRunning) break;

      const batch = offers.slice(i, i + BATCH_SIZE);

      // Build full URLs
      const urls = batch.map(o => {
        const path = o.activationUrl;
        // activationUrl is either a full URL or a relative path
        return path.startsWith('http') ? path : BASE_URL + path;
      });

      // Fire beacons via MAIN world interceptor (bypasses CSP, has session cookies)
      await this._fireBeaconsViaMainWorld(urls);

      activated += batch.length;

      this.reportProgress({
        phase: 'activating',
        current: activated,
        total: offers.length,
        merchant: batch[batch.length - 1]?.merchant || ''
      });

      if (i + BATCH_SIZE < offers.length) {
        await this.wait(500);
      }
    }

    // Wait for final batch
    await this.wait(1000);

    this.reportProgress({
      phase: 'complete',
      current: offers.length,
      total: offers.length,
      result: { added: activated, failed: 0, skipped: 0, total: offers.length }
    });

    return activated;
  },

  /**
   * Send beacon URLs to MAIN world interceptor to fire as Image beacons.
   * Bypasses CSP since the MAIN world script is manifest-registered.
   */
  _fireBeaconsViaMainWorld(urls) {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.channel !== this.API_CHANNEL) return;
        if (event.data?.type !== 'beacons_fired') return;
        window.removeEventListener('message', handler);
        this.log(`Fired ${event.data.data?.count || 0} beacons via MAIN world`);
        resolve();
      };

      window.addEventListener('message', handler);
      window.postMessage({
        channel: this.API_CHANNEL,
        type: 'fire_beacons',
        data: urls
      }, '*');

      // Timeout — beacons are fire-and-forget, don't block long
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve();
      }, 2000);
    });
  },

  // ============================================
  // PHASE 3: FALLBACK — Optimized click-and-navigate
  // ============================================

  async fallbackClickAndNavigate() {
    this.log('=== Phase 3: Fallback click-and-navigate ===');
    let added = 0;
    const MAX_ITERATIONS = 200;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (!this.isRunning) break;

      // Find next unactivated offer tile/button
      const tiles = document.querySelectorAll(
        '[data-testid="commerce-tile"], [data-cy="commerce-tile"]'
      );

      let targetButton = null;
      let targetTile = null;
      for (const tile of tiles) {
        const btn = this._findTileButton(tile);
        if (btn && !this.isButtonAlreadySaved(btn)) {
          targetButton = btn;
          targetTile = tile;
          break;
        }
      }

      if (!targetButton) {
        this.log('No more offers to activate');
        break;
      }

      const merchant = this.getMerchantFromTile(targetTile);
      this.log(`Fallback: clicking "${merchant}" (${added + 1})`);

      // Click the plus button (inline activation) or tile (navigates)
      const urlBefore = window.location.href;
      this._safeClick(targetButton);

      // Wait for activation
      const delay = Math.floor(Math.random() * 400) + 600; // 600-1000ms
      await this.wait(delay);

      // Only history.back() if click caused navigation
      if (window.location.href !== urlBefore) {
        window.history.back();
        await this.waitForOffers(5000);
        await this.wait(300);

        // Chase lazy-loads tiles after history.back() — scroll to load all if partial
        const visibleTiles = document.querySelectorAll(
          '[data-testid="commerce-tile"], [data-cy="commerce-tile"]'
        ).length;
        if (visibleTiles < 50) {
          window.scrollTo(0, document.body.scrollHeight);
          await this.wait(1000);
          window.scrollTo(0, 0);
          await this.wait(300);
        }
      } else {
        // Inline activation — wait for tile UI to update
        await this.wait(500);
      }

      added++;

      // Report progress
      this.reportProgress({
        phase: 'clicking',
        current: added,
        total: tiles.length,
        merchant: merchant
      });
    }

    // Report completion
    this.reportProgress({
      phase: 'complete',
      current: added,
      total: added,
      result: { added, failed: 0, skipped: 0, total: added }
    });

    return added;
  },

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Find the actual clickable button inside a tile.
   * Chase puts data-cy/data-testid on SVG icons inside buttons,
   * so we traverse up to find the real <button> or [role="button"].
   */
  _findTileButton(tile) {
    const el = tile.querySelector(
      '[data-cy="commerce-tile-button"], [data-testid="commerce-tile-button"]'
    );
    if (!el) return null;

    // Chase DOM: SVG(plus icon) → DIV.r9jbijb → DIV.r9jbijn → DIV[role=button](tile)
    // We must click the SVG or its immediate wrapper — NOT the tile, which navigates
    // to the detail page instead of activating the offer.
    if (el.tagName === 'BUTTON' || el.tagName === 'A') return el;

    // Look for a <button> ancestor, but stop before reaching the tile itself
    const btn = el.closest('button');
    if (btn && tile.contains(btn) && btn !== tile) return btn;

    // No <button> found — return the SVG's parent container (the clickable wrapper)
    // so the click event bubbles to Chase's "Add Offer" handler without
    // reaching the tile's navigation handler
    return el.parentElement || el;
  },

  /**
   * Safely click an element — handles SVG elements and elements where
   * .click() is not a function (Chase uses custom components).
   */
  _safeClick(el) {
    if (typeof el.click === 'function') {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  },

  /**
   * Check if a button is already in "saved" state.
   */
  isButtonAlreadySaved(btn) {
    if (!btn) return true;
    if (btn.disabled) return true;
    const text = (btn.textContent || '').toLowerCase();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const icon = btn.querySelector('[type]');
    const iconType = icon?.getAttribute('type') || '';

    return text.includes('saved') || text.includes('added') ||
           ariaLabel.includes('saved') || ariaLabel.includes('added') ||
           title.includes('saved') || title.includes('added') ||
           iconType.includes('check') || iconType.includes('saved');
  },

  /**
   * Get merchant name from tile element.
   */
  getMerchantFromTile(tile) {
    if (!tile) return 'Unknown';
    const ariaLabel = tile.getAttribute('aria-label') || '';
    return this.getMerchantFromAriaLabel(ariaLabel);
  },

  getMerchantFromAriaLabel(ariaLabel) {
    // Parse "3 of 72 LensDirect $20 cash back" → "LensDirect"
    const match = ariaLabel.match(/^\d+\s+of\s+\d+\s+(.+?)\s+(\$\d+|[\d.]+%)/);
    return match ? match[1].trim() : 'Unknown';
  },

  /**
   * Report progress to popup via chrome.runtime.sendMessage.
   */
  reportProgress(data) {
    try {
      chrome.runtime.sendMessage({
        action: 'batch_progress',
        source: 'chase',
        current: data.current || 0,
        total: data.total || 0,
        merchant: data.merchant || '',
        phase: data.phase || 'clicking',
        result: data.result || undefined
      });
    } catch (e) { /* popup may be closed */ }
  },

  // ============================================
  // EXISTING COLLECTION LOGIC (unchanged)
  // ============================================

  // Scroll to load all lazy-loaded offers
  async scrollToLoad() {
    this.log('Loading all offers via scroll...');
    let lastCount = 0;
    const maxPasses = 15;

    for (let i = 0; i < maxPasses; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(800);

      const currentCount = document.querySelectorAll('[data-testid="commerce-tile"], [data-cy="commerce-tile"]').length;
      this.log(`Scroll pass ${i + 1}: ${currentCount} tiles found`);

      if (currentCount <= lastCount) break;
      lastCount = currentCount;
    }

    window.scrollTo(0, 0);
    await this.wait(500);
  },

  // Collect all offers from the page
  collectOffers() {
    const offers = [];
    const seen = new Set();

    this.log('Looking for commerce-tile elements...');
    const tiles = document.querySelectorAll('[data-testid="commerce-tile"], [data-cy="commerce-tile"]');
    this.log('Found', tiles.length, 'commerce-tile elements');

    tiles.forEach((tile, index) => {
      const ariaLabel = tile.getAttribute('aria-label') || '';
      this.log(`Tile ${index} aria-label:`, ariaLabel);

      let merchant = null;
      let value = null;

      const ariaMatch = ariaLabel.match(/^\d+\s+of\s+\d+\s+(.+?)\s+(\$\d+.*?|\d+%.*?)$/i);
      if (ariaMatch) {
        merchant = ariaMatch[1].trim();
        value = ariaMatch[2].trim();
        this.log(`Tile ${index} parsed from aria:`, { merchant, value });
      }

      if (!merchant) merchant = this.extractMerchantFromTile(tile);
      if (!value) value = this.extractValueFromTile(tile);

      this.log(`Tile ${index} final:`, { merchant, value });

      if (!merchant) {
        this.log(`Tile ${index}: skipping - no merchant found`);
        return;
      }

      const key = merchant.toLowerCase();
      if (seen.has(key)) {
        this.log(`Tile ${index}: skipping - duplicate merchant`);
        return;
      }
      seen.add(key);

      const expiry = this.extractExpiryFromTile(tile);

      offers.push({
        merchant,
        value: value || 'See details',
        expiry
      });

      this.log(`Tile ${index}: added offer -`, merchant, '|', value);
    });

    // FALLBACK: Try offerTileGridItemContainer if no commerce-tiles found
    if (offers.length === 0) {
      this.log('No commerce-tiles found, trying fallback selectors...');
      const containers = document.querySelectorAll('.offerTileGridItemContainer, [class*="offerTile"]');
      this.log('Found', containers.length, 'fallback containers');

      containers.forEach((container) => {
        const tile = container.querySelector('[data-testid="commerce-tile"], [data-cy="commerce-tile"], [role="button"]');
        if (!tile) return;

        const ariaLabel = tile.getAttribute('aria-label') || '';
        let merchant = null;
        let value = null;

        const ariaMatch = ariaLabel.match(/^\d+\s+of\s+\d+\s+(.+?)\s+(\$\d+.*?|\d+%.*?)$/i);
        if (ariaMatch) {
          merchant = ariaMatch[1].trim();
          value = ariaMatch[2].trim();
        }

        if (!merchant) merchant = this.extractMerchantFromTile(container);
        if (!value) value = this.extractValueFromTile(container);

        if (!merchant) return;

        const key = merchant.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        offers.push({
          merchant,
          value: value || 'See details',
          expiry: this.extractExpiryFromTile(container)
        });
      });
    }

    return offers;
  },

  // Extract merchant name from tile DOM
  extractMerchantFromTile(tile) {
    const merchantSpan = tile.querySelector('span.mds-body-small-heavier, [class*="mds-body-small-heavier"]');
    if (merchantSpan && merchantSpan.textContent.trim()) {
      const text = merchantSpan.textContent.trim();
      if (!text.includes('$') && !text.includes('%')) return text;
    }

    const nameSelectors = [
      '[class*="merchantName"]',
      '[class*="merchant-name"]',
      '[class*="offer-title"]',
      '[class*="r9jbijk"]'
    ];

    for (const selector of nameSelectors) {
      const el = tile.querySelector(selector);
      if (el && el.textContent.trim()) {
        const text = el.textContent.trim();
        if (!text.includes('$') && !text.includes('%') && text.length < 50) return text;
      }
    }

    const spans = tile.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text &&
          !text.includes('$') &&
          !text.includes('%') &&
          !text.includes('back') &&
          !text.toLowerCase().includes('new') &&
          !text.toLowerCase().includes('expir') &&
          text.length > 2 &&
          text.length < 50) {
        return text;
      }
    }

    return null;
  },

  // Extract value from tile DOM
  extractValueFromTile(tile) {
    const valueSpan = tile.querySelector('span.mds-body-large-heavier, [class*="mds-body-large-heavier"]');
    if (valueSpan && valueSpan.textContent.trim()) return valueSpan.textContent.trim();

    const valueSelectors = [
      '[class*="r9jbijj"]',
      '[class*="offer-value"]',
      '[class*="cashback"]',
      '[class*="reward"]'
    ];

    for (const selector of valueSelectors) {
      const el = tile.querySelector(selector);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }

    const tileText = tile.textContent || '';
    const valuePatterns = [
      /(\$\d+(?:\.\d+)?\s*(?:cash\s*)?back)/i,
      /(\d+%\s*(?:cash\s*)?back)/i,
      /(\d+x\s*points?)/i,
      /(earn\s+\$\d+)/i,
      /(earn\s+\d+%)/i
    ];

    for (const pattern of valuePatterns) {
      const match = tileText.match(pattern);
      if (match) return match[1];
    }

    return null;
  },

  // Extract expiry from tile DOM
  extractExpiryFromTile(tile) {
    const tileText = tile.textContent || '';

    // Chase shows "Xd left" in days-left-banner on activated offers
    const daysLeftEl = tile.querySelector('[data-cy="days-left-banner"]');
    if (daysLeftEl) {
      const daysMatch = daysLeftEl.textContent.match(/(\d+)\s*d(?:ays?)?\s*left/i);
      if (daysMatch) {
        const days = parseInt(daysMatch[1], 10);
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + days);
        return `${String(expDate.getMonth() + 1).padStart(2, '0')}/${String(expDate.getDate()).padStart(2, '0')}/${expDate.getFullYear()}`;
      }
    }

    // Also check for "Xd left" anywhere in tile text (e.g. "23d left")
    const daysTextMatch = tileText.match(/(\d+)\s*d(?:ays?)?\s*left/i);
    if (daysTextMatch) {
      const days = parseInt(daysTextMatch[1], 10);
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + days);
      return `${String(expDate.getMonth() + 1).padStart(2, '0')}/${String(expDate.getDate()).padStart(2, '0')}/${expDate.getFullYear()}`;
    }

    const expiryPatterns = [
      /expires?\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
      /valid\s*(?:through|until)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
      /ends?\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i
    ];

    for (const pattern of expiryPatterns) {
      const match = tileText.match(pattern);
      if (match) return match[1];
    }

    const expirySelectors = ['[class*="expir"]', '[class*="valid"]', '[class*="date"]', 'time'];
    for (const selector of expirySelectors) {
      const el = tile.querySelector(selector);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }

    return 'Check portal';
  },

  detectCategory(merchantName) {
    if (typeof Categories !== 'undefined') return Categories.detectCategory(merchantName);
    return 'other';
  },

  // Clean value string by removing trailing status text
  cleanValue(value) {
    if (!value) return value;
    return value
      .replace(/\s*\d+\s*days?\s*left/gi, '')
      .replace(/\s*Expiring\s*(?:soon|\.{3})?/gi, '')
      .replace(/\s*Last\s*day/gi, '')
      .replace(/\s*Success/gi, '')
      .replace(/\s*Added/gi, '')
      .replace(/\s*Add\s*offer/gi, '')
      .replace(/\s*New$/gi, '')
      .trim();
  },

  parseValueType(value) {
    if (!value) return 'unknown';
    if (value.includes('%')) return 'percent';
    if (value.includes('$')) return 'fixed';
    if (/\d+x/i.test(value)) return 'multiplier';
    return 'unknown';
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Wait for offers to be visible on page
  async waitForOffers(timeout) {
    if (typeof timeout === 'undefined') timeout = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const tiles = document.querySelectorAll('[data-testid="commerce-tile"], [data-cy="commerce-tile"]');
      if (tiles.length > 0) {
        this.log('Offers loaded:', tiles.length, 'tiles');
        return true;
      }
      await this.wait(200);
    }

    this.log('Timeout waiting for offers');
    return false;
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.ChaseScraper = ChaseScraper;
}
