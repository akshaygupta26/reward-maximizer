// Main content script coordinator
// Routes messages to appropriate scrapers based on current site

console.log('[Reward Maximizer] Content script loaded');

const AUTO_SYNC_KEY = 'rmx_auto_sync';

// Detect which site we're on
function detectSite() {
  const host = window.location.hostname.toLowerCase();

  if (host.includes('americanexpress.com')) return 'amex';
  if (host.includes('chase.com')) return 'chase';
  if (host.includes('citi.com') || host.includes('citibank.com')) return 'citi';
  if (host.includes('capitalone.com')) return 'capital-one';
  if (host.includes('discover.com')) return 'discover';
  if (host.includes('bankofamerica.com') || host.includes('bofa.com')) return 'bofa';
  if (host.includes('usbank.com')) return 'usbank';
  if (host.includes('rakuten.com')) return 'rakuten';
  if (host.includes('capitaloneshopping.com')) return 'capital-one-shopping';

  return null;
}

// Get the appropriate scraper for the current site
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

// Handle scrape request
async function handleScrapeRequest(sendResponse) {
  const site = detectSite();

  if (!site) {
    sendResponse({ error: 'unsupported_tab' });
    return;
  }

  const scraper = getScraper(site);

  if (!scraper) {
    sendResponse({ error: 'scraper_not_loaded', site });
    return;
  }

  try {
    // Check if we need to navigate to offers page
    if (scraper.needsNavigation && scraper.needsNavigation()) {
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

    // Run the scraper
    console.log('[RMX-Content] About to run scraper for', site);
    const result = await scraper.scrape();
    console.log('[RMX-Content] Scraper completed. Offers count:', result.offers?.length);
    console.log('[RMX-Content] Sending response to popup:', {
      site,
      offersCount: result.offers?.length,
      sample: result.offers?.[0]
    });

    const response = {
      site,
      offers: result.offers || [],
      added: result.added || 0,
      totalFound: result.totalFound || result.offers?.length || 0
    };

    sendResponse(response);
    console.log('[RMX-Content] ✅ Response sent to popup');
  } catch (err) {
    console.error('[Reward Maximizer] Scrape failed:', err);
    sendResponse({ error: err?.message || 'scrape_failed', site });
  }
}

// Auto-sync if pending
async function autoSyncIfPending() {
  const pendingStr = localStorage.getItem(AUTO_SYNC_KEY);
  if (!pendingStr) return;

  try {
    const pending = JSON.parse(pendingStr);
    if (pending.status !== 'pending') return;

    // Check if this is the right site
    const currentSite = detectSite();
    if (currentSite !== pending.site) return;

    const scraper = getScraper(currentSite);
    if (!scraper) return;

    // Check if we're on the offers page now
    if (scraper.needsNavigation && scraper.needsNavigation()) return;

    // Update status
    localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify({
      ...pending,
      status: 'running'
    }));

    console.log('[Reward Maximizer] Auto-sync starting for', currentSite);

    const result = await scraper.scrape();

    // Store offers
    if (result.offers && result.offers.length > 0) {
      await mergeAndStoreOffers(result.offers, currentSite);
    }

    console.log('[Reward Maximizer] Auto-sync complete:', result.offers?.length, 'offers');
  } catch (err) {
    console.warn('[Reward Maximizer] Auto-sync failed:', err);
  } finally {
    localStorage.removeItem(AUTO_SYNC_KEY);
  }
}

// Merge and store offers using Chrome storage
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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape_offers') {
    handleScrapeRequest(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (request.action === 'get_site_info') {
    const site = detectSite();
    const scraper = getScraper(site);
    sendResponse({
      site,
      scraperLoaded: !!scraper,
      url: window.location.href
    });
    return false;
  }

  if (request.action === 'check_portal') {
    // For Capital One - check if current site has portal cashback
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

// Check for pending sync from popup navigation
async function checkPendingSyncFromPopup() {
  try {
    const result = await chrome.storage.local.get(['rmx_pending_sync']);
    if (!result.rmx_pending_sync) return;

    const { source, timestamp } = result.rmx_pending_sync;
    const currentSite = detectSite();

    // Check if this is the site we were waiting for
    if (currentSite === source) {
      console.log('[RMX-Content] Found pending sync from popup for', source);

      // Clear the flag
      await chrome.storage.local.remove('rmx_pending_sync');

      // Wait a moment for page to settle
      setTimeout(async () => {
        const scraper = getScraper(currentSite);
        if (!scraper) return;

        console.log('[RMX-Content] Auto-syncing after navigation...');

        // Notify service worker sync is starting
        chrome.runtime.sendMessage({
          action: 'start_sync',
          portal: currentSite
        }).catch(() => {});

        try {
          const result = await scraper.scrape();
          if (result.offers && result.offers.length > 0) {
            await mergeAndStoreOffers(result.offers, currentSite);
            console.log('[RMX-Content] ✅ Auto-sync complete:', result.offers.length, 'offers saved');

            // Notify service worker of successful sync
            chrome.runtime.sendMessage({
              action: 'complete_sync',
              portal: currentSite,
              offersCount: result.offers.length
            }).catch(() => {});
          } else {
            // No offers but sync complete
            chrome.runtime.sendMessage({
              action: 'complete_sync',
              portal: currentSite,
              offersCount: 0
            }).catch(() => {});
          }
        } catch (err) {
          console.error('[RMX-Content] Auto-sync failed:', err);

          // Notify service worker of error
          chrome.runtime.sendMessage({
            action: 'sync_error',
            portal: currentSite,
            error: err.message
          }).catch(() => {});
        }
      }, 2000); // Wait 2 seconds for page to fully load
    }
  } catch (err) {
    console.error('[RMX-Content] Error checking pending sync:', err);
  }
}

// Run auto-sync checks on page load
autoSyncIfPending();
checkPendingSyncFromPopup();

// Notify background script that content script is ready
chrome.runtime.sendMessage({
  action: 'content_script_ready',
  site: detectSite(),
  url: window.location.href
});
