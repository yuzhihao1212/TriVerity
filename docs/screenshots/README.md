# Curated project screenshots

These views use synthetic dispute data. All eleven were captured afresh on 30 October 2026 from `main`
(`1331c2e`) running locally, in headless Chrome with reduced motion. D001 and D007 ran live against Hy3; D004
and D006 ran offline, because they only appear as rows in the queue. The earlier 16 October captures remain in
[docs/review](../review/).

| View | Image | What it shows | Bytes |
|---|---|---|---:|
| Landing | [01-landing.png](01-landing.png) | Landing page, light theme, 1280 × 900 | 327,447 |
| Reviewer home | [02-reviewer-home.png](02-reviewer-home.png) | Queue with an auto-resolved case, two closed cases and one on hold | 148,009 |
| Live progress | [03-live-progress.png](03-live-progress.png) | D001 during a live Hy3 run, 13 s in | 148,859 |
| Evidence | [04-evidence.png](04-evidence.png) | D001, live Hy3 run | 369,318 |
| Hearing | [05-hearing.png](05-hearing.png) | D001, live Hy3 run; every argument and reply came from the AI | 474,748 |
| Ruling | [06-ruling.png](06-ruling.png) | D001 reopened by a reviewer, with accept and override controls | 338,200 |
| Notify | [07-notify.png](07-notify.png) | D007, live Hy3 run; a reviewer decided $6.90 and added a quick note | 256,434 |
| Closed case | [08-closed-case.png](08-closed-case.png) | D001 after a correction, with the sent history open | 333,085 |
| Mobile | [09-mobile.png](09-mobile.png) | Reviewer home, 375 px wide | 135,720 |
| Dark | [10-dark.png](10-dark.png) | Reviewer home, dark theme, 1280 × 800 | 105,421 |
| Auto-resolved | [11-auto-resolved.png](11-auto-resolved.png) | D001 closed by itself under the policy, showing why | 279,473 |

Total curated image size: **2,916,714 bytes**. Every image is below 600 KB.

The live-progress view is a still taken during the run. The reviewer decisions in these views are simulated
in the prototype, and no real message or payment was sent.

## Repository cover

[cover.jpg](cover.jpg) is an optimised copy of the cover artwork supplied by the team on 16 October 2026.
It is separate from the eleven synthetic UI screenshots above: 1280 × 731 px, **66,709 bytes**, resized
proportionally from 2016 × 1152 px and exported as JPEG at quality 85 with 4:4:4 chroma sampling.
No crop or new artwork was applied; embedded metadata is stripped. The original file is unchanged.
The original PNG was 2,242,934 bytes, so this export reduces the download by **97.0%**.
