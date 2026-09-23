const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

describe('manifest and UI security boundaries', () => {
  test('declares alarms for durable service-worker cleanup', () => {
    expect(manifest.permissions).toContain('alarms');
  });

  test('does not expose extension libraries through web-accessible resources', () => {
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  test('loads the shared offer validator in isolated offer-producing scripts', () => {
    const scripts = manifest.content_scripts
      .filter(entry => entry.js.includes('content/content-main.js') || entry.js.includes('content/merchant-banner.js'));
    expect(scripts.length).toBeGreaterThan(0);
    scripts.forEach(entry => expect(entry.js).toContain('lib/offer-utils.js'));
  });

  test('guards localStorage access in the all-frames content script', () => {
    const contentMain = fs.readFileSync(path.join(root, 'content/content-main.js'), 'utf8');

    expect(contentMain).toContain('function readLocalValue(key)');
    expect(contentMain).toContain('function writeLocalValue(key, value)');
    expect(contentMain).toContain('function removeLocalValue(key)');
    expect(contentMain).not.toMatch(/(?<!window\.)\blocalStorage\.(?:getItem|setItem|removeItem)\s*\(/);
  });

  test('escapes scraped values before banner and popup HTML interpolation', () => {
    const banner = fs.readFileSync(path.join(root, 'content/merchant-banner.js'), 'utf8');
    const popup = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');

    expect(banner).toContain('escapeHtml(cardOffer.value)');
    expect(banner).toContain('escapeHtml(stackingOffer.value)');
    expect(banner).toContain('tooltip.textContent');
    expect(popup).toContain('escapeHtml(offer.source)');
    expect(popup).toContain('escapeHtml(formatSource(offer.source))');
  });

  test('awaits asynchronous card-selection writes in settings', () => {
    const settings = fs.readFileSync(path.join(root, 'settings/settings.js'), 'utf8');

    expect(settings).toContain("chip.addEventListener('click', async (e) =>");
    expect(settings).toContain('await Storage.setUserCards(userCards)');
  });
});
