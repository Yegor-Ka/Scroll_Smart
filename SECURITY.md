# Security review — 2026-11-09

Reviewed the complete application source, public assets, local HTTP preview server, hosting manifest, response-header configuration, browser-storage handling, all 11 provider adapters, and available Git history. Fixed identified weaknesses and added regression tests. This is a source review and controlled local testing, not a guarantee of complete security or an independent penetration test.

## Findings and fixes

| Finding | Assessment | Resolution |
| --- | --- | --- |
| Local preview accepted arbitrary Host headers and cross-site requests | Medium: exposure to DNS-rebinding or unwanted local-service access; no account data or write endpoint exists | Exact loopback Host/port validation, duplicate-Host rejection, Origin and Fetch Metadata checks |
| Preview could serve any regular file placed in dist | Medium if a secret or backup is accidentally copied into the public folder | Explicit allowlist of eight public asset URL paths, including root/index aliases; all other paths denied |
| Path validation happened separately from opening files | Low: race if a local process modifies files between checking and opening | Descriptor-relative file opens with O_NOFOLLOW, regular-file validation, hardlink rejection, no directory serving |
| API allowlist matched hostnames without constraining ports or all routes | Low: latent request-boundary weakness, because current callers use constants | Exact fixed API routes, default HTTPS ports only, no credentials/fragments or redirects |
| HTML-string rendering depended on correct escaping at every insertion | Defense in depth; no new executable injection demonstrated in the reviewed version | Removed HTML parsing sinks; dynamic feed content uses DOM nodes and textContent; Trusted Types enforced where supported |
| Stored JSON was parsed before size validation | Low: availability risk from corrupted or oversized browser data | 1 MiB read limit, bounded saved records/progress, strict types and field lengths |
| Article links could target loopback/private IPs or unusual ports | Low: unwanted navigation to local services, not server-side SSRF | Reject literal IP addresses, local-name suffixes, nonstandard ports, credentials, control/bidi characters, and backslash URL syntax |
| Preview had no explicit connection limits or request timeout | Low: local resource-exhaustion risk | 10-second socket timeout, 16 active request slots, small queue, response-size limit |

## Verification

- 62 automated tests pass: 42 JavaScript tests and 20 Python tests, covering the existing feed features plus the reader, extraction, and SSRF boundaries. Exact commands are in README.md.
- Server tests exercise actual HTTP parsing and response generation using an in-memory socket. They cover all public assets, GET/HEAD, Host/Origin validation, traversal, symlinks/hardlinks, private paths, unsupported methods, request bodies, and security headers.
- Browser-independent DOM tests verify that malicious markup remains text and no script/image/event nodes are created. Navigation, topic filters, provider failures, and oversized storage are checked with a minimal DOM test double.
- Credential-pattern scan found no real credentials in application files or available Git history. A URL-with-credentials match in a negative test fixture is intentionally fake. This is a heuristic scan, not an exhaustive secret-detection service.
- There are no npm runtime packages. The reader introduces pinned Python dependencies nh3 0.3.7 and defusedxml 0.7.1 in requirements.txt; pip check passes. Dependency compatibility is not a vulnerability-advisory audit, and deployed dependencies need continued monitoring. Python/Node, browser, operating system, and hosting patch levels are outside this source review.
- JavaScript and Python syntax checks pass. Live browser enforcement of CSP/Trusted Types, provider CORS, and production response headers/TLS remain unverified.

Run from the repository root:

```sh
node --test --experimental-test-isolation=none --test-reporter=spec scroll-smart/tests/*.test.mjs
scroll-smart/.venv/bin/python -B -m unittest discover -s scroll-smart/tests -p 'test_*.py' -v
```

## Current protections

API responses and browser-storage records are untrusted. Inputs have topic, identifier, date, URL, field-length, record-count, and visual-control-character checks. Requests omit cookies and referrers, reject redirects, time out after 12 seconds, and cap decoded response bodies at 2 MiB. Exact JSON MIME types are required; the official CISA raw JSON path alone permits text/plain. Previously fetched results survive provider failures in memory.

No provider HTML is inserted in the browser, and no remote scripts, analytics, external fonts, API secrets, or external images are loaded. A fixed NOAA page may be fetched server-side under the reader policy below. New tabs use noopener/noreferrer. The CSP denies unrelated resource types, inline scripts/styles, forms, plugins, framing, and Trusted Type policies. Local and recommended hosted headers also specify nosniff, no-referrer, permissions restrictions, no-store, same-origin resource policy, and same-origin opener policy. HTML meta CSP omits frame-ancestors because that directive requires an HTTP header.

The preview serves only the explicit public assets, binds to 127.0.0.1, does not log request-controlled strings, and suppresses Python version disclosure. It requires Unix descriptor-relative/no-follow file-opening support. It remains a development server, not an internet-facing production server. A compromised process running as the same OS user remains outside its protection boundary.

## Deployment requirements and remaining limits

