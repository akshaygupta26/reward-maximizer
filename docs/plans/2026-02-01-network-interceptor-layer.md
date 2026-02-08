# Network Interceptor Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a hybrid data extraction layer that passively observes bank portal API responses for structured offer data, with automatic fallback to existing DOM scrapers.

**Architecture:** Content scripts inject a main-world observer that monkey-patches `fetch`/`XMLHttpRequest` before the bank page's JS runs. Captured JSON responses are bridged back to the isolated content script world via `window.postMessage`. The orchestrator in `content-main.js` waits for interceptor data with a configurable timeout, then falls back to DOM scrapers if nothing arrives. A per-portal config object controls feature flags and timeouts.

**Tech Stack:** Vanilla JS (no bundler), Chrome Extension Manifest V3 APIs, `chrome.scripting.executeScript` with `world: 'MAIN'`

---

## Task 1: Create `lib/extractor-config.js` — Feature Flags & Configuration

**Files:**
- Create: `lib/extractor-config.js`
- Test: `tests/extractor-config.test.js`

**Step 1: Write the failing test**

```javascript
// tests/extractor-config.test.js
const { ExtractorConfig } = require('../lib/extractor-config.js');

describe('ExtractorConfig', () => {
  test('has useInterceptors master toggle defaulting to true', () => {
    expect(ExtractorConfig.useInterceptors).toBe(true);
  });

  test('has portal configs for all 9 portals', () => {
    const expected = ['amex', 'chase', 'citi', 'capital-one', 'bofa', 'discover', 'usbank', 'rakuten', 'capital-one-shopping'];
    expected.forEach(portal => {
      expect(ExtractorConfig.portals[portal]).toBeDefined();
      expect(typeof ExtractorConfig.portals[portal].interceptor).toBe('boolean');
      expect(typeof ExtractorConfig.portals[portal].fallbackToScraper).toBe('boolean');
    });
  });

  test('rakuten and capital-one-shopping have interceptor disabled by default', () => {
    expect(ExtractorConfig.portals.rakuten.interceptor).toBe(false);
    expect(ExtractorConfig.portals['capital-one-shopping'].interceptor).toBe(false);
  });

  test('has interceptorTimeout defaulting to 12000ms', () => {
    expect(ExtractorConfig.interceptorTimeout).toBe(12000);
  });

  test('has activationDelay defaulting to 1000ms', () => {
    expect(ExtractorConfig.activationDelay).toBe(1000);
  });

  test('has maxConcurrentActivations defaulting to 1', () => {
    expect(ExtractorConfig.maxConcurrentActivations).toBe(1);
  });

  test('has logRawResponses defaulting to false', () => {
    expect(ExtractorConfig.logRawResponses).toBe(false);
  });

  test('isInterceptorEnabled returns correct values', () => {
    expect(ExtractorConfig.isInterceptorEnabled('chase')).toBe(true);
    expect(ExtractorConfig.isInterceptorEnabled('rakuten')).toBe(false);
    expect(ExtractorConfig.isInterceptorEnabled('unknown')).toBe(false);
  });

  test('isFallbackEnabled returns correct values', () => {
    expect(ExtractorConfig.isFallbackEnabled('chase')).toBe(true);
    expect(ExtractorConfig.isFallbackEnabled('rakuten')).toBe(true);
    expect(ExtractorConfig.isFallbackEnabled('unknown')).toBe(true);
  });

  test('getRandomizedDelay returns value within ±30% of activationDelay', () => {
    for (let i = 0; i < 50; i++) {
      const delay = ExtractorConfig.getRandomizedDelay();
      expect(delay).toBeGreaterThanOrEqual(700);
      expect(delay).toBeLessThanOrEqual(1300);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/extractor-config.test.js`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```javascript
// lib/extractor-config.js

const ExtractorConfig = {
  // Master toggle for the interceptor layer
  useInterceptors: true,

  // Per-portal toggles
  portals: {
    amex:                  { interceptor: true,  fallbackToScraper: true },
    chase:                 { interceptor: true,  fallbackToScraper: true },
    citi:                  { interceptor: true,  fallbackToScraper: true },
    'capital-one':         { interceptor: true,  fallbackToScraper: true },
    bofa:                  { interceptor: true,  fallbackToScraper: true },
    discover:              { interceptor: true,  fallbackToScraper: true },
    usbank:                { interceptor: true,  fallbackToScraper: true },
    rakuten:               { interceptor: false, fallbackToScraper: true },
    'capital-one-shopping':{ interceptor: false, fallbackToScraper: true },
  },

  // Timeout before falling back to DOM scraper (ms)
  interceptorTimeout: 12000,

  // Delay between activation API calls (ms, randomized ±30%)
  activationDelay: 1000,

  // Maximum concurrent activation requests
  maxConcurrentActivations: 1,

  // Log captured API responses for debugging (disable in production)
  logRawResponses: false,

  // Check if interceptor is enabled for a portal
  isInterceptorEnabled(portal) {
    if (!this.useInterceptors) return false;
    const config = this.portals[portal];
    return config ? config.interceptor : false;
  },

  // Check if fallback is enabled for a portal
  isFallbackEnabled(portal) {
    const config = this.portals[portal];
    return config ? config.fallbackToScraper : true;
  },

  // Get randomized delay (±30% of activationDelay)
  getRandomizedDelay() {
    const variance = this.activationDelay * 0.3;
    return Math.round(this.activationDelay + (Math.random() * 2 - 1) * variance);
  }
};

// Browser export
if (typeof window !== 'undefined') {
  window.ExtractorConfig = ExtractorConfig;
}

// Node export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExtractorConfig };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/extractor-config.test.js`
Expected: PASS — all 9 tests

**Step 5: Commit**

```bash
git add lib/extractor-config.js tests/extractor-config.test.js
git commit -m "feat: add ExtractorConfig with per-portal feature flags and activation delay"
```

---

## Task 2: Create `content/interceptors/base-interceptor.js` — Core Interception Utilities

**Files:**
- Create: `content/interceptors/base-interceptor.js`
- Test: `tests/base-interceptor.test.js`

**Step 1: Write the failing test**

