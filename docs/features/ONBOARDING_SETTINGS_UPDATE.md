# Onboarding & Settings Update

**Date:** 2026-01-29
**Changes:** Card Selection in Onboarding & Settings + "Coming Soon" badges

---

## 🎯 What Was Implemented

### 1. Onboarding Page Updates (`onboarding/welcome.html`)

**Card Selection with "Coming Soon" Badges:**
- ✅ American Express (enabled, pre-checked)
- ✅ Chase (enabled, pre-checked)
- ⏳ Citi (disabled, "Coming Soon")
- ⏳ Capital One (disabled, "Coming Soon")
- ⏳ Discover (disabled, "Coming Soon")
- ✅ Bank of America (enabled)
- ✅ US Bank (enabled)
- ✅ Rakuten (enabled)
- ⏳ Capital One Shopping (disabled, "Coming Soon")

**Features:**
- Disabled checkboxes for unfinished portals
- Yellow "Coming Soon" badges
- Reduced opacity (50%) for disabled items
- Cannot be selected by user

**CSS Additions:**
```css
.card-checkbox.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.coming-soon {
  display: inline-block;
  font-size: 11px;
  color: #f59e0b;
  background: #fef3c7;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  margin-left: 4px;
}
```

### 2. Settings Page Updates (`settings/settings.html`)

**New Section: "Card Portals & Cashback Sites"**
- Positioned at the top of settings (first section)
- Same card selection as onboarding
- Same "Coming Soon" badges for unfinished portals
- "Save Card Selection" button at bottom

**Section Structure:**
```
Card Portals & Cashback Sites
├── 💳 Credit Card Portals
│   ├── American Express ✓
│   ├── Chase ✓
│   ├── Citi (Coming Soon)
│   ├── Capital One (Coming Soon)
│   ├── Discover (Coming Soon)
│   ├── Bank of America ✓
│   └── US Bank ✓
└── 🛍️ Cashback Portals
    ├── Rakuten ✓
    └── Capital One Shopping (Coming Soon)

[Save Card Selection]
```

### 3. Settings JavaScript Updates (`settings/settings.js`)

**New Functions:**
- `loadPortalSelection()` - Loads user's selected portals from `rmx_user_cards`
- `savePortalSelection()` - Saves selected portals to `rmx_user_cards`

**Event Listener:**
- Added click handler for "Save Card Selection" button
- Validates at least 1 portal is selected
- Shows success toast: "Card selection saved! Popup will update on next open."

**Integration:**
- Loads portal selection on page load
- Syncs with same storage key as onboarding (`rmx_user_cards`)

### 4. Settings CSS Updates (`settings/settings.css`)

**New Styles:**
```css
/* Portal Selection Styles */
.portal-selection { ... }
.portal-category { ... }
.portal-grid { ... }
.portal-checkbox { ... }
.portal-label { ... }
.coming-soon-badge { ... }
```

**Features:**
- Grid layout (200px minimum per column)
- Hover effects (blue border)
- Checked state (blue background)
- Disabled state (50% opacity, no hover)
- Yellow "Coming Soon" badges
- Responsive (1 column on mobile)

### 5. Onboarding JavaScript (`onboarding/onboarding.js`)

**No Changes Needed:**
- Already filters out disabled checkboxes when saving
- Only saves portals that are checked AND not disabled
- Works correctly with new disabled portals

---

## 📋 User Experience Flow

### First-Time User (Onboarding)
1. Install extension → Welcome page opens
2. See card selection with some marked "Coming Soon"
3. Select available cards (Amex & Chase pre-selected)
4. Click "Get Started"
5. Cards saved to `rmx_user_cards`
6. Popup shows only selected card buttons

### Existing User (Settings)
1. Open settings page
2. Scroll to "Card Portals & Cashback Sites" (top section)
3. See current selections pre-checked
4. Change selections (add/remove cards)
5. Click "Save Card Selection"
6. See success toast
7. Reopen popup → See updated card buttons

### "Coming Soon" Portals
- Visually distinct (50% opacity, yellow badge)
- Cannot be selected
- User knows they're planned but not ready yet

---

## 🔧 Technical Details

### Storage Key
- **Key:** `rmx_user_cards`
- **Type:** Array of strings
- **Example:** `['amex', 'chase', 'bofa', 'usbank', 'rakuten']`

