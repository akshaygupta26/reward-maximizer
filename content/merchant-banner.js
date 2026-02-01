// Merchant Banner - Shows non-intrusive banner on merchant websites with active offers
// This content script runs on ALL websites to detect if we have offers for the current merchant

debug.log('[RMX-Banner] Script loaded on', window.location.hostname);

// State
let bannerElement = null;
let currentOffers = [];
let isDismissed = false;

// Initialize banner on page load
async function init() {
  // Don't show banner on credit card portal sites
  const hostname = window.location.hostname.toLowerCase();
  const portalSites = [
    'americanexpress.com',
    'chase.com',
    'citi.com',
    'citibank.com',
    'capitalone.com',
    'capitaloneshopping.com',
    'discover.com',
    'bankofamerica.com',
    'bofa.com',
    'usbank.com',
    'rakuten.com'
  ];

  if (portalSites.some(site => hostname.includes(site))) {
    debug.log('[RMX-Banner] Skipping portal site');
    return;
  }

  // Check if we have offers for this merchant
  await checkForOffers();
}

// Check if we have offers for the current merchant
async function checkForOffers() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get_offers' });
    const allOffers = response.offers || [];

    if (allOffers.length === 0) {
      debug.log('[RMX-Banner] No offers in storage');
      return;
    }

    // Extract merchant name from hostname
    const hostname = window.location.hostname.replace('www.', '').toLowerCase();
    const merchantName = hostname.split('.')[0];

    debug.log('[RMX-Banner] Checking for offers matching:', merchantName);

    // Find matching offers
    currentOffers = allOffers.filter(offer => {
      const offerMerchant = offer.merchant.toLowerCase();
      const match = offerMerchant.includes(merchantName) ||
                    merchantName.includes(offerMerchant) ||
                    offerMerchant.replace(/[^a-z0-9]/g, '') === merchantName.replace(/[^a-z0-9]/g, '');

      if (match) {
        debug.log('[RMX-Banner] Match found:', offer.merchant, '|', offer.value, '|', offer.source);
      }
      return match;
    });

    if (currentOffers.length > 0) {
      debug.log('[RMX-Banner] Found', currentOffers.length, 'offers for this merchant');
      showBanner();

      // Notify background to update badge
      chrome.runtime.sendMessage({
        action: 'update_badge',
        count: currentOffers.length
      });
    } else {
      debug.log('[RMX-Banner] No matching offers found');
    }
  } catch (error) {
    debug.error('[RMX-Banner] Error checking offers:', error);
  }
}