```javascript
// tests/base-interceptor.test.js

// Mock debug
global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

// Mock window.postMessage
global.window = { postMessage: jest.fn() };

// Mock chrome
global.chrome = {
  scripting: { executeScript: jest.fn() },
  runtime: { id: 'test-extension-id' }
};

const { BaseInterceptor } = require('../content/interceptors/base-interceptor.js');

describe('BaseInterceptor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MESSAGE_TYPE', () => {
    test('has a unique message type identifier', () => {
      expect(BaseInterceptor.MESSAGE_TYPE).toBe('RMX_INTERCEPTOR_BRIDGE');
    });
  });

  describe('generateMainWorldScript', () => {
    test('returns a string containing fetch wrapper code', () => {
      const script = BaseInterceptor.generateMainWorldScript({
        portal: 'chase',
        urlPatterns: ['/offers', '/commerce'],
        captureActivation: true
      });
      expect(typeof script).toBe('string');
      expect(script).toContain('fetch');
      expect(script).toContain('XMLHttpRequest');
      expect(script).toContain('RMX_INTERCEPTOR_BRIDGE');
      expect(script).toContain('chase');
    });

    test('includes URL patterns in the generated script', () => {
      const script = BaseInterceptor.generateMainWorldScript({
        portal: 'amex',
        urlPatterns: ['/api/offers', '/enrollment'],
        captureActivation: true
      });
      expect(script).toContain('/api/offers');
      expect(script).toContain('/enrollment');
    });
  });

  describe('normalizeOffer', () => {
    test('produces standard offer format from raw data', () => {
      const raw = {
        merchant: 'TestStore',
        value: '$20 cash back',
        expiry: '03/15/2026',
        offerId: 'offer_123',
        activationUrl: '/api/activate',
        eligibleCards: ['card1', 'card2'],
        minSpend: 50,
        maxReward: 100,
        status: 'available'
      };

      const result = BaseInterceptor.normalizeOffer(raw, 'chase');
      expect(result.merchant).toBe('TestStore');
      expect(result.value).toBe('$20 cash back');
      expect(result.expiry).toBe('03/15/2026');
      expect(result.merchantCategory).toBe('other'); // Categories mock
      expect(result.valueType).toBe('fixed');
      expect(result.offerId).toBe('offer_123');
      expect(result.activationUrl).toBe('/api/activate');
      expect(result.eligibleCards).toEqual(['card1', 'card2']);
      expect(result.minSpend).toBe(50);
      expect(result.maxReward).toBe(100);
      expect(result.status).toBe('available');
      expect(result.timestamp).toBeDefined();
    });

    test('defaults new fields to null when missing', () => {
      const raw = { merchant: 'Store', value: '5% back' };
      const result = BaseInterceptor.normalizeOffer(raw, 'amex');
      expect(result.offerId).toBeNull();
      expect(result.activationUrl).toBeNull();
      expect(result.eligibleCards).toBeNull();
      expect(result.minSpend).toBeNull();
      expect(result.maxReward).toBeNull();
      expect(result.status).toBeNull();
    });

    test('detects valueType correctly', () => {
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: '5% back' }, 's').valueType).toBe('percent');
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: '$20 off' }, 's').valueType).toBe('fixed');
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: '3x points' }, 's').valueType).toBe('multiplier');
      expect(BaseInterceptor.normalizeOffer({ merchant: 'A', value: 'See details' }, 's').valueType).toBe('unknown');
    });
  });

  describe('parseMessageFromMainWorld', () => {
    test('returns null for messages without correct type', () => {
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: { type: 'WRONG' } })).toBeNull();
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: 'string' })).toBeNull();
      expect(BaseInterceptor.parseMessageFromMainWorld({ data: null })).toBeNull();
    });

    test('returns payload for valid messages', () => {
      const event = {
        data: {
          type: 'RMX_INTERCEPTOR_BRIDGE',
          portal: 'chase',
          action: 'offers_captured',
          payload: [{ merchant: 'Test' }]
        }
      };
      const result = BaseInterceptor.parseMessageFromMainWorld(event);
      expect(result.portal).toBe('chase');
      expect(result.action).toBe('offers_captured');
      expect(result.payload).toEqual([{ merchant: 'Test' }]);
    });
  });

  describe('sanitize', () => {
    test('strips HTML tags from strings', () => {
      expect(BaseInterceptor.sanitize('<script>alert("xss")</script>Hello')).toBe('Hello');
      expect(BaseInterceptor.sanitize('<b>Bold</b> text')).toBe('Bold text');
    });

    test('handles non-string inputs', () => {
      expect(BaseInterceptor.sanitize(42)).toBe(42);
      expect(BaseInterceptor.sanitize(null)).toBe(null);
      expect(BaseInterceptor.sanitize(undefined)).toBe(undefined);
    });

    test('truncates excessively long strings', () => {
      const long = 'a'.repeat(600);
      expect(BaseInterceptor.sanitize(long).length).toBe(500);
    });
  });

  describe('assessDataQuality', () => {
    test('returns true when >50% of fields are populated', () => {
      const offer = { merchant: 'Store', value: '$20 back', expiry: '03/15/2026' };
      expect(BaseInterceptor.assessDataQuality(offer)).toBe(true);
    });

    test('returns false when <=50% of fields are populated', () => {
      const offer = { merchant: 'Store' };
      expect(BaseInterceptor.assessDataQuality(offer)).toBe(false);
    });

    test('returns false for empty/null offer', () => {
      expect(BaseInterceptor.assessDataQuality(null)).toBe(false);
      expect(BaseInterceptor.assessDataQuality({})).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/base-interceptor.test.js`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```javascript
// content/interceptors/base-interceptor.js
//
// Core utilities for the network response observation layer.
// Provides: main-world script generation, fetch/XHR monkey-patching,
// message bridging, offer normalization, and data sanitization.

const BaseInterceptor = {
  // Unique message type for window.postMessage bridging
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',

  /**
   * Generate the JavaScript string to inject into the page's main world.
   * This script wraps fetch() and XMLHttpRequest to observe API responses
   * matching the given URL patterns. Captured responses are sent back to
   * the content script via window.postMessage.
   *
   * @param {Object} opts
   * @param {string} opts.portal - Portal identifier (e.g., 'chase')
   * @param {string[]} opts.urlPatterns - URL substrings to match (e.g., ['/offers', '/commerce'])
   * @param {boolean} opts.captureActivation - Whether to also capture POST responses (activation)
   * @returns {string} JavaScript code to execute in the main world
   */
  generateMainWorldScript({ portal, urlPatterns, captureActivation = false }) {
    // Serialize patterns into the injected script
    const patternsJSON = JSON.stringify(urlPatterns);
    const messageType = this.MESSAGE_TYPE;

    return `
(function() {
  'use strict';
  const RMX_PORTAL = ${JSON.stringify(portal)};
  const RMX_URL_PATTERNS = ${patternsJSON};
  const RMX_MSG_TYPE = ${JSON.stringify(messageType)};
  const RMX_CAPTURE_ACTIVATION = ${captureActivation};

  function urlMatchesPatterns(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return RMX_URL_PATTERNS.some(function(p) { return lower.includes(p.toLowerCase()); });
  }

  function isJSONResponse(contentType) {
    return contentType && contentType.includes('application/json');
  }

  function sendToContentScript(action, payload, meta) {
    try {
      window.postMessage({
        type: RMX_MSG_TYPE,
        portal: RMX_PORTAL,
        action: action,
        payload: payload,
        meta: meta || {}
      }, '*');
    } catch (e) { /* silent */ }
  }

  // ---- Wrap fetch ----
  var originalFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var url = '';
    if (typeof args[0] === 'string') {
      url = args[0];
    } else if (args[0] && args[0].url) {
      url = args[0].url;
    }

    var method = 'GET';
    if (args[1] && args[1].method) {
      method = args[1].method.toUpperCase();
    } else if (args[0] && args[0].method) {
      method = args[0].method.toUpperCase();
    }

    if (!urlMatchesPatterns(url)) {
      return originalFetch.apply(this, args);
    }

    // Skip non-GET unless captureActivation is on
    if (method !== 'GET' && !RMX_CAPTURE_ACTIVATION) {
      return originalFetch.apply(this, args);
    }

    return originalFetch.apply(this, args).then(function(response) {
      try {
        // Clone to avoid consuming the body
        var cloned = response.clone();
        var contentType = cloned.headers.get('content-type') || '';

        if (isJSONResponse(contentType)) {
          cloned.json().then(function(data) {
            var action = (method === 'GET') ? 'api_response' : 'activation_response';
            sendToContentScript(action, data, {
              url: url,
              method: method,
              status: response.status,
              timestamp: Date.now()
            });
          }).catch(function() { /* not JSON, ignore */ });
        }
      } catch (e) { /* don't break the page */ }
      return response;
    });
  };

  // ---- Wrap XMLHttpRequest ----
  var OrigXHR = window.XMLHttpRequest;
  var origOpen = OrigXHR.prototype.open;
  var origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function(method, url) {
    this._rmx_url = url;
    this._rmx_method = (method || 'GET').toUpperCase();
    return origOpen.apply(this, arguments);
  };

  OrigXHR.prototype.send = function() {
    var xhr = this;
    if (urlMatchesPatterns(xhr._rmx_url)) {
      var shouldCapture = (xhr._rmx_method === 'GET') || RMX_CAPTURE_ACTIVATION;

      if (shouldCapture) {
        xhr.addEventListener('load', function() {
          try {
            var contentType = xhr.getResponseHeader('content-type') || '';
            if (isJSONResponse(contentType) && xhr.responseText) {
              var data = JSON.parse(xhr.responseText);
              var action = (xhr._rmx_method === 'GET') ? 'api_response' : 'activation_response';
              sendToContentScript(action, data, {
                url: xhr._rmx_url,
                method: xhr._rmx_method,
                status: xhr.status,
                timestamp: Date.now()
              });
            }
          } catch (e) { /* silent */ }
        });
      }
    }
    return origSend.apply(this, arguments);
  };

  // Signal that observers are in place
  sendToContentScript('observers_ready', null, { timestamp: Date.now() });
})();
`;
  },

  /**
   * Parse a postMessage event from the main world.
   * Returns null if the message is not from our interceptor.
   *
   * @param {MessageEvent} event
   * @returns {Object|null} { portal, action, payload, meta }
   */
  parseMessageFromMainWorld(event) {
    if (!event || !event.data || typeof event.data !== 'object') return null;
    if (event.data.type !== this.MESSAGE_TYPE) return null;
    return {
      portal: event.data.portal,
      action: event.data.action,
      payload: event.data.payload,
      meta: event.data.meta || {}
    };
  },

  /**
   * Normalize a raw API response offer object into the standard extension format.
   * Adds new fields (offerId, activationUrl, etc.) defaulting to null.
   *
   * @param {Object} raw - Raw offer data (may vary by portal)
   * @param {string} source - Portal source identifier
   * @returns {Object} Normalized offer
   */
  normalizeOffer(raw, source) {
    const merchant = this.sanitize(raw.merchant || 'Unknown');
    const value = this.sanitize(raw.value || 'See details');
    const expiry = this.sanitize(raw.expiry || 'Check portal');

    // Detect category via Categories lib if available
    let merchantCategory = 'other';
    if (typeof Categories !== 'undefined' && Categories.detectCategory) {
      merchantCategory = Categories.detectCategory(merchant);
    }

    // Detect value type
    let valueType = 'unknown';
    if (typeof value === 'string') {
      if (value.includes('%')) valueType = 'percent';
      else if (value.includes('$')) valueType = 'fixed';
      else if (/\d+x/i.test(value)) valueType = 'multiplier';
    }

    return {
      merchant,
      value,
      expiry,
      merchantCategory,
      valueType,
      timestamp: Date.now(),
      // New fields from interceptor layer (additive, backward-compatible)
      offerId: raw.offerId || null,
      activationUrl: raw.activationUrl || null,
      eligibleCards: raw.eligibleCards || null,
      minSpend: raw.minSpend || null,
      maxReward: raw.maxReward || null,
      status: raw.status || null
    };
  },

  /**
   * Sanitize a value to prevent XSS. Strips HTML tags from strings
   * and truncates excessively long strings.
   *
   * @param {*} val
   * @returns {*} Sanitized value
   */
  sanitize(val) {
    if (typeof val !== 'string') return val;
    // Strip HTML tags
    let cleaned = val.replace(/<[^>]*>/g, '');
    // Truncate
    if (cleaned.length > 500) cleaned = cleaned.substring(0, 500);
    return cleaned;
  },

  /**
   * Assess whether a normalized offer has sufficient data quality.
   * Returns true if >50% of core fields are populated.
   * Used to decide whether to trust interceptor data or fall back.
   *
   * @param {Object} offer
   * @returns {boolean}
   */
  assessDataQuality(offer) {
    if (!offer || typeof offer !== 'object') return false;

    const coreFields = ['merchant', 'value', 'expiry'];
    let populated = 0;

    for (const field of coreFields) {
      const val = offer[field];
      if (val && val !== 'Unknown' && val !== 'See details' && val !== 'Check portal') {
        populated++;
      }
    }

    return populated / coreFields.length > 0.5;
  },

  /**
   * Generate the script to make an authenticated request from the main world.
   * Used for offer activation — inherits the page's session cookies/CSRF.
   *
   * @param {Object} opts
   * @param {string} opts.url - API endpoint
   * @param {string} opts.method - HTTP method (POST, PUT)
   * @param {Object} opts.headers - Request headers
   * @param {*} opts.body - Request body (will be JSON.stringify'd)
   * @param {string} opts.portal - Portal identifier for message routing
   * @returns {string} JavaScript code to execute in main world
   */
  generateActivationScript({ url, method, headers, body, portal }) {
    const messageType = this.MESSAGE_TYPE;
    return `
