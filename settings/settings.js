// Settings Page JavaScript

document.addEventListener('DOMContentLoaded', async () => {
  // State
  let settings = {};
  let userCards = [];
  let customPointValues = {};

  // Elements
  const cardGrid = document.getElementById('cardGrid');
  const valuationList = document.getElementById('valuationList');
  const dataStats = document.getElementById('dataStats');

  // Initialize
  await loadSettings();
  renderCards();
  renderValuations();
  renderStats();
  setupEventListeners();

  // Load settings from storage
  async function loadSettings() {
    settings = await Storage.getSettings();
    userCards = await Storage.getUserCards();
    customPointValues = await Storage.getPointValues();

    // Apply settings to UI
    document.getElementById('autoOptIn').checked = settings.autoOptIn !== false;
    document.getElementById('showStackingAlerts').checked = settings.showStackingAlerts !== false;
    document.getElementById('defaultView').value = settings.defaultView || 'merchant';
  }

  // Render card selection grid
  function renderCards() {
    const programs = CARD_PROGRAMS;

    cardGrid.innerHTML = Object.entries(programs).map(([key, program]) => `
      <div class="card-item" data-program="${key}">
        <div class="card-item-header">
          <div class="card-item-logo" style="background: ${program.color}">
            ${program.shortName.substring(0, 2)}
          </div>
          <div class="card-item-info">
            <h3>${program.name}</h3>
            <p>${program.cards.length} cards</p>
          </div>
        </div>
        <div class="card-item-cards">
          ${program.cards.map(card => `
            <span class="card-chip ${userCards.includes(card.id) ? 'selected' : ''}"
                  data-card-id="${card.id}">
              ${card.name}
            </span>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Card chip click handlers
    cardGrid.querySelectorAll('.card-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardId = chip.dataset.cardId;

        if (userCards.includes(cardId)) {
          userCards = userCards.filter(c => c !== cardId);
          chip.classList.remove('selected');
        } else {
          userCards.push(cardId);
          chip.classList.add('selected');
        }

        Storage.setUserCards(userCards);
        showToast('Cards updated');
      });
    });
  }

  // Render point valuations
  function renderValuations() {
    // Group by program
    const grouped = {};

    Object.entries(DEFAULT_POINT_VALUES).forEach(([key, defaultValue]) => {
      const parts = key.split('-');
      const program = parts.slice(0, -1).join('-') || key;

      if (!grouped[program]) {
        grouped[program] = [];
      }

      // Only show if user has selected this card
      grouped[program].push({
        id: key,
        name: formatCardName(key),
        defaultValue,
        customValue: customPointValues[key]
      });
    });

    valuationList.innerHTML = Object.entries(grouped)
      .filter(([program]) => {
        // Show all programs or only ones user has cards from
        return true;
      })
      .map(([program, cards]) => `
        <div class="valuation-group">
          <h3 style="font-size: 14px; color: #64748b; margin-bottom: 12px; text-transform: uppercase;">
            ${formatProgramName(program)}
          </h3>
          ${cards.map(card => `
            <div class="valuation-item">
              <div>
                <label>${card.name}</label>
                <span>Default: ${card.defaultValue}cpp</span>
              </div>
              <div class="valuation-input">
                <input type="number"
                       step="0.01"
                       min="0"
                       max="10"
                       value="${card.customValue ?? card.defaultValue}"
                       data-card-id="${card.id}"
                       data-default="${card.defaultValue}">
                <span class="unit">cpp</span>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('');

    // Valuation input handlers
    valuationList.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', async () => {
        const cardId = input.dataset.cardId;
        const defaultValue = parseFloat(input.dataset.default);
        const newValue = parseFloat(input.value);

        if (newValue !== defaultValue) {
          customPointValues[cardId] = newValue;
        } else {
          delete customPointValues[cardId];
        }

        await Storage.setPointValues(customPointValues);
        showToast('Valuation updated');
      });
    });
  }

  // Render data stats
  async function renderStats() {
    const offers = await Storage.getOffers();
    const syncHistory = await Storage.getSyncHistory();

    const bySource = {};
    offers.forEach(o => {
      bySource[o.source] = (bySource[o.source] || 0) + 1;
    });

    const lastSync = Object.values(syncHistory).sort().pop();
    const lastSyncText = lastSync
      ? new Date(lastSync).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
      : 'Never';

    dataStats.innerHTML = `
      <div class="stat-item">
        <div class="stat-value">${offers.length}</div>
        <div class="stat-label">Total Offers</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${Object.keys(bySource).length}</div>
        <div class="stat-label">Card Programs</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${userCards.length}</div>
        <div class="stat-label">My Cards</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" style="font-size: 14px;">${lastSyncText}</div>
        <div class="stat-label">Last Sync</div>
      </div>
    `;
  }

  // Setup event listeners
  function setupEventListeners() {
    // Preferences
    document.getElementById('autoOptIn').addEventListener('change', async (e) => {
      settings.autoOptIn = e.target.checked;
      await Storage.setSettings(settings);
      showToast('Settings saved');
    });

    document.getElementById('showStackingAlerts').addEventListener('change', async (e) => {
      settings.showStackingAlerts = e.target.checked;
      await Storage.setSettings(settings);
      showToast('Settings saved');
    });

    document.getElementById('defaultView').addEventListener('change', async (e) => {
      settings.defaultView = e.target.value;
      await Storage.setSettings(settings);
      showToast('Settings saved');
    });

    // Reset valuations
    document.getElementById('resetValuations').addEventListener('click', async () => {
      if (confirm('Reset all point valuations to defaults?')) {
        customPointValues = {};
        await Storage.setPointValues({});
        renderValuations();
        showToast('Valuations reset to defaults');
      }
    });

    // Export backup
    document.getElementById('exportBackup').addEventListener('click', async () => {
      await ExportUtils.exportBackup(Storage);
      showToast('Backup exported');
    });

    // Import backup
    document.getElementById('importBackup').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        await ExportUtils.importBackup(file, Storage);
        showToast('Backup imported successfully', 'success');
        // Reload page to show imported data
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        showToast(err.message, 'error');
      }

      e.target.value = '';
    });

    // Clear data
    document.getElementById('clearData').addEventListener('click', async () => {
      if (confirm('This will delete all your synced offers and settings. Are you sure?')) {
        await Storage.clearAllData();
        showToast('All data cleared', 'success');
        setTimeout(() => location.reload(), 1000);
      }
    });
  }

  // Helpers
  function formatCardName(id) {
    const names = {
      'chase-ur-csr': 'Sapphire Reserve',
      'chase-ur-csp': 'Sapphire Preferred',
      'chase-ur-cfu': 'Freedom Unlimited',
      'chase-ur-cff': 'Freedom Flex',
      'amex-mr-platinum': 'Platinum',
      'amex-mr-gold': 'Gold',
      'amex-mr-green': 'Green',
      'amex-mr-bce': 'Blue Cash Everyday',
      'amex-mr-bcp': 'Blue Cash Preferred',
      'citi-ty-premier': 'Premier',
      'citi-double-cash': 'Double Cash',
      'capital-one-venture': 'Venture',
      'capital-one-savor': 'Savor',
      'capital-one-quicksilver': 'Quicksilver',
      'discover-it': 'Discover it',
      'bofa-premium-rewards': 'Premium Rewards',
      'usbank-altitude-reserve': 'Altitude Reserve',
      'rakuten': 'Rakuten',
      'capital-one-shopping': 'Capital One Shopping'
    };

    return names[id] || id.split('-').map(w =>
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
  }

  function formatProgramName(program) {
    const names = {
      'chase-ur': 'Chase Ultimate Rewards',
      'amex-mr': 'Amex Membership Rewards',
      'citi-ty': 'Citi ThankYou',
      'capital-one': 'Capital One',
      'discover': 'Discover',
      'bofa': 'Bank of America',
      'usbank': 'US Bank',
      'rakuten': 'Cashback Portals',
      'capital-one-shopping': 'Cashback Portals'
    };

    return names[program] || program;
  }

  function showToast(message, type = '') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }
});