- Serve only public static assets over HTTPS through a production host. Never serve the repository, .git, .openai, credentials, or the Python server publicly. `_headers` is configuration, not a browser asset, and is denied by the local server.
- `dist/_headers` specifies the recommended production headers for hosts supporting that format. Other hosts need equivalent configuration. Verify actual deployed headers, access controls, TLS, and HSTS separately; a source file does not prove that a host applied it. Enable HSTS at the HTTPS host after validating HTTPS. No production changes were made in this review.
- Article destinations remain external and untrusted. Public DNS names can resolve to private addresses or redirect after navigation; the browser-only app cannot guarantee safe remote destinations. HTTPS does not prove publisher identity or factual correctness. This application never fetches arbitrary article URLs on a server.
- Providers learn visitors' IP addresses. Rate limits, API changes, CORS restrictions, and outages can affect coverage. No arbitrary proxy bypasses browser protections.
- Saved stories and progress are device-local, unencrypted, and accessible to any script running on the same origin. Keep secrets and sensitive information out of localStorage. The app has no accounts, auth cookies, payment flow, database, upload endpoint, or background server-side ingestion. The on-demand reader endpoint is reviewed separately below.
- Operating-system compromise, malicious browser extensions, upstream content credibility, production host misconfiguration, and future code changes require separate assessment. Adding accounts, ingestion, secrets, or uploads requires a new review.

References: [Python HTTP server security guidance](https://docs.python.org/3/library/http.server.html), [OWASP browser storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html), [CSP and Trusted Types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

## Source verification follow-up

See [SOURCE_AUDIT.md](SOURCE_AUDIT.md) and its raw HTTPS observations for the provider identity, link availability, redirect, JSON, and CORS review. One broken NASA URL and two canonical redirects were corrected. Outgoing cards display destination domains; source status distinguishes a successful fetch from security or editorial certification. No malware/reputation scanning was performed, and future aggregated links remain unreviewed.

## Interface and gesture changes

Double-click/double-tap saving uses delegated native events and the same bounded, device-local saved collection. Quick-save gestures now toggle saved state. Gesture inputs are checked against existing card IDs before storage; links, buttons, text fields, scrolling, and multi-touch are excluded. Card rendering continues to use textContent and DOM nodes under the existing strict CSP and Trusted Types policy. The redesign adds no external scripts, fonts, assets, API destinations, storage services, or dependencies. Regression tests cover gestures, duplicate synthetic-event suppression, persistence across reloads, and explicit bookmark removal. No live-browser security or visual certification is implied.

Lazy feed rendering appends validated cards in batches using the existing safe DOM renderer. It adds no API endpoints, external dependencies, or HTML parsing. Regression tests cover batch limits, filter resets, preservation of loaded depth, and stale observer notifications. Actual browser/device performance remains unverified.

## In-app reader security boundary

The new `GET /api/reader?id=...` endpoint accepts a single internal feed ID only; URL parameters and unknown ID shapes are rejected. The server rehydrates supported source-native IDs through fixed official API routes and verifies the returned MED/work/event/CVE identity. Browser metadata and localStorage do not authorize a URL fetch. Unsupported feed/curated IDs receive an explicitly labeled excerpt response without fetching their publisher URL. No proxy, client HTML, or signed arbitrary-URL token is accepted.

The outbound allowlist is the subset of existing sources needed by approved extractors: www.ebi.ac.uk, earthquake.usgs.gov, openlibrary.org, raw.githubusercontent.com and oceanservice.noaa.gov. HTTPS is mandatory; credentials, explicit ports, fragments and malformed URLs are blocked. Every DNS answer must be global/unicast; loopback, private, link-local, shared, reserved, unspecified, multicast, cloud metadata, mapped IPv4, known NAT64, 6to4 and Teredo addresses are denied. The transport pins the validated numeric address and verifies TLS against the original hostname. API redirects are limited to three and repeat URL/DNS validation. HTML and robots requests refuse all redirects to avoid applying the wrong page policy. Environment proxies and cookies are not used.

There are four concurrent reader slots, four DNS slots, a global 20/minute uncached admission limit, an 18-second transfer deadline enforced by socket shutdown, six-second socket operations, and two-second DNS waits. Bodies are capped at 2 MiB (HTML 1 MiB; robots 64 KiB), text at 120,000 characters, and the cache at 64 entries. Positive entries expire in ten minutes; fallback entries in one minute. No full articles, sensitive query strings, cookies or tokens are logged.

Full Europe PMC body text requires a verified MED record, Open Access status, a PMCID, and an explicit CC BY/CC0 license link; marked retractions, unknown licenses and XML DTD/entity declarations fall back. USGS/CISA return clearly labeled source records; Open Library returns only a catalog description. Only the fixed, existing NOAA coral explainer is approved for HTML main-content extraction, under its public-information policy, subject to robots.txt and access/reuse metadata. No publisher/paywall/bot-protection workaround is used. Other providers and curated sources remain excerpt-only. Full supported behavior is listed in README.md.

nh3 sanitizes all extracted fragments, dropping scripts/forms/iframes/styles/SVG/objects/tracking containers and every attribute/URL. Responses contain only typed text blocks, never raw HTML; the browser uses DOM construction and textContent. Remote hero images are omitted because no approved media proxy/licensing path exists. Trusted Types and existing CSP/CORS protections remain; `connect-src 'self'` is the sole CSP addition needed for the same-origin API.

This local Python backend is **not** included by the retained static-only hosting manifest. A production backend/route, HTTPS/HSTS, actual response-header checks, access controls/per-client quotas, outbound firewall policy, runtime/dependency review, and real desktop/mobile browser testing remain necessary before a production release. Tests use controlled fixtures and in-memory sockets rather than unbounded live publisher crawling.