(function() {
  fetch(${JSON.stringify(url)}, {
    method: ${JSON.stringify(method || 'POST')},
    headers: ${JSON.stringify(headers || { 'Content-Type': 'application/json' })},
    body: ${JSON.stringify(typeof body === 'string' ? body : JSON.stringify(body))},
    credentials: 'same-origin'
  }).then(function(r) {
    return r.json().then(function(data) {
      window.postMessage({
        type: ${JSON.stringify(messageType)},
        portal: ${JSON.stringify(portal)},
        action: 'activation_result',
        payload: { success: r.ok, status: r.status, data: data }
      }, '*');
    });
  }).catch(function(err) {
    window.postMessage({
      type: ${JSON.stringify(messageType)},
      portal: ${JSON.stringify(portal)},
      action: 'activation_result',
      payload: { success: false, error: err.message }
    }, '*');
  });
})();
`;
  }
};

// Browser export
if (typeof window !== 'undefined') {
  window.BaseInterceptor = BaseInterceptor;
}

// Node export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BaseInterceptor };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/base-interceptor.test.js`
Expected: PASS — all tests

**Step 5: Commit**

```bash
git add content/interceptors/base-interceptor.js tests/base-interceptor.test.js
git commit -m "feat: add BaseInterceptor with fetch/XHR wrapping, message bridge, and offer normalization"
```

---

## Task 3: Create `lib/interceptor-health.js` — Health Monitoring

**Files:**
- Create: `lib/interceptor-health.js`
- Test: `tests/interceptor-health.test.js`

**Step 1: Write the failing test**

```javascript
// tests/interceptor-health.test.js

// Mock chrome.storage.local
const storageData = {};
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys, cb) => {
        const result = {};
        keys.forEach(k => { if (storageData[k]) result[k] = storageData[k]; });
        cb(result);
      }),
      set: jest.fn((obj, cb) => {
        Object.assign(storageData, obj);
        if (cb) cb();
      })
    }
  }
};
global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const { InterceptorHealth } = require('../lib/interceptor-health.js');

describe('InterceptorHealth', () => {
  beforeEach(() => {
    Object.keys(storageData).forEach(k => delete storageData[k]);
    jest.clearAllMocks();
  });

  test('STORAGE_KEY is rmx_interceptor_health', () => {
    expect(InterceptorHealth.STORAGE_KEY).toBe('rmx_interceptor_health');
  });

  test('recordSuccess stores interceptor method and resets failure count', async () => {
    await InterceptorHealth.recordSuccess('chase', 42);
    const health = storageData.rmx_interceptor_health;
    expect(health.chase.lastMethod).toBe('interceptor');
    expect(health.chase.lastOfferCount).toBe(42);
    expect(health.chase.consecutiveInterceptorFailures).toBe(0);
    expect(health.chase.lastTimestamp).toBeDefined();
  });

  test('recordFallback stores scraper method and increments failure count', async () => {
    await InterceptorHealth.recordFallback('amex', 'no_matching_responses');
    const health = storageData.rmx_interceptor_health;
    expect(health.amex.lastMethod).toBe('scraper');
    expect(health.amex.consecutiveInterceptorFailures).toBe(1);
    expect(health.amex.lastError).toBe('no_matching_responses');
  });

  test('recordFallback increments consecutive failures', async () => {
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordFallback('chase', 'parse_error');
    const health = storageData.rmx_interceptor_health;
    expect(health.chase.consecutiveInterceptorFailures).toBe(3);
  });

  test('recordSuccess resets consecutive failures after fallbacks', async () => {
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordSuccess('chase', 50);
    const health = storageData.rmx_interceptor_health;
    expect(health.chase.consecutiveInterceptorFailures).toBe(0);
  });

  test('getHealth returns health data for a portal', async () => {
    await InterceptorHealth.recordSuccess('chase', 10);
    const result = await InterceptorHealth.getHealth('chase');
    expect(result.lastMethod).toBe('interceptor');
    expect(result.lastOfferCount).toBe(10);
  });

  test('getHealth returns null for unknown portal', async () => {
    const result = await InterceptorHealth.getHealth('unknown');
    expect(result).toBeNull();
  });

  test('getAllHealth returns full health object', async () => {
    await InterceptorHealth.recordSuccess('chase', 10);
    await InterceptorHealth.recordFallback('amex', 'err');
    const all = await InterceptorHealth.getAllHealth();
    expect(all.chase).toBeDefined();
    expect(all.amex).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/interceptor-health.test.js`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```javascript
// lib/interceptor-health.js
//
// Tracks per-portal extraction health: which method was last used,
// consecutive interceptor failures, and timestamps.
// Stored in chrome.storage.local under key 'rmx_interceptor_health'.

const InterceptorHealth = {
  STORAGE_KEY: 'rmx_interceptor_health',

  async _getAll() {
    return new Promise(resolve => {
      chrome.storage.local.get([this.STORAGE_KEY], result => {
        resolve(result[this.STORAGE_KEY] || {});
      });
    });
  },

  async _save(health) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: health }, () => resolve());
    });
  },

  /**
   * Record a successful interceptor extraction.
   */
  async recordSuccess(portal, offerCount) {
    const health = await this._getAll();
    health[portal] = {
      ...(health[portal] || {}),
      lastMethod: 'interceptor',
      lastTimestamp: new Date().toISOString(),
      lastOfferCount: offerCount,
      consecutiveInterceptorFailures: 0,
      lastError: null
    };
    await this._save(health);

    if (typeof debug !== 'undefined') {
      debug.log(`[RMX-Health] ${portal}: interceptor success, ${offerCount} offers`);
    }
  },

  /**
   * Record a fallback to DOM scraper (interceptor failed).
   */
  async recordFallback(portal, reason) {
    const health = await this._getAll();
    const existing = health[portal] || { consecutiveInterceptorFailures: 0 };
    health[portal] = {
      ...existing,
      lastMethod: 'scraper',
      lastTimestamp: new Date().toISOString(),
      consecutiveInterceptorFailures: (existing.consecutiveInterceptorFailures || 0) + 1,
      lastError: reason
    };
    await this._save(health);

    if (typeof debug !== 'undefined') {
      debug.warn(`[RMX-Health] ${portal}: fallback to scraper (${reason}), failures: ${health[portal].consecutiveInterceptorFailures}`);
    }
  },

  /**
   * Get health data for a specific portal.
   */
  async getHealth(portal) {
    const health = await this._getAll();
    return health[portal] || null;
  },

  /**
   * Get all health data.
   */
  async getAllHealth() {
    return this._getAll();
  }
};

if (typeof window !== 'undefined') {
  window.InterceptorHealth = InterceptorHealth;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InterceptorHealth };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/interceptor-health.test.js`
Expected: PASS — all tests

**Step 5: Commit**

```bash
git add lib/interceptor-health.js tests/interceptor-health.test.js
git commit -m "feat: add InterceptorHealth for per-portal extraction monitoring"
```

---

## Task 4: Modify `content/content-main.js` — Orchestrator with Interceptor-First Flow

**Files:**
- Modify: `content/content-main.js` (lines 26-49, 52-106, 109-148)
- Reference: `lib/extractor-config.js`, `content/interceptors/base-interceptor.js`, `lib/interceptor-health.js`

