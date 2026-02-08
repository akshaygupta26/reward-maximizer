// Mock chrome.storage.local and chrome.runtime for Jest tests

function createChromeStorageMock() {
  let store = {};

  const storage = {
    local: {
      get(keys, callback) {
        if (keys === null) {
          // Return all data
          callback({ ...store });
          return;
        }
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          if (store[key] !== undefined) {
            result[key] = store[key];
          }
        }
        callback(result);
      },
      set(items, callback) {
        Object.assign(store, items);
        if (callback) callback();
      },
      clear(callback) {
        store = {};
        if (callback) callback();
      },
    },
  };

  const runtime = {
    lastError: null,
  };

  return {
    storage,
    runtime,
    _store: store,
    _reset() {
      store = {};
      runtime.lastError = null;
      storage.local.get = function (keys, callback) {
        if (keys === null) { callback({ ...store }); return; }
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          if (store[key] !== undefined) result[key] = store[key];
        }
        callback(result);
      };
      storage.local.set = function (items, callback) {
        Object.assign(store, items);
        if (callback) callback();
      };
      storage.local.clear = function (callback) {
        store = {};
        if (callback) callback();
      };
    },
  };
}

module.exports = { createChromeStorageMock };
