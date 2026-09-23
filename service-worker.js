// Background Service Worker
// Handles notifications, badge updates, and cross-tab communication

// Import shared utilities. The worker must not depend on in-memory-only helpers
// for offer identity because it can be suspended and restarted at any time.
importScripts('lib/debug.js', 'lib/offer-utils.js');

debug.log('[Reward Maximizer] Service worker started');

function safeChromeCall(api, method, args, label) {
  try {
    const result = api[method](...args);
    if (result && typeof result.catch === 'function') {
      result.catch(error => debug.warn(`[RMX-SW] ${label || method} failed:`, error));
    }
  } catch (error) {
    debug.warn(`[RMX-SW] ${label || method} failed:`, error);
  }
}

function storageGet(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(keys, result => {
        if (chrome.runtime?.lastError) {
          debug.error('[RMX-SW] Storage get failed:', chrome.runtime.lastError.message);
          resolve({});
          return;
        }
        resolve(result || {});
      });
    } catch (error) {
      debug.error('[RMX-SW] Storage get exception:', error);
      resolve({});
    }
  });
}

function storageSet(items) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime?.lastError) {
          debug.error('[RMX-SW] Storage set failed:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      debug.error('[RMX-SW] Storage set exception:', error);
      resolve(false);
    }
  });
}

function storageRemove(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime?.lastError) {
          debug.error('[RMX-SW] Storage remove failed:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      debug.error('[RMX-SW] Storage remove exception:', error);
      resolve(false);
    }
  });
}

// Initialize badge
safeChromeCall(chrome.action, 'setBadgeBackgroundColor', [{ color: '#2563eb' }], 'initial badge setup');

// Sync progress tracking
const SYNC_PROGRESS_KEY = 'rmx_sync_progress';
const SYNC_PROGRESS_CLEAR_ALARM = 'rmx_clear_sync_progress';
const merchantBadgeChecks = new Map();

function emptySyncProgress() {
  return {
    isRunning: false,
    currentPortal: null,
    completed: [],
    remaining: [],
    totalOffers: 0,
    errors: []
  };
}

function normalizeSyncProgress(value) {
  const defaults = emptySyncProgress();
  if (!value || typeof value !== 'object') return defaults;
  const completed = Array.isArray(value.completed)
    ? [...new Set(value.completed.filter(p => typeof p === 'string'))]
    : [];
  return {
    isRunning: value.isRunning === true,
    currentPortal: typeof value.currentPortal === 'string' ? value.currentPortal : null,
    completed,
    remaining: Array.isArray(value.remaining)
      ? [...new Set(value.remaining.filter(p => typeof p === 'string' && !completed.includes(p)))]
      : [],
    totalOffers: Number.isFinite(value.totalOffers) && value.totalOffers >= 0 ? value.totalOffers : 0,
    errors: Array.isArray(value.errors) ? value.errors : defaults.errors
  };
}

let syncProgress = emptySyncProgress();

async function hydrateSyncProgress() {
  const result = await storageGet([SYNC_PROGRESS_KEY]);
  if (result[SYNC_PROGRESS_KEY]) {
    syncProgress = normalizeSyncProgress(result[SYNC_PROGRESS_KEY]);
  } else {
    // Storage cleanup can happen while this worker remains alive. Do not keep
    // a completed/stale in-memory queue after the durable state is gone.
    syncProgress = emptySyncProgress();
  }
  return syncProgress;
}

async function persistSyncProgress() {
  await storageSet({ [SYNC_PROGRESS_KEY]: syncProgress });
}

