// Amex API Interceptor — runs in MAIN world (manifest "world": "MAIN")
// Patches fetch/XHR to capture outgoing activation requests during discovery,
// then replays the captured template for multi-card batch activation.
// Communicates with isolated-world content script via window.postMessage.
//
// Capture + replay only: no response observation, no beacons, no caching.
// Nothing leaves the page except the replayed Amex requests themselves.

(function() {
  'use strict';

  var CHANNEL = 'rmx-amex-api';
  var isCapturing = false;
  var capturedRequests = [];

  // GETs only captured if URL matches these patterns (avoids noise)
  var GET_CAPTURE_PATTERNS = ['/activate', '/enroll', '/add-offer', '/save-offer',
    '/opt-in', '/enrollment'];

  function shouldCaptureGet(url) {
    var lower = (url || '').toLowerCase();
    return GET_CAPTURE_PATTERNS.some(function(p) { return lower.indexOf(p) !== -1; });
  }

  function shouldCapture(method, url) {
    return isCapturing && (
      method === 'POST' || method === 'PUT' || method === 'PATCH' ||
      (method === 'GET' && shouldCaptureGet(url))
    );
  }

  function postCaptured(captured) {
    capturedRequests.push(captured);
    window.postMessage({
      channel: CHANNEL,
      type: 'captured_request',
      data: captured
    }, '*');
  }

  // The MAIN-world bridge is observable by page scripts, so command payloads
  // must never be allowed to turn it into an arbitrary cross-origin request
  // primitive. Amex activation and replay endpoints are HTTPS subdomains of
  // americanexpress.com; anything else is refused before fetch is called.
  function allowedAmexUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || rawUrl.length > 4096) return null;
    try {
      var parsed = new URL(rawUrl, window.location.href);
      var host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'https:' ||
          (host !== 'americanexpress.com' &&
           host.slice(-'.americanexpress.com'.length) !== '.americanexpress.com')) {
        return null;
      }
      return parsed.href;
    } catch (e) {
      return null;
    }
  }

  // ---- Patch fetch ----

  var originalFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var resource = args[0];
    var init = args[1] || {};
    var url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
    var method = (init.method || (resource && typeof resource !== 'string' && resource.method) || 'GET').toUpperCase();

    if (shouldCapture(method, url)) {
      var captured = {
        url: url,
        method: method,
        headers: {},
        body: null,
        timestamp: Date.now()
      };

      // Extract headers
      if (init.headers) {
        if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
          init.headers.forEach(function(v, k) { captured.headers[k] = v; });
        } else if (typeof init.headers === 'object') {
          var hKeys = Object.keys(init.headers);
          for (var i = 0; i < hKeys.length; i++) {
            captured.headers[hKeys[i]] = init.headers[hKeys[i]];
          }
        }
      }

      // Extract body
      if (init.body) {
        try {
          captured.body = typeof init.body === 'string'
            ? init.body
            : JSON.stringify(init.body);
        } catch(e) {
          captured.body = String(init.body);
        }
      }

      postCaptured(captured);
    }

    return originalFetch.apply(this, args);
  };

  // ---- Patch XMLHttpRequest ----

  var OrigXHR = window.XMLHttpRequest;
  if (OrigXHR && OrigXHR.prototype) {
    var origOpen = OrigXHR.prototype.open;
    var origSend = OrigXHR.prototype.send;
    var origSetHeader = OrigXHR.prototype.setRequestHeader;

    OrigXHR.prototype.open = function(method, url) {
      this._rmxCapMethod = method;
      this._rmxCapUrl = url;
      this._rmxCapHeaders = {};
      return origOpen.apply(this, arguments);
    };

    OrigXHR.prototype.setRequestHeader = function(key, value) {
      if (this._rmxCapHeaders) {
        this._rmxCapHeaders[key] = value;
      }
      return origSetHeader.apply(this, arguments);
    };

    OrigXHR.prototype.send = function(body) {
      var xhrMethod = (this._rmxCapMethod || 'GET').toUpperCase();
      if (shouldCapture(xhrMethod, this._rmxCapUrl)) {
        postCaptured({
          url: String(this._rmxCapUrl || ''),
          method: xhrMethod,
          headers: Object.assign({}, this._rmxCapHeaders || {}),
          body: body ? String(body) : null,
          timestamp: Date.now(),
          isXHR: true
        });
      }
      return origSend.apply(this, arguments);
    };
  }

  // ---- Listen for commands from content script ----

  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.channel !== CHANNEL) return;

    switch (event.data.type) {
      case 'start_capture':
        isCapturing = true;
        capturedRequests = [];
        break;

      case 'stop_capture':
        isCapturing = false;
        window.postMessage({
          channel: CHANNEL,
          type: 'capture_complete',
          data: capturedRequests.slice() // copy
        }, '*');
        break;

      case 'ping':
        window.postMessage({
          channel: CHANNEL,
          type: 'interceptor_ready'
        }, '*');
        break;

      case 'replay_request':
        // Replay a captured API call with modified URL/body. requestId is echoed
        // back because one offerId is replayed once per card in the same batch.
        var detail = event.data.data;
        if (!detail || !detail.template) break;

        var tpl = detail.template;
        var replayUrl = allowedAmexUrl(detail.newUrl || tpl.url);
        if (!replayUrl) {
          window.postMessage({
            channel: CHANNEL,
            type: 'replay_result',
            data: { success: false, offerId: detail.offerId, requestId: detail.requestId, error: 'invalid_url' }
          }, '*');
          break;
        }
        var replayInit = {
          method: tpl.method,
          headers: tpl.headers,
          credentials: 'same-origin'
        };
        if (detail.newBody !== undefined && detail.newBody !== null) {
          replayInit.body = detail.newBody;
        } else if (tpl.body) {
          replayInit.body = tpl.body;
        }

        originalFetch(replayUrl, replayInit)
          .then(function(res) {
            var status = res.status;
            var ok = res.ok;
            return res.json().catch(function() { return {}; }).then(function(data) {
              window.postMessage({
                channel: CHANNEL,
                type: 'replay_result',
                data: { success: ok, offerId: detail.offerId, requestId: detail.requestId, status: status, response: data }
              }, '*');
            });
          })
          .catch(function(err) {
            window.postMessage({
              channel: CHANNEL,
              type: 'replay_result',
              data: { success: false, offerId: detail.offerId, requestId: detail.requestId, error: err && err.message }
            }, '*');
          });
        break;
    }
  });

  // Signal that interceptor is ready
  window.postMessage({ channel: CHANNEL, type: 'interceptor_ready' }, '*');
})();
