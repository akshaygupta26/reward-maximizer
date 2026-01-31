// Background Service Worker
// Handles notifications, badge updates, and cross-tab communication

// Import debug utility
importScripts('../lib/debug.js');

debug.log('[Reward Maximizer] Service worker started');

// Initialize badge
chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });

// Sync progress tracking
let syncProgress = {
  isRunning: false,
  currentPortal: null,
  completed: [],
  remaining: [],
  totalOffers: 0,
  errors: []
};

// Listen for content script ready messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'content_script_ready') {
    debug.log('[RMX-SW] Content script ready on:', message.site, message.url);
    handleContentScriptReady(message, sender.tab);
    return false;
  }

  if (message.action === 'update_badge') {
    updateBadge(message.count);
    return false;
  }

  if (message.action === 'get_offers') {
    getOffersFromStorage().then(offers => {
      sendResponse({ offers });
    });
    return true;
  }

  if (message.action === 'save_offers') {
    saveOffersToStorage(message.offers, message.source).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'check_stacking') {
    checkStackingOpportunities(message.merchant).then(result => {
      sendResponse(result);
    });
    return true;
  }

  // Sync progress management
  if (message.action === 'start_sync') {
    startSyncProgress(message.portal);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'complete_sync') {
    completeSyncProgress(message.portal, message.offersCount);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'sync_error') {
    recordSyncError(message.portal, message.error);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'get_sync_progress') {
    sendResponse({ progress: syncProgress });
    return false;
  }
});

// Handle content script initialization
async function handleContentScriptReady(message, tab) {
  if (!tab) return;

  // Check if this site has available offers
  const site = message.site;
  if (site) {
    // Show badge indicating this site is supported
    chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#059669', tabId: tab.id });
  }
}

// Update badge with offer count
function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Get offers from storage
async function getOffersFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rmx_offers'], (result) => {
      resolve(result.rmx_offers || []);
    });
  });
}

// Save offers to storage
async function saveOffersToStorage(newOffers, source) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rmx_offers'], (result) => {
      const existing = result.rmx_offers || [];
      const existingMap = new Map();

      existing.forEach(o => {
        const key = `${o.source}-${o.merchant}`.toLowerCase();
        existingMap.set(key, o);
      });

      let added = 0;
      let updated = 0;

      newOffers.forEach(offer => {
        const key = `${source}-${offer.merchant}`.toLowerCase();
        const offerWithMeta = {
          ...offer,
          source,
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

      chrome.storage.local.set({ rmx_offers: merged }, () => {
        updateBadge(merged.length);
        resolve({ added, updated, total: merged.length });
      });
    });
  });
}

// Check for stacking opportunities
async function checkStackingOpportunities(merchant) {
  const offers = await getOffersFromStorage();
  const merchantLower = merchant.toLowerCase();

  const matchingOffers = offers.filter(o =>
    o.merchant.toLowerCase().includes(merchantLower) ||
    merchantLower.includes(o.merchant.toLowerCase())
  );

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
    chrome.storage.local.set({
      rmx_settings: {
        notifications: true,
        autoOptIn: true,
        showStackingAlerts: true,
        defaultView: 'byMerchant'
      },
      rmx_offers: [],
      rmx_user_cards: [], // Will be populated during onboarding
      rmx_point_values: {},
      rmx_onboarding_complete: false
    });

    // Show welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/welcome.html')
    });
  } else if (details.reason === 'update') {
    debug.log('[RMX-SW] Extension updated to', chrome.runtime.getManifest().version);

    // Check if user needs to see onboarding
    chrome.storage.local.get(['rmx_onboarding_complete'], (result) => {
      if (!result.rmx_onboarding_complete) {
        // User upgraded from old version without onboarding
        chrome.tabs.create({
          url: chrome.runtime.getURL('onboarding/welcome.html')
        });
      }
    });
  }
});

// Listen for tab updates to show portal reminders
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

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
    return;
  }

  // Check if we have offers for this merchant
  checkMerchantOffers(host, tabId);
});