// Listen for content script ready messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') return false;

  if (message.action === 'content_script_ready') {
    debug.log('[RMX-SW] Content script ready on:', message.site, message.url);
    handleContentScriptReady(message, sender.tab);
    return false;
  }

  // Relay interceptor data from iframe content script to top frame
  if (message.action === 'relay_interceptor_data') {
    const offers = OfferUtils.filterValidOffers(message.offers);
    debug.log('[RMX-SW] Relaying interceptor data from iframe:', message.portal, offers.length, 'offers');
    if (typeof message.portal === 'string' && offers.length > 0 &&
        sender.tab && sender.tab.id !== undefined) {
      safeChromeCall(chrome.tabs, 'sendMessage', [sender.tab.id, {
        action: 'interceptor_data_from_iframe',
        portal: message.portal,
        offers,
        meta: message.meta
      }, { frameId: 0 }], 'iframe relay');
    }
    return false;
  }

  if (message.action === 'update_badge') {
    updateBadge(message.count, sender.tab?.id);
    return false;
  }

  if (message.action === 'get_offers') {
    respondAsync(getOffersFromStorage().then(offers => ({ offers })), sendResponse, { offers: [] });
    return true;
  }

  if (message.action === 'save_offers') {
    respondAsync(
      saveOffersToStorage(message.offers, message.source, sender.tab?.id),
      sendResponse,
      { added: 0, updated: 0, total: 0, error: 'save_failed' }
    );
    return true;
  }

  if (message.action === 'check_stacking') {
    respondAsync(checkStackingOpportunities(message.merchant), sendResponse, {
      merchant: message.merchant || '', cardOffers: [], stackingOffers: [], canStack: false
    });
    return true;
  }

  // Sync progress management
  if (message.action === 'start_sync') {
    respondAsync(startSyncProgress(message.portal, message.portals).then(() => ({ success: true })), sendResponse, {
      success: false, error: 'sync_start_failed'
    });
    return true;
  }

  if (message.action === 'complete_sync') {
    respondAsync(completeSyncProgress(message.portal, message.offersCount).then(() => ({ success: true })), sendResponse, {
      success: false, error: 'sync_complete_failed'
    });
    return true;
  }

  if (message.action === 'sync_error') {
    respondAsync(recordSyncError(message.portal, message.error).then(() => ({ success: true })), sendResponse, {
      success: false, error: 'sync_error_record_failed'
    });
    return true;
  }

  if (message.action === 'get_sync_progress') {
    respondAsync(hydrateSyncProgress().then(progress => ({ progress })), sendResponse, {
      progress: emptySyncProgress()
    });
    return true;
  }

  // Batch opt-in progress — let it propagate to popup, no action needed here
  if (message.action === 'batch_progress') {
    return false;
  }

  return false;
});

function respondAsync(promise, sendResponse, fallback) {
  Promise.resolve(promise)
    .then(result => sendResponseSafely(sendResponse, result))
    .catch(error => {
      debug.error('[RMX-SW] Message handler failed:', error);
      sendResponseSafely(sendResponse, fallback);
    });
}

function sendResponseSafely(sendResponse, payload) {
  if (typeof sendResponse !== 'function') return;
  try {
    sendResponse(payload);
  } catch (error) {
    // The popup/content-script port may have closed before async work ended.
    debug.warn('[RMX-SW] Response port closed:', error);
  }
}

// Handle content script initialization
async function handleContentScriptReady(message, tab) {
  if (!tab || tab.id === undefined) return;

  // Check if this site has available offers
  const site = message.site;
  if (site) {
    // Show badge indicating this site is supported
    safeChromeCall(chrome.action, 'setBadgeText', [{ text: '✓', tabId: tab.id }], 'supported-site badge');
    safeChromeCall(chrome.action, 'setBadgeBackgroundColor', [{ color: '#059669', tabId: tab.id }], 'supported-site badge color');
  }
}

// Update badge with offer count
function updateBadge(count, tabId) {
  const details = {
    text: Number(count) > 0 ? String(count) : ''
  };
  if (tabId !== undefined) details.tabId = tabId;
  safeChromeCall(chrome.action, 'setBadgeText', [details], 'offer badge');
}

// Get offers from storage
async function getOffersFromStorage() {
  const result = await storageGet(['rmx_offers']);
  return OfferUtils.normalizeOfferRecords(result.rmx_offers);
}

