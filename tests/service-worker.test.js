const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener: jest.fn(listener => listeners.push(listener)),
    dispatch(...args) {
      return listeners.map(listener => listener(...args));
    }
  };
}

function createWorker(initialStore = {}) {
  let store = { ...initialStore };
  const runtimeOnMessage = createEvent();
  const alarmsOnAlarm = createEvent();
  const tabsOnUpdated = createEvent();

  const chrome = {
    runtime: {
      lastError: null,
      onMessage: runtimeOnMessage,
      onInstalled: createEvent(),
      getURL: jest.fn(file => `chrome-extension://test/${file}`),
      getManifest: jest.fn(() => ({ version: '2.1.0' }))
    },
    storage: {
      local: {
        get: jest.fn((keys, callback) => {
          if (keys === null) {
            callback({ ...store });
            return;
          }
          const result = {};
          const keyList = Array.isArray(keys) ? keys : [keys];
          keyList.forEach(key => {
            if (store[key] !== undefined) result[key] = store[key];
          });
          callback(result);
        }),
        set: jest.fn((items, callback) => {
          Object.assign(store, items);
          if (callback) callback();
        }),
        remove: jest.fn((keys, callback) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          keyList.forEach(key => delete store[key]);
          if (callback) callback();
        })
      }
    },
    action: {
      setBadgeBackgroundColor: jest.fn(),
      setBadgeText: jest.fn()
    },
    tabs: {
      sendMessage: jest.fn(() => Promise.resolve()),
      create: jest.fn(),
      onUpdated: tabsOnUpdated
    },
    notifications: { create: jest.fn() },
    alarms: { create: jest.fn(), onAlarm: alarmsOnAlarm }
  };

  const context = {
    chrome,
    URL,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    importScripts(...files) {
      files.forEach(file => {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
      });
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), context, {
    filename: 'service-worker.js'
  });

  return {
    context,
    chrome,
    runtimeOnMessage,
    alarmsOnAlarm,
    tabsOnUpdated,
    getStore: () => store
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

describe('service worker', () => {
  test('keeps async get_offers response alive and filters malformed records', async () => {
    const worker = createWorker({
      rmx_offers: [null, { merchant: null }, { merchant: 'Nike', source: 'amex' }]
    });
    const sendResponse = jest.fn();

    const returned = worker.runtimeOnMessage.listeners[0]({ action: 'get_offers' }, {}, sendResponse);
    expect(returned).toBe(true);

    await flushPromises();
    expect(sendResponse).toHaveBeenCalledWith({
      offers: [{ merchant: 'Nike', source: 'amex' }]
    });
  });

  test('relays only valid iframe offers and preserves tab id 0', async () => {
    const worker = createWorker();
    worker.runtimeOnMessage.listeners[0]({
      action: 'relay_interceptor_data',
      portal: 'chase',
      offers: [null, { merchant: 'Nike' }, { merchant: '' }]
    }, { tab: { id: 0 } }, jest.fn());

    expect(worker.chrome.tabs.sendMessage).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        action: 'interceptor_data_from_iframe',
        offers: [{ merchant: 'Nike' }]
      }),
      { frameId: 0 }
    );
  });

  test('writes normalized offers and updates the originating tab badge', async () => {
    const worker = createWorker();
    const sendResponse = jest.fn();

    worker.runtimeOnMessage.listeners[0]({
      action: 'save_offers',
      source: ' AMEX ',
      offers: [{ merchant: 'Nike', value: '5%' }, null]
    }, { tab: { id: 0 } }, sendResponse);

    await flushPromises();
    expect(worker.getStore().rmx_offers[0].source).toBe('amex');
    expect(worker.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '1', tabId: 0 });
    expect(sendResponse).toHaveBeenCalledWith({ added: 1, updated: 0, total: 1 });
  });

  test('persists sync progress and schedules alarm-based cleanup', async () => {
    const worker = createWorker();
    const listener = worker.runtimeOnMessage.listeners[0];

    const startResponse = jest.fn();
    listener({ action: 'start_sync', portal: 'amex', portals: ['amex', 'chase'] }, {}, startResponse);
    await flushPromises();
    expect(startResponse).toHaveBeenCalledWith({ success: true });

    const firstComplete = jest.fn();
    listener({ action: 'complete_sync', portal: 'amex', offersCount: 2 }, {}, firstComplete);
    await flushPromises();
    expect(firstComplete).toHaveBeenCalledWith({ success: true });

    const finalComplete = jest.fn();
    listener({ action: 'complete_sync', portal: 'chase', offersCount: 3 }, {}, finalComplete);
    await flushPromises();
    expect(finalComplete).toHaveBeenCalledWith({ success: true });
    expect(worker.getStore().rmx_sync_progress.isRunning).toBe(false);
    expect(worker.chrome.alarms.create).toHaveBeenCalledWith(
      'rmx_clear_sync_progress',
      { delayInMinutes: 0.5 }
    );
  });

  test('does not reuse stale in-memory progress after storage cleanup', async () => {
    const worker = createWorker();
    const listener = worker.runtimeOnMessage.listeners[0];

    listener({ action: 'start_sync', portal: 'amex' }, {}, jest.fn());
    await flushPromises();
    worker.chrome.storage.local.remove('rmx_sync_progress');

    const response = jest.fn();
    listener({ action: 'get_sync_progress' }, {}, response);
    await flushPromises();
    expect(response).toHaveBeenCalledWith({
      progress: {
        isRunning: false,
        currentPortal: null,
        completed: [],
        remaining: [],
        totalOffers: 0,
        errors: []
      }
    });
  });

  test('does not let an older tab navigation overwrite a newer badge result', async () => {
    const worker = createWorker({
      rmx_offers: [{ merchant: 'Nike', source: 'amex' }]
    });

    worker.tabsOnUpdated.dispatch(7, { status: 'complete' }, { url: 'https://nike.com/' });
    worker.tabsOnUpdated.dispatch(7, { status: 'complete' }, { url: 'https://example.com/' });
    await flushPromises();

    expect(worker.chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: '1', tabId: 7 });
    expect(worker.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 7 });
  });

  test('invalidates a pending badge check when a new navigation starts', async () => {
    const worker = createWorker({
      rmx_offers: [{ merchant: 'Nike', source: 'amex' }]
    });

    worker.tabsOnUpdated.dispatch(7, { status: 'complete' }, { url: 'https://nike.com/' });
    worker.tabsOnUpdated.dispatch(7, { status: 'loading' }, { url: 'https://example.com/' });
    await flushPromises();

    expect(worker.chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: '1', tabId: 7 });
  });

  test('does not throw when an async response port is already closed', async () => {
    const worker = createWorker();
    const sendResponse = () => { throw new Error('port closed'); };

    expect(() => worker.runtimeOnMessage.listeners[0]({ action: 'get_offers' }, {}, sendResponse))
      .not.toThrow();
    await expect(flushPromises()).resolves.toBeUndefined();
  });
});
