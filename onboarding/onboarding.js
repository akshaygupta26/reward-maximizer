// Onboarding Wizard — State Machine
// Manages 5-step wizard flow with slide transitions

document.addEventListener('DOMContentLoaded', () => {
  debug.log('[RMX-Onboarding] Wizard script loaded');

  // --- Referral link setup (moved from inline script to fix CSP) ---
  const rakutenLink = document.getElementById('rakutenLink');
  const bmacLink = document.getElementById('bmacLink');
  if (rakutenLink && typeof RAKUTEN_REFERRAL_URL !== 'undefined') {
    rakutenLink.href = RAKUTEN_REFERRAL_URL;
  }
  if (bmacLink && typeof BMAC_URL !== 'undefined') {
    bmacLink.href = BMAC_URL;
  }

  // --- DOM references ---
  const steps = document.querySelectorAll('.wizard-step');
  const dots = document.querySelectorAll('.wizard-dot');
  const btnBack = document.getElementById('btnBack');
  const btnContinue = document.getElementById('btnContinue');
  const messageEl = document.getElementById('wizardMessage');
  const validationMsg = document.getElementById('cardValidation');
  const cardOptions = document.querySelectorAll('.card-option:not(.disabled)');

  const TOTAL_STEPS = 5;
  let currentStep = 1;
  let isTransitioning = false;

  // --- Button labels per step ---
  const continueLabels = {
    1: 'Get Started',
    2: 'Continue',
    3: 'Continue',
    4: 'Continue',
    5: 'Start Exploring'
  };

  // --- Card option toggle behavior ---
  cardOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      // Prevent double-toggle from label-input interaction
      e.preventDefault();
      const checkbox = option.querySelector('input[type="checkbox"]');
      checkbox.checked = !checkbox.checked;
      option.classList.toggle('selected', checkbox.checked);
      // Hide validation message when user selects a card
      if (validationMsg) {
        validationMsg.classList.remove('visible');
      }
    });
  });

  // --- Show message ---
  function showMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = 'wizard-message ' + type;
    messageEl.hidden = false;
    setTimeout(() => { messageEl.hidden = true; }, 5000);
  }

  // --- Get selected cards ---
  function getSelectedCards() {
    const checked = document.querySelectorAll('.card-option:not(.disabled) input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  }

  // --- Validate step before advancing ---
  function validateStep(step) {
    if (step === 3) {
      const selected = getSelectedCards();
      if (selected.length === 0) {
        if (validationMsg) validationMsg.classList.add('visible');
        return false;
      }
    }
    return true;
  }

  // --- Update progress dots ---
  function updateDots(target) {
    dots.forEach(dot => {
      const dotStep = parseInt(dot.dataset.step, 10);
      dot.classList.remove('active', 'completed');
      if (dotStep === target) {
        dot.classList.add('active');
      } else if (dotStep < target) {
        dot.classList.add('completed');
      }
    });
  }

  // --- Update navigation buttons ---
  function updateNav(target) {
    // Back button
    if (target === 1) {
      btnBack.classList.add('hidden');
    } else {
      btnBack.classList.remove('hidden');
    }

    // Continue button label & style
    btnContinue.textContent = continueLabels[target] || 'Continue';
    btnContinue.disabled = false;

    if (target === TOTAL_STEPS) {
      btnContinue.classList.add('success');
    } else {
      btnContinue.classList.remove('success');
    }
  }

  // --- Go to step with slide transitions ---
  function goToStep(target) {
    if (target < 1 || target > TOTAL_STEPS) return;
    if (target === currentStep) return;
    if (isTransitioning) return;

    const direction = target > currentStep ? 'forward' : 'backward';
    const currentEl = document.querySelector(`.wizard-step[data-step="${currentStep}"]`);
    const targetEl = document.querySelector(`.wizard-step[data-step="${target}"]`);

    if (!currentEl || !targetEl) return;

    isTransitioning = true;

    // Set initial position of incoming step
    if (direction === 'forward') {
      targetEl.classList.add('enter-right');
      targetEl.classList.remove('exit-left', 'exit-right', 'enter-left');
    } else {
      targetEl.classList.add('enter-left');
      targetEl.classList.remove('exit-left', 'exit-right', 'enter-right');
    }

    // Make target visible for animation
    targetEl.style.position = 'absolute';
    targetEl.classList.add('active');

    // Force reflow so the initial transform state is applied
    void targetEl.offsetHeight;

    // Animate current out and target in
    requestAnimationFrame(() => {
      // Exit current
      currentEl.classList.remove('active');
      if (direction === 'forward') {
        currentEl.classList.add('exit-left');
      } else {
        currentEl.classList.add('exit-right');
      }

      // Enter target
      targetEl.classList.remove('enter-right', 'enter-left');
      targetEl.style.position = '';

      // Wait for transition to complete
      const onEnd = () => {
        currentEl.removeEventListener('transitionend', onEnd);
        currentEl.classList.remove('exit-left', 'exit-right', 'enter-right', 'enter-left');
        isTransitioning = false;
      };
      currentEl.addEventListener('transitionend', onEnd);

      // Fallback in case transitionend doesn't fire
      setTimeout(() => {
        if (isTransitioning) {
          currentEl.classList.remove('exit-left', 'exit-right', 'enter-right', 'enter-left');
          isTransitioning = false;
        }
      }, 500);
    });

    currentStep = target;
    updateDots(target);
    updateNav(target);
  }

  // --- Continue button handler ---
  btnContinue.addEventListener('click', async () => {
    if (isTransitioning) return;

    // Final step: save and close
    if (currentStep === TOTAL_STEPS) {
      await finishOnboarding();
      return;
    }

    // Validate current step
    if (!validateStep(currentStep)) return;

    goToStep(currentStep + 1);
  });

  // --- Back button handler ---
  btnBack.addEventListener('click', () => {
    if (isTransitioning) return;
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    }
  });

  // --- Finish onboarding: save data and close ---
  async function finishOnboarding() {
    const selectedCards = getSelectedCards();
    const bannerEnabled = document.getElementById('toggleBanner')?.checked ?? true;
    const autoSyncEnabled = document.getElementById('toggleAutoSync')?.checked ?? true;

    debug.log('[RMX-Onboarding] Finishing. Cards:', selectedCards, 'Banner:', bannerEnabled, 'AutoSync:', autoSyncEnabled);

    btnContinue.textContent = 'Saving...';
    btnContinue.disabled = true;

    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({
          rmx_onboarding_complete: true,
          // Portal selection has its own key; rmx_user_cards is reserved for
          // individual card IDs selected later in Settings.
          rmx_selected_portals: selectedCards,
          rmx_banner_enabled: bannerEnabled,
          rmx_auto_sync: autoSyncEnabled
        }, () => {
          if (chrome.runtime.lastError) {
            debug.error('[RMX-Onboarding] Save error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            debug.log('[RMX-Onboarding] Saved successfully');
            resolve();
          }
        });
      });

      btnContinue.textContent = 'Done!';
      debug.log('[RMX-Onboarding] Closing tab in 1s...');

      setTimeout(() => {
        window.close();
      }, 1000);

    } catch (err) {
      debug.error('[RMX-Onboarding] Error finishing:', err);
      showMessage('Something went wrong. Please try again.', 'error');
      btnContinue.textContent = continueLabels[TOTAL_STEPS];
      btnContinue.disabled = false;
    }
  }

  // --- Restore previously saved cards (if user returns to onboarding) ---
  chrome.storage.local.get([
    'rmx_selected_portals',
    'rmx_user_cards',
    'rmx_banner_enabled',
    'rmx_auto_sync'
  ], (result) => {
    if (chrome.runtime.lastError) {
      debug.error('[RMX-Onboarding] Error loading saved state:', chrome.runtime.lastError);
      return;
    }

    const savedCards = typeof OfferUtils !== 'undefined'
      ? OfferUtils.normalizePortalIds(
        Array.isArray(result.rmx_selected_portals)
          ? result.rmx_selected_portals
          : result.rmx_user_cards
      )
      : [];
    if (savedCards && savedCards.length > 0) {
      debug.log('[RMX-Onboarding] Restoring saved cards:', savedCards);

      // Clear all selections first
      cardOptions.forEach(option => {
        const cb = option.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.checked = false;
          option.classList.remove('selected');
        }
      });

      // Restore saved selections
      savedCards.forEach(card => {
        const option = document.querySelector(`.card-option[data-value="${card}"]`);
        if (option && !option.classList.contains('disabled')) {
          const cb = option.querySelector('input[type="checkbox"]');
          if (cb) {
            cb.checked = true;
            option.classList.add('selected');
          }
        }
      });
    }

    // Restore preference toggles
    if (result.rmx_banner_enabled === false) {
      const toggle = document.getElementById('toggleBanner');
      if (toggle) toggle.checked = false;
    }
    if (result.rmx_auto_sync === false) {
      const toggle = document.getElementById('toggleAutoSync');
      if (toggle) toggle.checked = false;
    }
  });

  // --- Keyboard navigation ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
      btnContinue.click();
    } else if (e.key === 'ArrowLeft') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
      btnBack.click();
    }
  });

  debug.log('[RMX-Onboarding] Wizard initialized');
});
