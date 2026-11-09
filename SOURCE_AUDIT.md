# Source and outbound-link review — 2026-11-09

The configured providers are identifiable public services on their documented domains. This does **not** establish that every article they index is accurate, safe to open, or free from malware. This review checked provider identity, HTTPS responses, redirects, JSON shape/size, CORS headers for the local origin, curated destinations, and application link handling. It did not perform malware scanning, domain-reputation screening, executable/download analysis, full browser testing, or independent fact-checking of each future article.

## Direct HTTPS results

[Raw observations](audit/source-check-2026-11-09.json) contain all 34 distinct pre-change URLs: 9 documentation URLs, 13 curated links, and 12 API requests (11 adapters plus CISA's fallback).

- 30 responses returned HTTP 200. The Library of Congress documentation response returned 200 but timed out while reading its body; this is recorded as an incomplete body check.
- 3 returned HTTP 403: the Library of Congress feed, Europe PMC documentation, and the Event Horizon Telescope article. These observations establish an access failure from this test environment, not malware or proof that the organizations are invalid.
- 1 returned HTTP 404: the old NASA Webb first-images page. It has been replaced with [NASA's current page](https://science.nasa.gov/mission/webb/webbs-first-images/), whose content was retrieved through web browsing.
- AlphaGo and Rosetta redirected within their original organizations. The app now links to the observed final HTTPS URLs directly.
- 11 of 12 API requests returned parseable JSON within the app's 2 MiB limit. Ten of the eleven adapters have a successful tested endpoint, including CISA through its fallback. Library of Congress remains unavailable in this environment; the app reports the failure and retains curated history material.

## Provider assessment

| Provider / adapters | Identity and role | Observed API result | Content and click-safety limits |
| --- | --- | --- | --- |
| [Open Library](https://openlibrary.org/about) / Books | Internet Archive's community-editable book catalog | 200, expected works array, CORS allowed | Catalog metadata may contain mistakes. It is not a professional review service. Original Scroll Smart reading notes are labeled separately. |
| [Library of Congress](https://www.loc.gov/apis/json-and-yaml/) / History | Official U.S. library API and historical collection | 403 for the configured collection request | Legitimate source; automated access unavailable here. Historical interpretation and archive metadata need context. |
| [HN Search](https://hn.algolia.com/api) / AI, Computer Science, Cybersecurity reports | Algolia's Hacker News search service | All three queries: 200, expected hits, local-origin CORS permission | Community-submitted links are unreviewed external destinations. Neither search relevance nor votes establishes accuracy or link safety. |
| [Europe PMC](https://europepmc.org/RestfulWebService) / Medicine | Life-sciences literature service, using EMBL-EBI's API domain | API 200, expected result list, CORS allowed; documentation 403 | Indexing is not clinical validation. Check publication type, methods, corrections and retractions; not personal medical advice. |
| [CISA KEV](https://github.com/cisagov/kev-data) / Cybersecurity advisories | Official government catalog, with official cisagov mirror | Both endpoints 200 and expected catalog; main endpoint omitted CORS, official mirror allowed it | Advisories concern known exploited vulnerabilities. Catalog addition dates are not attack dates and coverage is not every incident. |
| [Hacker News](https://github.com/HackerNews/API) / Technology | Official public community API | 200, expected IDs, local-origin CORS permission | Submission destinations are not vetted by Scroll Smart. The API's legitimacy does not certify submitted links. |
| [Spaceflight News](https://github.com/TheSpaceDevs/Tutorials/blob/main/faqs/faq_SNAPI.md) / Space | The Space Devs' reporting aggregator | 200, expected results, CORS allowed | Articles belong to separate publishers. Aggregation is not a security assessment or independent confirmation of reporting. |
| [USGS](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) / Nature | Official U.S. earthquake observations | 200, expected features, CORS allowed | Preliminary measurements can change. This learning feed is not an emergency alert service. |
| [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) / Science | Scholarly metadata registry with publisher-deposited records | 200, expected message/items shape, CORS allowed | A DOI or metadata record does not establish paper quality, peer-review status, or correctness. DOI links can redirect to publisher sites. |

CORS observations used `Origin: http://127.0.0.1:8080`. Response headers from this origin do not prove that every hosted origin works or that a real browser has successfully fetched the data. APIs and permissions can change after this review.

## Curated destinations

- Project Gutenberg: all three book pages returned 200 on the expected domain. Copyright/download availability depends on jurisdiction; the mini-reviews are original Scroll Smart notes, not attributed Gutenberg reviews.
- U.S. National Archives, CERN, Nobel Prize, arXiv, LIGO/Caltech, NOAA: expected organization domains and successful HTTPS responses. arXiv identifies research submissions, not a guarantee of peer review or correct findings.
- NASA: original URL was broken; current official Webb page substituted and retrieved via browsing.
- Google DeepMind and ESA: observed final HTTPS URLs substituted for redirected links.
- Event Horizon Telescope: direct request returned 403; the official article was retrievable through web browsing. Retained as an access-limited primary source, without claiming universal availability.

No redirect to an unrelated organization or HTTP downgrade was observed among the curated links checked. That is a point-in-time observation, not a certificate of safety; third-party pages can change and load their own scripts, trackers or downloads.

## Changes made

1. Corrected NASA's broken URL and updated AlphaGo/Rosetta to the observed canonical destinations.
2. Cards now display the actual destination hostname, including for community and aggregator links. Link tooltips show the full URL.
3. Source status now says “Last fetch succeeded” rather than “Available” to avoid implying security or editorial approval. Source cards explicitly distinguish fetch success from article accuracy and malware screening.
4. Preserved HTTPS validation, local-address/credential/nonstandard-port rejection, text-only DOM rendering, and noopener/noreferrer protections. No remote article HTML is embedded in the app.

The app has no Safe Browsing or malware-reputation integration. It does not certify dynamic outgoing links as safe. A future reputation-checking service would need a server-held API key, privacy review for submitting users' destination URLs, and its own failure policy; even such a service cannot guarantee safety.
