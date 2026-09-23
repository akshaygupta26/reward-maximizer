# Reward Maximizer

**Chrome extension to sync, compare, and stack credit card offers for maximum rewards.**

---

## 🚀 Quick Start

### For Users
1. Install the extension from Chrome Web Store (coming soon)
2. Complete onboarding to select your cards
3. Visit your credit card portals and click sync buttons
4. Shop online and see which card has the best offer!

### For Developers
**👉 See [`CLAUDE.md`](./CLAUDE.md) for complete technical documentation**

---

## 📁 Project Structure

```
Reward Maximizer/
├── manifest.json              # Chrome extension configuration
├── CLAUDE.md                  # 🔧 Main developer documentation
├── README.md                  # This file
│
├── background/                # Service worker (background tasks)
├── content/                   # Content scripts & scrapers
│   └── scrapers/             # Portal-specific scrapers
├── popup/                     # Extension popup UI
├── settings/                  # Settings page
├── onboarding/               # First-time welcome page
├── lib/                      # Shared utilities
├── data/                     # Default configurations
├── legal/                    # Privacy policy & terms
├── website/                  # Public website (Netlify)
│
└── docs/                     # 📚 Documentation
    ├── features/            # Feature implementation guides
    ├── production/          # Production readiness docs
    └── sessions/            # Development session notes
```

---

## 🎯 Features

- ✅ **Sync offers** from 5 credit card portals + Rakuten
- ✅ **Compare offers** across all your cards
- ✅ **Stack rewards** - combine card offers with cashback portals
- ✅ **Smart alerts** - see offers when shopping online
- ✅ **Background sync** - close popup while syncing continues
- ✅ **Point valuations** - compare points vs cash back

---

## 🛠️ Development

### Load Extension Locally
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `Reward Maximizer` folder

### Testing
```bash
# Check console for errors
# All logs prefixed with [RMX-...]

# Test individual scrapers
# Visit portal website, open DevTools console
```

### Key Files
- **Scrapers**: `content/scrapers/*.js` - Portal-specific offer extraction
- **Popup**: `popup/popup.js` - Main UI controller
- **Service Worker**: `background/service-worker.js` - Background tasks
- **Storage**: `lib/storage.js` - Data persistence layer

---

## 📋 Supported Portals

**Credit Cards:**
- ✅ American Express
- ✅ Chase
- ✅ Bank of America
- ✅ US Bank
- ⏳ Citi (Coming Soon)
- ⏳ Capital One (Coming Soon)
- ⏳ Discover (Coming Soon)

**Cashback Portals:**
- ✅ Rakuten
- ⏳ Capital One Shopping (Coming Soon)

---

## 📚 Documentation

### For Developers
- **[CLAUDE.md](./CLAUDE.md)** - Complete technical documentation
- **[docs/features/](./docs/features/)** - Feature implementation guides
- **[docs/production/](./docs/production/)** - Production readiness

### For Users
- **[Privacy Policy](https://gorgeous-torte-f0c7c0.netlify.app/privacy.html)**
- **[Terms of Service](https://gorgeous-torte-f0c7c0.netlify.app/terms.html)**
- **[Website](https://gorgeous-torte-f0c7c0.netlify.app/)**

---

## 🔒 Privacy

- ✅ **100% local storage** - All data stored on your device
- ✅ **No data collection** - We never see your offers or personal info
- ✅ **No tracking** - No analytics or third-party services
- ✅ **Open source** - Inspect the code yourself

---

## 📧 Support

**Email:** rewardmaximizer@gmail.com

**Issues:** Found a bug? Please report it with:
- Browser version
- Which portal you were syncing
- Console error logs (if any)

---

## 📝 License

MIT — see [LICENSE](LICENSE).

---

## 🎉 Version

**v2.0.0** - January 2026

**Recent Updates:**
- Added background sync progress tracking
- Added "Sync All" button
- Added first-time onboarding
- Added card selection in settings
- Improved merchant detection

---

**Made with ❤️ for credit card rewards enthusiasts**
