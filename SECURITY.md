# Security review — 2026-11-09

Reviewed the complete application source, public assets, local HTTP preview server, hosting manifest, response-header configuration, browser-storage handling, all 11 provider adapters, and available Git history. Fixed identified weaknesses and added regression tests. This is a source review and controlled local testing, not a guarantee of complete security or an independent penetration test.

## Findings and fixes

| Finding | Assessment | Resolution |
| --- | --- | --- |
| Local preview accepted arbitrary Host headers and cross-site requests | Medium: exposure to DNS-rebinding or unwanted local-service access; no account data or write endpoint exists | Exact loopback Host/port validation, duplicate-Host rejection, Origin and Fetch Metadata checks |
| Preview could serve any regular file placed in dist | Medium if a secret or backup is accidentally copied into the public folder | Explicit allowlist of seven public URL paths, including root/index aliases; all other paths denied |
| Path validation happened separately from opening files | Low: race if a local process modifies files between checking and opening | Descriptor-relative file opens with O_NOFOLLOW, regular-file validation, hardlink rejection, no directory serving |
| API allowlist matched hostnames without constraining ports or all routes | Low: latent request-boundary weakness, because current callers use constants | Exact fixed API routes, default HTTPS ports only, no credentials/fragments or redirects |
| HTML-string rendering depended on correct escaping at every insertion | Defense in depth; no new executable injection demonstrated in the reviewed version | Removed HTML parsing sinks; dynamic feed content uses DOM nodes and textContent; Trusted Types enforced where supported |
| Stored JSON was parsed before size validation | Low: availability risk from corrupted or oversized browser data | 1 MiB read limit, bounded saved records/progress, strict types and field lengths |
| Article links could target loopback/private IPs or unusual ports | Low: unwanted navigation to local services, not server-side SSRF | Reject literal IP addresses, local-name suffixes, nonstandard ports, credentials, control/bidi characters, and backslash URL syntax |
| Preview had no explicit connection limits or request timeout | Low: local resource-exhaustion risk | 10-second socket timeout, 16 active request slots, small queue, response-size limit |

## Verification

- 39 automated tests pass: 14 feed/request/schema tests, 4 DOM-rendering tests, 3 application smoke tests, 8 gesture tests, 4 lazy-feed tests, and 6 HTTP/server tests.
- Server tests exercise actual HTTP parsing and response generation using an in-memory socket. They cover all public assets, GET/HEAD, Host/Origin validation, traversal, symlinks/hardlinks, private paths, unsupported methods, request bodies, and security headers.
- Browser-independent DOM tests verify that malicious markup remains text and no script/image/event nodes are created. Navigation, topic filters, provider failures, and oversized storage are checked with a minimal DOM test double.
- Credential-pattern scan found no real credentials in application files or available Git history. A URL-with-credentials match in a negative test fixture is intentionally fake. This is a heuristic scan, not an exhaustive secret-detection service.
- There are no npm packages or third-party Python packages, package managers, or lockfiles in this application to run a dependency advisory audit against. Python/Node, browser, operating system, and hosting patch levels are outside this source review.
- JavaScript and Python syntax checks pass. Live browser enforcement of CSP/Trusted Types, provider CORS, and production response headers/TLS remain unverified.

Run from the repository root:

```sh
node scroll-smart/tests/feed.test.mjs
node scroll-smart/tests/ui.test.mjs
node scroll-smart/tests/app-smoke.test.mjs
python3 -B -m unittest discover -s scroll-smart/tests -p 'test_*.py' -v
```

## Current protections

API responses and browser-storage records are untrusted. Inputs have topic, identifier, date, URL, field-length, record-count, and visual-control-character checks. Requests omit cookies and referrers, reject redirects, time out after 12 seconds, and cap decoded response bodies at 2 MiB. Exact JSON MIME types are required; the official CISA raw JSON path alone permits text/plain. Previously fetched results survive provider failures in memory.

No provider HTML, remote scripts, analytics, external fonts, API secrets, or external images are loaded. New tabs use noopener/noreferrer. The CSP denies unrelated resource types, inline scripts/styles, forms, plugins, framing, and Trusted Type policies. Local and recommended hosted headers also specify nosniff, no-referrer, permissions restrictions, no-store, same-origin resource policy, and same-origin opener policy. HTML meta CSP omits frame-ancestors because that directive requires an HTTP header.

The preview serves only the explicit public assets, binds to 127.0.0.1, does not log request-controlled strings, and suppresses Python version disclosure. It requires Unix descriptor-relative/no-follow file-opening support. It remains a development server, not an internet-facing production server. A compromised process running as the same OS user remains outside its protection boundary.

## Deployment requirements and remaining limits

- Serve only public static assets over HTTPS through a production host. Never serve the repository, .git, .openai, credentials, or the Python server publicly. `_headers` is configuration, not a browser asset, and is denied by the local server.
- `dist/_headers` specifies the recommended production headers for hosts supporting that format. Other hosts need equivalent configuration. Verify actual deployed headers, access controls, TLS, and HSTS separately; a source file does not prove that a host applied it. Enable HSTS at the HTTPS host after validating HTTPS. No production changes were made in this review.
- Article destinations remain external and untrusted. Public DNS names can resolve to private addresses or redirect after navigation; the browser-only app cannot guarantee safe remote destinations. HTTPS does not prove publisher identity or factual correctness. This application never fetches arbitrary article URLs on a server.
- Providers learn visitors' IP addresses. Rate limits, API changes, CORS restrictions, and outages can affect coverage. No arbitrary proxy bypasses browser protections.
- Saved stories and progress are device-local, unencrypted, and accessible to any script running on the same origin. Keep secrets and sensitive information out of localStorage. The app has no accounts, auth cookies, payment flow, database, upload endpoint, or server-side ingestion to assess.
- Operating-system compromise, malicious browser extensions, upstream content credibility, production host misconfiguration, and future code changes require separate assessment. Adding accounts, ingestion, secrets, or uploads requires a new review.

References: [Python HTTP server security guidance](https://docs.python.org/3/library/http.server.html), [OWASP browser storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html), [CSP and Trusted Types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

## Source verification follow-up

See [SOURCE_AUDIT.md](SOURCE_AUDIT.md) and its raw HTTPS observations for the provider identity, link availability, redirect, JSON, and CORS review. One broken NASA URL and two canonical redirects were corrected. Outgoing cards display destination domains; source status distinguishes a successful fetch from security or editorial certification. No malware/reputation scanning was performed, and future aggregated links remain unreviewed.

## Interface and gesture changes

Double-click/double-tap saving uses delegated native events and the same bounded, device-local saved collection. Quick-save gestures now toggle saved state. Gesture inputs are checked against existing card IDs before storage; links, buttons, text fields, scrolling, and multi-touch are excluded. Card rendering continues to use textContent and DOM nodes under the existing strict CSP and Trusted Types policy. The redesign adds no external scripts, fonts, assets, API destinations, storage services, or dependencies. Regression tests cover gestures, duplicate synthetic-event suppression, persistence across reloads, and explicit bookmark removal. No live-browser security or visual certification is implied.

Lazy feed rendering appends validated cards in batches using the existing safe DOM renderer. It adds no API endpoints, external dependencies, or HTML parsing. Regression tests cover batch limits, filter resets, preservation of loaded depth, and stale observer notifications. Actual browser/device performance remains unverified.