// Check if we have offers for a merchant
async function checkMerchantOffers(hostname, tabId) {
  const offers = await getOffersFromStorage();
  const merchantName = hostname.split('.')[0];

  const matchingOffers = offers.filter(o => {
    const offerMerchant = o.merchant.toLowerCase();
    return offerMerchant.includes(merchantName) || merchantName.includes(offerMerchant);
  });

  if (matchingOffers.length > 0) {
    // Show badge indicator
    chrome.action.setBadgeText({ text: matchingOffers.length.toString(), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#059669', tabId });
  }
}

// Alarm for periodic offer refresh (optional future feature)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh_offers') {
    debug.log('[RMX-SW] Periodic refresh triggered');
    // Could trigger background sync here in future
  }
});

// Sync progress management functions
function startSyncProgress(portal) {
  debug.log('[RMX-SW] Starting sync for:', portal);

  syncProgress.isRunning = true;
  syncProgress.currentPortal = portal;

  if (!syncProgress.completed.includes(portal)) {
    syncProgress.remaining = syncProgress.remaining.filter(p => p !== portal);
  }

  // Update badge to show progress
  updateSyncBadge();

  // Save to storage so popup can read it
  chrome.storage.local.set({ rmx_sync_progress: syncProgress });
}

function completeSyncProgress(portal, offersCount = 0) {
  debug.log('[RMX-SW] Completed sync for:', portal, 'Offers:', offersCount);

  if (!syncProgress.completed.includes(portal)) {
    syncProgress.completed.push(portal);
  }
  syncProgress.remaining = syncProgress.remaining.filter(p => p !== portal);
  syncProgress.totalOffers += offersCount;
  syncProgress.currentPortal = null;

  // Check if all syncs complete
  if (syncProgress.remaining.length === 0 && syncProgress.isRunning) {
    finishAllSyncs();
  } else {
    updateSyncBadge();
    chrome.storage.local.set({ rmx_sync_progress: syncProgress });
  }
}

function recordSyncError(portal, error) {
  debug.error('[RMX-SW] Sync error for:', portal, error);

  syncProgress.errors.push({ portal, error, timestamp: Date.now() });

  if (!syncProgress.completed.includes(portal)) {
    syncProgress.completed.push(portal); // Mark as "done" even if error
  }
  syncProgress.remaining = syncProgress.remaining.filter(p => p !== portal);
  syncProgress.currentPortal = null;

  // Check if all syncs complete
  if (syncProgress.remaining.length === 0 && syncProgress.isRunning) {
    finishAllSyncs();
  } else {
    updateSyncBadge();
    chrome.storage.local.set({ rmx_sync_progress: syncProgress });
  }
}

function updateSyncBadge() {
  const total = syncProgress.completed.length + syncProgress.remaining.length;
  const completed = syncProgress.completed.length;

  if (syncProgress.isRunning && total > 0) {
    chrome.action.setBadgeText({ text: `${completed}/${total}` });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  }
}

function finishAllSyncs() {
  debug.log('[RMX-SW] All syncs complete!');

  syncProgress.isRunning = false;

  // Show completion notification
  const successCount = syncProgress.completed.length - syncProgress.errors.length;
  const message = syncProgress.errors.length > 0
    ? `Synced ${successCount}/${syncProgress.completed.length} portals. ${syncProgress.totalOffers} total offers.`
    : `Successfully synced ${syncProgress.totalOffers} offers from ${syncProgress.completed.length} portals!`;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: '../icons/icon128.png',
    title: 'Sync Complete! 🎉',
    message: message,
    priority: 1
  });

  // Reset badge to show total offers
  getOffersFromStorage().then(offers => {
    chrome.action.setBadgeText({ text: offers.length > 0 ? offers.length.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#059669' });
  });

  // Save final state
  chrome.storage.local.set({ rmx_sync_progress: syncProgress });

  // Clear after 30 seconds
  setTimeout(() => {
    syncProgress = {
      isRunning: false,
      currentPortal: null,
      completed: [],
      remaining: [],
      totalOffers: 0,
      errors: []
    };
    chrome.storage.local.remove('rmx_sync_progress');
  }, 30000);
}