// Show the banner
function showBanner() {
  if (isDismissed || bannerElement) {
    return; // Already dismissed or already showing
  }

  // Sort offers by value (card offers first, then stacking partners)
  const cardOffers = currentOffers.filter(o =>
    !['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
  );
  const stackingOffers = currentOffers.filter(o =>
    ['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
  );

  const bestCardOffer = cardOffers.length > 0 ? cardOffers[0] : null;
  const bestStackingOffer = stackingOffers.length > 0 ? stackingOffers[0] : null;

  // Create banner HTML
  bannerElement = document.createElement('div');
  bannerElement.id = 'rmx-merchant-banner';
  bannerElement.innerHTML = createBannerHTML(bestCardOffer, bestStackingOffer);

  // Add to page
  document.body.appendChild(bannerElement);

  // Add event listeners
  const closeBtn = bannerElement.querySelector('#rmx-banner-close');
  const detailsBtn = bannerElement.querySelector('#rmx-banner-details');

  if (closeBtn) {
    closeBtn.addEventListener('click', dismissBanner);
  }

  if (detailsBtn) {
    detailsBtn.addEventListener('click', openPopup);
  }

  // Slide in animation
  setTimeout(() => {
    bannerElement.classList.add('rmx-visible');
  }, 300);

  debug.log('[RMX-Banner] Banner displayed');
}

// Create banner HTML
function createBannerHTML(cardOffer, stackingOffer) {
  const sourceName = getSourceDisplayName(cardOffer?.source);
  const cardName = getCardName(cardOffer?.source);

  let mainMessage = '';
  if (cardOffer) {
    mainMessage = `Use your <strong>${sourceName}</strong> card for <strong>${cardOffer.value}</strong>`;
  }

  let stackingMessage = '';
  if (stackingOffer) {
    const stackingName = getSourceDisplayName(stackingOffer.source);
    stackingMessage = `<div class="rmx-stacking">💡 Stack with ${stackingName} for ${stackingOffer.value} extra cashback</div>`;
    if (stackingOffer.source === 'rakuten') {
      stackingMessage += `<div class="rmx-referral">Don't have Rakuten? <a href="${RAKUTEN_REFERRAL_URL}" target="_blank" rel="noopener">Sign up free →</a><br><span class="rmx-referral-disc">${REFERRAL_DISCLOSURE}</span></div>`;
    }
  }

  return `
    <div class="rmx-banner-content">
      <div class="rmx-banner-icon">💳</div>
      <div class="rmx-banner-text">
        <div class="rmx-banner-title">${mainMessage}</div>
        ${stackingMessage}
      </div>
      <div class="rmx-banner-actions">
        <button id="rmx-banner-details" class="rmx-banner-btn rmx-banner-btn-primary">Details</button>
        <button id="rmx-banner-close" class="rmx-banner-btn rmx-banner-btn-close">×</button>
      </div>
    </div>
  `;
}

// Get display name for source
function getSourceDisplayName(source) {
  const names = {
    'amex': 'American Express',
    'chase': 'Chase',
    'citi': 'Citi',
    'capital-one': 'Capital One',
    'discover': 'Discover',
    'bofa': 'Bank of America',
    'usbank': 'US Bank',
    'rakuten': 'Rakuten',
    'capital-one-shopping': 'Capital One Shopping',
    'topcashback': 'TopCashback'
  };
  return names[source] || source;
}

// Get card name for source
function getCardName(source) {
  const cards = {
    'amex': 'Amex card',
    'chase': 'Chase card',
    'citi': 'Citi card',
    'capital-one': 'Capital One card',
    'discover': 'Discover card',
    'bofa': 'BofA card',
    'usbank': 'US Bank card'
  };
  return cards[source] || 'your card';
}

// Dismiss banner
function dismissBanner() {
  if (bannerElement) {
    bannerElement.classList.remove('rmx-visible');
    setTimeout(() => {
      bannerElement.remove();
      bannerElement = null;
    }, 300);
    isDismissed = true;
  }
}

// Open extension popup
function openPopup() {
  // Can't programmatically open popup, but we can show a helpful tooltip
  const detailsBtn = bannerElement.querySelector('#rmx-banner-details');
  if (detailsBtn) {
    const originalText = detailsBtn.textContent;

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'rmx-tooltip';
    tooltip.innerHTML = '👆 Click the Reward Maximizer extension icon to see all offer details';
    bannerElement.appendChild(tooltip);

    // Pulse the button
    detailsBtn.classList.add('rmx-pulse');

    // Remove tooltip and pulse after 4 seconds
    setTimeout(() => {
      tooltip.remove();
      detailsBtn.classList.remove('rmx-pulse');
    }, 4000);
  }
}

// Add CSS styles
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #rmx-merchant-banner {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      max-width: 400px;
      opacity: 0;
      transform: translateX(420px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(10px);
    }

    #rmx-merchant-banner.rmx-visible {
      opacity: 1;
      transform: translateX(0);
    }

    .rmx-banner-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .rmx-banner-icon {
      font-size: 24px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .rmx-banner-text {
      flex: 1;
      min-width: 0;
    }

    .rmx-banner-title {
      font-size: 15px;
      line-height: 1.4;
      margin-bottom: 4px;
    }

    .rmx-banner-title strong {
      font-weight: 600;
      color: #fbbf24;
    }

    .rmx-stacking {
      font-size: 13px;
      opacity: 0.9;
      margin-top: 4px;
      padding-left: 12px;
      border-left: 2px solid rgba(255, 255, 255, 0.3);
    }

    .rmx-referral {
      font-size: 12px;
      opacity: 0.85;
      margin-top: 6px;
      padding-left: 12px;
      border-left: 2px solid rgba(255, 255, 255, 0.3);
    }

    .rmx-referral a {
      color: #fbbf24;
      text-decoration: underline;
    }

    .rmx-referral-disc {
      font-size: 10px;
      opacity: 0.7;
    }

    .rmx-banner-actions {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      flex-shrink: 0;
    }

    .rmx-banner-btn {
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 6px;
      transition: all 0.2s ease;
      font-family: inherit;
    }

    .rmx-banner-btn-primary {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      backdrop-filter: blur(10px);
    }

    .rmx-banner-btn-primary:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    .rmx-banner-btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .rmx-banner-btn-close {
      background: rgba(255, 255, 255, 0.15);
      color: white;
      width: 28px;
      height: 28px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      line-height: 1;
    }

    .rmx-banner-btn-close:hover {
      background: rgba(255, 255, 255, 0.25);
    }

    /* Tooltip */
    .rmx-tooltip {
      position: absolute;
      bottom: -50px;
      right: 0;
      background: #1f2937;
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: rmx-tooltip-slide-in 0.3s ease;
      z-index: 10;
    }

    .rmx-tooltip::before {
      content: '';
      position: absolute;
      top: -6px;
      right: 20px;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 6px solid #1f2937;
    }

    @keyframes rmx-tooltip-slide-in {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Pulse animation */
    .rmx-pulse {
      animation: rmx-pulse 1.5s ease infinite;
    }

    @keyframes rmx-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
      }
      50% {
        box-shadow: 0 0 0 8px rgba(255, 255, 255, 0);
      }
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      #rmx-merchant-banner {
        top: 10px;
        right: 10px;
        left: 10px;
        max-width: none;
        transform: translateY(-100px);
      }

      #rmx-merchant-banner.rmx-visible {
        transform: translateY(0);
      }

      .rmx-banner-content {
        flex-direction: column;
        gap: 8px;
      }

      .rmx-banner-actions {
        width: 100%;
      }

      .rmx-banner-btn-primary {
        flex: 1;
      }

      .rmx-tooltip {
        bottom: -60px;
        left: 0;
        right: 0;
        white-space: normal;
        text-align: center;
      }

      .rmx-tooltip::before {
        right: 50%;
        transform: translateX(50%);
      }
    }
  `;
  document.head.appendChild(style);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    init();
  });
} else {
  injectStyles();
  init();
}

// Re-check offers when navigating within SPA
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    isDismissed = false;
    if (bannerElement) {
      dismissBanner();
    }
    setTimeout(() => {
      init();
    }, 1000);
  }
}).observe(document, { subtree: true, childList: true });
