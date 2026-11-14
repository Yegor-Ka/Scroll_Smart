# Discovery and open-text research — 2026-11-14

## Presentation research

Reviewed [Deepstash’s public site](https://deepstash.com/): short learning entry points, broad topic exploration, and connecting ideas are useful patterns for this project. Scroll Smart applies these through original card introductions, four curated trails, search, an unopened-article surprise action, reflection questions, and a reading section list. It retains the daily stopping point rather than adding an endless reward loop. No Deepstash text, book summaries, branding, or assets are imported.

## Sources selected for implementation

“Open-source software” and “openly licensed article content” are different. Public accessibility alone does not grant redistribution rights.

| Source | License / access evidence | Implementation |
| --- | --- | --- |
| Wikipedia | [Wikimedia Terms of Use, section 7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content) permits reuse with attribution and license conditions; text is generally CC BY-SA 4.0. | Thirteen fixed, curated encyclopedia titles; official parse API. Contributor attribution, exact original revision, CC BY-SA link, and adaptation notice in every successful reader. |
| Wikivoyage | [Copyleft policy](https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft) specifies CC BY-SA 4.0 and attribution requirements. | Three fixed guides: Astronomy, Archaeological sites, and Rail travel. Same verified-ID and text-only reader model. |
| NASA (researched, not integrated) | [Media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) distinguishes NASA material and third-party copyrighted material. | Not treated as a blanket license for arbitrary pages or imagery. |
| Europe PMC (existing) | [REST API](https://europepmc.org/RestfulWebService) provides fullTextXML for eligible open-access papers. | Existing per-paper open-access / license verification remains; no claim that every medicine item has full text. |

The new integrations use [MediaWiki’s parse API](https://www.mediawiki.org/wiki/API:Parsing_wikitext). The TextExtracts extension was considered but not selected because its documentation identifies maintenance limitations. No API keys are needed. Titles are server-maintained, not browser-provided URLs. Catalog additions require updating both `open_articles.json` and `dist/discovery.mjs`; a test prevents those catalogs from drifting.

Source text is sanitized, converted to headings/paragraphs, and displayed as main article text. Images, equations, reference lists, navigation, and infoboxes are omitted. Readers are told this and given the exact source revision for full layout, citations, and contributor history. Content edits remain subject to the displayed CC BY-SA 4.0 license. The app does not claim community-edited sources are error-free or links are malware-certified.

## Live verification and limits

Initial public API checks returned article HTML and revision IDs for Wikipedia’s Spaced repetition and Wikivoyage’s Astronomy. A subsequent pass through the production reader confirmed main-text extraction for ten Wikipedia entries: spaced repetition, curiosity, Stoicism, Occam’s razor, Fermi paradox, biomimetics, fractals, game theory, carbon cycle, and circular economy. No full article bodies were saved in the audit artifacts.

The next Wikipedia request (Printing press) and the Wikivoyage reader request (Astronomy) initially returned HTTP 429. Further requests to each affected host were stopped. After a cooldown, one sequential follow-up checked the six remaining entries; **all succeeded**, including Linguistic relativity, Open-source software, Archaeological sites, and Rail travel. All 16 entries are now verified through the production reader handler. See [structured observations](audit/discovery-2026-11-14.json), including the initial rate-limit results. The app applies a two-minute per-source cooldown on these rate-limit responses. A supported source label indicates a retrieval capability, not guaranteed future availability.

## Storage and security decision

Accounts and cross-device saved-library synchronization require trusted shared storage or an external account service. The user requested no database/server implementation, so login is deferred. Existing bounded, validated browser bookmarks remain available without a password, account, or new service. Article bodies are only cached in the Python process for ten minutes; saved bookmarks are not offline full-text storage.

The same-origin local Python reader is still required for full text. Static deployment alone cannot execute the reader. All server URL/DNS/TLS restrictions, sanitizer boundaries, time/size limits, and cache bounds remain in place. No new browser network destination or runtime dependency was added. See SECURITY.md for checks and limits.
