// Merchant Banner - Shows non-intrusive banner on merchant websites with active offers
// This content script runs on ALL websites to detect if we have offers for the current merchant

debug.log('[RMX-Banner] Script loaded on', window.location.hostname);

// State
let bannerElement = null;
let currentOffers = [];
// Per-site session dismiss: stored in sessionStorage so it survives SPA nav + page reloads
const DISMISS_KEY = 'rmx_banner_dismissed';

function isSiteDismissed() {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; }
  catch (e) { return false; }
}

function dismissSite() {
  try { sessionStorage.setItem(DISMISS_KEY, '1'); }
  catch (e) { /* private browsing may block sessionStorage */ }
}

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

    // Extract merchant name from hostname, handling subdomains like shop.lululemon.com
    const hostname = window.location.hostname.toLowerCase();
    const parts = hostname.replace(/^www\./, '').split('.');
    // Use second-to-last part (domain name) if there are 3+ parts (subdomain.domain.tld)
    // Otherwise use the first part (domain.tld)
    const merchantName = parts.length >= 3 ? parts[parts.length - 2] : parts[0];

    debug.log('[RMX-Banner] Checking for offers matching:', merchantName);

    // Find matching offers — require minimum 3 chars for substring matching
    // to avoid false positives like "x" matching "Expedia"
    const normalizedSite = merchantName.replace(/[^a-z0-9]/g, '');

    currentOffers = allOffers.filter(offer => {
      if (!offer || !offer.merchant) return false; // skip malformed offers (no merchant to match)
      const offerMerchant = offer.merchant.toLowerCase();
      const normalizedOffer = offerMerchant.replace(/[^a-z0-9]/g, '');

      // Exact match after normalization (always allowed)
      if (normalizedOffer === normalizedSite) return true;

      // Substring matching only when both sides are 3+ chars
      if (normalizedSite.length >= 3 && normalizedOffer.length >= 3) {
        if (offerMerchant.includes(merchantName) || merchantName.includes(offerMerchant)) {
          return true;
        }
      }

      return false;
    });

    if (currentOffers.length > 0) {
      debug.log('[RMX-Banner] Found', currentOffers.length, 'offers for', merchantName);
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
  if (isSiteDismissed() || bannerElement) {
    return; // Already dismissed for this site or already showing
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

// Get brand color for source
function getSourceColor(source) {
  const colors = {
    'amex': '#60a5fa',
    'chase': '#60a5fa',
    'citi': '#93c5fd',
    'capital-one': '#fca5a5',
    'discover': '#fdba74',
    'bofa': '#93c5fd',
    'usbank': '#93c5fd',
    'rakuten': '#fca5a5',
    'capital-one-shopping': '#fca5a5',
    'topcashback': '#6ee7b7'
  };
  return colors[source] || '#f8fafc';
}

// Create banner HTML
function createBannerHTML(cardOffer, stackingOffer) {
  const sourceName = getSourceDisplayName(cardOffer?.source);
  const sourceColor = getSourceColor(cardOffer?.source);

  let mainMessage = '';
  if (cardOffer) {
    mainMessage = `Use your <strong style="color:${sourceColor}">${sourceName}</strong> card for <strong style="color:#34d399">${cardOffer.value}</strong>`;
  } else if (stackingOffer) {
    // Stacking-only (e.g. Rakuten cashback with no card offer): lead with the cashback
    const onlyName = getSourceDisplayName(stackingOffer.source);
    const onlyColor = getSourceColor(stackingOffer.source);
    mainMessage = `Earn <strong style="color:#34d399">${stackingOffer.value}</strong> cashback via <strong style="color:${onlyColor}">${onlyName}</strong>`;
  }

  let stackingMessage = '';
  if (cardOffer && stackingOffer) {
    const stackingName = getSourceDisplayName(stackingOffer.source);
    const stackingColor = getSourceColor(stackingOffer.source);
    stackingMessage = `<div class="rmx-stacking">Stack with <span style="color:${stackingColor}">${stackingName}</span> for <span style="color:#34d399">${stackingOffer.value}</span> extra cashback</div>`;
  }
  // Referral prompt shows whenever a Rakuten offer is present (card offer or not)
  if (stackingOffer && stackingOffer.source === 'rakuten') {
    stackingMessage += `<div class="rmx-referral">Don't have Rakuten? <a href="${RAKUTEN_REFERRAL_URL}" target="_blank" rel="noopener">Sign up free →</a><br><span class="rmx-referral-disc">${REFERRAL_DISCLOSURE}</span></div>`;
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
        <button id="rmx-banner-close" class="rmx-banner-btn rmx-banner-btn-close">&times;</button>
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
    dismissSite();
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
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      color: #f8fafc;
      padding: 14px 18px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      max-width: 420px;
      opacity: 0;
      transform: translateX(440px);
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @supports not (backdrop-filter: blur(20px)) {
      #rmx-merchant-banner {
        background: rgba(15, 23, 42, 0.97);
      }
    }

    #rmx-merchant-banner.rmx-visible {
      opacity: 1;
      transform: translateX(0);
    }

    .rmx-banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .rmx-banner-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
      line-height: 1;
    }

    .rmx-banner-text {
      flex: 1;
      min-width: 0;
    }

    .rmx-banner-title {
      font-size: 14px;
      font-weight: 500;
      line-height: 1.4;
      color: #f8fafc;
    }

    .rmx-banner-title strong {
      font-weight: 600;
    }

    .rmx-stacking {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 3px;
      line-height: 1.4;
    }

    .rmx-stacking span {
      font-weight: 500;
    }

    .rmx-referral {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 4px;
    }

    .rmx-referral a {
      color: #8b5cf6;
      text-decoration: underline;
      text-decoration-color: rgba(139, 92, 246, 0.4);
    }

    .rmx-referral a:hover {
      color: #a78bfa;
    }

    .rmx-referral-disc {
      font-size: 10px;
      opacity: 0.6;
    }

    .rmx-banner-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    }

    .rmx-banner-btn {
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 8px;
      transition: all 0.2s ease;
      font-family: inherit;
    }

    .rmx-banner-btn-primary {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #f8fafc;
    }

    .rmx-banner-btn-primary:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .rmx-banner-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .rmx-banner-btn-close {
      background: rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      width: 28px;
      height: 28px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
      border-radius: 50%;
    }

    .rmx-banner-btn-close:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    /* Tooltip */
    .rmx-tooltip {
      position: absolute;
      bottom: -50px;
      right: 0;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 12px;
      white-space: nowrap;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
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
      border-bottom: 6px solid rgba(15, 23, 42, 0.95);
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
        box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5);
      }
      50% {
        box-shadow: 0 0 0 8px rgba(99, 102, 241, 0);
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
        flex-wrap: wrap;
        gap: 10px;
      }

      .rmx-banner-actions {
        width: 100%;
        justify-content: flex-end;
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
    // Remove old banner element but don't clear dismiss — stays dismissed for this site's session
    if (bannerElement) {
      bannerElement.remove();
      bannerElement = null;
    }
    setTimeout(() => {
      init();
    }, 1000);
  }
}).observe(document, { subtree: true, childList: true });