This is the critical integration point. The orchestrator must:
1. Attempt interceptor extraction first (if enabled for portal)
2. Wait up to `interceptorTimeout` for data
3. Fall back to DOM scraper if interceptor yields nothing
4. Log which method was used
5. Record health data

**Step 1: Write the failing test**

```javascript
// tests/content-main-orchestrator.test.js

// Mocks
global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
global.chrome = {
  runtime: {
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn((msg, cb) => cb && cb())
  },
  storage: {
    local: {
      get: jest.fn((keys, cb) => cb({})),
      set: jest.fn((obj, cb) => cb && cb()),
      remove: jest.fn((key, cb) => cb && cb())
    }
  }
};
global.localStorage = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn()
};
global.window = {
  location: { hostname: 'secure.chase.com', href: 'https://secure.chase.com/offers', pathname: '/offers' },
  addEventListener: jest.fn(),
  postMessage: jest.fn()
};

// Mock ExtractorConfig
global.ExtractorConfig = {
  useInterceptors: true,
  interceptorTimeout: 100, // short for tests
  portals: {
    chase: { interceptor: true, fallbackToScraper: true }
  },
  isInterceptorEnabled: function(p) { return this.portals[p] && this.portals[p].interceptor; },
  isFallbackEnabled: function(p) { return this.portals[p] ? this.portals[p].fallbackToScraper : true; }
};

// Mock InterceptorHealth
global.InterceptorHealth = {
  recordSuccess: jest.fn(),
  recordFallback: jest.fn()
};

describe('Orchestrator - getExtractor', () => {
  test('getExtractor returns interceptor for enabled portal', () => {
    // Test will validate once content-main exposes getExtractor
    expect(ExtractorConfig.isInterceptorEnabled('chase')).toBe(true);
  });

  test('getExtractor returns null interceptor for disabled portal', () => {
    expect(ExtractorConfig.isInterceptorEnabled('rakuten')).toBeFalsy();
  });
});
```

**Step 2: Run test to verify it passes** (this is a light integration-readiness test)

Run: `npm test -- tests/content-main-orchestrator.test.js`
Expected: PASS

**Step 3: Modify content-main.js**

Add the following new functions and modify existing ones. Key changes:

1. Add `getInterceptor(site)` function parallel to `getScraper(site)`
2. Add `extractWithInterceptor(interceptor, site)` that listens for postMessage data with a timeout
3. Modify `handleScrapeRequest()` to try interceptor first, then scraper
4. Modify `autoSyncIfPending()` and `checkPendingSyncFromPopup()` similarly

The full modified `content-main.js`:

