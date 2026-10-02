global.debug = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
const { BaseInterceptor: RealBase } = require('../content/interceptors/base-interceptor.js');
global.BaseInterceptor = {
  MESSAGE_TYPE: 'RMX_INTERCEPTOR_BRIDGE',
  generateMainWorldScript: jest.fn(() => 'mock_script'),
  normalizeOffer: jest.fn(raw => ({ ...raw, normalized: true })),
  sanitize: jest.fn(v => v),
  findOfferArray: RealBase.findOfferArray.bind(RealBase),
};
global.Categories = { detectCategory: jest.fn(() => 'shopping') };
global.ExtractorConfig = { logRawResponses: false };

const { AmexInterceptor } = require('../content/interceptors/amex-interceptor.js');

describe('AmexInterceptor', () => {
  beforeEach(() => jest.clearAllMocks());

  test('has correct portal and source', () => {
    expect(AmexInterceptor.portal).toBe('amex');
    expect(AmexInterceptor.source).toBe('amex');
  });

  test('urlPatterns contains offers/enrollment', () => {
    const joined = AmexInterceptor.urlPatterns.join(' ');
    expect(joined).toMatch(/offer|enroll/i);
  });

  describe('parseOffers', () => {
    test('extracts from {offers: [...]}', () => {
      const offers = AmexInterceptor.parseOffers({
        offers: [
          { name: 'Starbucks', description: 'Earn 5% back', offerId: 'a1', cardTokens: ['c1', 'c2'] },
          { name: 'Amazon', description: '$20 credit', offerId: 'a2' }
        ]
      }, { url: '/offers' });
      expect(offers.length).toBe(2);
    });

    test('extracts eligibleCards from cardTokens', () => {
      AmexInterceptor.parseOffers({
        offers: [{ name: 'Test', description: '5% back', cardTokens: ['card1', 'card2'] }]
      }, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.eligibleCards).toEqual(['card1', 'card2']);
    });

    test('extracts eligibleCards from eligibleCardMemberTokens', () => {
      AmexInterceptor.parseOffers({
        offers: [{ name: 'Test', description: '5% back', eligibleCardMemberTokens: ['t1'] }]
      }, {});
      const call = BaseInterceptor.normalizeOffer.mock.calls[0][0];
      expect(call.eligibleCards).toEqual(['t1']);
    });

    test('returns empty for non-offer responses', () => {
      expect(AmexInterceptor.parseOffers({ user: {} }, {})).toEqual([]);
    });

    test('handles null', () => {
      expect(AmexInterceptor.parseOffers(null, {})).toEqual([]);
    });

    test('finds nested arrays via heuristic', () => {
      const offers = AmexInterceptor.parseOffers({
        deep: { nested: { list: [{ name: 'Deep', description: '$10 back' }] } }
      }, {});
      expect(offers.length).toBe(1);
    });
  });

  describe('_buildTasks', () => {
    test('expands one task per eligible card', () => {
      const tasks = AmexInterceptor._buildTasks([
        { merchant: 'A', offerId: 'o1', status: 'available', eligibleCards: ['c1', 'c2'] },
        { merchant: 'B', offerId: 'o2', status: 'available', eligibleCards: ['c3'] }
      ]);
      expect(tasks).toEqual([
        { offerId: 'o1', cardToken: 'c1', merchant: 'A' },
        { offerId: 'o1', cardToken: 'c2', merchant: 'A' },
        { offerId: 'o2', cardToken: 'c3', merchant: 'B' }
      ]);
    });

    test('skips activated/enrolled offers case-insensitively', () => {
      const tasks = AmexInterceptor._buildTasks([
        { merchant: 'A', offerId: 'o1', status: 'activated', eligibleCards: ['c1'] },
        { merchant: 'B', offerId: 'o2', status: 'ENROLLED', eligibleCards: ['c2'] },
        { merchant: 'C', offerId: 'o3', status: 'available', eligibleCards: ['c3'] }
      ]);
      expect(tasks).toEqual([{ offerId: 'o3', cardToken: 'c3', merchant: 'C' }]);
    });

    test('offer without eligibleCards becomes one task with null cardToken', () => {
      const tasks = AmexInterceptor._buildTasks([{ merchant: 'A', offerId: 'o1', status: 'available' }]);
      expect(tasks).toEqual([{ offerId: 'o1', cardToken: null, merchant: 'A' }]);
    });
  });

  describe('_discoverTemplateFromCaptures', () => {
    test('templates offerId and card token found in a JSON body', () => {
      const template = AmexInterceptor._discoverTemplateFromCaptures([{
        url: 'https://online.americanexpress.com/api/offers/activate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '44' },
        body: JSON.stringify({ offerId: 'OFF123', cardMemberToken: 'CTOK1' })
      }], [{ offerId: 'OFF123', cardToken: 'CTOK1', merchant: 'A' }]);

      expect(template.body).toContain('{OFFER_ID}');
      expect(template.body).toContain('{CARD_TOKEN}');
      expect(template.body).not.toContain('OFF123');
      expect(template.body).not.toContain('CTOK1');
      expect(template.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(template.method).toBe('POST');
    });

    test('templates an offerId embedded in the URL', () => {
      const template = AmexInterceptor._discoverTemplateFromCaptures([{
        url: 'https://online.americanexpress.com/offers/OFF123/enroll',
        method: 'POST',
        headers: {},
        body: null
      }], [{ offerId: 'OFF123', cardToken: null, merchant: 'A' }]);

      expect(template.url).toBe('https://online.americanexpress.com/offers/{OFFER_ID}/enroll');
    });

    test('matches endpoints without a leading-slash pattern', () => {
      const template = AmexInterceptor._discoverTemplateFromCaptures([{
        url: 'https://functions.americanexpress.com/CreateCardAccountOfferEnrollment.v1',
        method: 'POST',
        headers: {},
        body: JSON.stringify({ offerId: 'OFF123' })
      }], [{ offerId: 'OFF123', cardToken: null, merchant: 'A' }]);

      expect(template).not.toBeNull();
      expect(template.body).toBe('{"offerId":"{OFFER_ID}"}');
    });

    test('returns null when no capture correlates with a known offer', () => {
      expect(AmexInterceptor._discoverTemplateFromCaptures([
        { url: 'https://online.americanexpress.com/analytics/collect', method: 'POST', headers: {}, body: '{"offerId":"OFF123"}' },
        { url: 'https://online.americanexpress.com/api/offers/activate', method: 'POST', headers: {}, body: '{"offerId":"OTHER99"}' }
      ], [{ offerId: 'OFF123', cardToken: null, merchant: 'A' }])).toBeNull();
    });
  });

  describe('activateAll', () => {
    const savedTimeouts = AmexInterceptor._discoveryTimeouts;

    beforeEach(() => {
      AmexInterceptor._discoveryTimeouts = {
        pingMs: 10, clickSettleMs: 10, captureCompleteMs: 50, replayBatchMs: 50, batchPauseMs: 10
      };
    });

    afterEach(() => {
      AmexInterceptor._discoveryTimeouts = savedTimeouts;
      delete global.window;
      delete global.document;
      delete global.BatchOptIn;
      delete global.chrome;
    });

    // Fake page + MAIN-world bridge: answers ping, stop_capture and replay_request
    function installFakeAmexPage({ captured, replaySucceeds = () => true }) {
      const listeners = [];
      const replays = [];
      const button = {
        disabled: false,
        textContent: 'Add to Card',
        getAttribute: () => null,
        click: jest.fn()
      };

      const bridge = (msg) => {
        if (!msg || msg.channel !== 'rmx-amex-api') return;
        if (msg.type === 'ping') {
          global.window.postMessage({ channel: 'rmx-amex-api', type: 'interceptor_ready' }, '*');
        } else if (msg.type === 'stop_capture') {
          global.window.postMessage({ channel: 'rmx-amex-api', type: 'capture_complete', data: captured }, '*');
        } else if (msg.type === 'replay_request') {
          const detail = msg.data;
          replays.push(detail);
          global.window.postMessage({
            channel: 'rmx-amex-api',
            type: 'replay_result',
            data: { success: replaySucceeds(detail), offerId: detail.offerId, requestId: detail.requestId, status: 200 }
          }, '*');
        }
      };

      global.window = {
        postMessage: jest.fn(msg => setTimeout(() => {
          listeners.slice().forEach(listener => listener({ source: global.window, data: msg }));
          bridge(msg);
        }, 0)),
        addEventListener: jest.fn((type, listener) => { if (type === 'message') listeners.push(listener); }),
        removeEventListener: jest.fn((type, listener) => {
          const i = listeners.indexOf(listener);
          if (i !== -1) listeners.splice(i, 1);
        })
      };
      global.document = { querySelectorAll: () => [button] };
      global.BatchOptIn = {
        run: jest.fn(),
        waitForDOMStabilization: jest.fn().mockResolvedValue()
      };

      return { button, replays, listeners };
    }

    const multiCardOffers = [
      { merchant: 'Shop A', offerId: 'OFF-AAA1', status: 'available', eligibleCards: ['CARDTOKEN1', 'CARDTOKEN2'] },
      { merchant: 'Shop B', offerId: 'OFF-BBB2', status: 'available', eligibleCards: ['CARDTOKEN1', 'CARDTOKEN2'] }
    ];

    const enrollmentCapture = (body) => ({
      url: 'https://functions.americanexpress.com/CreateCardAccountOfferEnrollment.v1',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'content-length': '52' },
      body
    });

    test('replays the discovered template for every remaining (offer, card) task', async () => {
      const page = installFakeAmexPage({
        captured: [
          { url: 'https://www.americanexpress.com/analytics/collect', method: 'POST', headers: {}, body: '{"event":"click"}' },
          enrollmentCapture('{"offerId":"OFF-AAA1","accountToken":"CARDTOKEN1"}')
        ]
      });

      const added = await AmexInterceptor.activateAll(multiCardOffers);

      expect(added).toBe(4); // 1 discovery click + 3 replays
      expect(page.button.click).toHaveBeenCalledTimes(1);
      expect(global.BatchOptIn.run).not.toHaveBeenCalled();
      expect(page.replays.map(r => r.newBody)).toEqual([
        '{"offerId":"OFF-AAA1","accountToken":"CARDTOKEN2"}',
        '{"offerId":"OFF-BBB2","accountToken":"CARDTOKEN1"}',
        '{"offerId":"OFF-BBB2","accountToken":"CARDTOKEN2"}'
      ]);
      expect(new Set(page.replays.map(r => r.requestId)).size).toBe(3);
      page.replays.forEach(r => {
        expect(r.template.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(r.newUrl).toBe('https://functions.americanexpress.com/CreateCardAccountOfferEnrollment.v1');
      });
      expect(page.listeners).toHaveLength(0);
    });

    test('counts failed replays and reports completion totals', async () => {
      const page = installFakeAmexPage({
        captured: [enrollmentCapture('{"offerId":"OFF-AAA1","accountToken":"CARDTOKEN1"}')],
        replaySucceeds: detail => detail.requestId.indexOf('OFF-BBB2:CARDTOKEN2') !== 0
      });
      global.chrome = { runtime: { sendMessage: jest.fn().mockResolvedValue() } };

      const added = await AmexInterceptor.activateAll(multiCardOffers);

      expect(added).toBe(3);
      expect(page.replays).toHaveLength(3);
      expect(global.chrome.runtime.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
        action: 'batch_progress',
        source: 'amex',
        phase: 'complete',
        result: { added: 3, failed: 1, skipped: 0, total: 4 }
      }));
    });

    test('replays once per offer when the request carries no card token', async () => {
      const page = installFakeAmexPage({
        captured: [enrollmentCapture('{"offerId":"OFF-AAA1"}')]
      });

      const added = await AmexInterceptor.activateAll(multiCardOffers);

      expect(added).toBe(2);
      expect(page.replays.map(r => r.newBody)).toEqual(['{"offerId":"OFF-BBB2"}']);
    });

    test('falls back to DOM BatchOptIn when the bridge never answers', async () => {
      global.window = { postMessage: jest.fn(), addEventListener: jest.fn() };
      global.document = { querySelectorAll: () => [] };
      global.BatchOptIn = {
        run: jest.fn().mockResolvedValue({ added: 3, failed: 0, skipped: 0, total: 3 }),
        waitForDOMStabilization: jest.fn().mockResolvedValue()
      };

      const added = await AmexInterceptor.activateAll([{ merchant: 'X', offerId: '1', status: 'available' }]);

      expect(added).toBe(3);
      expect(global.BatchOptIn.run).toHaveBeenCalledWith(expect.objectContaining({ source: 'amex' }));
      expect(typeof global.BatchOptIn.run.mock.calls[0][0].findButtons).toBe('function');
    });

    test('degrades to 0 without window, document, chrome or BatchOptIn', async () => {
      await expect(AmexInterceptor.activateAll([])).resolves.toBe(0);
      await expect(AmexInterceptor.activateAll([{ merchant: 'X', offerId: '1', status: 'available' }])).resolves.toBe(0);
    });
  });
});
