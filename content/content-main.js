// Main content script coordinator
// Routes messages to appropriate scrapers based on current site
// Supports hybrid extraction: interceptor (primary) -> scraper (fallback)

debug.log('[RMX-Orchestrator] Content script loaded');

const AUTO_SYNC_KEY = 'rmx_auto_sync';

// ---- Site Detection ----

function detectSite() {
  const host = window.location.hostname.toLowerCase();

  if (host.includes('americanexpress.com')) return 'amex';
  if (host.includes('chase.com')) return 'chase';
  if (host.includes('citi.com') || host.includes('citibank.com')) return 'citi';
  if (host.includes('capitaloneshopping.com')) return 'capital-one-shopping';
  if (host.includes('capitalone.com')) return 'capital-one';
  if (host.includes('discover.com')) return 'discover';
  if (host.includes('bankofamerica.com') || host.includes('bofa.com')) return 'bofa';
  if (host.includes('usbank.com')) return 'usbank';
  if (host.includes('rakuten.com')) return 'rakuten';

  return null;
}

// ---- Scraper Lookup (fallback layer) ----

function getScraper(site) {
  switch (site) {
    case 'amex':
      return typeof AmexScraper !== 'undefined' ? AmexScraper : null;
    case 'chase':
      return typeof ChaseScraper !== 'undefined' ? ChaseScraper : null;
    case 'citi':
      return typeof CitiScraper !== 'undefined' ? CitiScraper : null;
    case 'capital-one':
      return typeof CapitalOneScraper !== 'undefined' ? CapitalOneScraper : null;
    case 'discover':
      return typeof DiscoverScraper !== 'undefined' ? DiscoverScraper : null;
    case 'bofa':
      return typeof BofAScraper !== 'undefined' ? BofAScraper : null;
    case 'usbank':
      return typeof USBankScraper !== 'undefined' ? USBankScraper : null;
    case 'rakuten':
      return typeof RakutenScraper !== 'undefined' ? RakutenScraper : null;
    case 'capital-one-shopping':
      return typeof CapitalOneShoppingScraper !== 'undefined' ? CapitalOneShoppingScraper : null;
    default:
      return null;
  }
}

// ---- Interceptor Lookup (primary layer) ----

function getInterceptor(site) {
  if (typeof ExtractorConfig === 'undefined' || !ExtractorConfig.isInterceptorEnabled(site)) {
    return null;
  }

  switch (site) {
    case 'amex':
      return typeof AmexInterceptor !== 'undefined' ? AmexInterceptor : null;
    case 'chase':
      return typeof ChaseInterceptor !== 'undefined' ? ChaseInterceptor : null;
    case 'citi':
      return typeof CitiInterceptor !== 'undefined' ? CitiInterceptor : null;
    case 'capital-one':
      return typeof CapitalOneInterceptor !== 'undefined' ? CapitalOneInterceptor : null;
    case 'discover':
      return typeof DiscoverInterceptor !== 'undefined' ? DiscoverInterceptor : null;
    case 'bofa':
      return typeof BofAInterceptor !== 'undefined' ? BofAInterceptor : null;
    case 'usbank':
      return typeof USBankInterceptor !== 'undefined' ? USBankInterceptor : null;
    default:
      return null;
  }
}

// ---- Interceptor Data Cache ----
// Populated as API responses arrive via postMessage bridge.
const interceptorCache = {};

// Listen for messages from main world (interceptor bridge)
if (typeof BaseInterceptor !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = BaseInterceptor.parseMessageFromMainWorld(event);
    if (!msg) return;

    debug.log(`[RMX-Orchestrator] Received ${msg.action} from ${msg.portal}`, msg.meta);

    if (msg.action === 'api_response' && msg.payload) {
      const interceptor = getInterceptor(msg.portal);
      if (interceptor && typeof interceptor.parseOffers === 'function') {
        try {
          const offers = interceptor.parseOffers(msg.payload, msg.meta);
          if (offers && offers.length > 0) {
            debug.log(`[RMX-Orchestrator] Parsed ${offers.length} offers from ${msg.portal} API`);
            interceptorCache[msg.portal] = {
              offers,
              meta: msg.meta,
              timestamp: Date.now(),
              ready: true
            };
          }
        } catch (err) {
          debug.warn(`[RMX-Orchestrator] Failed to parse ${msg.portal} API response:`, err);
        }
      }
    }

    if (msg.action === 'activation_result') {
      debug.log(`[RMX-Orchestrator] Activation result for ${msg.portal}:`, msg.payload);
    }
  });
}

/**
 * Wait for interceptor data with timeout.
 * Returns cached data or null.
 */