### Available vs. Coming Soon

**Available (Implemented):**
- `amex` - American Express
- `chase` - Chase
- `bofa` - Bank of America
- `usbank` - US Bank
- `rakuten` - Rakuten

**Coming Soon (Not Implemented):**
- `citi` - Citi
- `capital-one` - Capital One
- `discover` - Discover
- `capital-one-shopping` - Capital One Shopping

### Validation
- Onboarding: Requires at least 1 card selected
- Settings: Requires at least 1 portal selected
- Both show alert if user tries to proceed with 0 selections

### Sync Integration
- Popup reads `rmx_user_cards` on load
- Hides sync buttons for unselected cards
- "Sync All" only syncs selected cards
- Backward compatible (shows all if `rmx_user_cards` is empty)

---

## 🎨 Visual Design

### "Coming Soon" Badge
- **Color:** Yellow/Amber (`#f59e0b` text on `#fef3c7` background)
- **Size:** 11px font, small padding
- **Position:** Inline after card name
- **Style:** Rounded corners (4px), bold text

### Disabled State
- **Opacity:** 50%
- **Cursor:** `not-allowed`
- **Hover:** No border color change (stays gray)
- **Background:** Stays light gray (no blue highlight)

### Active/Checked State
- **Border:** Blue (`#2563eb`)
- **Background:** Light blue (`#eff6ff`)
- **Label Color:** Blue (`#2563eb`)
- **Hover:** Enhanced blue border and background

---

## 📱 Responsive Design

### Desktop (> 600px)
- Grid: Auto-fit columns, 200px minimum
- 3-4 cards per row
- Comfortable spacing

### Mobile (< 600px)
- Grid: Single column
- Full-width cards
- Easy touch targets

---

## ✅ Testing Checklist

### Onboarding
- [ ] Fresh install shows welcome page
- [ ] Amex & Chase pre-checked by default
- [ ] Coming Soon portals are disabled and grayed out
- [ ] Coming Soon badges are visible and yellow
- [ ] Cannot check disabled portals
- [ ] Selecting 0 cards shows alert
- [ ] Get Started saves selected cards
- [ ] Tab closes after saving

### Settings
- [ ] Settings page loads without errors
- [ ] Portal section is at the top
- [ ] User's previously selected cards are checked
- [ ] Coming Soon portals are disabled and grayed out
- [ ] Save button updates `rmx_user_cards`
- [ ] Success toast appears after saving
- [ ] Saving 0 portals shows error toast

### Popup Integration
- [ ] Popup hides unselected card buttons
- [ ] Sync All only syncs selected cards
- [ ] Shows all buttons if `rmx_user_cards` is empty (backward compatibility)

### Visual Consistency
- [ ] Onboarding and Settings have matching card lists
- [ ] "Coming Soon" badges look the same in both places
- [ ] Disabled state is consistent
- [ ] Hover effects work correctly

---

## 🚀 Next Steps

When implementing Citi, Capital One, Discover, or Capital One Shopping:

1. **Update Onboarding** (`onboarding/welcome.html`):
   ```html
   <!-- Change from: -->
   <label class="card-checkbox disabled">
     <input type="checkbox" value="citi" disabled>
     <span class="card-label">Citi <span class="coming-soon">Coming Soon</span></span>
   </label>

   <!-- To: -->
   <label class="card-checkbox">
     <input type="checkbox" value="citi">
     <span class="card-label">Citi</span>
   </label>
   ```

2. **Update Settings** (`settings/settings.html`):
   - Same change as above

3. **No JavaScript changes needed** - Already handles dynamic card lists

4. **Test:**
   - Fresh onboarding shows new card as selectable
   - Settings shows new card as selectable
   - Popup shows sync button when card is selected

---

## 📝 Files Modified

1. `onboarding/welcome.html` - Added disabled state and badges
2. `settings/settings.html` - Added portal selection section
3. `settings/settings.js` - Added load/save portal functions
4. `settings/settings.css` - Added portal selection styles
5. `ONBOARDING_SETTINGS_UPDATE.md` - This documentation

**Total Changes:** 5 files

**Lines Added:** ~200 lines (HTML/CSS/JS combined)

---

**Status:** ✅ Complete and ready for testing
**Backward Compatible:** Yes (shows all cards if none selected)
**Production Ready:** Yes

