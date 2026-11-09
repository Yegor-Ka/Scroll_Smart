# Scroll Smart

A responsive personal learning feed for desktop and mobile. It includes topic filters, selected milestones since 2016, original-source attribution, a device-local saved collection, a five-idea daily goal, and an in-app article reader. It is a web app, not a native iOS/Android app.

## Local setup and run

From the repository root, with Python 3.10+ on Unix and Node.js 22+ for tests:

```sh
python3 -m venv scroll-smart/.venv
scroll-smart/.venv/bin/python -m pip install -r scroll-smart/requirements.txt
scroll-smart/.venv/bin/python scroll-smart/serve.py
```

Open **http://127.0.0.1:8080**. From inside `scroll-smart`, use `.venv/bin/python serve.py`. Stop an older server with Ctrl+C first, or select `--port 8081`. Restart the server after backend or policy changes. There is no JavaScript dependency installation or build step. Python dependencies are pinned: nh3 for established HTML5 sanitization and defusedxml for hardened XML parsing.

The launcher serves an absolute asset directory, accepts only localhost/127.0.0.1, validates Host and Origin, and requires Unix descriptor-relative/no-follow file opening. It is a development server; do not expose it directly to the internet.

## Reading and saving

- Click/tap a card for the in-app reader. A 500 ms delay on the card body distinguishes a single click from the existing double gesture. **Read here →** and Enter on a focused card open immediately.
- The native dialog becomes full-screen on phones. It shows the title, provider, topic, available author/date, an estimate for the text actually displayed, and a persistent original-source link opening a separate tab.
- Back, Escape, or the browser Back button closes the reader and restores the feed scroll position. The feed DOM and loaded batch stay in place. Outstanding requests are canceled on close and late results are ignored.
- Double-click/double-tap the card or reading area to save or unsave. Focus a card/reading area and press **S**, or use the save button. Scrolling, long presses, controls, and multi-touch do not count as double-taps.
- Reader and feed bookmarks use the same collection. Opening a reader counts an idea once toward the daily goal; it does not claim to measure reading completion or comprehension.
- Saved stories and progress use browser localStorage, limited to 200 records. They do not sync across devices. Clearing storage removes them; storage failures are explicitly reported as session-only.

A loading state is shown during retrieval. **Excerpt only** means the full article could not be retrieved; the existing summary is displayed without claiming it is complete. Catalog descriptions and structured records have separate labels. No third-party pages are embedded. No remote hero images are displayed: there is no approved licensed-image/proxy path, and the existing `img-src 'self'` policy remains intact.

## Feed and lazy rendering

There are 11 existing adapters, with no API keys required. Refresh happens on opening, manually, every 15 minutes while visible, and when returning after 15 minutes. Requests have a 30-second cooldown and cannot overlap. Unavailable providers retain their prior in-memory results and report failure. There is no background ingestion while closed.

Feeds initially construct eight cards. Scrolling near the end appends eight more without replacing the existing cards. **Load more** is a keyboard-accessible fallback. Filters/views reset the batch, while save/refresh updates preserve the number loaded. This is lazy rendering of the bounded fetched collection, not unlimited upstream pagination.

## Source-specific reader support

All feed adapters retain their original fetching behavior. Full-text retrieval is a separate, on-demand server operation.

| Adapter / source | In-app content | Why / conditions |
| --- | --- | --- |
| Europe PMC / Medicine | Full main-body text when approved; otherwise excerpt | Rehydrate the MED ID through the official API, require Open Access, a valid PMCID and an explicit CC BY or CC0 reuse link in JATS XML. Reject marked retractions, unverified licenses, DTDs/entities, blocked responses or unsupported content. |
| USGS / Nature | Official structured event record | Re-fetch the official event ID. Labeled as observations, not a complete news article or an emergency alert. |
| CISA KEV / Cybersecurity advisories | Official catalog record | Look up the CVE in the existing official cisagov mirror (CC0). Catalog addition dates are not attack dates. |
| Open Library / Books | Catalog description, if provided | Official work ID lookup; this is not the full book or a professional review. |
| NOAA / curated coral explainer | Main article text when safely identifiable | Only this fixed existing page is eligible for HTML extraction, under NOAA's public-information policy. Honor robots.txt and restrictive meta tags; refuse access-wall indicators and redirects. Missing/unclear main content falls back. |
| Crossref / Science | Existing excerpt and metadata | Crossref provides metadata and full-text links, not blanket permission to redistribute publisher articles. No DOI/publisher redirects are followed. |
| Spaceflight News / Space | Existing attributed summary | Aggregation does not grant a full-text reuse license for each publisher. |
| Hacker News / Technology | Existing excerpt and metadata | Arbitrary community submission URLs are never fetched by the reader server. |
| HN Search / AI | Existing excerpt and metadata | Same community-link restrictions. |
| HN Search / Computer Science | Existing excerpt and metadata | Same community-link restrictions. |
| HN Search / cybersecurity reports | Existing excerpt and metadata | Same restrictions; selected reports are not comprehensive incident coverage. |
| Library of Congress / History | Existing excerpt and metadata | Collection access was blocked in the prior check and reproduction rights are item-specific; no generic collection crawler was added. |
| Other curated sources and original book mini-reviews | Existing excerpt/reading note and source link | No page fetching without a separately reviewed source policy. Project Gutenberg links do not cause book downloads. |

