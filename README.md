# Scroll Smart

A responsive first version of a personal learning feed. Desktop and mobile share one web app; this is not a native iOS/Android app.

## Run locally

From the repository root: `python3 scroll-smart/serve.py`, then open http://127.0.0.1:8080. From this folder, use `python3 serve.py`.

No installation or build is required. Publish `dist/` on a static host.

## Features

- Topic filtering, selected milestones from 2016 onward, original-source links.
- Device-local saved stories and daily five-idea goal. Opening a source counts as exploring; reading comprehension is not measured.
- Live technology links, space news, earthquake observations, and journal metadata from Hacker News, Spaceflight News, USGS, and Crossref. No personal API keys are required.
- Refresh on opening, on demand, and every 15 minutes while visible. Failed providers are reported; curated content remains available. There is no background ingestion while closed, content database, account sync, AI summarization, or exhaustive decade archive.
- The curated nature explainer is marked evergreen rather than presented as a dated discovery.

## Sources and credentials

- Hacker News: https://github.com/HackerNews/API
- Spaceflight News: https://api.spaceflightnewsapi.net/v4/docs/
- Optional broader news: https://newsapi.org/docs and https://newsapi.org/pricing. Requires your own account key; the free Developer plan does not permit production use.

Do not store paid API keys in public files or browser storage. Add a backend with server-held secrets for providers that require keys. A later ingestion service can deduplicate, classify, store source timestamps, and schedule updates while the app is closed. Review publisher reuse terms before expanding beyond attributed excerpts and links.

Saved stories and progress use browser localStorage; they do not synchronize across devices. Clearing browser storage removes them.

## Updated sources and refresh

Four public providers are integrated: Hacker News, Spaceflight News, [USGS](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php), and [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/). No account keys are required. USGS cards are recent seismic observations, not emergency alerts. Crossref cards show journal metadata, not independently verified findings. The Wikipedia Wikifeeds API was considered but excluded because its official documentation announces gradual deprecation from July 2026.

**Refresh feed** checks all four providers, prevents overlapping requests, limits checks to once per 30 seconds, and removes duplicate links. Automatic checks happen on opening, every 15 minutes while visible, and on returning after 15 minutes. Failed providers retain their previous in-memory results; the UI identifies failures and warns that results may be stale. A page reload starts fresh. Saved stories are limited to 200 records.

## Reliable local start

From the repository root, run `python3 scroll-smart/serve.py`. This serves the correct absolute directory regardless of the terminal's current folder and adds security headers. Open http://127.0.0.1:8080. Stop an earlier server with Ctrl+C first, or use `--port 8081`.

## Security review and validation

See [SECURITY.md](SECURITY.md) for scope, mitigations, deployment requirements, and remaining risks. Run `node --test scroll-smart/tests/*.test.mjs` from the repository root. The tests use controlled fixtures and do not verify live API availability or browser CORS.

## Expanded learning topics

The Discover feed now offers Books, History, AI, Computer Science, Medicine, and Cybersecurity filters alongside the original topics. There are 11 independently tracked provider adapters:

| Topic | Content | Source |
| --- | --- | --- |
| Books | Six science-book catalog discoveries, plus three fixed original mini-reviews with reading suggestions | Open Library; original Scroll Smart notes linking to Project Gutenberg |
| History | Six archive essays, plus sourced facts about Apollo 11 and the Web | Library of Congress; U.S. National Archives; CERN |
| AI | Six recent community-submitted links matching artificial intelligence | HN Search / Algolia |
| Computer Science | Six recent community-submitted links matching computer science | HN Search / Algolia |
| Medicine | Six recent indexed medical journal articles | Europe PMC / EMBL-EBI |
| Cybersecurity | Six community breach-report links and six recent catalog additions | HN Search; CISA KEV, with the official cisagov/kev-data mirror as a fallback |

These sources require no app API keys. Historical material and book discoveries are labeled evergreen, not breaking news. Mini-reviews are original editorial reading notes, not copied professional reviews or invented user ratings. Project Gutenberg availability and copyright rules vary by jurisdiction; check the linked edition. Medicine cards are research updates, not patient-specific advice. Community news can include opinion or unconfirmed reporting. Cybersecurity coverage is selective and cannot include every incident; KEV addition dates are not attack dates.

The expanded Sources & updates screen reports each adapter independently. All adapters participate in the existing refresh, failure retention, duplicate removal, topic filtering, and save functions. The refresh UI derives its source count from the provider registry.

Provider documentation: [Open Library](https://openlibrary.org/developers/api), [Library of Congress](https://www.loc.gov/apis/json-and-yaml/), [HN Search](https://hn.algolia.com/api), [Europe PMC](https://europepmc.org/RestfulWebService), [CISA official mirror](https://github.com/cisagov/kev-data). API schemas are fixture-tested; browser CORS and live availability have not been verified in this environment. A failing provider is shown as unavailable without bypassing browser security or using an unknown proxy.

## Hardened local preview

Restart `python3 scroll-smart/serve.py` after server/security-policy changes, then reload the page. The preview accepts only `http://127.0.0.1:8080` or `http://localhost:8080` (or the selected `--port`). Custom hostnames, LAN access, cross-site embeddings, and direct requests to nonpublic files are intentionally rejected. The launcher requires Unix file-descriptor/no-follow support. Serve the static assets through an HTTPS production host for real deployment.

The renderer now constructs DOM nodes instead of parsing HTML strings. The CSP enforces Trusted Types where supported. For the complete review, findings, test commands, and deployment limits, see [SECURITY.md](SECURITY.md).

## Source validity and outgoing links

See [SOURCE_AUDIT.md](SOURCE_AUDIT.md) for the checked provider identities, direct HTTPS results, unavailable endpoints, and corrected curated links. Cards show their actual destination hostname. Provider fetch success does not certify accuracy or malware safety, especially for community links and DOI redirects.

## Modern interface and quick saving

The responsive interface uses system typography, topic artwork drawn with CSS, larger touch controls, clear focus indicators, reduced-motion support, and floating mobile navigation. No third-party runtime scripts or remote fonts were added.

- Desktop: double-click the body of a story to save or unsave it.
- Mobile/tablet: double-tap the same story without scrolling to save or unsave it.
- Keyboard: focus a card and press **S**, or activate its save button.
- The save button also removes an existing bookmark. Repeating a quick-save gesture removes the story from Saved for later.
- A confirmation and saved marker appear; stories remain in **Saved for later** on the same browser/device. If browser storage fails, the confirmation explicitly says the update is session-only.

Links and controls are excluded from quick-saving. Swipes, scrolling, long presses, multi-touch, and canceled touches reset the mobile gesture. Pinch zoom and regular scrolling remain available.

Gesture tests: `node scroll-smart/tests/gestures.test.mjs`. The complete test command is `node --test scroll-smart/tests/*.test.mjs` plus the Python tests documented in SECURITY.md. Real desktop/mobile browser appearance and touch behavior still need visual/device verification; automated gesture tests use controlled pointer events.

## Lazy feed rendering

Discover, decade, and saved feeds initially render eight matching stories. Scrolling within 300 px of the Load more button appends the next eight. The button is also a keyboard-accessible fallback when IntersectionObserver is unavailable. Existing card nodes remain intact when appending. Topic/view changes reset the batch; saving or refreshing preserves the number already loaded. The footer appears after all matching stories are shown.

This lazily renders the fetched collection; it does not add unlimited provider pagination or defer the existing bounded API refresh requests. Offscreen cards also use browser content-visibility optimization. Tests: `node scroll-smart/tests/lazy-feed.test.mjs`.