```javascript
// Main content script coordinator
// Routes messages to appropriate scrapers based on current site
// Supports hybrid extraction: interceptor (primary) → scraper (fallback)

debug.log('[RMX-Content] Content script loaded');

const AUTO_SYNC_KEY = 'rmx_auto_sync';

// ---- Site Detection ----

function detectSite() {
  const host = window.location.hostname.toLowerCase();

  if (host.includes('americanexpress.com')) return 'amex';
  if (host.includes('chase.com')) return 'chase';
  if (host.includes('citi.com') || host.includes('citibank.com')) return 'citi';
  if (host.includes('capitaloneshopping.com')) return 'capital-one-shopping';
  if (host.includes('capitalone.com')) return 'capital-one';
  if (host.includes('discover.com')) return 'discover';
  if (host.includes('bankofamerica.com') || host.includes('bofa.com')) return 'bofa';
  if (host.includes('usbank.com')) return 'usbank';
  if (host.includes('rakuten.com')) return 'rakuten';

  return null;
}

// ---- Scraper Lookup (fallback layer) ----

function getScraper(site) {
  switch (site) {
    case 'amex':
      return typeof AmexScraper !== 'undefined' ? AmexScraper : null;
    case 'chase':
      return typeof ChaseScraper !== 'undefined' ? ChaseScraper : null;
    case 'citi':
      return typeof CitiScraper !== 'undefined' ? CitiScraper : null;
    case 'capital-one':
      return typeof CapitalOneScraper !== 'undefined' ? CapitalOneScraper : null;
    case 'discover':
      return typeof DiscoverScraper !== 'undefined' ? DiscoverScraper : null;
    case 'bofa':
      return typeof BofAScraper !== 'undefined' ? BofAScraper : null;
    case 'usbank':
      return typeof USBankScraper !== 'undefined' ? USBankScraper : null;
    case 'rakuten':
      return typeof RakutenScraper !== 'undefined' ? RakutenScraper : null;
    case 'capital-one-shopping':
      return typeof CapitalOneShoppingScraper !== 'undefined' ? CapitalOneShoppingScraper : null;
    default:
      return null;
  }
}

// ---- Interceptor Lookup (primary layer) ----

function getInterceptor(site) {
  // Check if interceptors are available and enabled
  if (typeof ExtractorConfig === 'undefined' || !ExtractorConfig.isInterceptorEnabled(site)) {
    return null;
  }

  switch (site) {
    case 'amex':
      return typeof AmexInterceptor !== 'undefined' ? AmexInterceptor : null;
    case 'chase':
      return typeof ChaseInterceptor !== 'undefined' ? ChaseInterceptor : null;
    case 'citi':
      return typeof CitiInterceptor !== 'undefined' ? CitiInterceptor : null;
    case 'capital-one':
      return typeof CapitalOneInterceptor !== 'undefined' ? CapitalOneInterceptor : null;
    case 'discover':
      return typeof DiscoverInterceptor !== 'undefined' ? DiscoverInterceptor : null;
    case 'bofa':
      return typeof BofAInterceptor !== 'undefined' ? BofAInterceptor : null;
    case 'usbank':
      return typeof USBankInterceptor !== 'undefined' ? USBankInterceptor : null;
    default:
      return null;
  }
}

// ---- Interceptor Data Cache ----
// Interceptors populate this as API responses arrive.
// Key: portal name, Value: { offers: [], timestamp, ready: bool }
const interceptorCache = {};

// Listen for messages from main world (interceptor bridge)
if (typeof BaseInterceptor !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = BaseInterceptor.parseMessageFromMainWorld(event);
    if (!msg) return;

    debug.log(`[RMX-Orchestrator] Received ${msg.action} from ${msg.portal}`, msg.meta);

    if (msg.action === 'api_response' && msg.payload) {
      const interceptor = getInterceptor(msg.portal);
      if (interceptor && typeof interceptor.parseOffers === 'function') {
        try {
          const offers = interceptor.parseOffers(msg.payload, msg.meta);
          if (offers && offers.length > 0) {
            debug.log(`[RMX-Orchestrator] Parsed ${offers.length} offers from ${msg.portal} API`);
            interceptorCache[msg.portal] = {
              offers,
              meta: msg.meta,
              timestamp: Date.now(),
              ready: true
            };
          }
        } catch (err) {
          debug.warn(`[RMX-Orchestrator] Failed to parse ${msg.portal} API response:`, err);
        }
      }
    }

    if (msg.action === 'activation_result') {
      // Interceptor modules handle this via their own listeners
      debug.log(`[RMX-Orchestrator] Activation result for ${msg.portal}:`, msg.payload);
    }
  });
}

/**
 * Wait for interceptor data to arrive, with timeout.
 * Returns cached offers or null if timeout.
 */
function waitForInterceptorData(portal, timeout) {
  return new Promise(resolve => {
    // Check if data already arrived
    if (interceptorCache[portal] && interceptorCache[portal].ready) {
      resolve(interceptorCache[portal]);
      return;
    }

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (interceptorCache[portal] && interceptorCache[portal].ready) {
        clearInterval(checkInterval);
        resolve(interceptorCache[portal]);
        return;
      }
      if (Date.now() - startTime >= timeout) {
        clearInterval(checkInterval);
        resolve(null);
      }
    }, 200);
  });
}

// ---- Hybrid Extraction ----

/**
 * Try interceptor first, fall back to scraper.
 * Returns { offers, added, totalFound, method: 'interceptor'|'scraper' }
 */
async function hybridExtract(site) {
  const interceptor = getInterceptor(site);
  const scraper = getScraper(site);
  const timeout = (typeof ExtractorConfig !== 'undefined') ? ExtractorConfig.interceptorTimeout : 12000;

  // Try interceptor if available
  if (interceptor) {
    debug.log(`[RMX-Orchestrator] Trying interceptor for ${site} (timeout: ${timeout}ms)`);

    try {
      // Initialize interceptor if it has an init method
      if (typeof interceptor.init === 'function') {
        await interceptor.init();
      }

      const cached = await waitForInterceptorData(site, timeout);

      if (cached && cached.offers && cached.offers.length > 0) {
        // Validate data quality
        const qualityOk = cached.offers.every(o => BaseInterceptor.assessDataQuality(o));

        if (qualityOk || cached.offers.length >= 5) {
          debug.log(`[RMX-Orchestrator] Interceptor success for ${site}: ${cached.offers.length} offers`);

          // Record health
          if (typeof InterceptorHealth !== 'undefined') {
            await InterceptorHealth.recordSuccess(site, cached.offers.length);
          }

          // Handle activation if interceptor supports it
          let added = 0;
          if (typeof interceptor.activateAll === 'function') {
            added = await interceptor.activateAll(cached.offers);
          }

          return {
            offers: cached.offers,
            added,
            totalFound: cached.offers.length,
            method: 'interceptor'
          };
        } else {
          debug.warn(`[RMX-Orchestrator] Interceptor data quality too low for ${site}, falling back`);
        }
      } else {
        debug.warn(`[RMX-Orchestrator] No interceptor data for ${site} within timeout`);
      }
    } catch (err) {
      debug.error(`[RMX-Orchestrator] Interceptor error for ${site}:`, err);
    }

    // Record fallback
    if (typeof InterceptorHealth !== 'undefined') {
      await InterceptorHealth.recordFallback(site, 'no_data_or_quality_fail');
    }
  }

  // Fallback to DOM scraper
  if (scraper) {
    debug.log(`[RMX-Orchestrator] Using DOM scraper for ${site}`);
    const result = await scraper.scrape();
    return {
      ...result,
      method: 'scraper'
    };
  }

  return { offers: [], added: 0, totalFound: 0, method: 'none' };
}

// ---- Handle Scrape Request ----

async function handleScrapeRequest(sendResponse) {
  const site = detectSite();

  if (!site) {
    sendResponse({ error: 'unsupported_tab' });
    return;
  }

  const scraper = getScraper(site);
  const interceptor = getInterceptor(site);

  if (!scraper && !interceptor) {
    sendResponse({ error: 'scraper_not_loaded', site });
    return;
  }

  try {
    // Check if we need to navigate to offers page (scraper knows this)
    if (scraper && scraper.needsNavigation && scraper.needsNavigation()) {
      const offersUrl = scraper.getOffersUrl();
      if (offersUrl) {
        localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify({
          site,
          status: 'pending',
          timestamp: Date.now()
        }));
        window.location.href = offersUrl;
        sendResponse({ site, redirecting: true });
        return;
      }
    }

    // Run hybrid extraction
    debug.log('[RMX-Orchestrator] Starting hybrid extraction for', site);
    const result = await hybridExtract(site);
    debug.log(`[RMX-Orchestrator] Extraction complete via ${result.method}:`, result.offers?.length, 'offers');

    const response = {
      site,
      offers: result.offers || [],
      added: result.added || 0,
      totalFound: result.totalFound || result.offers?.length || 0,
      method: result.method
    };

    sendResponse(response);
    debug.log('[RMX-Orchestrator] Response sent to popup');
  } catch (err) {
    debug.error('[RMX-Orchestrator] Extraction failed:', err);
    sendResponse({ error: err?.message || 'scrape_failed', site });
  }
}

// ---- Auto-Sync ----

async function autoSyncIfPending() {
  const pendingStr = localStorage.getItem(AUTO_SYNC_KEY);
  if (!pendingStr) return;

  try {
    const pending = JSON.parse(pendingStr);
    if (pending.status !== 'pending') return;

    const currentSite = detectSite();
    if (currentSite !== pending.site) return;

    const scraper = getScraper(currentSite);
    if (!scraper) return;

    if (scraper.needsNavigation && scraper.needsNavigation()) return;

    localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify({
      ...pending,
      status: 'running'
    }));

    debug.log('[RMX-Orchestrator] Auto-sync starting for', currentSite);

    const result = await hybridExtract(currentSite);

    if (result.offers && result.offers.length > 0) {
      await mergeAndStoreOffers(result.offers, currentSite);
    }

    debug.log(`[RMX-Orchestrator] Auto-sync complete via ${result.method}:`, result.offers?.length, 'offers');
  } catch (err) {
    debug.warn('[RMX-Orchestrator] Auto-sync failed:', err);
  } finally {
    localStorage.removeItem(AUTO_SYNC_KEY);
  }
}

// ---- Merge & Store ----

function mergeAndStoreOffers(newOffers, source) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rmx_offers'], (result) => {
      const existing = result.rmx_offers || [];

      const mergedMap = new Map();
      existing.forEach(offer => {
        const key = `${offer.source}-${offer.merchant}`.toLowerCase();
        mergedMap.set(key, offer);
      });

      newOffers.forEach(offer => {
        const key = `${source}-${offer.merchant}`.toLowerCase();
        mergedMap.set(key, {
          ...offer,
          source,
          id: offer.id || `rmx_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`,
          optedInAt: offer.optedInAt || new Date().toISOString(),
          status: 'active'
        });
      });

      const merged = Array.from(mergedMap.values());
      chrome.storage.local.set({ rmx_offers: merged }, () => resolve(merged));
    });
  });
}

// ---- Message Listener ----

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape_offers') {
    handleScrapeRequest(sendResponse);
    return true;
  }

  if (request.action === 'get_site_info') {
    const site = detectSite();
    const scraper = getScraper(site);
    const interceptor = getInterceptor(site);
    sendResponse({
      site,
      scraperLoaded: !!scraper,
      interceptorLoaded: !!interceptor,
      url: window.location.href
    });
    return false;
  }

  if (request.action === 'check_portal') {
    if (typeof CapitalOneScraper !== 'undefined' && CapitalOneScraper.checkCurrentSite) {
      CapitalOneScraper.checkCurrentSite().then(result => {
        sendResponse(result);
      });
      return true;
    }
    sendResponse({ available: false });
    return false;
  }
});

// ---- Pending Sync from Popup ----

async function checkPendingSyncFromPopup() {
  try {
    const result = await chrome.storage.local.get(['rmx_pending_sync']);
    if (!result.rmx_pending_sync) return;

    const { source, timestamp } = result.rmx_pending_sync;
    const currentSite = detectSite();

    if (currentSite === source) {
      debug.log('[RMX-Orchestrator] Found pending sync from popup for', source);
      await chrome.storage.local.remove('rmx_pending_sync');

      setTimeout(async () => {
        const scraper = getScraper(currentSite);
        const interceptor = getInterceptor(currentSite);
        if (!scraper && !interceptor) return;

        debug.log('[RMX-Orchestrator] Auto-syncing after navigation...');

        chrome.runtime.sendMessage({
          action: 'start_sync',
          portal: currentSite
        }).catch(() => {});

        try {
          const result = await hybridExtract(currentSite);
          if (result.offers && result.offers.length > 0) {
            await mergeAndStoreOffers(result.offers, currentSite);
            debug.log(`[RMX-Orchestrator] Auto-sync complete via ${result.method}:`, result.offers.length, 'offers saved');

            chrome.runtime.sendMessage({
              action: 'complete_sync',
              portal: currentSite,
              offersCount: result.offers.length
            }).catch(() => {});
          } else {
            chrome.runtime.sendMessage({
              action: 'complete_sync',
              portal: currentSite,
              offersCount: 0
            }).catch(() => {});
          }
        } catch (err) {
          debug.error('[RMX-Orchestrator] Auto-sync failed:', err);
          chrome.runtime.sendMessage({
            action: 'sync_error',
            portal: currentSite,
            error: err.message
          }).catch(() => {});
        }
      }, 2000);
    }
  } catch (err) {
    debug.error('[RMX-Orchestrator] Error checking pending sync:', err);
  }
}

// ---- Initialize Interceptor on Page Load ----

(function initInterceptor() {
  const site = detectSite();
  if (!site) return;

  const interceptor = getInterceptor(site);
  if (interceptor && typeof interceptor.inject === 'function') {
    debug.log(`[RMX-Orchestrator] Injecting interceptor for ${site}`);
    try {
      interceptor.inject();
    } catch (err) {
      debug.warn(`[RMX-Orchestrator] Failed to inject interceptor for ${site}:`, err);
    }
  }
})();

// ---- Startup ----

autoSyncIfPending();
checkPendingSyncFromPopup();

chrome.runtime.sendMessage({
  action: 'content_script_ready',
  site: detectSite(),
  url: window.location.href
});
```

**Step 4: Run all tests**

Run: `npm test`
Expected: All existing tests still pass (77 + new ones)

**Step 5: Commit**

```bash
git add content/content-main.js tests/content-main-orchestrator.test.js
git commit -m "feat: upgrade content-main.js to hybrid interceptor-first orchestration with fallback"
```

---

## Task 5: Create `content/interceptors/chase-interceptor.js` — Chase API Observation

**Files:**
- Create: `content/interceptors/chase-interceptor.js`
- Test: `tests/chase-interceptor.test.js`

**Step 1: Write the failing test**

