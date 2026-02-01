// content/interceptors/base-interceptor.js
//
// Core utilities for the network response observation layer.
// Provides: main-world script generation, fetch/XHR monkey-patching,
// message bridging, offer normalization, and data sanitization.

const BaseInterceptor = {
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',

  /**
   * Generate JavaScript to inject into the page's main world.
   * Wraps fetch() and XMLHttpRequest to observe API responses
   * matching URL patterns. Captured responses are bridged back via postMessage.
   */
  generateMainWorldScript({ portal, urlPatterns, captureActivation = false }) {
    const patternsJSON = JSON.stringify(urlPatterns);
    const messageType = this.MESSAGE_TYPE;

    return `
(function() {
  'use strict';
  var RMX_PORTAL = ${JSON.stringify(portal)};
  var RMX_URL_PATTERNS = ${patternsJSON};
  var RMX_MSG_TYPE = ${JSON.stringify(messageType)};
  var RMX_CAPTURE_ACTIVATION = ${captureActivation};

  function urlMatchesPatterns(url) {
    if (!url) return false;
    var lower = url.toLowerCase();
    return RMX_URL_PATTERNS.some(function(p) { return lower.includes(p.toLowerCase()); });
  }

  function isJSONResponse(ct) {
    return ct && ct.indexOf('application/json') !== -1;
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
    } catch (e) {}
  }

  // Wrap fetch
  var originalFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var url = '';
    if (typeof args[0] === 'string') { url = args[0]; }
    else if (args[0] && args[0].url) { url = args[0].url; }

    var method = 'GET';
    if (args[1] && args[1].method) { method = args[1].method.toUpperCase(); }
    else if (args[0] && typeof args[0] !== 'string' && args[0].method) { method = args[0].method.toUpperCase(); }

    if (!urlMatchesPatterns(url)) {
      return originalFetch.apply(this, args);
    }
    if (method !== 'GET' && !RMX_CAPTURE_ACTIVATION) {
      return originalFetch.apply(this, args);
    }

    return originalFetch.apply(this, args).then(function(response) {
      try {
        var cloned = response.clone();
        var ct = cloned.headers.get('content-type') || '';
        if (isJSONResponse(ct)) {
          cloned.json().then(function(data) {
            var action = (method === 'GET') ? 'api_response' : 'activation_response';
            sendToContentScript(action, data, {
              url: url, method: method, status: response.status, timestamp: Date.now()
            });
          }).catch(function() {});
        }
      } catch (e) {}
      return response;
    });
  };

  // Wrap XMLHttpRequest
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
            var ct = xhr.getResponseHeader('content-type') || '';
            if (isJSONResponse(ct) && xhr.responseText) {
              var data = JSON.parse(xhr.responseText);
              var action = (xhr._rmx_method === 'GET') ? 'api_response' : 'activation_response';
              sendToContentScript(action, data, {
                url: xhr._rmx_url, method: xhr._rmx_method, status: xhr.status, timestamp: Date.now()
              });
            }
          } catch (e) {}
        });
      }
    }
    return origSend.apply(this, arguments);
  };

  sendToContentScript('observers_ready', null, { timestamp: Date.now() });
})();
`;
  },

  /**
   * Parse a postMessage event from the main world.
   * Returns null if not from our interceptor.
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
   * Normalize raw API offer data into the standard extension format.
   */
  normalizeOffer(raw, source) {
    const merchant = this.sanitize(raw.merchant || 'Unknown');
    const value = this.sanitize(raw.value || 'See details');
    const expiry = this.sanitize(raw.expiry || 'Check portal');

    let merchantCategory = 'other';
    if (typeof Categories !== 'undefined' && Categories.detectCategory) {
      merchantCategory = Categories.detectCategory(merchant);
    }

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
      offerId: raw.offerId || null,
      activationUrl: raw.activationUrl || null,
      eligibleCards: raw.eligibleCards || null,
      minSpend: raw.minSpend || null,
      maxReward: raw.maxReward || null,
      status: raw.status || null
    };
  },

  /**
   * Sanitize a value to prevent XSS.
   */
  sanitize(val) {
    if (typeof val !== 'string') return val;
    let cleaned = val.replace(/<[^>]*>/g, '');
    if (cleaned.length > 500) cleaned = cleaned.substring(0, 500);
    return cleaned;
  },

  /**
   * Check if >50% of core fields are populated.
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
   * Generate JS to make an authenticated activation request from the main world.
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

if (typeof window !== 'undefined') {
  window.BaseInterceptor = BaseInterceptor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BaseInterceptor };
}
