// Popup JavaScript - Main Controller

debug.log('[RMX-Popup] ========================================');
debug.log('[RMX-Popup] Popup script loading...');
debug.log('[RMX-Popup] ========================================');

document.addEventListener('DOMContentLoaded', async () => {
  debug.log('[RMX-Popup] DOM Content Loaded');
  debug.log('[RMX-Popup] Storage available:', typeof Storage !== 'undefined');
  debug.log('[RMX-Popup] ExportUtils available:', typeof ExportUtils !== 'undefined');

  // State
  let offers = [];
  let filteredOffers = [];
  let currentView = 'merchant';
  let currentFilter = 'all';
  let searchQuery = '';
  let customPointValues = {};

  // Elements
  const offersContainer = document.getElementById('offersContainer');
  const emptyState = document.getElementById('emptyState');
  const statusBar = document.getElementById('statusBar');
  const statusText = document.getElementById('statusText');
  const offerCount = document.getElementById('offerCount');
  const searchInput = document.getElementById('searchInput');
  const filterChips = document.getElementById('filterChips');
  const exportBtn = document.getElementById('exportBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const viewToggle = document.querySelector('.view-toggle');

  // Initialize
  debug.log('[RMX-Popup] Starting initialization...');
  await loadData();
  debug.log('[RMX-Popup] Initializing user cards...');
  await initializeUserCards();
  debug.log('[RMX-Popup] Setting up event listeners...');
  setupEventListeners();

  // Listen for batch opt-in progress from content scripts
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'batch_progress') {
      const { source, current, total, merchant, phase, result } = message;

      if (phase === 'starting') {
        updateStatus(`Activating ${total} ${formatSource(source)} offers...`, 'success');
      } else if (phase === 'discovering') {
        updateStatus(`${formatSource(source)}: Discovering activation API...`, 'success');
      } else if (phase === 'activating') {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        updateStatus(
          `${formatSource(source)}: ${current}/${total} activated via API (${pct}%)${merchant ? ' \u2014 ' + merchant : ''}`,
          'success'
        );
      } else if (phase === 'fallback') {
        updateStatus(`${formatSource(source)}: Using fallback mode...`, 'success');
      } else if (phase === 'clicking') {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        updateStatus(
          `${formatSource(source)}: ${current}/${total} activated (${pct}%)${merchant ? ' \u2014 ' + merchant : ''}`,
          'success'
        );
      } else if (phase === 'complete' && result) {
        const msg = result.failed > 0
          ? `${formatSource(source)}: ${result.added} activated, ${result.failed} failed`
          : `${formatSource(source)}: All ${result.added} offers activated!`;
        updateStatus(msg, result.failed > 0 ? 'warning' : 'success');
      }
    }
    return false;
  });
  debug.log('[RMX-Popup] Applying initial filters...');
  applyFilters(); // Populate filteredOffers from offers
  debug.log('[RMX-Popup] Checking for ongoing sync...');
  await checkSyncProgress();
  debug.log('[RMX-Popup] Detecting current merchant...');
  await detectCurrentMerchant();
  // Set referral/support URLs
  const emptyRakutenLink = document.getElementById('emptyRakutenLink');
  if (emptyRakutenLink) emptyRakutenLink.href = RAKUTEN_REFERRAL_URL;
  const supportBtn = document.getElementById('supportBtn');
  if (supportBtn) supportBtn.href = BMAC_URL;

  debug.log('[RMX-Popup] Rendering UI...');
  render();
  debug.log('[RMX-Popup] ✅ Initialization complete! Offers:', offers.length, 'Filtered:', filteredOffers.length);

  // Check for ongoing sync progress
  async function checkSyncProgress() {
    try {
      const result = await chrome.storage.local.get(['rmx_sync_progress']);
      const progress = result.rmx_sync_progress;
      if (progress?.isRunning) {
        const total = (progress.completed?.length || 0) + (progress.remaining?.length || 0);
        const current = progress.completed?.length || 0;

        if (progress.currentPortal) {
          updateStatus(`Syncing ${progress.currentPortal}... (${current}/${total})`, 'success');
        } else if (progress.remaining?.length > 0) {
          updateStatus(`Sync in progress... (${current}/${total} complete)`, 'success');
        }
      }
    } catch (err) {
      debug.error('[RMX-Popup] Error checking sync progress:', err);
    }
  }

  // Detect current merchant and auto-filter
  async function detectCurrentMerchant() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        debug.log('[RMX-Popup] No active tab found');
        return;
      }

      const url = new URL(tab.url);
      const hostname = url.hostname.replace('www.', '').toLowerCase();

      // Skip portal sites
      const portalSites = [
        'americanexpress.com', 'chase.com', 'citi.com', 'citibank.com',
        'capitalone.com', 'capitaloneshopping.com', 'discover.com',
        'bankofamerica.com', 'bofa.com', 'usbank.com', 'rakuten.com'
      ];

      if (portalSites.some(site => hostname.includes(site))) {
        debug.log('[RMX-Popup] On portal site, skipping auto-filter');
        return;
      }

      // Extract merchant name from hostname, handling subdomains like shop.lululemon.com
      const parts = hostname.split('.');
      const merchantName = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      debug.log('[RMX-Popup] Checking for offers matching:', merchantName);

      // Find matching offers using fuzzy matching
      const matchingOffers = offers.filter(offer => {
        const offerMerchant = offer.merchant.toLowerCase();
        const match = offerMerchant.includes(merchantName) ||
                      merchantName.includes(offerMerchant) ||
                      offerMerchant.replace(/[^a-z0-9]/g, '') === merchantName.replace(/[^a-z0-9]/g, '');
        return match;
      });

      if (matchingOffers.length > 0) {
        debug.log('[RMX-Popup] Found', matchingOffers.length, 'offers for current site');

        // Auto-populate search with merchant name
        searchQuery = matchingOffers[0].merchant.toLowerCase();
        searchInput.value = matchingOffers[0].merchant;
        searchInput.placeholder = `Showing offers for ${matchingOffers[0].merchant}`;

        // Apply filters
        applyFilters();

        // Show notification
        updateStatus(`Found ${matchingOffers.length} offer(s) for ${matchingOffers[0].merchant}`, 'success');

        // Highlight the search box briefly
        searchInput.style.background = 'rgba(99,102,241,0.15)';
        setTimeout(() => {
          searchInput.style.background = '';
        }, 2000);
      }
    } catch (err) {
      debug.error('[RMX-Popup] Error detecting current merchant:', err);
    }
  }

  // Load data from storage
  async function loadData() {
    debug.log('[RMX-Popup] ========== loadData START ==========');
    debug.log('[RMX-Popup] Calling Storage.getOffers()...');
    try {
      offers = await Storage.getOffers();
      debug.log('[RMX-Popup] ✅ Got', offers.length, 'offers from storage');
      if (offers.length > 0) {
        debug.log('[RMX-Popup] First offer:', JSON.stringify(offers[0]).substring(0, 200));
      } else {
        debug.warn('[RMX-Popup] ⚠️ No offers found in storage');
      }
      customPointValues = await Storage.getPointValues();
      updateStatus(`${offers.length} offers loaded`, 'success');
      debug.log('[RMX-Popup] ========== loadData END ==========');
    } catch (err) {
      debug.error('[RMX-Popup] ❌ ERROR in loadData:', err);
      updateStatus('Failed to load offers', 'error');
    }
  }

  // Initialize user card visibility
  async function initializeUserCards() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['rmx_user_cards'], (result) => {
        const userCards = result.rmx_user_cards || [];

        debug.log('[RMX-Popup] User cards from storage:', userCards);

        // If no cards selected, show all (backward compatibility for existing users)
        if (userCards.length === 0) {
          debug.log('[RMX-Popup] No cards selected, showing all buttons');
          resolve();
          return;
        }

        // Hide buttons for cards user doesn't have
        const allButtons = document.querySelectorAll('.sync-btn[data-source]');
        allButtons.forEach(btn => {
          const source = btn.dataset.source;
          if (!userCards.includes(source)) {
            debug.log('[RMX-Popup] Hiding button for:', source);
            btn.style.display = 'none';
          } else {
            debug.log('[RMX-Popup] Showing button for:', source);
            btn.style.display = '';
          }
        });

        resolve();
      });
    });
  }

  // Setup event listeners
  function setupEventListeners() {
    // Sync All button
    const syncAllBtn = document.getElementById('syncAllBtn');
    if (syncAllBtn) {
      syncAllBtn.addEventListener('click', syncAll);
    }

    // Individual sync buttons
    document.querySelectorAll('.sync-btn[data-source]').forEach(btn => {
      btn.addEventListener('click', () => syncSource(btn.dataset.source));
    });

    // Search
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      applyFilters();
      render();
    });

    // Filter chips
    filterChips.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-chip')) {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        applyFilters();
        render();
      }
    });

    // View toggle
    viewToggle.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        viewToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentView = e.target.dataset.view;
        render();
      }
    });

    // Export button
    exportBtn.addEventListener('click', showExportMenu);

    // Settings button
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage?.() ||
        chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
    });
  }

  // Sync all portals sequentially
  async function syncAll() {
    debug.log('[RMX-Popup] Starting Sync All...');

    // Get user's selected cards from storage
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['rmx_user_cards'], resolve);
    });

    let portals = result.rmx_user_cards || [];

    // If no cards selected, use all portals (backward compatibility)
    if (portals.length === 0) {
      portals = ['amex', 'chase', 'citi', 'capital-one', 'discover', 'bofa', 'usbank', 'rakuten', 'capital-one-shopping'];
      debug.log('[RMX-Popup] No user cards set, syncing all portals');
    } else {
      debug.log('[RMX-Popup] Syncing user-selected portals:', portals);
    }

    const syncAllBtn = document.getElementById('syncAllBtn');
    const originalText = syncAllBtn.textContent;

    try {
      syncAllBtn.disabled = true;
      syncAllBtn.textContent = 'Starting...';
      updateStatus(`Starting sync of ${portals.length} portal(s)...`, 'success');

      // Initialize progress
      await chrome.runtime.sendMessage({
        action: 'start_sync',
        portal: portals[0]
      });

      // Set remaining portals in service worker
      await chrome.storage.local.set({
        rmx_sync_progress: {
          isRunning: true,
          currentPortal: null,
          completed: [],
          remaining: portals,
          totalOffers: 0,
          errors: []
        }
      });

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Sync each portal
      for (let i = 0; i < portals.length; i++) {
        const portal = portals[i];
        debug.log(`[RMX-Popup] Syncing ${i + 1}/${portals.length}: ${portal}`);

        syncAllBtn.textContent = `Syncing ${portal}... (${i + 1}/${portals.length})`;
        updateStatus(`Syncing ${portal}... (${i + 1}/${portals.length})`, 'success');

        // Sync this portal
        await syncSource(portal);

        // Wait 2 seconds between portals (be nice to servers)
        if (i < portals.length - 1) {
          await wait(2000);
        }
      }

      // All done - service worker will show notification
      updateStatus('All syncs complete! Check notification for results.', 'success');

      // Clear sync progress
      await chrome.storage.local.remove('rmx_sync_progress');

      // Reload offers
      await loadData();
      applyFilters();
      render();

    } catch (err) {
      debug.error('[RMX-Popup] Sync All failed:', err);
      updateStatus(`Sync All failed: ${err.message}`, 'error');
    } finally {
      syncAllBtn.disabled = false;
      syncAllBtn.textContent = originalText;
      // Ensure sync progress is cleared even on error
      await chrome.storage.local.remove('rmx_sync_progress').catch(() => {});
    }
  }

  // Sync a specific source
  async function syncSource(source) {
    debug.log('[RMX-Popup] ========== SYNC STARTED ==========');
    debug.log('[RMX-Popup] Syncing source:', source);

    const btn = document.querySelector(`.sync-btn.${source}`);
    const originalText = btn.textContent;

    try {
      btn.textContent = 'Opening...';
      btn.disabled = true;
      btn.classList.add('active');
      updateStatus(`Opening ${source}...`);

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      debug.log('[RMX-Popup] Active tab:', tab?.url);

      if (!tab || !tab.url) {
        throw new Error('No active tab found');
      }

      // Define portal offers URLs
      const portalUrls = {
        'amex': 'https://global.americanexpress.com/offers/eligible',
        'chase': 'https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub',
        'citi': 'https://online.citi.com/US/ag/merchantoffers',
        'capital-one': 'https://www.capitalone.com/',
        'capital-one-shopping': 'https://www.capitaloneshopping.com/',
        'discover': 'https://card.discover.com/cardmembersvcs/deals/app/home',
        'bofa': 'https://www.bankofamerica.com/credit-cards/deals-and-offers/',
        'usbank': 'https://www.usbank.com/deals.html',
        'rakuten': 'https://www.rakuten.com/stores/all'
      };

      // Check if on the right site
      const expectedDomains = {
        'amex': 'americanexpress.com',
        'chase': 'chase.com',
        'citi': 'citi',
        'capital-one': 'capitalone.com',
        'capital-one-shopping': 'capitaloneshopping',
        'discover': 'discover.com',
        'bofa': 'bankofamerica',
        'usbank': 'usbank.com',
        'rakuten': 'rakuten.com'
      };

      // Notify service worker that sync is starting
      await chrome.runtime.sendMessage({
        action: 'start_sync',
        portal: source
      });

      // If not on the right portal, navigate there
      if (!tab.url.toLowerCase().includes(expectedDomains[source])) {
        debug.log('[RMX-Popup] Not on', source, 'portal. Navigating to:', portalUrls[source]);
        btn.textContent = 'Opening...';
        updateStatus(`Opening ${source} offers page...`, 'success');

        // Set auto-sync flag in storage so it syncs automatically when page loads
        await chrome.storage.local.set({
          'rmx_pending_sync': {
            source: source,
            timestamp: Date.now()
          }
        });

        // Navigate to the offers page
        await chrome.tabs.update(tab.id, { url: portalUrls[source] });

        // Show helpful message
        updateStatus(`Opening ${source}... Will sync automatically.`, 'success');

        // Popup can be closed - sync will continue in background
        setTimeout(() => window.close(), 800);
        return;
      }

      // Already on the right site, trigger scrape
      btn.textContent = '⏹ Stop';
      btn.disabled = false;
      btn.classList.add('syncing');

      // Track whether user requested stop
      let stopRequested = false;

      // Allow clicking to stop sync
      const stopHandler = async (e) => {
        e.stopImmediatePropagation();
        stopRequested = true;
        debug.log('[RMX-Popup] Stop sync requested for', source);
        btn.textContent = 'Stopping...';
        btn.disabled = true;
        try {
          await sendMessageToTab(tab.id, { action: 'stop_sync' });
        } catch (e) {}
        updateStatus('Sync stopped.', 'success');
      };
      btn.addEventListener('click', stopHandler, { once: true });

      // Send scrape message
      const response = await sendMessageToTab(tab.id, { action: 'scrape_offers' });

      // Remove stop handler once sync completes
      btn.removeEventListener('click', stopHandler);

      // If user stopped, don't process results further — just show what we got
      if (stopRequested) {
        if (response?.offers && response.offers.length > 0) {
          await Storage.saveOffers(response.offers, source);
          await Storage.updateSyncHistory(source);
          await loadData();
          applyFilters();
          render();
          updateStatus(`Stopped. Saved ${response.offers.length} offers found so far.`, 'success');
        }
        btn.textContent = originalText;
        btn.disabled = false;
        btn.classList.remove('active');
        return;
      }

      if (response?.error === 'sync_in_progress') {
        // Sync is already running in background — show stop button
        btn.textContent = '⏹ Stop';
        btn.disabled = false;
        btn.classList.add('syncing');
        updateStatus('Sync in progress... Click Stop to cancel.', 'success');

        await new Promise((resolve) => {
          const bgStopHandler = async (e) => {
            e.stopImmediatePropagation();
            try {
              await sendMessageToTab(tab.id, { action: 'stop_sync' });
            } catch (err) {}
            btn.textContent = originalText;
            btn.disabled = false;
            btn.classList.remove('syncing', 'active');
            updateStatus('Sync stopped.', 'success');
            resolve();
          };
          btn.addEventListener('click', bgStopHandler, { once: true });
        });
        return;
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.redirecting) {
        updateStatus('Redirecting to offers page...', 'success');
        return;
      }

      if (response?.offers && response.offers.length > 0) {
        debug.log('[RMX-Popup] ========== SYNC SUCCESS ==========');
        debug.log('[RMX-Popup] Received', response.offers.length, 'offers from scraper');
        debug.log('[RMX-Popup] Sample offer:', JSON.stringify(response.offers[0]));
        debug.log('[RMX-Popup] Source:', source);

        // Save offers
        debug.log('[RMX-Popup] Calling Storage.saveOffers...');
        const result = await Storage.saveOffers(response.offers, source);
        debug.log('[RMX-Popup] ✅ Storage.saveOffers completed. Result:', result);

        await Storage.updateSyncHistory(source);

        // Notify service worker of successful sync
        await chrome.runtime.sendMessage({
          action: 'complete_sync',
          portal: source,
          offersCount: response.offers.length
        });

        // Reload data
        debug.log('[RMX-Popup] Reloading data from storage...');
        await loadData();
        debug.log('[RMX-Popup] After reload, offers count:', offers.length);

        applyFilters();
        render();

        updateStatus(`Synced ${response.offers.length} offers (${result.added} new)`, 'success');
      } else {
        debug.log('[RMX-Popup] No offers received from scraper. Response:', response);

        // Notify service worker (0 offers but successful)
        await chrome.runtime.sendMessage({
          action: 'complete_sync',
          portal: source,
          offersCount: 0
        });

        updateStatus('No new offers found', 'success');
      }
    } catch (err) {
      debug.error('[RMX-Popup] Sync failed:', err);

      // Notify service worker of error
      await chrome.runtime.sendMessage({
        action: 'sync_error',
        portal: source,
        error: err.message
      });

      updateStatus(`Sync failed: ${err.message}`, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
      btn.classList.remove('active', 'syncing');
    }
  }

  // Send message to content script
  function sendMessageToTab(tabId, message) {
    debug.log('[RMX-Popup] Sending message to tab', tabId, ':', message);
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          debug.error('[RMX-Popup] Message error:', chrome.runtime.lastError.message);
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          debug.log('[RMX-Popup] Received response:', response);
          resolve(response);
        }
      });
    });
  }

  // Apply filters
  function applyFilters() {
    filteredOffers = offers.filter(offer => {
      // Search filter
      if (searchQuery) {
        const searchable = `${offer.merchant} ${offer.value} ${offer.source}`.toLowerCase();
        if (!searchable.includes(searchQuery)) return false;
      }

      // Category filter
      if (currentFilter !== 'all') {
        if (currentFilter === 'stackable') {
          // Check if merchant has multiple offers
          const merchantOffers = offers.filter(o =>
            o.merchant.toLowerCase() === offer.merchant.toLowerCase()
          );
          const hasCardOffer = merchantOffers.some(o =>
            !['rakuten', 'capital-one-shopping'].includes(o.source)
          );
          const hasStackPartner = merchantOffers.some(o =>
            ['rakuten', 'capital-one-shopping'].includes(o.source)
          );
          if (!(hasCardOffer && hasStackPartner)) return false;
        } else {
          const category = offer.merchantCategory ||
            Categories.detectCategory(offer.merchant);
          if (category !== currentFilter) return false;
        }
      }

      return true;
    });
  }

  // Render offers
  function render() {
    if (filteredOffers.length === 0) {
      offersContainer.innerHTML = '';
      offersContainer.appendChild(emptyState);
      offerCount.textContent = '0 offers';
      return;
    }

    emptyState.style.display = 'none';

    let grouped;
    switch (currentView) {
      case 'merchant':
        grouped = groupByMerchant(filteredOffers);
        renderMerchantView(grouped);
        break;
      case 'card':
        grouped = groupBySource(filteredOffers);
        renderCardView(grouped);
        break;
      case 'category':
        grouped = groupByCategory(filteredOffers);
        renderCategoryView(grouped);
        break;
    }

    offerCount.textContent = `${filteredOffers.length} offers`;
  }

  // Group by merchant
  function groupByMerchant(offers) {
    const groups = {};
    offers.forEach(offer => {
      const key = offer.merchant.toLowerCase();
      if (!groups[key]) {
        groups[key] = {
          merchant: offer.merchant,
          category: offer.merchantCategory || Categories.detectCategory(offer.merchant),
          offers: []
        };
      }
      groups[key].offers.push(offer);
    });
    return Object.values(groups).sort((a, b) =>
      b.offers.length - a.offers.length || a.merchant.localeCompare(b.merchant)
    );
  }

  // Group by source
  function groupBySource(offers) {
    const groups = {};
    offers.forEach(offer => {
      if (!groups[offer.source]) {
        groups[offer.source] = {
          source: offer.source,
          offers: []
        };
      }
      groups[offer.source].offers.push(offer);
    });
    return Object.values(groups).sort((a, b) => b.offers.length - a.offers.length);
  }

  // Group by category
  function groupByCategory(offers) {
    const groups = {};
    offers.forEach(offer => {
      const cat = offer.merchantCategory || Categories.detectCategory(offer.merchant);
      if (!groups[cat]) {
        groups[cat] = {
          category: cat,
          categoryInfo: Categories.getCategory(cat),
          offers: []
        };
      }
      groups[cat].offers.push(offer);
    });
    return Object.values(groups).sort((a, b) => b.offers.length - a.offers.length);
  }

  // Render merchant view
  function renderMerchantView(groups) {
    offersContainer.innerHTML = groups.map(group => {
      const sortedOffers = Valuation.sortOffersByValue(
        group.offers,
        customPointValues,
        DEFAULT_POINT_VALUES
      );

      const bestOffer = sortedOffers[0];
      const hasStacking = group.offers.some(o =>
        ['rakuten', 'capital-one-shopping'].includes(o.source)
      ) && group.offers.some(o =>
        !['rakuten', 'capital-one-shopping'].includes(o.source)
      );

      const categoryInfo = Categories.getCategory(group.category);

      return `
        <div class="merchant-card fade-in">
          <div class="merchant-header">
            <span class="merchant-name">${escapeHtml(group.merchant)}</span>
            <span class="merchant-category">${categoryInfo.name}</span>
          </div>
          <div class="merchant-offers">
            ${sortedOffers.map((offer, idx) => {
              const cardId = Valuation.getCardIdForSource(offer.source);
              const valuePerDollar = Valuation.calculateValuePerDollar(
                offer, cardId, customPointValues, DEFAULT_POINT_VALUES
              );
              const displayValue = Valuation.formatValueDisplay(valuePerDollar);

              const isStacking = ['rakuten', 'capital-one-shopping'].includes(offer.source);

              return `
                <div class="offer-row">
                  <span class="offer-source ${offer.source}">${formatSource(offer.source)}</span>
                  <span class="offer-value">${escapeHtml(offer.value)}</span>
                  <span class="offer-cpp">${displayValue}</span>
                  ${idx === 0 && sortedOffers.length > 1 ? '<span class="best-badge">BEST</span>' : ''}
                  ${isStacking ? '<span class="stacking-badge">+STACK</span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
          ${hasStacking ? `
            <div class="stacking-tip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4M12 8h.01"></path>
              </svg>
              Stack card offer with cashback portal for extra savings!
              ${group.offers.some(o => o.source === 'rakuten') ? `<br><a href="${RAKUTEN_REFERRAL_URL}" target="_blank" rel="noopener" class="stacking-referral">New to Rakuten? Sign up & earn bonus cashback →</a><br><span class="referral-disc">${REFERRAL_DISCLOSURE}</span>` : ''}
            </div>
          ` : ''}
          <div class="merchant-footer">
            <span>Expires: ${escapeHtml(sortedOffers[0].expiry || 'Check portal')}</span>
            <span>Synced: ${formatDate(sortedOffers[0].optedInAt)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render card view
  function renderCardView(groups) {
    offersContainer.innerHTML = groups.map(group => {
      const sourceInfo = getSourceInfo(group.source);

      return `
        <div class="merchant-card fade-in">
          <div class="merchant-header card-view-header">
            <span class="merchant-name">${sourceInfo.name}</span>
            <span class="merchant-category">${group.offers.length} offers</span>
          </div>
          <div class="merchant-offers">
            ${group.offers.slice(0, 10).map(offer => `
              <div class="offer-row">
                <span class="card-view-merchant">${escapeHtml(offer.merchant)}</span>
                <span class="offer-value">${escapeHtml(offer.value)}</span>
              </div>
            `).join('')}
            ${group.offers.length > 10 ? `
              <div class="offer-row overflow-text">
                +${group.offers.length - 10} more offers
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Render category view
  function renderCategoryView(groups) {
    offersContainer.innerHTML = groups.map(group => `
      <div class="merchant-card fade-in">
        <div class="merchant-header">
          <span class="merchant-name">${group.categoryInfo.name}</span>
          <span class="merchant-category">${group.offers.length} offers</span>
        </div>
        <div class="merchant-offers">
          ${group.offers.slice(0, 8).map(offer => `
            <div class="offer-row">
              <span class="offer-source ${offer.source}">${formatSource(offer.source)}</span>
              <span class="card-view-merchant">${escapeHtml(offer.merchant)}</span>
              <span class="offer-value">${escapeHtml(offer.value)}</span>
            </div>
          `).join('')}
          ${group.offers.length > 8 ? `
            <div class="offer-row overflow-text">
              +${group.offers.length - 8} more offers
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  // Show export menu
  function showExportMenu() {
    debug.log('[RMX-Popup] Export button clicked. Offers count:', offers.length, 'Filtered:', filteredOffers.length);

    const menu = document.createElement('div');
    menu.className = 'export-menu';

    menu.innerHTML = `
      <button id="exportCSV">
        Export as CSV (${filteredOffers.length} offers)
      </button>
      <button id="exportJSON">
        Export as JSON (${filteredOffers.length} offers)
      </button>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#exportCSV').addEventListener('click', () => {
      debug.log('[RMX-Popup] Exporting CSV...');
      ExportUtils.exportCSV(filteredOffers);
      menu.remove();
    });

    menu.querySelector('#exportJSON').addEventListener('click', () => {
      debug.log('[RMX-Popup] Exporting JSON...');
      ExportUtils.exportJSON(filteredOffers);
      menu.remove();
    });

    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!menu.contains(e.target) && e.target !== exportBtn) {
          menu.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }

  // Update status bar
  function updateStatus(text, type = '') {
    statusText.textContent = text;
    statusBar.className = 'status-bar' + (type ? ` ${type}` : '');
  }

  // Helper: wait for specified milliseconds
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helpers
  function formatSource(source) {
    const names = {
      'amex': 'Amex',
      'chase': 'Chase',
      'citi': 'Citi',
      'capital-one': 'CapOne',
      'discover': 'Discover',
      'bofa': 'BofA',
      'usbank': 'US Bank',
      'rakuten': 'Rakuten',
      'capital-one-shopping': 'CO Shop'
    };
    return names[source] || source;
  }

  function getSourceInfo(source) {
    const info = {
      'amex': { name: 'American Express', color: '#006FCF' },
      'chase': { name: 'Chase', color: '#117ACA' },
      'citi': { name: 'Citi', color: '#003B70' },
      'capital-one': { name: 'Capital One', color: '#D03027' },
      'discover': { name: 'Discover', color: '#FF6600' },
      'bofa': { name: 'Bank of America', color: '#012169' },
      'usbank': { name: 'US Bank', color: '#0C2340' },
      'rakuten': { name: 'Rakuten', color: '#BF0000' },
      'capital-one-shopping': { name: 'Capital One Shopping', color: '#D03027' }
    };
    return info[source] || { name: source, color: '#64748b' };
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Initial filter application
  applyFilters();
});