Primary policy references: [Europe PMC REST service](https://europepmc.org/RestfulWebService), [Crossref full-text limitations](https://www.crossref.org/documentation/retrieve-metadata/rest-api/text-and-data-mining-for-researchers/), [NOAA reuse policy](https://oceanservice.noaa.gov/disclaimer.html), [CISA official mirror and license](https://github.com/cisagov/kev-data), [Open Library API](https://openlibrary.org/developers/api).

## Reader security model

`GET /api/reader?id=<internal-feed-id>` is same-origin and accepts one ID only—no URL field, proxy destination, cookies, API keys, or browser-supplied article HTML. Supported native IDs are independently rehydrated from the official source and matched against the returned record; unknown/unsupported records cannot become arbitrary fetches. The endpoint does not trust localStorage records as server authorization. IDs are not signed tokens: they select public source records through fixed handlers, not arbitrary URL paths or hosts.

Server destinations are an explicit subset of existing source domains: `www.ebi.ac.uk`, `earthquake.usgs.gov`, `openlibrary.org`, `raw.githubusercontent.com`, and `oceanservice.noaa.gov`. Only HTTPS/default port is permitted. DNS answers must all be public. Literal/private/loopback/link-local/reserved/multicast/metadata destinations, credentials and custom ports are rejected. The socket connects to a validated numeric address while TLS verifies the original hostname; redirects trigger fresh URL/DNS checks. No environment HTTP proxy or second DNS lookup is used. HTML and robots retrieval do not follow redirects.

Limits: four reader requests and four DNS resolutions concurrently, 20 uncached reader admissions/minute globally, 18-second retrieval deadline with socket shutdown watchdog, six-second socket operations, two-second DNS waits, three redirects, 2 MiB response cap (HTML 1 MiB; robots 64 KiB), and 120,000 text characters. Responses are cached in memory for 10 minutes (fallbacks 60 seconds), at most 64 entries. No article payload, credential, or source query URL is logged. Unsupported, blocked, paywalled, unlicensed, or unsafely parsed content returns the excerpt state.

nh3 removes executable/unwanted HTML subtrees and all attributes/URLs. The server returns only typed plain-text paragraph/heading blocks, never an HTML document. The browser validates them and uses `textContent`/DOM construction. XML parsing blocks external entities and DTDs. No iframe, image hotlink, script, cookie, or tracking markup is imported. Security headers and Trusted Types stay in force; the sole network-policy addition is `connect-src 'self'` for the new same-origin endpoint, with no permissive CORS header.

## Tests

From the repository root:

```sh
node --test --experimental-test-isolation=none --test-reporter=spec scroll-smart/tests/*.test.mjs
scroll-smart/.venv/bin/python -B -m unittest discover -s scroll-smart/tests -p 'test_*.py' -v
scroll-smart/.venv/bin/python -m pip check
```

Latest result: **42 JavaScript tests + 20 Python tests = 62 passing tests**, zero failures. Coverage includes reader opening, mobile dialog markup/rules, bookmarks, daily-goal integration, fallbacks, original-source links, SSRF/DNS/redirect controls, timeouts and response limits, sanitization, robots policy, cache/concurrency limits, and existing feed/lazy-loading/security regressions. Browser/device appearance and live provider access remain unverified; fixture tests are not an independent penetration test.

## Production deployment review still required

The retained `.openai/hosting.json` currently describes static hosting only. Copying `dist` to a static host does **not** deploy Python: the UI will gracefully fall back to excerpts when `/api/reader` is absent. Production full text requires a supported backend deployment and a same-origin `/api/reader` route. Review TLS/HSTS, applied headers, access controls, per-client rate limits, outbound network/DNS restrictions, process/thread limits, dependency advisories, publisher-policy changes, and retention before exposing it publicly. No production deployment was performed.

No accounts, cross-device sync, payments, uploads, background content database, or malware-reputation integration were introduced. External original links remain untrusted. Read [SECURITY.md](SECURITY.md) and [SOURCE_AUDIT.md](SOURCE_AUDIT.md) for the prior review and its limits.
