# Curated project screenshots

These views use synthetic dispute data. All fifteen were captured afresh on 31 October 2026 from `main` (`568473b`)
with the Demo Day case page, guide and report changes applied, running locally in headless Chrome with reduced motion,
against live Hy3. The earlier captures remain in this folder's git history and in [docs/review](../review/).

| View | Image | What it shows | Bytes |
|---|---|---|---:|
| Landing | [01-landing.png](01-landing.png) | Landing page, light theme, 1280 × 900 | 327,560 |
| Reviewer home | [02-reviewer-home.png](02-reviewer-home.png) | Queue straight after AI Review on nine cases, live: four need a person, five closed themselves, and one case's fallback text is labelled | 130,031 |
| Live progress | [03-live-progress.png](03-live-progress.png) | D001 during a live Hy3 run, about 10 s in | 108,185 |
| Evidence | [04-evidence.png](04-evidence.png) | D001, reopened by a reviewer, live Hy3 run | 184,191 |
| Hearing | [05-hearing.png](05-hearing.png) | D001, reopened by a reviewer, live Hy3 run | 329,783 |
| Ruling | [06-ruling.png](06-ruling.png) | D001 reopened by a reviewer, with accept and override controls | 251,639 |
| Notify | [07-notify.png](07-notify.png) | D007, live Hy3 run; a reviewer decided $6.90, before sending | 166,320 |
| Closed case | [08-closed-case.png](08-closed-case.png) | D001 after a correction, with the sent history open | 220,992 |
| Mobile | [09-mobile.png](09-mobile.png) | Reviewer home, 375 px wide | 75,573 |
| Dark | [10-dark.png](10-dark.png) | Reviewer home, dark theme, 1280 × 800 | 97,021 |
| Auto-resolved | [11-auto-resolved.png](11-auto-resolved.png) | D001 closed by itself under the policy, right after its run | 206,994 |
| Rules for This Case | [12-rules-for-this-case.png](12-rules-for-this-case.png) | D008 escalated for bad-faith risk, with its reasons and the rules panel, 1900 px wide | 256,520 |
| Case report | [13-case-report.png](13-case-report.png) | The D008 report on screen; the browser saves this page as a PDF | 540,766 |
| AI Review confirmation | [14-ai-review-confirm.png](14-ai-review-confirm.png) | The message shown before AI Review runs nine cases | 125,034 |
| First-visit guide | [15-first-visit-guide.png](15-first-visit-guide.png) | The owl giving step 1 of 3 on an untouched queue | 117,600 |

Total curated image size: **3,138,209 bytes**. Every image is below 600 KB.

The live-progress view is a still taken during the run. The reviewer decisions in these views are simulated
in the prototype, and no real message or payment was sent. D001's first run in these captures was repeated after a step
used fallback text. A real run can fall back, and the console labels it when it does, as the reviewer home view shows.

## Repository cover

[cover.jpg](cover.jpg) is an optimised copy of the cover artwork supplied by the team on 16 October 2026.
It is separate from the fifteen synthetic UI screenshots above: 1280 × 731 px, **66,709 bytes**, resized
proportionally from 2016 × 1152 px and exported as JPEG at quality 85 with 4:4:4 chroma sampling.
No crop or new artwork was applied; embedded metadata is stripped. The original file is unchanged.
The original PNG was 2,242,934 bytes, so this export reduces the download by **97.0%**.
