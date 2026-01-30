---
description: Check Chrome Web Store submission readiness and generate a submission checklist with pass/fail for each requirement
allowed-tools: Read, Grep, Glob, Bash(ls:*), Bash(wc:*), Bash(file:*), WebFetch
---

# Chrome Web Store Submission Readiness Check

Audit the Reward Maximizer extension for Chrome Web Store publication readiness. If $ARGUMENTS is provided, only check that section (e.g., "manifest", "icons", "privacy", "debug", "description").

## Instructions

The project root contains `manifest.json`. Perform every check below unless $ARGUMENTS filters to a specific section.

### 1. Manifest Validation

Read `manifest.json` and verify ALL fields:

| Field | Required | Criteria |
|---|---|---|
| `manifest_version` | REQUIRED | Must be exactly `3` |
| `name` | REQUIRED | 2-75 characters |
| `version` | REQUIRED | Valid semver (e.g., "2.0.0") |
| `description` | REQUIRED | Under 132 characters |
| `icons` (16, 48, 128) | REQUIRED | Object with "16", "48", "128" keys |
| `action.default_popup` | RECOMMENDED | Path to popup HTML |
| `action.default_title` | RECOMMENDED | Extension tooltip |
| `background.service_worker` | REQUIRED (MV3) | Path to service worker |
| `permissions` | CHECK | List permissions |
| `host_permissions` | CHECK | List host permissions |
| `content_scripts` | CHECK | Verify structure |
| `options_ui` | RECOMMENDED | Settings page |

### 2. File Reference Integrity

For every file path referenced in `manifest.json` (popup HTML, service worker, all content script JS files, options page), verify the file exists on disk. Report any missing files.

### 3. Icon Verification

Check the `icons/` directory for icon files:
- 16x16 PNG
- 48x48 PNG
- 128x128 PNG

Use `file` command to verify they are valid PNG images. Check if `manifest.json` has an `icons` field pointing to them. If the `icons` field is missing from manifest, flag as FAIL.

### 4. Permission Justification Audit

For each permission in `permissions` and `host_permissions`:
- Explain what the permission grants
- Search code for corresponding API calls to verify it's actually used
- Flag unused permissions
- Flag `<all_urls>` and explain the justification needed for Chrome review
- Check if `tabs` permission could be replaced with `activeTab` alone

### 5. Privacy & Legal

- Check for privacy policy URL in project files
- Fetch `https://gorgeous-torte-f0c7c0.netlify.app/privacy.html` and verify it loads
- Fetch `https://gorgeous-torte-f0c7c0.netlify.app/terms.html` and verify it loads
- Check `legal/` directory exists with policy files
- Verify settings page links to privacy policy
- Verify no data is sent to external servers (grep for fetch, XMLHttpRequest, external URLs)

### 6. Debug/Development Code Scan

Search ALL `.js` files for:
- `console.log` statements (count per file)
- `console.warn` / `console.error` (note count)
- `debug: true` or `DEBUG = true` flags
- `debugger` statements
- `TODO` / `FIXME` / `HACK` comments
- `localhost` or `127.0.0.1` references
- `alert()` calls

Report total counts and list top 5 files with most debug code.

### 7. Onboarding Flow

- Check `onboarding/welcome.html` exists
- Check `background/service-worker.js` handles `chrome.runtime.onInstalled` to show welcome page
- Verify onboarding page has no CSP violations (no inline scripts or style attributes)

### 8. Store Description Draft

Based on the extension's actual features (read CLAUDE.md, manifest.json), generate:
- **Short description** (under 132 chars for manifest)
- **Detailed description** (200-500 words for store listing)
- Include: supported portals, key features, privacy stance
- Do NOT include bank trademarks or claim official partnership

### 9. Output Checklist

```
╔══════════════════════════════════════════════════════╗
║       CHROME WEB STORE READINESS REPORT              ║
║       Reward Maximizer                               ║
╚══════════════════════════════════════════════════════╝

Readiness: XX% (passed/total checks)

MANIFEST & CONFIG
  [PASS/FAIL] manifest_version is 3
  [PASS/FAIL] name present and valid length
  [PASS/FAIL] version is valid semver
  [PASS/FAIL] description under 132 chars
  [PASS/FAIL] icons field with 16/48/128
  [PASS/FAIL] all referenced files exist on disk

ICONS & ASSETS
  [PASS/FAIL] 16x16 icon exists and valid PNG
  [PASS/FAIL] 48x48 icon exists and valid PNG
  [PASS/FAIL] 128x128 icon exists and valid PNG
  [PASS/FAIL] promotional tile 440x280 exists
  [PASS/FAIL] at least 1 screenshot exists

PERMISSIONS
  [PASS/FAIL] all permissions justified by code usage
  [PASS/FAIL] no unnecessary permissions
  [PASS/WARN] <all_urls> justification documented

PRIVACY & LEGAL
  [PASS/FAIL] privacy policy URL accessible
  [PASS/FAIL] terms of service exist
  [PASS/FAIL] settings page links to legal docs
  [PASS/FAIL] no data sent to external servers

CODE QUALITY
  [PASS/WARN] console.log statements (X remaining)
  [PASS/FAIL] no debugger statements
  [PASS/FAIL] no localhost references
  [PASS/WARN] TODO/FIXME comments (X remaining)
  [PASS/FAIL] DEBUG flag set to false

ONBOARDING
  [PASS/FAIL] welcome page exists
  [PASS/FAIL] first-run detection in service worker
  [PASS/FAIL] no CSP violations in onboarding page

STORE LISTING (generated drafts below)
  [PASS/FAIL] short description ready
  [READY/TODO] screenshots
  [READY/TODO] promotional images

BLOCKERS (must fix before submission):
  1. ...

WARNINGS (should fix for better review):
  1. ...

--- GENERATED STORE DESCRIPTION ---

Short (for manifest.json):
  "..."

Detailed (for Chrome Web Store listing):
  "..."
```
