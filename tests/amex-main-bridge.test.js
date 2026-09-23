const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CHANNEL = 'rmx-amex-api';

function loadBridge() {
  const messages = [];
  const listeners = [];

  const window = {
    location: { href: 'https://online.americanexpress.com/offers' },
    fetch: jest.fn(() => Promise.reject(new Error('unexpected fetch'))),
    postMessage: jest.fn(message => messages.push(message)),
    addEventListener: jest.fn((type, listener) => {
      if (type === 'message') listeners.push(listener);
    })
  };
  const originalFetch = window.fetch;

  class XhrMock {}
  XhrMock.prototype.open = jest.fn();
  XhrMock.prototype.send = jest.fn();
  XhrMock.prototype.setRequestHeader = jest.fn();
  XhrMock.prototype.addEventListener = jest.fn();
  window.XMLHttpRequest = XhrMock;

  // No Headers global: the bridge must take the plain-object header branch.
  const context = {
    window,
    URL,
    XMLHttpRequest: XhrMock,
    console: { log: jest.fn() }
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'content/amex-api-interceptor.js'), 'utf8'),
    context,
    { filename: 'amex-api-interceptor.js' }
  );

  const send = (type, data) => listeners[0]({
    source: window,
    data: data === undefined ? { channel: CHANNEL, type } : { channel: CHANNEL, type, data }
  });

  return { window, messages, listener: listeners[0], originalFetch, send };
}

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('Amex MAIN-world bridge', () => {
  test('announces readiness on load and answers ping', () => {
    const bridge = loadBridge();
    expect(bridge.messages).toEqual([{ channel: CHANNEL, type: 'interceptor_ready' }]);

    bridge.window.postMessage.mockClear();
    bridge.send('ping');

    expect(bridge.window.postMessage).toHaveBeenCalledWith({
      channel: CHANNEL,
      type: 'interceptor_ready'
    }, '*');
  });

  test('captures fetch activation requests only while capturing', () => {
    const bridge = loadBridge();
    bridge.originalFetch.mockResolvedValue({ ok: true, status: 200 });

    bridge.window.fetch('https://online.americanexpress.com/api/enroll', { method: 'POST', body: '{"a":0}' });
    bridge.send('start_capture');
    bridge.window.fetch('https://online.americanexpress.com/api/enroll', { method: 'POST', body: '{"a":1}' });

    const captured = bridge.messages.filter(m => m.type === 'captured_request');
    expect(captured).toHaveLength(1);
    expect(captured[0].data).toEqual(expect.objectContaining({
      url: 'https://online.americanexpress.com/api/enroll',
      method: 'POST',
      body: '{"a":1}'
    }));

    bridge.send('stop_capture');
    const complete = bridge.messages[bridge.messages.length - 1];
    expect(complete.type).toBe('capture_complete');
    expect(complete.data).toHaveLength(1);
    expect(complete.data[0].url).toBe('https://online.americanexpress.com/api/enroll');
    expect(bridge.originalFetch).toHaveBeenCalledTimes(2);
  });

  test('captures XHR activation requests with their headers', () => {
    const bridge = loadBridge();
    bridge.send('start_capture');

    const xhr = new bridge.window.XMLHttpRequest();
    xhr.open('post', '/api/offers/add-offer');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send('{"offerId":"o1"}');

    const captured = bridge.messages.filter(m => m.type === 'captured_request');
    expect(captured).toHaveLength(1);
    expect(captured[0].data).toEqual(expect.objectContaining({
      url: '/api/offers/add-offer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"offerId":"o1"}',
      isXHR: true
    }));
  });

  test('rejects cross-origin replay URLs before calling fetch', () => {
    const bridge = loadBridge();

    bridge.send('replay_request', {
      template: { url: 'https://online.americanexpress.com/api/offers/activate', method: 'POST' },
      newUrl: 'https://evil.example/steal',
      offerId: 'offer-1',
      requestId: 'offer-1:c1:0'
    });

    expect(bridge.originalFetch).not.toHaveBeenCalled();
    expect(bridge.window.postMessage).toHaveBeenLastCalledWith({
      channel: CHANNEL,
      type: 'replay_result',
      data: { success: false, offerId: 'offer-1', requestId: 'offer-1:c1:0', error: 'invalid_url' }
    }, '*');
  });

  test('replays allowed Amex URLs and echoes the requestId', async () => {
    const bridge = loadBridge();
    bridge.originalFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });

    bridge.send('replay_request', {
      template: { url: 'https://online.americanexpress.com/api/offers/activate', method: 'POST', headers: {} },
      newUrl: 'https://online.americanexpress.com/api/offers/activate',
      newBody: '{"offerId":"o1"}',
      offerId: 'o1',
      requestId: 'r1'
    });
    await flushPromises();

    expect(bridge.originalFetch).toHaveBeenCalledWith(
      'https://online.americanexpress.com/api/offers/activate',
      expect.objectContaining({ method: 'POST', body: '{"offerId":"o1"}', credentials: 'same-origin' })
    );
    expect(bridge.window.postMessage).toHaveBeenLastCalledWith({
      channel: CHANNEL,
      type: 'replay_result',
      data: expect.objectContaining({ success: true, offerId: 'o1', requestId: 'r1', status: 200 })
    }, '*');
  });
});
