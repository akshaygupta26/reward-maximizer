// Chase API Interceptor — runs in MAIN world (manifest "world": "MAIN")
// Patches fetch/XHR to capture outgoing activation requests during discovery,
// then replays the captured template for batch activation.
// Communicates with isolated-world content script via window.postMessage.

(function() {
  'use strict';

  var CHANNEL = 'rmx-chase-api';
  var isCapturing = false;
  var capturedRequests = [];
  var lastApiResponse = null; // Cache last customer-offers API response
  var lastCustomerOffersRequest = null; // Store URL + headers for replay with higher offer-count

  // GETs only captured if URL matches these patterns (avoids noise)
  var GET_CAPTURE_PATTERNS = ['reco.chase.com', '/activate', '/enroll', '/add-offer',
    '/save', 'offer', 'commerce', 'recommendation'];

  // URLs whose RESPONSES should be observed and forwarded (offer data APIs)
  var RESPONSE_OBSERVE_PATTERNS = ['customer-offers', 'digital-customer-targeted-offers',
    'digital-offers'];

  function shouldCaptureGet(url) {
    var lower = (url || '').toLowerCase();
    return GET_CAPTURE_PATTERNS.some(function(p) { return lower.indexOf(p) !== -1; });
  }

  function shouldObserveResponse(url) {
    var lower = (url || '').toLowerCase();
    return RESPONSE_OBSERVE_PATTERNS.some(function(p) { return lower.indexOf(p) !== -1; });
  }

  // ---- Patch fetch ----

  var originalFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var resource = args[0];
    var init = args[1] || {};
    var url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
    var method = (init.method || (resource && typeof resource !== 'string' && resource.method) || 'GET').toUpperCase();

    var shouldCapture = isCapturing && (
      method === 'POST' || method === 'PUT' || method === 'PATCH' ||
      (method === 'GET' && shouldCaptureGet(url))
    );

    if (shouldCapture) {
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

      capturedRequests.push(captured);

      window.postMessage({
        channel: CHANNEL,
        type: 'captured_request',
        data: captured
      }, '*');
    }

    // Always observe responses for offer data APIs (bypasses CSP-blocked BaseInterceptor)
    var result = originalFetch.apply(this, args);
    if (shouldObserveResponse(url)) {
      // Save customer-offers request info for potential replay with higher offer-count
      if (url.indexOf('customer-offers') !== -1 && url.indexOf('offer-summaries') === -1) {
        var fetchHeaders = {};
        if (init.headers) {
          if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
            init.headers.forEach(function(v, k) { fetchHeaders[k] = v; });
          } else if (typeof init.headers === 'object') {
            fetchHeaders = Object.assign({}, init.headers);
          }
        }
        lastCustomerOffersRequest = { url: url, headers: fetchHeaders };
      }
      console.log('[RMX-MAIN] fetch response observe matched:', url.substring(0, 120));
      result.then(function(response) {
        try {
          var ct = response.headers.get('content-type') || '';
          console.log('[RMX-MAIN] fetch response status:', response.status, 'content-type:', ct);
          if (ct.indexOf('application/json') !== -1 || ct.indexOf('json') !== -1) {
            response.clone().json().then(function(data) {
              console.log('[RMX-MAIN] fetch JSON parsed, top keys:', Object.keys(data || {}).join(','));
              // Only cache responses with customerOffers (not offer-summaries etc.)
              if (data && data.customerOffers) {
                lastApiResponse = { data: data, meta: { url: url, method: method, status: response.status, timestamp: Date.now() } };
                console.log('[RMX-MAIN] cached customerOffers response');
              }
              window.postMessage({
                channel: CHANNEL,
                type: 'api_response',
                data: data,
                meta: { url: url, method: method, status: response.status, timestamp: Date.now() }
              }, '*');
            }).catch(function(e) { console.log('[RMX-MAIN] fetch JSON parse failed:', e.message); });
          } else {
            console.log('[RMX-MAIN] fetch response not JSON, ct:', ct);
          }
        } catch(e) { console.log('[RMX-MAIN] fetch observe error:', e.message); }
      }).catch(function(e) { console.log('[RMX-MAIN] fetch promise rejected:', e.message); });
    }
    return result;
  };

  // ---- Patch XMLHttpRequest ----

  var OrigXHR = window.XMLHttpRequest;
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
    var xhrShouldCapture = isCapturing && (
      xhrMethod === 'POST' || xhrMethod === 'PUT' || xhrMethod === 'PATCH' ||
      (xhrMethod === 'GET' && shouldCaptureGet(this._rmxCapUrl))
    );

    if (xhrShouldCapture) {
      var captured = {
        url: this._rmxCapUrl || '',
        method: this._rmxCapMethod.toUpperCase(),
        headers: Object.assign({}, this._rmxCapHeaders || {}),
        body: body ? String(body) : null,
        timestamp: Date.now(),
        isXHR: true
      };
      capturedRequests.push(captured);
      window.postMessage({
        channel: CHANNEL,
        type: 'captured_request',
        data: captured
      }, '*');
    }
    // Always observe responses for offer data APIs via XHR
    if (shouldObserveResponse(this._rmxCapUrl)) {
      // Save customer-offers request info for potential replay with higher offer-count
      if ((this._rmxCapUrl || '').indexOf('customer-offers') !== -1 &&
          (this._rmxCapUrl || '').indexOf('offer-summaries') === -1) {
        lastCustomerOffersRequest = {
          url: this._rmxCapUrl,
          headers: Object.assign({}, this._rmxCapHeaders || {})
        };
      }
      console.log('[RMX-MAIN] XHR response observe matched:', (this._rmxCapUrl || '').substring(0, 120));
      var xhrRef = this;
      this.addEventListener('load', function() {
        try {
          var ct = xhrRef.getResponseHeader('content-type') || '';
          console.log('[RMX-MAIN] XHR response status:', xhrRef.status, 'content-type:', ct);
          if ((ct.indexOf('application/json') !== -1 || ct.indexOf('json') !== -1) && xhrRef.responseText) {
            var data = JSON.parse(xhrRef.responseText);
            console.log('[RMX-MAIN] XHR JSON parsed, top keys:', Object.keys(data || {}).join(','));
            // Only cache responses with customerOffers (not offer-summaries etc.)
            if (data && data.customerOffers) {
              lastApiResponse = { data: data, meta: { url: xhrRef._rmxCapUrl, method: xhrRef._rmxCapMethod, status: xhrRef.status, timestamp: Date.now() } };
              console.log('[RMX-MAIN] cached customerOffers response');
            }
            window.postMessage({
              channel: CHANNEL,
              type: 'api_response',
              data: data,
              meta: { url: xhrRef._rmxCapUrl, method: xhrRef._rmxCapMethod, status: xhrRef.status, timestamp: Date.now() }
            }, '*');
          } else {
            console.log('[RMX-MAIN] XHR response not JSON, ct:', ct);
          }
        } catch(e) { console.log('[RMX-MAIN] XHR observe error:', e.message); }
      });
    }

    return origSend.apply(this, arguments);
  };

  // ---- Patch Image.src to capture beacon-style GETs (Chase uses new Image().src) ----

  var ImageProto = Image.prototype;
  var imgSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
                      || Object.getOwnPropertyDescriptor(ImageProto, 'src');

  if (imgSrcDescriptor && imgSrcDescriptor.set) {
    var origImgSrcSet = imgSrcDescriptor.set;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set: function(val) {
        if (isCapturing && shouldCaptureGet(val)) {
          var captured = {
            url: val,
            method: 'GET',
            headers: {},
            body: null,
            timestamp: Date.now(),
            isImageBeacon: true
          };
          capturedRequests.push(captured);
          window.postMessage({
            channel: CHANNEL,
            type: 'captured_request',
            data: captured
          }, '*');
        }
        return origImgSrcSet.call(this, val);
      },
      get: imgSrcDescriptor.get,
      configurable: true,
      enumerable: true
    });
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

      case 'get_cached_response':
        // Return the last observed customer-offers API response
        console.log('[RMX-MAIN] get_cached_response: cache exists?', !!lastApiResponse,
          lastApiResponse ? 'url=' + (lastApiResponse.meta?.url || '').substring(0, 80) : '');
        window.postMessage({
          channel: CHANNEL,
          type: 'cached_response',
          data: lastApiResponse ? lastApiResponse.data : null,
          meta: lastApiResponse ? lastApiResponse.meta : null
        }, '*');
        break;

      case 'fire_beacons':
        // Fire Image beacon GETs in MAIN world (has session cookies, bypasses CSP)
        var beaconUrls = event.data.data;
        if (Array.isArray(beaconUrls)) {
          beaconUrls.forEach(function(u) { new Image().src = u; });
          window.postMessage({
            channel: CHANNEL,
            type: 'beacons_fired',
            data: { count: beaconUrls.length }
          }, '*');
        }
        break;

      case 'fetch_all_offers':
        // Replay the last customer-offers API call with a high offer-count to get all offers
        if (lastCustomerOffersRequest) {
          var allUrl = lastCustomerOffersRequest.url;
          if (allUrl.indexOf('offer-count=') !== -1) {
            allUrl = allUrl.replace(/offer-count=\d+/, 'offer-count=200');
          } else if (allUrl.indexOf('?') !== -1) {
            allUrl += '&offer-count=200';
          } else {
            allUrl += '?offer-count=200';
          }
          console.log('[RMX-MAIN] fetch_all_offers: requesting', allUrl.substring(0, 150));
          originalFetch(allUrl, {
            method: 'GET',
            headers: lastCustomerOffersRequest.headers,
            credentials: 'same-origin'
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.customerOffers) {
              lastApiResponse = { data: data, meta: { url: allUrl, method: 'GET', status: 200, timestamp: Date.now() } };
              console.log('[RMX-MAIN] fetch_all_offers: got', (data.customerOffers[0]?.offers || []).length, 'offers');
            }
            window.postMessage({
              channel: CHANNEL,
              type: 'all_offers_response',
              data: data
            }, '*');
          })
          .catch(function(err) {
            console.log('[RMX-MAIN] fetch_all_offers error:', err.message);
            window.postMessage({
              channel: CHANNEL,
              type: 'all_offers_response',
              data: null,
              error: err.message
            }, '*');
          });
        } else {
          console.log('[RMX-MAIN] fetch_all_offers: no customer-offers URL captured yet');
          window.postMessage({
            channel: CHANNEL,
            type: 'all_offers_response',
            data: null,
            error: 'no_url'
          }, '*');
        }
        break;

      case 'replay_request':
        // Replay a captured API call with modified URL/body
        var detail = event.data.data;
        if (!detail || !detail.template) break;

        var tpl = detail.template;
        var replayUrl = detail.newUrl || tpl.url;
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
                data: { success: ok, offerId: detail.offerId, status: status, response: data }
              }, '*');
            });
          })
          .catch(function(err) {
            window.postMessage({
              channel: CHANNEL,
              type: 'replay_result',
              data: { success: false, offerId: detail.offerId, error: err.message }
            }, '*');
          });
        break;
    }
  });

  // Signal that interceptor is ready
  window.postMessage({ channel: CHANNEL, type: 'interceptor_ready' }, '*');
})();