// Save offers to storage
async function saveOffersToStorage(newOffers, source, tabId) {
  const normalizedSource = OfferUtils.normalizeSource(source);
  if (!Array.isArray(newOffers) || !normalizedSource) {
    debug.warn('[RMX-SW] Refusing invalid offer batch or source:', source);
    return { added: 0, updated: 0, total: 0, error: 'invalid_offers' };
  }

  const result = await storageGet(['rmx_offers']);
  const existing = OfferUtils.normalizeOfferRecords(result.rmx_offers);
  const existingMap = new Map();

  existing.forEach(offer => {
    const key = OfferUtils.getOfferKey(offer.source, offer.merchant);
    if (key) existingMap.set(key, offer);
  });

  const validOffers = OfferUtils.filterValidOffers(newOffers);
  if (validOffers.length !== newOffers.length) {
    debug.warn('[RMX-SW] Dropped', newOffers.length - validOffers.length,
      'offers with missing merchant from', normalizedSource);
  }

  let added = 0;
  let updated = 0;

  validOffers.forEach(offer => {
    const key = OfferUtils.getOfferKey(normalizedSource, offer.merchant);
    const offerWithMeta = {
      ...offer,
      source: normalizedSource,
      id: offer.id || generateId(),
      optedInAt: offer.optedInAt || new Date().toISOString(),
      status: 'active'
    };

    if (existingMap.has(key)) {
      existingMap.set(key, { ...existingMap.get(key), ...offerWithMeta });
      updated++;
    } else {
      existingMap.set(key, offerWithMeta);
      added++;
    }
  });

  const merged = Array.from(existingMap.values());
  if (!await storageSet({ rmx_offers: merged })) {
    return { added: 0, updated: 0, total: 0, error: 'storage_write_failed' };
  }
  updateBadge(merged.length, tabId);
  return { added, updated, total: merged.length };
}

// Check for stacking opportunities
async function checkStackingOpportunities(merchant) {
  const offers = await getOffersFromStorage();
  const merchantLower = OfferUtils.normalizeMerchant(merchant);
  if (!merchantLower) {
    return { merchant: merchant || '', cardOffers: [], stackingOffers: [], canStack: false };
  }

  const matchingOffers = offers.filter(o => {
    const offerMerchant = OfferUtils.normalizeMerchant(o.merchant);
    return offerMerchant.includes(merchantLower) || merchantLower.includes(offerMerchant);
  });

  const cardOffers = matchingOffers.filter(o =>
    !['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
  );

  const stackingOffers = matchingOffers.filter(o =>
    ['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
  );

  return {
    merchant,
    cardOffers,
    stackingOffers,
    canStack: cardOffers.length > 0 && stackingOffers.length > 0
  };
}

// Generate unique ID
function generateId() {
  return 'rmx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    debug.log('[RMX-SW] Extension installed - showing welcome page');

    // Initialize default settings
    storageSet({
      rmx_settings: {
        notifications: true,
        autoOptIn: true,
        showStackingAlerts: true,
        defaultView: 'byMerchant'
      },
      rmx_offers: [],
      rmx_user_cards: [], // Individual card IDs; populated from Settings
      rmx_selected_portals: [], // Portal IDs; populated during onboarding
      rmx_point_values: {},
      rmx_onboarding_complete: false
    });

    // Show welcome page
    safeChromeCall(chrome.tabs, 'create', [{
      url: chrome.runtime.getURL('onboarding/welcome.html')
    }], 'welcome tab');
  } else if (details.reason === 'update') {
    debug.log('[RMX-SW] Extension updated to', chrome.runtime.getManifest().version);

    // Check if user needs to see onboarding
    storageGet(['rmx_onboarding_complete']).then(result => {
      if (!result.rmx_onboarding_complete) {
        // User upgraded from old version without onboarding
        safeChromeCall(chrome.tabs, 'create', [{
          url: chrome.runtime.getURL('onboarding/welcome.html')
        }], 'upgrade welcome tab');
      }
    });
  }
});