function waitForInterceptorData(portal, timeout) {
  return new Promise(resolve => {
    if (interceptorCache[portal] && interceptorCache[portal].ready) {
      resolve(interceptorCache[portal]);
      return;
    }

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (interceptorCache[portal] && interceptorCache[portal].ready) {
        clearInterval(checkInterval);
        resolve(interceptorCache[portal]);
        return;
      }
      if (Date.now() - startTime >= timeout) {
        clearInterval(checkInterval);
        resolve(null);
      }
    }, 200);
  });
}

// ---- Hybrid Extraction ----

/**
 * Try interceptor first, fall back to scraper.
 * Returns { offers, added, totalFound, method }
 */
async function hybridExtract(site) {
  const interceptor = getInterceptor(site);
  const scraper = getScraper(site);
  const timeout = (typeof ExtractorConfig !== 'undefined') ? ExtractorConfig.interceptorTimeout : 12000;

  // Try interceptor if available
  if (interceptor) {
    debug.log(`[RMX-Orchestrator] Trying interceptor for ${site} (timeout: ${timeout}ms)`);

    try {
      if (typeof interceptor.init === 'function') {
        await interceptor.init();
      }

      const cached = await waitForInterceptorData(site, timeout);

      if (cached && cached.offers && cached.offers.length > 0) {
        // Validate data quality — accept if enough offers or quality is good
        const qualityOk = typeof BaseInterceptor !== 'undefined'
          ? cached.offers.every(o => BaseInterceptor.assessDataQuality(o))
          : true;

        if (qualityOk || cached.offers.length >= 5) {
          debug.log(`[RMX-Orchestrator] Interceptor success for ${site}: ${cached.offers.length} offers`);

          if (typeof InterceptorHealth !== 'undefined') {
            await InterceptorHealth.recordSuccess(site, cached.offers.length);
          }

          let added = 0;
          if (typeof interceptor.activateAll === 'function') {
            added = await interceptor.activateAll(cached.offers);
          }

          return {
            offers: cached.offers,
            added,
            totalFound: cached.offers.length,
            method: 'interceptor'
          };
        } else {
          debug.warn(`[RMX-Orchestrator] Interceptor data quality too low for ${site}, falling back`);
        }
      } else {
        debug.warn(`[RMX-Orchestrator] No interceptor data for ${site} within timeout`);
      }
    } catch (err) {
      debug.error(`[RMX-Orchestrator] Interceptor error for ${site}:`, err);
    }

    // Record fallback
    if (typeof InterceptorHealth !== 'undefined') {
      await InterceptorHealth.recordFallback(site, 'no_data_or_quality_fail');
    }
  }

  // Fallback to DOM scraper
  if (scraper) {
    debug.log(`[RMX-Orchestrator] Using DOM scraper for ${site}`);
    const result = await scraper.scrape();
    return { ...result, method: 'scraper' };
  }

  return { offers: [], added: 0, totalFound: 0, method: 'none' };
}

// ---- Handle Scrape Request ----

async function handleScrapeRequest(sendResponse) {
  const site = detectSite();

  if (!site) {
    sendResponse({ error: 'unsupported_tab' });
    return;
  }

  const scraper = getScraper(site);
  const interceptor = getInterceptor(site);

  if (!scraper && !interceptor) {
    sendResponse({ error: 'scraper_not_loaded', site });
    return;
  }

  try {
    // Check if we need to navigate to offers page
    if (scraper && scraper.needsNavigation && scraper.needsNavigation()) {
      const offersUrl = scraper.getOffersUrl();
      if (offersUrl) {
        localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify({
          site,
          status: 'pending',
          timestamp: Date.now()
        }));
        window.location.href = offersUrl;
        sendResponse({ site, redirecting: true });
        return;
      }
    }

    // Run hybrid extraction
    debug.log('[RMX-Orchestrator] Starting hybrid extraction for', site);
    const result = await hybridExtract(site);
    debug.log(`[RMX-Orchestrator] Extraction complete via ${result.method}:`, result.offers?.length, 'offers');

    const response = {
      site,
      offers: result.offers || [],
      added: result.added || 0,
      totalFound: result.totalFound || result.offers?.length || 0,
      method: result.method
    };

    sendResponse(response);
    debug.log('[RMX-Orchestrator] Response sent to popup');
  } catch (err) {
    debug.error('[RMX-Orchestrator] Extraction failed:', err);
    sendResponse({ error: err?.message || 'scrape_failed', site });
  }
}

// ---- Auto-Sync ----

