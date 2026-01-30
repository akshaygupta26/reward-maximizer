---
description: Scan all extension files for CSP violations, XSS risks, credential leaks, and security issues per Manifest V3 requirements
allowed-tools: Read, Grep, Glob, Bash(ls:*), Bash(wc:*)
---

# CSP & Security Audit

Scan the Reward Maximizer Chrome extension for Content Security Policy violations and security vulnerabilities. If $ARGUMENTS is provided, filter by severity level (e.g., "critical", "high") or audit only that filename.

## Severity Levels

- **CRITICAL**: Will cause Chrome Web Store rejection or runtime CSP error
- **HIGH**: Security vulnerability exploitable by attacker
- **MEDIUM**: Bad practice that could lead to vulnerabilities
- **LOW**: Minor hygiene issue or improvement opportunity

## Instructions

The project root contains `manifest.json`. Scan ALL `.html`, `.js`, and `.css` files in the project.

### 1. Inline Script Violations (CRITICAL)

Scan ALL `.html` files for `<script>` tags WITHOUT a `src` attribute (i.e., inline script blocks with code between tags).

Note: `<script src="file.js"></script>` is ALLOWED. Only flag `<script>code here</script>`.

Report: file, line number, snippet of the inline code.

### 2. Inline Style Attribute Violations (CRITICAL)

Scan ALL `.html` files for `style="..."` attributes on any HTML element.

Note: `<style>` blocks in `<head>` ARE allowed. Only `style=""` inline attributes violate MV3 CSP.

Report: file, line number, element tag, the inline style value.

### 3. Inline Event Handler Violations (CRITICAL)

Scan ALL `.html` files for these attributes:
`onclick`, `onload`, `onerror`, `onchange`, `onsubmit`, `onmouseover`, `onmouseout`, `onfocus`, `onblur`, `onkeydown`, `onkeyup`, `onkeypress`, `onscroll`, `onresize`, `oninput`

Report: file, line number, attribute name and value.

### 4. Dangerous JavaScript Patterns (HIGH)

Scan ALL `.js` files for:
- `eval(` - dynamic code execution
- `new Function(` - dynamic function creation
- `setTimeout(` with a string argument (not a function reference)
- `setInterval(` with a string argument
- `document.write(` or `document.writeln(`

### 5. XSS Risk: innerHTML Usage (HIGH/MEDIUM)

Scan ALL `.js` files for:
- `.innerHTML =` or `.innerHTML +=`
- `.outerHTML =`
- `.insertAdjacentHTML(`

For each occurrence, check if the assigned value includes variable interpolation (`${}` in template literals, or string concatenation with `+` involving variables). Classify as:
- **HIGH**: Assigns scraped/user data (merchant names, offer values, URLs) via innerHTML
- **MEDIUM**: Assigns hardcoded HTML strings only

### 6. Permission Scope Analysis (MEDIUM)

Read `manifest.json` and check:
- Does `host_permissions` include `<all_urls>`? Flag with justification needed.
- Does `permissions` include `tabs`? Could `activeTab` alone suffice?
- Are any permissions declared but never used? Grep for API calls.
- Does `web_accessible_resources` expose sensitive files?

### 7. Credential & Secret Scan (HIGH)

Scan ALL files for:
- Patterns resembling API keys near keywords `key`, `api`, `token`, `secret`
- Hardcoded URLs with credentials: `https://user:pass@`
- OAuth/bearer tokens
- Private keys or certificates

### 8. Insecure URL References (MEDIUM)

Scan ALL files for:
- `http://` URLs (should be `https://`). Exception: `localhost` and `127.0.0.1` are acceptable.
- External CDN references (script/resource loading from third-party domains)
- Any `fetch()` or `XMLHttpRequest` calls to external domains

### 9. Data Handling Review (MEDIUM)

Check how scraped data flows through the extension:
- Are scraped offer values sanitized before display in popup?
- Is data from `chrome.storage` validated when read back?
- Could a malicious page inject data via the scraper that later executes as HTML?
- Check `content/merchant-banner.js` for DOM injection from stored data
- Check `popup/popup.js` for innerHTML with offer data

### 10. Content Script Isolation (LOW)

- Check if content scripts use `window` properties that page scripts could override
- Check if scrapers read DOM values that malicious pages could spoof
- Verify `web_accessible_resources` doesn't expose internal APIs

## Output Format

```
╔══════════════════════════════════════════════════════╗
║         SECURITY AUDIT REPORT                        ║
║         Reward Maximizer                             ║
╚══════════════════════════════════════════════════════╝

SUMMARY
  CRITICAL: X issues
  HIGH:     X issues
  MEDIUM:   X issues
  LOW:      X issues
  TOTAL:    X issues

--- CRITICAL ISSUES ---

[CSP-001] Issue title
  File: path/to/file.html, Line XX
  Detail: description of the violation
  Fix: how to resolve it

--- HIGH ISSUES ---

[SEC-001] Issue title
  File: path/to/file.js, Line XX
  Detail: description of the risk
  Fix: recommended remediation

--- MEDIUM ISSUES ---

[MED-001] Issue title
  ...

--- LOW ISSUES ---

[LOW-001] Issue title
  ...

--- PASSED CHECKS ---

(List checks that found no issues with checkmark)

--- TOP RECOMMENDATIONS ---

1. Most impactful fix
2. Second most impactful
3. ...
```
