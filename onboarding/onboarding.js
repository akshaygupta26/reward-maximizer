// Onboarding JavaScript
debug.log('[RMX-Onboarding] Script loaded');

document.addEventListener('DOMContentLoaded', () => {
  debug.log('[RMX-Onboarding] DOM loaded');

  const getStartedBtn = document.getElementById('getStartedBtn');
  const learnMoreBtn = document.getElementById('learnMoreBtn');

  if (!getStartedBtn) {
    debug.error('[RMX-Onboarding] Get Started button not found!');
    return;
  }

  debug.log('[RMX-Onboarding] Buttons found, setting up event listeners');

  // Get Started button handler
  getStartedBtn.addEventListener('click', async () => {
    debug.log('[RMX-Onboarding] Get Started button clicked');

    try {
      // Collect selected cards
      const checkboxes = document.querySelectorAll('.card-checkbox input[type="checkbox"]:checked');
      const selectedCards = Array.from(checkboxes).map(cb => cb.value);

      debug.log('[RMX-Onboarding] Selected cards:', selectedCards);

      // Validate at least one card is selected
      if (selectedCards.length === 0) {
        alert('Please select at least one credit card or cashback portal to continue.');
        return;
      }

      // Show loading state
      getStartedBtn.textContent = 'Saving...';
      getStartedBtn.disabled = true;

      // Mark onboarding as complete and save selected cards
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({
          rmx_onboarding_complete: true,
          rmx_user_cards: selectedCards
        }, () => {
          if (chrome.runtime.lastError) {
            debug.error('[RMX-Onboarding] Error saving:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            debug.log('[RMX-Onboarding] Saved successfully');
            resolve();
          }
        });
      });

      // Show success message
      getStartedBtn.textContent = 'Setup Complete! ✅';
      debug.log('[RMX-Onboarding] Showing success message');

      // Close this tab after a brief delay
      setTimeout(() => {
        debug.log('[RMX-Onboarding] Attempting to close tab...');
        chrome.tabs.getCurrent((tab) => {
          if (chrome.runtime.lastError) {
            debug.error('[RMX-Onboarding] Error getting current tab:', chrome.runtime.lastError);
            // Try alternative method
            window.close();
            return;
          }

          if (tab && tab.id) {
            debug.log('[RMX-Onboarding] Closing tab ID:', tab.id);
            chrome.tabs.remove(tab.id, () => {
              if (chrome.runtime.lastError) {
                debug.error('[RMX-Onboarding] Error closing tab:', chrome.runtime.lastError);
                window.close();
              } else {
                debug.log('[RMX-Onboarding] Tab closed successfully');
              }
            });
          } else {
            debug.warn('[RMX-Onboarding] No tab ID found, trying window.close()');
            window.close();
          }
        });
      }, 1500);

    } catch (err) {
      debug.error('[RMX-Onboarding] Error in Get Started handler:', err);
      alert('An error occurred. Please try again.');
      getStartedBtn.textContent = 'Get Started 🚀';
      getStartedBtn.disabled = false;
    }
  });

  // Learn More button handler
  if (learnMoreBtn) {
    learnMoreBtn.addEventListener('click', () => {
      debug.log('[RMX-Onboarding] Learn More clicked');
      chrome.tabs.create({ url: 'https://gorgeous-torte-f0c7c0.netlify.app/' });
    });
  }

  // Load previously saved cards if user returns to onboarding
  chrome.storage.local.get(['rmx_user_cards'], (result) => {
    if (chrome.runtime.lastError) {
      debug.error('[RMX-Onboarding] Error loading saved cards:', chrome.runtime.lastError);
      return;
    }

    const userCards = result.rmx_user_cards;
    if (userCards && userCards.length > 0) {
      debug.log('[RMX-Onboarding] Loading saved cards:', userCards);

      // Uncheck all first
      document.querySelectorAll('.card-checkbox input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
      });

      // Check saved cards
      userCards.forEach(card => {
        const checkbox = document.querySelector(`.card-checkbox input[value="${card}"]`);
        if (checkbox) {
          checkbox.checked = true;
          debug.log('[RMX-Onboarding] Checked:', card);
        }
      });
    } else {
      debug.log('[RMX-Onboarding] No saved cards found, using defaults');
    }
  });

  debug.log('[RMX-Onboarding] Initialization complete');
});
