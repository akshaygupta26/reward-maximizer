const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBridge() {
  const messages = [];
  const listeners = [];

  const window = {
    location: { href: 'https://secure.chase.com/offers' },
    fetch: jest.fn(() => Promise.reject(new Error('unexpected fetch'))),
    postMessage: jest.fn(message => messages.push(message)),
    addEventListener: jest.fn((type, listener) => {
      if (type === 'message') listeners.push(listener);
    })
  };
  const originalFetch = window.fetch;

  class ImageMock {}
  class HTMLImageElementMock {}
  Object.defineProperty(HTMLImageElementMock.prototype, 'src', {
    configurable: true,
    set(value) { this._src = value; },
    get() { return this._src; }
  });

  class XhrMock {}
  XhrMock.prototype.open = jest.fn();
  XhrMock.prototype.send = jest.fn();
  XhrMock.prototype.setRequestHeader = jest.fn();
  XhrMock.prototype.addEventListener = jest.fn();
  window.XMLHttpRequest = XhrMock;

  const context = {
    window,
    Image: ImageMock,
    HTMLImageElement: HTMLImageElementMock,
    URL,
    XMLHttpRequest: XhrMock,
    console: { log: jest.fn() }
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'content/chase-api-interceptor.js'), 'utf8'),
    context,
    { filename: 'chase-api-interceptor.js' }
  );

  return { window, messages, listener: listeners[0], originalFetch };
}

describe('Chase MAIN-world bridge', () => {
  test('filters beacon commands to HTTPS reco.chase.com URLs', () => {
    const bridge = loadBridge();

    bridge.listener({
      source: bridge.window,
      data: {
        channel: 'rmx-chase-api',
        type: 'fire_beacons',
        data: [
          'https://reco.chase.com/events/1',
          'https://evil.example/steal',
          'javascript:alert(1)'
        ]
      }
    });

    expect(bridge.window.postMessage).toHaveBeenLastCalledWith({
      channel: 'rmx-chase-api',
      type: 'beacons_fired',
      data: { count: 1 }
    }, '*');
  });

  test('rejects cross-origin replay URLs before calling fetch', () => {
    const bridge = loadBridge();

    bridge.listener({
      source: bridge.window,
      data: {
        channel: 'rmx-chase-api',
        type: 'replay_request',
        data: {
          template: { url: 'https://secure.chase.com/api/activate', method: 'POST' },
          newUrl: 'https://evil.example/steal',
          offerId: 'offer-1'
        }
      }
    });

    expect(bridge.originalFetch).not.toHaveBeenCalled();
    expect(bridge.window.postMessage).toHaveBeenLastCalledWith({
      channel: 'rmx-chase-api',
      type: 'replay_result',
      data: { success: false, offerId: 'offer-1', error: 'invalid_url' }
    }, '*');
  });
});