// Listen for tab updates to show portal reminders
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    merchantBadgeChecks.set(tabId, (merchantBadgeChecks.get(tabId) || 0) + 1);
  }

  if (changeInfo.status !== 'complete' || !tab.url) return;

  const checkId = (merchantBadgeChecks.get(tabId) || 0) + 1;
  merchantBadgeChecks.set(tabId, checkId);

  // Check if we should show a Capital One portal reminder
  // This would check if the current site has CO portal cashback available
  const url = new URL(tab.url);
  const host = url.hostname.replace('www.', '').toLowerCase();

  // Skip if already on a portal site
  if (
    host.includes('rakuten.com') ||
    host.includes('capitaloneshopping.com') ||
    host.includes('americanexpress.com') ||
    host.includes('chase.com') ||
    host.includes('citi.com') ||
    host.includes('discover.com') ||
    host.includes('bankofamerica.com') ||
    host.includes('usbank.com') ||
    host.includes('capitalone.com')
  ) {
    safeChromeCall(chrome.action, 'setBadgeText', [{ text: '', tabId }], 'portal badge clear');
    return;
  }

  // Check if we have offers for this merchant
  checkMerchantOffers(host, tabId, checkId).catch(error => {
    debug.error('[RMX-SW] Merchant badge check failed:', error);
  });
});

// Check if we have offers for a merchant
async function checkMerchantOffers(hostname, tabId, checkId) {
  const offers = await getOffersFromStorage();
  if (checkId !== undefined && merchantBadgeChecks.get(tabId) !== checkId) return;

  // Same merchant-name extraction as merchant-banner.js: for subdomains like
  // shop.lululemon.com use the second-to-last part ("lululemon")
  const parts = hostname.replace(/^www\./, '').split('.');
  const merchantName = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
  const normalizedSite = merchantName.replace(/[^a-z0-9]/g, '');

  const matchingOffers = offers.filter(o => {
    const offerMerchant = OfferUtils.normalizeMerchant(o.merchant);
    const normalizedOffer = offerMerchant.replace(/[^a-z0-9]/g, '');

    // Exact match after normalization (always allowed)
    if (normalizedOffer === normalizedSite) return true;

    // Substring matching only when both sides are 3+ chars (mirrors banner,
    // avoids false positives like "x" matching "Expedia")
    if (normalizedSite.length >= 3 && normalizedOffer.length >= 3) {
      return offerMerchant.includes(merchantName) || merchantName.includes(offerMerchant);
    }
    return false;
  });

  if (matchingOffers.length > 0) {
    // Show badge indicator
    safeChromeCall(chrome.action, 'setBadgeText', [{ text: matchingOffers.length.toString(), tabId }], 'merchant badge');
    safeChromeCall(chrome.action, 'setBadgeBackgroundColor', [{ color: '#059669', tabId }], 'merchant badge color');
  } else {
    // Clear stale tab-specific badges when navigating away from a matching merchant.
    safeChromeCall(chrome.action, 'setBadgeText', [{ text: '', tabId }], 'merchant badge clear');
  }
}



// Sync progress management functions
async function startSyncProgress(portal, requestedPortals = []) {
  await hydrateSyncProgress();
  const normalizedPortal = typeof portal === 'string' ? portal : '';
  const portals = Array.isArray(requestedPortals)
    ? [...new Set(requestedPortals.filter(p => typeof p === 'string' && p))]
    : [];
  if (!normalizedPortal) return;

  debug.log('[RMX-SW] Starting sync for:', portal);

  // A non-running stored state is a completed run, not a live queue. Start a
  // fresh one for a standalone portal sync. Sync All pre-populates storage with
  // its queue before sending this message.
  if (!syncProgress.isRunning) {
    syncProgress = emptySyncProgress();
    syncProgress.remaining = portals.length > 0 ? portals : [normalizedPortal];
  } else if (portals.length > 0 && syncProgress.completed.length === 0 &&
             syncProgress.remaining.length === 0) {
    syncProgress.remaining = portals;
  }

  syncProgress.isRunning = true;
  syncProgress.currentPortal = normalizedPortal;

  if (!syncProgress.completed.includes(normalizedPortal)) {
    syncProgress.remaining = syncProgress.remaining.filter(p => p !== normalizedPortal);
  }

  // Update badge to show progress
  updateSyncBadge();

  // Save to storage so popup can read it
  await persistSyncProgress();
}