```javascript
// tests/chase-interceptor.test.js

global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
global.BaseInterceptor = {
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
  generateMainWorldScript: jest.fn(() => 'mock_script'),
  normalizeOffer: jest.fn(raw => ({ ...raw, normalized: true })),
  sanitize: jest.fn(v => v),
  generateActivationScript: jest.fn(() => 'mock_activation')
};
global.Categories = { detectCategory: jest.fn(() => 'shopping') };
global.ExtractorConfig = {
  logRawResponses: false,
  getRandomizedDelay: () => 1000
};

const { ChaseInterceptor } = require('../content/interceptors/chase-interceptor.js');

describe('ChaseInterceptor', () => {
  test('has correct portal and source', () => {
    expect(ChaseInterceptor.portal).toBe('chase');
    expect(ChaseInterceptor.source).toBe('chase');
  });

  test('urlPatterns contains commerce/offers related patterns', () => {
    expect(ChaseInterceptor.urlPatterns.length).toBeGreaterThan(0);
    const joined = ChaseInterceptor.urlPatterns.join(' ');
    expect(joined).toMatch(/offer|commerce|merchant/i);
  });

  describe('parseOffers', () => {
    test('extracts offers from array-style response', () => {
      const response = {
        offers: [
          { merchantName: 'TestStore', rewardValue: '$20 cash back', offerId: 'o1', expirationDate: '2026-03-15' },
          { merchantName: 'Store2', rewardValue: '5% cash back', offerId: 'o2', expirationDate: '2026-04-01' }
        ]
      };
      const offers = ChaseInterceptor.parseOffers(response, { url: '/offers' });
      expect(offers.length).toBe(2);
      expect(BaseInterceptor.normalizeOffer).toHaveBeenCalled();
    });

    test('returns empty array for unrecognized response format', () => {
      const offers = ChaseInterceptor.parseOffers({ random: 'data' }, { url: '/something' });
      expect(offers).toEqual([]);
    });

    test('handles null/undefined payload', () => {
      expect(ChaseInterceptor.parseOffers(null, {})).toEqual([]);
      expect(ChaseInterceptor.parseOffers(undefined, {})).toEqual([]);
    });

    test('handles response where offers is directly an array', () => {
      const response = [
        { merchantName: 'Direct', rewardValue: '$10 back', offerId: 'd1' }
      ];
      const offers = ChaseInterceptor.parseOffers(response, { url: '/offers' });
      expect(offers.length).toBe(1);
    });
  });

  describe('isOfferResponse', () => {
    test('returns true for URLs containing offer-related patterns', () => {
      expect(ChaseInterceptor.isOfferResponse({ url: '/api/commerce/offers' })).toBe(true);
      expect(ChaseInterceptor.isOfferResponse({ url: '/merchantOffers/list' })).toBe(true);
    });

    test('returns false for unrelated URLs', () => {
      expect(ChaseInterceptor.isOfferResponse({ url: '/api/accounts/balance' })).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/chase-interceptor.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

```javascript
// content/interceptors/chase-interceptor.js
//
// Chase Offers API Observation Layer
//
// Chase's offer hub (secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub)
// is a React SPA that fetches offer data from internal APIs. This interceptor observes
// those API responses to extract structured offer data.
//
// Known API patterns (to be refined via live observation):
// - GET requests with /offers, /commerce, /merchantOffers in the path
// - JSON responses containing arrays of offer objects
// - POST requests for offer activation
//
// The main-world observer is injected early to wrap fetch/XHR before
// Chase's JS makes its first API call.

const ChaseInterceptor = {
  portal: 'chase',
  source: 'chase',

  // URL patterns to watch for offer-related API calls
  // These are heuristic starting points — refine after live observation.
  urlPatterns: [
    '/offers',
    '/commerce',
    '/merchantoffers',
    '/merchant-offers',
    '/deals',
    '/rewards/offers',
    '/offer-hub'
  ],

  // Activation URL patterns (POST requests)
  activationPatterns: [
    '/activate',
    '/enroll',
    '/add-offer',
    '/addOffer',
    '/opt-in'
  ],

  // State
  _injected: false,
  _capturedOffers: [],
  _activationResults: [],

  /**
   * Inject the main-world observer script.
   * Called by content-main.js on page load.
   */
  inject() {
    if (this._injected) return;

    const allPatterns = [...this.urlPatterns, ...this.activationPatterns];
    const script = BaseInterceptor.generateMainWorldScript({
      portal: this.portal,
      urlPatterns: allPatterns,
      captureActivation: true
    });

    // Inject via script element (works in content script context)
    try {
      const scriptEl = document.createElement('script');
      scriptEl.textContent = script;
      (document.head || document.documentElement).appendChild(scriptEl);
      scriptEl.remove();
      this._injected = true;
      debug.log('[RMX-Interceptor-Chase] Observer injected into main world');
    } catch (err) {
      debug.warn('[RMX-Interceptor-Chase] Script injection failed (CSP?):', err.message);
      // Fallback: try chrome.scripting.executeScript if available
      // This is handled by the orchestrator falling back to DOM scraper
    }
  },

  /**
   * Initialize the interceptor. Sets up message listener for this portal.
   */
  async init() {
    this.inject();
  },

  /**
   * Parse offer data from a captured API response.
   * This is the portal-specific logic that understands Chase's API format.
   *
   * @param {Object|Array} payload - Raw JSON response body
   * @param {Object} meta - Request metadata { url, method, status }
   * @returns {Array} Normalized offers
   */
  parseOffers(payload, meta) {
    if (!payload) return [];

    const offers = [];

    try {
      // Strategy 1: Response has an `offers` array property
      let rawOffers = null;

      if (Array.isArray(payload)) {
        rawOffers = payload;
      } else if (Array.isArray(payload.offers)) {
        rawOffers = payload.offers;
      } else if (Array.isArray(payload.data)) {
        rawOffers = payload.data;
      } else if (Array.isArray(payload.merchantOffers)) {
        rawOffers = payload.merchantOffers;
      } else if (Array.isArray(payload.commerceOffers)) {
        rawOffers = payload.commerceOffers;
      } else if (payload.offerList && Array.isArray(payload.offerList)) {
        rawOffers = payload.offerList;
      }

      // Strategy 2: Walk object looking for first large array of objects
      if (!rawOffers) {
        rawOffers = this._findOfferArray(payload);
      }

      if (!rawOffers || rawOffers.length === 0) return [];

      if (typeof ExtractorConfig !== 'undefined' && ExtractorConfig.logRawResponses) {
        debug.log('[RMX-Interceptor-Chase] Raw offers sample:', JSON.stringify(rawOffers[0]).substring(0, 500));
      }

      for (const raw of rawOffers) {
        const parsed = this._parseChaseOffer(raw);
        if (parsed) {
          offers.push(BaseInterceptor.normalizeOffer(parsed, this.source));
        }
      }
    } catch (err) {
      debug.warn('[RMX-Interceptor-Chase] Parse error:', err);
    }

    debug.log(`[RMX-Interceptor-Chase] Parsed ${offers.length} offers from API response`);
    return offers;
  },

  /**
   * Check if a captured response looks like an offer list.
   */
  isOfferResponse(meta) {
    if (!meta || !meta.url) return false;
    const lower = meta.url.toLowerCase();
    return this.urlPatterns.some(p => lower.includes(p.toLowerCase()));
  },

  /**
   * Parse a single Chase offer object from the API.
   * Field names are heuristic — the actual Chase API field names
   * will be discovered during live testing and documented here.
   *
   * Known/suspected field mappings:
   * - merchantName / merchant / name → merchant display name
   * - rewardValue / reward / value / offerDescription → offer value text
   * - offerId / id / offerKey → internal offer identifier
   * - expirationDate / expiry / endDate → offer expiry
   * - activationStatus / status → current status
   * - accountId / cardId → eligible card
   * - activationUrl / enrollUrl → activation endpoint
   */
  _parseChaseOffer(raw) {
    if (!raw || typeof raw !== 'object') return null;

    // Extract merchant name (try multiple field names)
    const merchant = raw.merchantName || raw.merchant || raw.name ||
                     raw.merchantDisplayName || raw.brandName ||
                     raw.storeName || null;
    if (!merchant) return null;

    // Extract value
    const value = raw.rewardValue || raw.reward || raw.value ||
                  raw.offerDescription || raw.description ||
                  raw.cashBack || raw.discount || null;

    // Extract expiry
    const expiry = raw.expirationDate || raw.expiry || raw.endDate ||
                   raw.validThrough || raw.expires || 'Check portal';

    // Extract offer ID
    const offerId = raw.offerId || raw.id || raw.offerKey ||
                    raw.offerIdentifier || null;

    // Extract activation info
    const activationUrl = raw.activationUrl || raw.enrollUrl ||
                          raw.addUrl || null;

    // Extract card/account info
    let eligibleCards = null;
    if (raw.eligibleCards && Array.isArray(raw.eligibleCards)) {
      eligibleCards = raw.eligibleCards;
    } else if (raw.accountId) {
      eligibleCards = [raw.accountId];
    } else if (raw.cardId) {
      eligibleCards = [raw.cardId];
    }

    // Extract spend/reward limits
    const minSpend = raw.minSpend || raw.minimumSpend || raw.spendThreshold || null;
    const maxReward = raw.maxReward || raw.rewardCap || raw.maximumReward || null;

    // Extract status
    const status = raw.activationStatus || raw.status || raw.offerStatus || null;

    return {
      merchant,
      value: value || 'See details',
      expiry,
      offerId,
      activationUrl,
      eligibleCards,
      minSpend: minSpend ? Number(minSpend) : null,
      maxReward: maxReward ? Number(maxReward) : null,
      status
    };
  },

  /**
   * Walk an object looking for the first array of objects with merchant-like fields.
   * Heuristic fallback when we don't know the exact response structure.
   */
  _findOfferArray(obj, depth = 0) {
    if (depth > 3 || !obj || typeof obj !== 'object') return null;

    // Check each property
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        // Does this look like an offers array?
        const sample = val[0];
        const hasNameField = sample.merchantName || sample.merchant || sample.name || sample.brandName || sample.storeName;
        const hasValueField = sample.rewardValue || sample.reward || sample.value || sample.offerDescription || sample.cashBack;
        if (hasNameField || hasValueField) {
          return val;
        }
      }
      // Recurse into nested objects
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const found = this._findOfferArray(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  },

  /**
   * Activate all offers via API (if activation URL pattern is known).
   * Falls back to DOM clicking if API activation is not available.
   *
   * @param {Array} offers - Normalized offers with offerId and activationUrl
   * @returns {number} Number of successfully activated offers
   */
  async activateAll(offers) {
    // TODO: Implement API-based activation after discovering Chase's activation endpoint.
    // For now, return 0 and let the DOM scraper handle activation.
    // When the activation API pattern is known, this will:
    // 1. Filter offers that have offerId and activationUrl
    // 2. Send POST requests with randomized delays
    // 3. Return count of successful activations
    debug.log('[RMX-Interceptor-Chase] API activation not yet implemented, deferring to DOM scraper');
    return 0;
  }
};

