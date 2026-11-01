# Curated project screenshots

These views use synthetic dispute data. All fifteen were captured afresh on 31 October 2026 from `main` (`568473b`)
with the Demo Day case page, guide and report changes applied, running locally in headless Chrome with reduced motion,
against live Hy3. The earlier captures remain in this folder's git history and in [docs/review](../review/).

| View | Image | What it shows | Bytes |
|---|---|---|---:|
| Landing | [01-landing.png](01-landing.png) | Landing page, light theme, 1280 × 900 | 327,560 |
| Reviewer home | [02-reviewer-home.png](02-reviewer-home.png) | Queue straight after AI Review on nine cases, live: four need a person, five closed themselves, and one case's fallback text is labelled | 130,031 |
| Live progress | [03-live-progress.png](03-live-progress.png) | D001 during a live Hy3 run, about 10 s in | 108,185 |
| Evidence | [04-evidence.png](04-evidence.png) | D001, reopened by a reviewer, live Hy3 run | 194,484 |
| Hearing | [05-hearing.png](05-hearing.png) | D001, reopened by a reviewer, live Hy3 run | 349,725 |
| Ruling | [06-ruling.png](06-ruling.png) | D001 reopened by a reviewer, with accept and override controls | 260,751 |
| Notify | [07-notify.png](07-notify.png) | D007, live Hy3 run; a reviewer decided $6.90, before sending | 179,010 |
| Closed case | [08-closed-case.png](08-closed-case.png) | D001 after a correction, with the sent history open | 227,042 |
| Mobile | [09-mobile.png](09-mobile.png) | Reviewer home, 375 px wide | 75,573 |
| Dark | [10-dark.png](10-dark.png) | Reviewer home, dark theme, 1280 × 800 | 97,021 |
| Auto-resolved | [11-auto-resolved.png](11-auto-resolved.png) | D001 closed by itself under the policy, right after its run | 204,696 |
| Rules for This Case | [12-rules-for-this-case.png](12-rules-for-this-case.png) | D008 escalated for bad-faith risk, with its reasons and the rules panel, 1900 px wide | 251,539 |
| Case report | [13-case-report.png](13-case-report.png) | The D008 report on screen; the browser saves this page as a PDF | 540,766 |
| AI Review confirmation | [14-ai-review-confirm.png](14-ai-review-confirm.png) | The message shown before AI Review runs nine cases | 125,034 |
| First-visit guide | [15-first-visit-guide.png](15-first-visit-guide.png) | The owl giving step 1 of 3 on an untouched queue | 117,600 |

Total curated image size: **3,189,017 bytes**. Every image is below 600 KB.

The live-progress view is a still taken during the run. The reviewer decisions in these views are simulated
in the prototype, and no real message or payment was sent. D001's first run in these captures was repeated after a step
used fallback text. A real run can fall back, and the console labels it when it does, as the reviewer home view shows.

## Repository cover

[cover.jpg](cover.jpg) is the repository cover, updated on 2 November 2026 to match the app: the console's
own owl perched on level scales (rider and driver at equal size, in the Hearing step's muted avatar tints),
the Poppins wordmark with the rose dot, the landing page's tagline, and a footer crediting OeroAI, Tencent
Hunyuan and Tencent Cloud. It is 1920 × 1080 px, **155,200 bytes**: rendered at 2× in Chrome from the app's
components and assets, scaled down with Lanczos, and exported as JPEG at quality 85 with 4:4:4 chroma
sampling and no metadata. It replaces the 16 October cover (1280 × 731 px, 66,709 bytes), which showed an
earlier drawing of the owl with tilted scales.
