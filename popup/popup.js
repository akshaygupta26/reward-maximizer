// Popup JavaScript - Main Controller

document.addEventListener('DOMContentLoaded', async () => {
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
  await loadData();
  setupEventListeners();
  render();

  // Load data from storage
  async function loadData() {
    console.log('[RMX-Popup] loadData called');
    try {
      offers = await Storage.getOffers();
      console.log('[RMX-Popup] loadData: got', offers.length, 'offers from storage');
      if (offers.length > 0) {
        console.log('[RMX-Popup] loadData: first offer:', JSON.stringify(offers[0]).substring(0, 200));
      }
      customPointValues = await Storage.getPointValues();
      updateStatus(`${offers.length} offers loaded`, 'success');
    } catch (err) {
      console.error('[RMX-Popup] Failed to load offers:', err);
      updateStatus('Failed to load offers', 'error');
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    // Sync buttons
    document.querySelectorAll('.sync-btn').forEach(btn => {
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

  // Sync a specific source
  async function syncSource(source) {
    const btn = document.querySelector(`.sync-btn.${source}`);
    const originalText = btn.textContent;

    try {
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      btn.classList.add('active');
      updateStatus(`Syncing ${source}...`);

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        throw new Error('No active tab found');
      }

      // Check if on the right site
      const expectedDomains = {
        'amex': 'americanexpress.com',
        'chase': 'chase.com',
        'citi': 'citi',
        'capital-one': 'capitalone',
        'discover': 'discover.com',
        'bofa': 'bankofamerica',
        'usbank': 'usbank.com',
        'rakuten': 'rakuten.com'
      };

      if (!tab.url.toLowerCase().includes(expectedDomains[source])) {
        updateStatus(`Please open ${source} portal first`, 'error');
        return;
      }

      // Send scrape message
      const response = await sendMessageToTab(tab.id, { action: 'scrape_offers' });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.redirecting) {
        updateStatus('Redirecting to offers page...', 'success');
        return;
      }

      if (response?.offers && response.offers.length > 0) {
        console.log('[RMX-Popup] Received', response.offers.length, 'offers from scraper');
        console.log('[RMX-Popup] Sample offer:', JSON.stringify(response.offers[0]));

        // Save offers
        console.log('[RMX-Popup] Calling Storage.saveOffers...');
        const result = await Storage.saveOffers(response.offers, source);
        console.log('[RMX-Popup] Storage.saveOffers result:', result);

        await Storage.updateSyncHistory(source);

        // Reload data
        console.log('[RMX-Popup] Reloading data from storage...');
        await loadData();
        console.log('[RMX-Popup] After reload, offers count:', offers.length);

        applyFilters();
        render();

        updateStatus(`Synced ${response.offers.length} offers (${result.added} new)`, 'success');
      } else {
        console.log('[RMX-Popup] No offers received from scraper. Response:', response);
        updateStatus('No new offers found', 'success');
      }
    } catch (err) {
      console.error('Sync failed:', err);
      updateStatus(`Sync failed: ${err.message}`, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
      btn.classList.remove('active');
    }
  }

  // Send message to content script
  function sendMessageToTab(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
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
          <div class="merchant-header" style="background: ${sourceInfo.color}15">
            <span class="merchant-name" style="color: ${sourceInfo.color}">${sourceInfo.name}</span>
            <span class="merchant-category">${group.offers.length} offers</span>
          </div>
          <div class="merchant-offers">
            ${group.offers.slice(0, 10).map(offer => `
              <div class="offer-row">
                <span class="merchant-name" style="flex: 1; font-size: 12px;">${escapeHtml(offer.merchant)}</span>
                <span class="offer-value">${escapeHtml(offer.value)}</span>
              </div>
            `).join('')}
            ${group.offers.length > 10 ? `
              <div class="offer-row" style="justify-content: center; color: #64748b;">
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
              <span style="flex: 1; margin-left: 10px; font-size: 12px;">${escapeHtml(offer.merchant)}</span>
              <span class="offer-value">${escapeHtml(offer.value)}</span>
            </div>
          `).join('')}
          ${group.offers.length > 8 ? `
            <div class="offer-row" style="justify-content: center; color: #64748b;">
              +${group.offers.length - 8} more offers
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  // Show export menu
  function showExportMenu() {
    const menu = document.createElement('div');
    menu.style.cssText = `
      position: fixed;
      bottom: 60px;
      right: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 8px 0;
      z-index: 1000;
    `;

    menu.innerHTML = `
      <button style="display: block; width: 100%; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 13px;" id="exportCSV">
        Export as CSV
      </button>
      <button style="display: block; width: 100%; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 13px;" id="exportJSON">
        Export as JSON
      </button>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#exportCSV').addEventListener('click', () => {
      ExportUtils.exportCSV(filteredOffers);
      menu.remove();
    });

    menu.querySelector('#exportJSON').addEventListener('click', () => {
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