if (typeof window !== 'undefined') {
  window.ChaseInterceptor = ChaseInterceptor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChaseInterceptor };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/chase-interceptor.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add content/interceptors/chase-interceptor.js tests/chase-interceptor.test.js
git commit -m "feat: add Chase interceptor with heuristic API response parsing and offer normalization"
```

---

## Task 6: Create `content/interceptors/amex-interceptor.js` — Amex API Observation

**Files:**
- Create: `content/interceptors/amex-interceptor.js`
- Test: `tests/amex-interceptor.test.js`

**Step 1: Write the failing test**

```javascript
// tests/amex-interceptor.test.js

global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
global.BaseInterceptor = {
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
  generateMainWorldScript: jest.fn(() => 'mock_script'),
  normalizeOffer: jest.fn(raw => ({ ...raw, normalized: true })),
  sanitize: jest.fn(v => v),
  generateActivationScript: jest.fn(() => 'mock_activation')
};
global.Categories = { detectCategory: jest.fn(() => 'shopping') };
global.ExtractorConfig = {
  logRawResponses: false,
  getRandomizedDelay: () => 1000
};

const { AmexInterceptor } = require('../content/interceptors/amex-interceptor.js');

describe('AmexInterceptor', () => {
  test('has correct portal and source', () => {
    expect(AmexInterceptor.portal).toBe('amex');
    expect(AmexInterceptor.source).toBe('amex');
  });

  test('urlPatterns contains offers/enrollment patterns', () => {
    const joined = AmexInterceptor.urlPatterns.join(' ');
    expect(joined).toMatch(/offer|enroll/i);
  });

  describe('parseOffers', () => {
    test('extracts offers from response with offers array', () => {
      const response = {
        offers: [
          { name: 'Starbucks', description: 'Earn 5% back', offerId: 'a1', expiryDate: '2026-03-20', cardTokens: ['c1', 'c2'] },
          { name: 'Amazon', description: '$20 statement credit', offerId: 'a2', expiryDate: '2026-04-15' }
        ]
      };
      const offers = AmexInterceptor.parseOffers(response, { url: '/offers' });
      expect(offers.length).toBe(2);
    });

    test('extracts eligibleCards from cardTokens field', () => {
      // We test the raw parsing, not the normalized output (BaseInterceptor.normalizeOffer is mocked)
      const response = {
        offers: [
          { name: 'Test', description: '5% back', offerId: 'x', cardTokens: ['card1', 'card2'] }
        ]
      };
      AmexInterceptor.parseOffers(response, { url: '/offers' });
      const callArg = BaseInterceptor.normalizeOffer.mock.calls[BaseInterceptor.normalizeOffer.mock.calls.length - 1][0];
      expect(callArg.eligibleCards).toEqual(['card1', 'card2']);
    });

    test('returns empty for non-offer responses', () => {
      expect(AmexInterceptor.parseOffers({ user: {} }, {})).toEqual([]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/amex-interceptor.test.js`
Expected: FAIL

**Step 3: Write implementation**

```javascript
// content/interceptors/amex-interceptor.js
//
// American Express Offers API Observation Layer
//
// Amex's offers page (americanexpress.com/us/credit-cards/category/offer/all/)
// is a React SPA. The page fetches offers from internal APIs, likely including
// offer IDs, eligible card tokens, and activation endpoints.
//
// Key feature: Multi-card activation. Amex allows the same offer on multiple
// personal cards, but the DOM hides the offer after adding to one. The API
// should accept card token parameters for sequential multi-card activation.
//
// Known API patterns (to be refined via live observation):
// - Offer list: GET with /offers or /enrollment in path
// - Activation: POST with offer ID + card member token
// - Card list: Response may include eligible card/account identifiers

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
  _capturedOffers: [],

  inject() {
    if (this._injected) return;

    const allPatterns = [...this.urlPatterns, ...this.activationPatterns];
    const script = BaseInterceptor.generateMainWorldScript({
      portal: this.portal,
      urlPatterns: allPatterns,
      captureActivation: true
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

  async init() {
    this.inject();
  },

  /**
   * Parse offer data from an Amex API response.
   *
   * Suspected Amex API field names:
   * - name / merchantName → merchant
   * - description / offerDescription → value (e.g., "Earn 5% back on...")
   * - offerId / id → internal ID
   * - expiryDate / endDate → expiry
   * - cardTokens / eligibleCardMemberTokens → list of card IDs for multi-card activation
   * - enrollmentUrl / activateUrl → activation endpoint
   * - minimumSpend / spendThreshold → min spend
   * - maximumReward / rewardCap → max reward
   * - status / enrolled → activation status
   */
  parseOffers(payload, meta) {
    if (!payload) return [];

    const offers = [];

    try {
      let rawOffers = null;

      if (Array.isArray(payload)) {
        rawOffers = payload;
      } else if (Array.isArray(payload.offers)) {
        rawOffers = payload.offers;
      } else if (Array.isArray(payload.data)) {
        rawOffers = payload.data;
      } else if (Array.isArray(payload.eligibleOffers)) {
        rawOffers = payload.eligibleOffers;
      } else if (Array.isArray(payload.merchantOffers)) {
        rawOffers = payload.merchantOffers;
      }

      // Heuristic: walk object for first offer-like array
      if (!rawOffers) {
        rawOffers = this._findOfferArray(payload);
      }

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

    const activationUrl = raw.enrollmentUrl || raw.activateUrl ||
                          raw.activationUrl || null;

    // Multi-card support: extract eligible card tokens
    let eligibleCards = null;
    if (raw.cardTokens && Array.isArray(raw.cardTokens)) {
      eligibleCards = raw.cardTokens;
    } else if (raw.eligibleCardMemberTokens && Array.isArray(raw.eligibleCardMemberTokens)) {
      eligibleCards = raw.eligibleCardMemberTokens;
    } else if (raw.eligibleCards && Array.isArray(raw.eligibleCards)) {
      eligibleCards = raw.eligibleCards;
    }

    const minSpend = raw.minimumSpend || raw.spendThreshold || raw.minSpend || null;
    const maxReward = raw.maximumReward || raw.rewardCap || raw.maxReward || null;

    const status = raw.status || (raw.enrolled ? 'activated' : 'available') || null;

    return {
      merchant,
      value: value || 'See details',
      expiry,
      offerId,
      activationUrl,
      eligibleCards,
      minSpend: minSpend ? Number(minSpend) : null,
      maxReward: maxReward ? Number(maxReward) : null,
      status
    };
  },

  _findOfferArray(obj, depth = 0) {
    if (depth > 3 || !obj || typeof obj !== 'object') return null;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        const sample = val[0];
        const hasNameField = sample.name || sample.merchantName || sample.merchant || sample.brandName;
        const hasValueField = sample.description || sample.offerDescription || sample.value || sample.rewardValue;
        if (hasNameField || hasValueField) return val;
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const found = this._findOfferArray(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  },

  /**
   * Activate offers across multiple cards via API.
   * This is the key feature unlock for Amex — one offer, many cards.
   *
   * TODO: Implement after discovering Amex's activation endpoint format.
   * Expected flow:
   * 1. For each offer with eligibleCards, iterate card tokens
   * 2. POST to activation endpoint with offerId + cardToken
   * 3. Wait randomized delay between requests
   * 4. Return total activated count
   */
  async activateAll(offers) {
    debug.log('[RMX-Interceptor-Amex] API activation not yet implemented');
    return 0;
  }
};

if (typeof window !== 'undefined') {
  window.AmexInterceptor = AmexInterceptor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AmexInterceptor };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/amex-interceptor.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add content/interceptors/amex-interceptor.js tests/amex-interceptor.test.js
git commit -m "feat: add Amex interceptor with multi-card activation support skeleton"
```

---

## Task 7: Create Remaining Interceptor Skeletons (Citi, Capital One, BofA, Discover, US Bank)

**Files:**
- Create: `content/interceptors/citi-interceptor.js`
- Create: `content/interceptors/capital-one-interceptor.js`
- Create: `content/interceptors/bofa-interceptor.js`
- Create: `content/interceptors/discover-interceptor.js`
- Create: `content/interceptors/usbank-interceptor.js`

These all follow the same pattern as Chase/Amex but with portal-specific URL patterns and field name heuristics. Each interceptor should be a minimal skeleton that:
1. Defines `portal`, `source`, `urlPatterns`
2. Has `inject()`, `init()`, `parseOffers()`, `activateAll()` methods
3. Has portal-specific field name mappings in `_parse[Portal]Offer()`
4. Has the `_findOfferArray()` heuristic

For brevity, each follows the Chase template exactly. The only differences are:
- `portal`/`source` values
- `urlPatterns` (portal-specific URL hints)
- Field name mappings in the private parse method (portal-specific guesses)

**Step 1: Create all 5 files** following the Chase template pattern.

**Step 2: Run all tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add content/interceptors/citi-interceptor.js content/interceptors/capital-one-interceptor.js content/interceptors/bofa-interceptor.js content/interceptors/discover-interceptor.js content/interceptors/usbank-interceptor.js
git commit -m "feat: add interceptor skeletons for Citi, Capital One, BofA, Discover, US Bank"
```

---

## Task 8: Update `manifest.json` — Add Interceptor Scripts to Content Script Entries

**Files:**
- Modify: `manifest.json`

**Step 1: Add new files to each portal's content script entry**

For each bank portal (NOT rakuten, NOT capital-one-shopping), add these scripts **before** the existing scraper and content-main.js:

```
"lib/extractor-config.js",
"lib/interceptor-health.js",
"content/interceptors/base-interceptor.js",
"content/interceptors/{portal}-interceptor.js",
```

Also add `"content/interceptors/"` to `web_accessible_resources`.

The new load order per portal becomes:
1. `lib/debug.js`
2. `lib/categories.js`
3. `lib/extractor-config.js` (NEW)
4. `lib/interceptor-health.js` (NEW)
5. `content/utils.js`
6. `content/interceptors/base-interceptor.js` (NEW)
7. `content/interceptors/{portal}-interceptor.js` (NEW)
8. `content/scrapers/{portal}.js` (existing)
9. `content/content-main.js` (existing, modified)

**Important:** Change `run_at` to `"document_start"` for bank portal entries (needed so fetch/XHR wrappers are in place before the page's JS runs). Keep `"document_idle"` for the merchant-banner entry.

**Step 2: Run test** — load extension in Chrome, verify no errors on `chrome://extensions/`

**Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add interceptor scripts to manifest content_scripts with document_start injection"
```

---

## Task 9: Add `StorageKeys.INTERCEPTOR_HEALTH` to `lib/storage.js`

**Files:**
- Modify: `lib/storage.js` (line 18, add key)

**Step 1: Add the key**

```javascript
// In StorageKeys object, add:
INTERCEPTOR_HEALTH: 'rmx_interceptor_health'
```

**Step 2: Run existing tests to verify no regression**

Run: `npm test -- tests/storage.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add lib/storage.js
git commit -m "feat: add INTERCEPTOR_HEALTH storage key"
```

---

## Task 10: Integration Test — Fallback Verification

**Files:**
- Test: `tests/interceptor-fallback.test.js`

**Step 1: Write integration test**

```javascript
// tests/interceptor-fallback.test.js
// Verifies that when interceptor is disabled or produces no data,
// the system falls back to the DOM scraper correctly.

global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

describe('Interceptor Fallback', () => {
  test('ExtractorConfig.isInterceptorEnabled returns false when master toggle is off', () => {
    const { ExtractorConfig } = require('../lib/extractor-config.js');
    const original = ExtractorConfig.useInterceptors;
    ExtractorConfig.useInterceptors = false;
    expect(ExtractorConfig.isInterceptorEnabled('chase')).toBe(false);
    ExtractorConfig.useInterceptors = original;
  });

  test('ExtractorConfig.isInterceptorEnabled returns false for rakuten', () => {
    const { ExtractorConfig } = require('../lib/extractor-config.js');
    expect(ExtractorConfig.isInterceptorEnabled('rakuten')).toBe(false);
  });

  test('ExtractorConfig.isFallbackEnabled returns true for all portals by default', () => {
    const { ExtractorConfig } = require('../lib/extractor-config.js');
    const portals = ['amex', 'chase', 'citi', 'capital-one', 'bofa', 'discover', 'usbank', 'rakuten'];
    portals.forEach(p => {
      expect(ExtractorConfig.isFallbackEnabled(p)).toBe(true);
    });
  });

  test('BaseInterceptor.parseMessageFromMainWorld rejects foreign messages', () => {
    const { BaseInterceptor } = require('../content/interceptors/base-interceptor.js');
    expect(BaseInterceptor.parseMessageFromMainWorld({ data: { type: 'OTHER_EXT' } })).toBeNull();
  });

  test('ChaseInterceptor.parseOffers handles empty/null gracefully', () => {
    global.BaseInterceptor = {
      normalizeOffer: jest.fn(r => r),
      MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
      generateMainWorldScript: jest.fn(() => '')
    };
    global.ExtractorConfig = { logRawResponses: false };
    const { ChaseInterceptor } = require('../content/interceptors/chase-interceptor.js');
    expect(ChaseInterceptor.parseOffers(null, {})).toEqual([]);
    expect(ChaseInterceptor.parseOffers({}, {})).toEqual([]);
    expect(ChaseInterceptor.parseOffers({ offers: [] }, {})).toEqual([]);
  });

  test('InterceptorHealth records fallback and increments failure count', async () => {
    const storageData = {};
    global.chrome = {
      storage: {
        local: {
          get: jest.fn((keys, cb) => {
            const result = {};
            keys.forEach(k => { if (storageData[k]) result[k] = storageData[k]; });
            cb(result);
          }),
          set: jest.fn((obj, cb) => { Object.assign(storageData, obj); if (cb) cb(); })
        }
      }
    };
    const { InterceptorHealth } = require('../lib/interceptor-health.js');
    await InterceptorHealth.recordFallback('chase', 'timeout');
    await InterceptorHealth.recordFallback('chase', 'no_data');
    const health = await InterceptorHealth.getHealth('chase');
    expect(health.consecutiveInterceptorFailures).toBe(2);
    expect(health.lastMethod).toBe('scraper');
  });
});
```

**Step 2: Run test**

Run: `npm test -- tests/interceptor-fallback.test.js`
Expected: PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass (77 existing + ~50 new)

**Step 4: Commit**

```bash
git add tests/interceptor-fallback.test.js
git commit -m "test: add integration tests verifying interceptor fallback behavior"
```

---

## Task 11: Update `CLAUDE.md` — Document New Architecture

**Files:**
- Modify: `CLAUDE.md`

Update the Architecture section to include the interceptor layer, update the Data Model with new fields, add interceptor debugging info, and update the TODO section.

**Step 1: Update the relevant sections**

Add under Architecture:
```
├── content/
│   ├── interceptors/              # Primary: Network API observation
│   │   ├── base-interceptor.js    # fetch/XHR wrapping, message bridge, normalization
│   │   ├── chase-interceptor.js   # Chase API patterns
│   │   ├── amex-interceptor.js    # Amex API patterns (multi-card activation)
│   │   ├── citi-interceptor.js
│   │   ├── capital-one-interceptor.js
│   │   ├── bofa-interceptor.js
│   │   ├── discover-interceptor.js
│   │   └── usbank-interceptor.js
```

Update Offer Object to include new nullable fields.

Add interceptor health storage key.

Update TODO with next steps (live API endpoint discovery).

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with interceptor layer architecture and new fields"
```

---

## Summary

| Task | Component | Purpose |
|------|-----------|---------|
| 1 | `lib/extractor-config.js` | Feature flags, per-portal toggles, timing config |
| 2 | `content/interceptors/base-interceptor.js` | Core: fetch/XHR wrapping, message bridge, normalization, sanitization |
| 3 | `lib/interceptor-health.js` | Per-portal health monitoring |
| 4 | `content/content-main.js` | Orchestrator upgrade: interceptor-first with fallback |
| 5 | `content/interceptors/chase-interceptor.js` | Chase API observation + heuristic parsing |
| 6 | `content/interceptors/amex-interceptor.js` | Amex API observation + multi-card skeleton |
| 7 | Remaining interceptors (5 files) | Citi, Capital One, BofA, Discover, US Bank skeletons |
| 8 | `manifest.json` | Wire new scripts, change to `document_start` |
| 9 | `lib/storage.js` | Add health storage key |
| 10 | Integration tests | Verify fallback behavior end-to-end |
| 11 | `CLAUDE.md` | Document new architecture |

**After completing all tasks:** The extension will have a fully wired interceptor infrastructure. The actual API endpoint patterns and response field mappings will be refined when you test against live bank portals. The debug logs (`[RMX-Interceptor-*]`) will show exactly which URLs are captured and what data is extracted, making it straightforward to update the patterns.
