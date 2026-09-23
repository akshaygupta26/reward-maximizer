// Batch Opt-In Engine
// Shared utility for fast sequential offer activation with progress reporting
// Uses MutationObserver-based DOM stabilization instead of fixed timeouts

const BatchOptIn = {
  isRunning: false,

  /**
   * Fast sequential opt-in with MutationObserver-based waiting
   * @param {Object} config
   * @param {Function} config.findButtons - Returns array of clickable buttons
   * @param {Function} config.isAlreadyAdded - Checks if button is already activated
   * @param {Function} config.getMerchantName - Extracts merchant name from button/card
   * @param {number} config.minDelay - Minimum ms between clicks (default: 250)
   * @param {number} config.maxDelay - Maximum ms for DOM stabilization timeout (default: 2000)
   * @param {string} config.source - Source name for progress reporting ('amex'/'chase')
   * @param {boolean} config.scrollToButton - Whether to scroll button into view (default: false)
   * @returns {Promise<{added: number, failed: number, skipped: number, total: number}>}
   */
  async run(config) {
    const {
      findButtons,
      isAlreadyAdded,
      getMerchantName = () => 'Unknown',
      minDelay = 250,
      maxDelay = 2000,
      source = 'unknown',
      scrollToButton = false
    } = config;

    this.isRunning = true;
    let added = 0;
    let failed = 0;
    let skipped = 0;

    // Get initial count of all activatable buttons
    const allButtons = findButtons();
    const total = allButtons.length;

    debug.log(`[RMX-Batch] Starting batch opt-in for ${source}: ${total} buttons found`);

    // Report initial state
    this.reportProgress({ source, current: 0, total, merchant: '', phase: 'starting' });

    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    while (this.isRunning) {
      // Re-query buttons each iteration (DOM changes after clicks)
      const currentButtons = findButtons();

      // Find next clickable button
      let targetButton = null;
      let merchantName = '';

      for (const btn of currentButtons) {
        if (!isAlreadyAdded(btn)) {
          targetButton = btn;
          merchantName = getMerchantName(btn);
          break;
        }
      }

      // No more buttons to click
      if (!targetButton) {
        debug.log('[RMX-Batch] No more clickable buttons found');
        break;
      }

      // Safety: abort if too many consecutive failures
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        debug.warn(`[RMX-Batch] ${MAX_CONSECUTIVE_FAILURES} consecutive failures, stopping`);
        break;
      }

      try {
        // Optionally scroll into view (without smooth scroll for speed)
        if (scrollToButton) {
          targetButton.scrollIntoView({ behavior: 'instant', block: 'center' });
        }

        // Click the button
        targetButton.click();

        // Wait for DOM to stabilize using MutationObserver
        await this.waitForDOMStabilization(targetButton, maxDelay);

        // Enforce minimum delay between clicks
        await this.wait(minDelay);

        added++;
        consecutiveFailures = 0;

        // Report progress
        this.reportProgress({
          source,
          current: added + failed + skipped,
          total,
          merchant: merchantName,
          phase: 'clicking'
        });

      } catch (err) {
        debug.warn(`[RMX-Batch] Failed to click button for ${merchantName}:`, err.message);
        failed++;
        consecutiveFailures++;

        // Small delay before retry
        await this.wait(500);
      }
    }

    const result = { added, failed, skipped, total };
    debug.log('[RMX-Batch] Batch complete:', JSON.stringify(result));

    // Report completion
    this.reportProgress({
      source,
      current: total,
      total,
      merchant: '',
      phase: 'complete',
      result
    });

    this.isRunning = false;
    return result;
  },

  /**
   * Wait for DOM to stabilize after a button click.
   * Uses MutationObserver to detect when changes stop.
   * Falls back to timeout if no mutations detected.
   */
  waitForDOMStabilization(element, maxWait) {
    if (typeof maxWait === 'undefined') maxWait = 2000;

    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      let observer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (observer) observer.disconnect();
        if (timer) clearTimeout(timer);
        resolve();
      };

      // Watch for DOM changes near the clicked element
      const observeTarget = element.closest('[class*="Row"], [class*="tile"], [class*="card"], [class*="offer"]')
        || element.parentElement
        || document.body;

      observer = new MutationObserver(() => {
        // Reset the "settled" timer each time a mutation happens
        if (timer) clearTimeout(timer);
        // Consider DOM stable after 150ms of no mutations
        timer = setTimeout(finish, 150);
      });

      observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'disabled', 'aria-label', 'data-testid']
      });

      // Start initial timer — if no mutations at all, resolve after 300ms
      timer = setTimeout(finish, 300);

      // Hard timeout: never wait longer than maxWait
      setTimeout(finish, maxWait);
    });
  },

  /**
   * Report progress to popup and service worker
   */
  reportProgress(data) {
    try {
      const result = chrome.runtime.sendMessage({
        action: 'batch_progress',
        ...data
      });
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (e) {
      // Popup might be closed, that's fine
    }
  },

  /**
   * Stop the batch process (called from popup via message)
   */
  stop() {
    debug.log('[RMX-Batch] Stopping batch opt-in');
    this.isRunning = false;
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

if (typeof window !== 'undefined') {
  window.BatchOptIn = BatchOptIn;
}