async function completeSyncProgress(portal, offersCount = 0) {
  await hydrateSyncProgress();
  if (typeof portal !== 'string' || !portal) return;
  debug.log('[RMX-SW] Completed sync for:', portal, 'Offers:', offersCount);

  if (!syncProgress.completed.includes(portal)) {
    syncProgress.completed.push(portal);
    const numericOffers = Number(offersCount);
    if (Number.isFinite(numericOffers) && numericOffers > 0) {
      syncProgress.totalOffers += numericOffers;
    }
  }
  syncProgress.remaining = syncProgress.remaining.filter(p => p !== portal);
  syncProgress.currentPortal = null;

  // Check if all syncs complete
  if (syncProgress.remaining.length === 0 && syncProgress.isRunning) {
    await finishAllSyncs();
  } else {
    updateSyncBadge();
    await persistSyncProgress();
  }
}

async function recordSyncError(portal, error) {
  await hydrateSyncProgress();
  if (typeof portal !== 'string' || !portal) return;
  debug.error('[RMX-SW] Sync error for:', portal, error);

  if (!syncProgress.errors.some(item => item.portal === portal && item.error === error)) {
    syncProgress.errors.push({ portal, error, timestamp: Date.now() });
  }

  if (!syncProgress.completed.includes(portal)) {
    syncProgress.completed.push(portal); // Mark as "done" even if error
  }
  syncProgress.remaining = syncProgress.remaining.filter(p => p !== portal);
  syncProgress.currentPortal = null;

  // Check if all syncs complete
  if (syncProgress.remaining.length === 0 && syncProgress.isRunning) {
    await finishAllSyncs();
  } else {
    updateSyncBadge();
    await persistSyncProgress();
  }
}

function updateSyncBadge() {
  const total = syncProgress.completed.length + syncProgress.remaining.length;
  const completed = syncProgress.completed.length;

  if (syncProgress.isRunning && total > 0) {
    safeChromeCall(chrome.action, 'setBadgeText', [{ text: `${completed}/${total}` }], 'sync progress badge');
    safeChromeCall(chrome.action, 'setBadgeBackgroundColor', [{ color: '#2563eb' }], 'sync progress badge color');
  }
}

async function finishAllSyncs() {
  debug.log('[RMX-SW] All syncs complete!');

  syncProgress.isRunning = false;

  // Show completion notification
  const successCount = syncProgress.completed.length - syncProgress.errors.length;
  const message = syncProgress.errors.length > 0
    ? `Synced ${successCount}/${syncProgress.completed.length} portals. ${syncProgress.totalOffers} total offers.`
    : `Successfully synced ${syncProgress.totalOffers} offers from ${syncProgress.completed.length} portals!`;

  safeChromeCall(chrome.notifications, 'create', [{
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: 'Sync Complete! 🎉',
    message: message,
    priority: 1
  }], 'sync completion notification');

  // Reset badge to show total offers
  getOffersFromStorage().then(offers => {
    safeChromeCall(chrome.action, 'setBadgeText', [{ text: offers.length > 0 ? offers.length.toString() : '' }], 'final offer badge');
    safeChromeCall(chrome.action, 'setBadgeBackgroundColor', [{ color: '#059669' }], 'final offer badge color');
  }).catch(error => debug.error('[RMX-SW] Final badge update failed:', error));

  // Save final state
  await persistSyncProgress();

  // Service workers can be suspended between events; alarms are the durable
  // MV3 mechanism for deferred cleanup.
  safeChromeCall(chrome.alarms, 'create', [SYNC_PROGRESS_CLEAR_ALARM, { delayInMinutes: 0.5 }], 'sync progress cleanup alarm');
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== SYNC_PROGRESS_CLEAR_ALARM) return;
    syncProgress = emptySyncProgress();
    storageRemove(SYNC_PROGRESS_KEY).catch(error => {
      debug.error('[RMX-SW] Sync progress cleanup failed:', error);
    });
  });
}
