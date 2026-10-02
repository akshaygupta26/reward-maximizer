// content/interceptors/amex-interceptor.js
//
// American Express Offers API Observation Layer
//
// Amex offers page (americanexpress.com/us/credit-cards/category/offer/all/)
// is a React SPA. Key feature unlock: multi-card activation via API.
// The DOM hides offers after adding to one card, but the API likely accepts
// a card token parameter for sequential activation across cards.

const AmexInterceptor = {
  portal: 'amex',
  source: 'amex',

  urlPatterns: [
    '/offers',
    '/enrollment',
    '/eligible',
    '/merchant-offer',
    '/merchantoffer',
    '/card-offers',
    '/rewards/offers'
  ],

  activationPatterns: [
    '/activate',
    '/enroll',
    '/add-offer',
    '/save-offer',
    '/opt-in'
  ],

  _injected: false,

  inject(nonce) {
    if (this._injected) return;

    const allPatterns = [...this.urlPatterns, ...this.activationPatterns];
    const script = BaseInterceptor.generateMainWorldScript({
      portal: this.portal,
      urlPatterns: allPatterns,
      captureActivation: true,
      nonce: nonce || ''
    });

    try {
      const scriptEl = document.createElement('script');
      scriptEl.textContent = script;
      (document.head || document.documentElement).appendChild(scriptEl);
      scriptEl.remove();
      this._injected = true;
      debug.log('[RMX-Interceptor-Amex] Observer injected into main world');
    } catch (err) {
      debug.warn('[RMX-Interceptor-Amex] Script injection failed:', err.message);
    }
  },

  async init(nonce) {
    this.inject(nonce);
  },

  parseOffers(payload, meta) {
    if (!payload) return [];

    const offers = [];

    try {
      let rawOffers = this._extractOfferArray(payload);
      if (!rawOffers || rawOffers.length === 0) return [];

      if (typeof ExtractorConfig !== 'undefined' && ExtractorConfig.logRawResponses) {
        debug.log('[RMX-Interceptor-Amex] Raw sample:', JSON.stringify(rawOffers[0]).substring(0, 500));
      }

      for (const raw of rawOffers) {
        const parsed = this._parseAmexOffer(raw);
        if (parsed) {
          offers.push(BaseInterceptor.normalizeOffer(parsed, this.source));
        }
      }
    } catch (err) {
      debug.warn('[RMX-Interceptor-Amex] Parse error:', err);
    }

    debug.log(`[RMX-Interceptor-Amex] Parsed ${offers.length} offers`);
    return offers;
  },

  _extractOfferArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.offers)) return payload.offers;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.eligibleOffers)) return payload.eligibleOffers;
    if (Array.isArray(payload.merchantOffers)) return payload.merchantOffers;
    return BaseInterceptor.findOfferArray(payload);
  },

  /**
   * Parse a single Amex offer. Supports multi-card via cardTokens/eligibleCardMemberTokens.
   */
  _parseAmexOffer(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const merchant = raw.name || raw.merchantName || raw.merchant ||
                     raw.brandName || raw.storeName || null;
    if (!merchant) return null;

    const value = raw.description || raw.offerDescription || raw.value ||
                  raw.rewardValue || raw.headline || null;

    const expiry = raw.expiryDate || raw.endDate || raw.expirationDate ||
                   raw.validThrough || 'Check portal';

    const offerId = raw.offerId || raw.id || raw.offerKey || null;
    const activationUrl = raw.enrollmentUrl || raw.activateUrl || raw.activationUrl || null;

    // Multi-card: extract eligible card tokens
    let eligibleCards = null;
    if (Array.isArray(raw.cardTokens)) eligibleCards = raw.cardTokens;
    else if (Array.isArray(raw.eligibleCardMemberTokens)) eligibleCards = raw.eligibleCardMemberTokens;
    else if (Array.isArray(raw.eligibleCards)) eligibleCards = raw.eligibleCards;

    const minSpend = raw.minimumSpend ?? raw.spendThreshold ?? raw.minSpend ?? null;
    const maxReward = raw.maximumReward ?? raw.rewardCap ?? raw.maxReward ?? null;
    const status = raw.status || (raw.enrolled ? 'activated' : 'available') || null;

    return {
      merchant,
      value: value || 'See details',
      expiry,
      offerId,
      activationUrl,
      eligibleCards,
      minSpend: minSpend != null ? Number(minSpend) : null,
      maxReward: maxReward != null ? Number(maxReward) : null,
      status
    };
  },

  // ============================================
  // MULTI-CARD ACTIVATION (discovery + replay)
  // ============================================

  // postMessage channel for the MAIN-world bridge (content/amex-api-interceptor.js)
  _bridgeChannel: 'rmx-amex-api',

  // All waits in ms; settable so tests can shrink them.
  _discoveryTimeouts: {
    pingMs: 2500,
    clickSettleMs: 1500,
    captureCompleteMs: 3000,
    replayBatchMs: 8000,
    batchPauseMs: 500
  },

  // Discovery-only URL patterns (no leading slash): Amex endpoints look like
  // functions.americanexpress.com/CreateCardAccountOfferEnrollment.v1
  _discoveryPatterns: ['activate', 'enroll', 'add-offer', 'save-offer', 'opt-in', 'enrollment'],

  // Shorter IDs/tokens are ignored for value correlation: substituting a value
  // like "1" would match (and corrupt) unrelated parts of the request.
  _minCorrelationLength: 4,

  _hopByHopHeaders: ['content-length', 'host', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade'],

  _addButtonSelector: 'button[data-testid="merchantOfferListAddButton"]',

  /**
   * Activate offers on every eligible card.
   *
   * The Amex DOM only activates on the currently-selected card, so we click ONE
   * offer, capture the activation request in the MAIN world, turn it into a
   * template ({OFFER_ID}/{CARD_TOKEN} placeholders) and replay it for every
   * remaining (offer, card) pair. Falls back to DOM BatchOptIn (selected card
   * only) if discovery fails. Never throws; resolves the number activated.
   */
  async activateAll(offers) {
    try {
      if (!Array.isArray(offers) || offers.length === 0) return 0;

      const tasks = this._buildTasks(offers);
      if (tasks.length === 0) {
        debug.log('[RMX-Interceptor-Amex] No offers to activate');
        return 0;
      }

      debug.log(`[RMX-Interceptor-Amex] ${tasks.length} (offer, card) activations across ${offers.length} offers`);
      this._reportProgress('discovering', 0, tasks.length, '');

      const discovery = await this._discoverTemplate(tasks);
      if (discovery.template) {
        return await this._replayAll(discovery.template, tasks);
      }
      return await this._fallbackBatchOptIn(discovery.clicked);
    } catch (err) {
      debug.warn('[RMX-Interceptor-Amex] activateAll failed:', err && err.message);
      return 0;
    }
  },

  /**
   * Expand offers into one task per (offer, eligible card). Offers without
   * card tokens become a single task for the currently-selected card.
   */
  _buildTasks(offers) {
    const tasks = [];
    const seen = new Set();
    if (!Array.isArray(offers)) return tasks;

    for (const offer of offers) {
      if (!offer || typeof offer !== 'object') continue;
      const status = String(offer.status || '').toLowerCase();
      if (status === 'activated' || status === 'enrolled') continue;

      const offerId = offer.offerId != null ? String(offer.offerId) : null;
      const merchant = offer.merchant || '';
      const cards = Array.isArray(offer.eligibleCards) && offer.eligibleCards.length > 0
        ? offer.eligibleCards
        : [null];

      for (const card of cards) {
        const cardToken = (typeof card === 'string' || typeof card === 'number') ? String(card) : null;
        if (offerId !== null) {
          const key = `${offerId}\u0000${cardToken}`;
          if (seen.has(key)) continue;
          seen.add(key);
        }
        tasks.push({ offerId, cardToken, merchant });
      }
    }
    return tasks;
  },

  /**
   * Discovery: ping the MAIN-world bridge, capture requests while clicking ONE
   * un-added offer, then derive a replay template from the captures.
   * @returns {Promise<{template: Object|null, clicked: boolean}>}
   */
  async _discoverTemplate(tasks) {
    const result = { template: null, clicked: false };
    if (typeof window === 'undefined' || typeof window.postMessage !== 'function' ||
        typeof document === 'undefined') {
      return result;
    }

    const t = this._discoveryTimeouts;
    const channel = this._bridgeChannel;

    const ready = this._waitForBridgeMessage(['interceptor_ready'], t.pingMs);
    window.postMessage({ channel, type: 'ping' }, '*');
    if (!(await ready)) {
      debug.log('[RMX-Interceptor-Amex] MAIN-world bridge not responding');
      return result;
    }

    const button = this._findDiscoveryButton();
    if (!button) {
      debug.log('[RMX-Interceptor-Amex] No un-added offer button for discovery');
      return result;
    }

    let captured = null;
    const armed = this._waitForBridgeMessage(['interceptor_ready'], t.pingMs);
    window.postMessage({ channel, type: 'start_capture' }, '*');
    // The bridge handles messages in order, so this ping's reply means capture
    // is on; clicking before then could miss a synchronously-fired request.
    window.postMessage({ channel, type: 'ping' }, '*');
    try {
      if (!(await armed)) return result;

      if (typeof button.scrollIntoView === 'function') {
        button.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
      button.click();
      result.clicked = true;

      if (typeof BatchOptIn !== 'undefined' && typeof BatchOptIn.waitForDOMStabilization === 'function') {
        await BatchOptIn.waitForDOMStabilization(button, t.clickSettleMs);
      } else {
        await this._wait(t.clickSettleMs);
      }
    } finally {
      const complete = this._waitForBridgeMessage(['capture_complete'], t.captureCompleteMs);
      window.postMessage({ channel, type: 'stop_capture' }, '*');
      const message = await complete;
      captured = message ? message.data : null;
    }

    debug.log(`[RMX-Interceptor-Amex] Discovery captured ${Array.isArray(captured) ? captured.length : 0} requests`);
    result.template = this._discoverTemplateFromCaptures(captured, tasks);
    return result;
  },

  _findDiscoveryButton() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null;
    const buttons = Array.from(document.querySelectorAll(this._addButtonSelector) || []);
    return buttons.find(btn => !this._isButtonAdded(btn)) || null;
  },

  _isButtonAdded(btn) {
    if (btn.disabled) return true;
    const text = (btn.textContent || '').toLowerCase();
    const title = ((btn.getAttribute && btn.getAttribute('title')) || '').toLowerCase();
    return text.includes('added') || title.includes('added');
  },

  /**
   * Find the activation request among the captures and turn it into a template.
   * A candidate must match an activation pattern AND contain a known offerId in
   * its URL or body; that value correlation is what identifies the offer-ID
   * (and card-token) slots, which are replaced with {OFFER_ID}/{CARD_TOKEN}.
   */
  _discoverTemplateFromCaptures(captured, tasks) {
    if (!Array.isArray(captured) || captured.length === 0 || !Array.isArray(tasks)) return null;

    const offerIds = this._correlationValues(tasks.map(task => task.offerId));
    const cardTokens = this._correlationValues(tasks.map(task => task.cardToken));
    if (offerIds.length === 0) return null;

    for (const req of captured) {
      if (!req || typeof req.url !== 'string' || !this._matchesDiscoveryPattern(req.url)) continue;

      const body = typeof req.body === 'string' ? req.body : null;
      const headers = {};
      Object.keys(req.headers || {}).forEach(key => {
        if (this._hopByHopHeaders.includes(key.toLowerCase())) return;
        headers[key] = String(req.headers[key]);
      });

      const offerId = offerIds.find(id => this._containsValue(req.url, id, true) || this._containsValue(body, id, false));
      if (!offerId) continue;

      const cardToken = cardTokens.find(tok =>
        this._containsValue(req.url, tok, true) ||
        this._containsValue(body, tok, false) ||
        Object.keys(headers).some(key => headers[key].includes(tok))
      ) || null;

      // Replace the longer value first so one can't clobber the other when
      // one happens to be a substring of the other.
      const replacements = [{ value: offerId, placeholder: '{OFFER_ID}' }];
      if (cardToken) replacements.push({ value: cardToken, placeholder: '{CARD_TOKEN}' });
      replacements.sort((a, b) => b.value.length - a.value.length);

      let url = req.url;
      let templBody = body;
      for (const { value, placeholder } of replacements) {
        url = this._replaceValue(this._replaceValue(url, value, placeholder), encodeURIComponent(value), placeholder);
        if (templBody !== null) templBody = this._replaceValue(templBody, value, placeholder);
      }
      if (cardToken) {
        Object.keys(headers).forEach(key => {
          headers[key] = this._replaceValue(headers[key], cardToken, '{CARD_TOKEN}');
        });
      }

      if (!url.includes('{OFFER_ID}') && !(templBody || '').includes('{OFFER_ID}')) continue;

      debug.log(`[RMX-Interceptor-Amex] Activation template: ${req.method} ${url.split('?')[0].substring(0, 150)}` +
        `${cardToken ? ' (card-token slot found)' : ' (no card-token slot)'}`);

      return {
        url,
        method: String(req.method || 'POST').toUpperCase(),
        headers,
        body: templBody,
        matchedOfferId: offerId,
        matchedCardToken: cardToken
      };
    }

    debug.log('[RMX-Interceptor-Amex] No captured request correlates with a known offer');
    return null;
  },

  _matchesDiscoveryPattern(url) {
    const lower = (url || '').toLowerCase();
    return this._discoveryPatterns.some(p => lower.includes(p));
  },

  // Unique non-null values long enough to correlate safely, longest first.
  _correlationValues(values) {
    const unique = [...new Set(values.filter(v => v != null).map(String))];
    return unique
      .filter(v => v.length >= this._minCorrelationLength)
      .sort((a, b) => b.length - a.length);
  },

  _containsValue(haystack, value, checkEncoded) {
    if (typeof haystack !== 'string' || !value) return false;
    return haystack.includes(value) || (checkEncoded && haystack.includes(encodeURIComponent(value)));
  },

  _replaceValue(str, value, placeholder) {
    if (typeof str !== 'string' || !value) return str;
    return str.split(value).join(placeholder);
  },

  /**
   * Replay the template for every (offer, card) task in batches of 5. The
   * discovery click already activated its task, so it counts as done.
   */
  async _replayAll(template, tasks) {
    const t = this._discoveryTimeouts;
    const hasCardSlot = this._templateHas(template, '{CARD_TOKEN}');

    let runTasks = tasks;
    if (!hasCardSlot) {
      // Without a card-token slot every card's request for an offer would be
      // identical, so only the selected card can be targeted: one per offer.
      const seenOffers = new Set();
      runTasks = tasks.filter(task => {
        if (seenOffers.has(task.offerId)) return false;
        seenOffers.add(task.offerId);
        return true;
      });
      debug.log('[RMX-Interceptor-Amex] Activation request has no card token; replaying for the selected card only');
    }

    const discovered = this._findDiscoveredTask(runTasks, template);
    const total = runTasks.length;
    let added = discovered ? 1 : 0;
    let failed = 0;
    let skipped = 0;
    let lastMerchant = discovered ? discovered.merchant : '';

    const pending = [];
    runTasks.forEach((task, index) => {
      if (task === discovered) return;
      if (task.offerId === null) {
        skipped++; // Can't fill the {OFFER_ID} slot
        return;
      }
      pending.push({
        task,
        requestId: `${task.offerId}:${task.cardToken || 'default'}:${index}`,
        ...this._fillTemplate(template, task)
      });
    });

    debug.log(`[RMX-Interceptor-Amex] Replaying ${pending.length} activations (${added} done via discovery, ${skipped} skipped)`);
    this._reportProgress('starting', added + skipped, total, lastMerchant);

    const BATCH_SIZE = 5;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const results = await this._replayBatch(template, batch);

      for (const entry of batch) {
        const res = results[entry.requestId];
        if (res && res.success === true) added++;
        else failed++;
      }

      lastMerchant = batch[batch.length - 1].task.merchant || '';
      this._reportProgress('clicking', added + failed + skipped, total, lastMerchant);

      if (i + BATCH_SIZE < pending.length) {
        await this._wait(t.batchPauseMs);
      }
    }

    debug.log(`[RMX-Interceptor-Amex] Replay complete: ${added} activated, ${failed} failed, ${skipped} skipped of ${total}`);
    this._reportProgress('complete', total, total, '', { added, failed, skipped, total });
    return added;
  },

  _templateHas(template, placeholder) {
    return template.url.includes(placeholder) ||
      (template.body || '').includes(placeholder) ||
      Object.keys(template.headers || {}).some(key => String(template.headers[key]).includes(placeholder));
  },

  // The task the discovery click activated, identified by the values found in
  // the captured request rather than by DOM position.
  _findDiscoveredTask(tasks, template) {
    const sameOffer = tasks.filter(task => task.offerId === template.matchedOfferId);
    return sameOffer.find(task => template.matchedCardToken && task.cardToken === template.matchedCardToken) ||
      sameOffer.find(task => task.cardToken === null) ||
      sameOffer[0] ||
      null;
  },

  _fillTemplate(template, task) {
    // Offers without card tokens target the card used during discovery.
    const cardToken = task.cardToken !== null ? task.cardToken : template.matchedCardToken;

    let newUrl = this._replaceValue(template.url, '{OFFER_ID}', encodeURIComponent(task.offerId));
    let newBody = this._replaceValue(template.body, '{OFFER_ID}', task.offerId);
    const headers = Object.assign({}, template.headers);
    if (cardToken) {
      newUrl = this._replaceValue(newUrl, '{CARD_TOKEN}', encodeURIComponent(cardToken));
      newBody = this._replaceValue(newBody, '{CARD_TOKEN}', cardToken);
      Object.keys(headers).forEach(key => {
        headers[key] = this._replaceValue(headers[key], '{CARD_TOKEN}', cardToken);
      });
    }
    return { newUrl, newBody, headers };
  },

  /**
   * Post one batch of replay_requests and collect replay_results by requestId.
   * Resolves { [requestId]: resultData } when all arrive or on timeout.
   */
  _replayBatch(template, batch) {
    return new Promise(resolve => {
      const results = {};
      const waiting = new Set(batch.map(entry => entry.requestId));
      let settled = false;
      let timer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('message', handler);
        }
        resolve(results);
      };

      const handler = (event) => {
        if (!this._isBridgeMessage(event, ['replay_result'])) return;
        const data = event.data.data || {};
        if (!waiting.has(data.requestId)) return;
        waiting.delete(data.requestId);
        results[data.requestId] = data;
        if (waiting.size === 0) finish();
      };

      window.addEventListener('message', handler);
      timer = setTimeout(finish, this._discoveryTimeouts.replayBatchMs);

      for (const entry of batch) {
        window.postMessage({
          channel: this._bridgeChannel,
          type: 'replay_request',
          data: {
            template: {
              url: template.url,
              method: template.method,
              headers: entry.headers,
              body: template.body
            },
            newUrl: entry.newUrl,
            newBody: entry.newBody,
            offerId: entry.task.offerId,
            requestId: entry.requestId
          }
        }, '*');
      }
    });
  },

  /**
   * DOM fallback: BatchOptIn clicks remaining add buttons on the selected card.
   */
  async _fallbackBatchOptIn(discoveryClicked) {
    if (typeof BatchOptIn === 'undefined' || typeof document === 'undefined') {
      debug.warn('[RMX-Interceptor-Amex] Multi-card API unavailable and DOM fallback missing');
      return 0;
    }

    debug.log('[RMX-Interceptor-Amex] Multi-card API unavailable; only the currently-selected card will be activated');
    this._reportProgress('fallback', 0, 0, '');

    const batchResult = await BatchOptIn.run({
      source: 'amex',
      findButtons: () => Array.from(document.querySelectorAll(this._addButtonSelector)),
      isAlreadyAdded: btn => this._isButtonAdded(btn),
      getMerchantName: btn => ((btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim() || 'Unknown'),
      minDelay: 250,
      maxDelay: 1500,
      scrollToButton: true
    });

    // The discovery click already activated one offer before falling back.
    return ((batchResult && batchResult.added) || 0) + (discoveryClicked ? 1 : 0);
  },

  /**
   * One-shot wait for a bridge message of the given type(s).
   * Resolves the message (event.data) or null on timeout.
   */
  _waitForBridgeMessage(types, timeoutMs) {
    return new Promise(resolve => {
      let settled = false;
      let timer = null;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('message', handler);
        }
        resolve(value);
      };

      const handler = (event) => {
        if (this._isBridgeMessage(event, types)) finish(event.data);
      };

      window.addEventListener('message', handler);
      timer = setTimeout(() => finish(null), timeoutMs);
    });
  },

  _isBridgeMessage(event, types) {
    return !!event && event.source === window &&
      !!event.data && event.data.channel === this._bridgeChannel &&
      types.includes(event.data.type);
  },

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Report activation progress to popup via chrome.runtime.sendMessage
   */
  _reportProgress(phase, current, total, merchant, result) {
    if (typeof chrome === 'undefined') return;
    try {
      const msg = {
        action: 'batch_progress',
        source: 'amex',
        current,
        total,
        merchant,
        phase
      };
      if (result) msg.result = result;
      const response = chrome.runtime.sendMessage(msg);
      if (response && typeof response.catch === 'function') response.catch(() => {});
    } catch (e) {
      // Popup might be closed
    }
  }
};

if (typeof window !== 'undefined') {
  window.AmexInterceptor = AmexInterceptor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AmexInterceptor };
}