async function autoSyncIfPending() {
  const pendingStr = localStorage.getItem(AUTO_SYNC_KEY);
  if (!pendingStr) return;

  try {
    const pending = JSON.parse(pendingStr);
    if (pending.status !== 'pending') return;

    const currentSite = detectSite();
    if (currentSite !== pending.site) return;

    const scraper = getScraper(currentSite);
    if (!scraper) return;

    if (scraper.needsNavigation && scraper.needsNavigation()) return;

    localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify({
      ...pending,
      status: 'running'
    }));

    debug.log('[RMX-Orchestrator] Auto-sync starting for', currentSite);

    const result = await hybridExtract(currentSite);

    if (result.offers && result.offers.length > 0) {
      await mergeAndStoreOffers(result.offers, currentSite);
    }

    debug.log(`[RMX-Orchestrator] Auto-sync complete via ${result.method}:`, result.offers?.length, 'offers');
  } catch (err) {
    debug.warn('[RMX-Orchestrator] Auto-sync failed:', err);
  } finally {
    localStorage.removeItem(AUTO_SYNC_KEY);
  }
}

// ---- Merge & Store ----

function mergeAndStoreOffers(newOffers, source) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rmx_offers'], (result) => {
      const existing = result.rmx_offers || [];

      const mergedMap = new Map();
      existing.forEach(offer => {
        const key = `${offer.source}-${offer.merchant}`.toLowerCase();
        mergedMap.set(key, offer);
      });

      newOffers.forEach(offer => {
        const key = `${source}-${offer.merchant}`.toLowerCase();
        mergedMap.set(key, {
          ...offer,
          source,
          id: offer.id || `rmx_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`,
          optedInAt: offer.optedInAt || new Date().toISOString(),
          status: 'active'
        });
      });

      const merged = Array.from(mergedMap.values());
      chrome.storage.local.set({ rmx_offers: merged }, () => resolve(merged));
    });
  });
}

// ---- Message Listener ----

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape_offers') {
    handleScrapeRequest(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (request.action === 'get_site_info') {
    const site = detectSite();
    const scraper = getScraper(site);
    const interceptor = getInterceptor(site);
    sendResponse({
      site,
      scraperLoaded: !!scraper,
      interceptorLoaded: !!interceptor,
      url: window.location.href
    });
    return false;
  }

  if (request.action === 'check_portal') {
    if (typeof CapitalOneScraper !== 'undefined' && CapitalOneScraper.checkCurrentSite) {
      CapitalOneScraper.checkCurrentSite().then(result => {
        sendResponse(result);
      });
      return true;
    }
    sendResponse({ available: false });
    return false;
  }
});

// ---- Pending Sync from Popup ----

async function checkPendingSyncFromPopup() {
  try {
    const result = await chrome.storage.local.get(['rmx_pending_sync']);
    if (!result.rmx_pending_sync) return;

    const { source, timestamp } = result.rmx_pending_sync;
    const currentSite = detectSite();

    if (currentSite === source) {
      debug.log('[RMX-Orchestrator] Found pending sync from popup for', source);
      await chrome.storage.local.remove('rmx_pending_sync');

      setTimeout(async () => {
        const scraper = getScraper(currentSite);
        const interceptor = getInterceptor(currentSite);
        if (!scraper && !interceptor) return;

        debug.log('[RMX-Orchestrator] Auto-syncing after navigation...');

        chrome.runtime.sendMessage({
          action: 'start_sync',
          portal: currentSite
        }).catch(() => {});

        try {
          const syncResult = await hybridExtract(currentSite);
          if (syncResult.offers && syncResult.offers.length > 0) {
            await mergeAndStoreOffers(syncResult.offers, currentSite);
            debug.log(`[RMX-Orchestrator] Auto-sync complete via ${syncResult.method}:`, syncResult.offers.length, 'offers saved');

            chrome.runtime.sendMessage({
              action: 'complete_sync',
              portal: currentSite,
              offersCount: syncResult.offers.length
            }).catch(() => {});
          } else {
            chrome.runtime.sendMessage({
              action: 'complete_sync',
              portal: currentSite,
              offersCount: 0
            }).catch(() => {});
          }
        } catch (err) {
          debug.error('[RMX-Orchestrator] Auto-sync failed:', err);
          chrome.runtime.sendMessage({
            action: 'sync_error',
            portal: currentSite,
            error: err.message
          }).catch(() => {});
        }
      }, 2000);
    }
  } catch (err) {
    debug.error('[RMX-Orchestrator] Error checking pending sync:', err);
  }
}

// ---- Initialize Interceptor on Page Load ----

(function initInterceptor() {
  const site = detectSite();
  if (!site) return;

  const interceptor = getInterceptor(site);
  if (interceptor && typeof interceptor.inject === 'function') {
    debug.log(`[RMX-Orchestrator] Injecting interceptor for ${site}`);
    try {
      interceptor.inject();
    } catch (err) {
      debug.warn(`[RMX-Orchestrator] Failed to inject interceptor for ${site}:`, err);
    }
  }
})();

// ---- Startup ----

autoSyncIfPending();
checkPendingSyncFromPopup();

chrome.runtime.sendMessage({
  action: 'content_script_ready',
  site: detectSite(),
  url: window.location.href
});
