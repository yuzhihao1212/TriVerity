# Curated project screenshots

These views use synthetic dispute data. All fourteen were captured afresh on 31 October 2026 from `main`
(`6c5989b`) running locally, in headless Chrome with reduced motion, against live Hy3. The earlier captures remain in
this folder's git history and in [docs/review](../review/).

| View | Image | What it shows | Bytes |
|---|---|---|---:|
| Landing | [01-landing.png](01-landing.png) | Landing page, light theme, 1280 × 900 | 327,560 |
| Reviewer home | [02-reviewer-home.png](02-reviewer-home.png) | Queue after all nine cases ran: four need a person, five closed themselves | 119,674 |
| Live progress | [03-live-progress.png](03-live-progress.png) | D001 during a live Hy3 run, 11 s in | 118,197 |
| Evidence | [04-evidence.png](04-evidence.png) | D001, reopened by a reviewer, live Hy3 run | 196,449 |
| Hearing | [05-hearing.png](05-hearing.png) | D001, reopened by a reviewer; every argument and reply came from the AI | 347,871 |
| Ruling | [06-ruling.png](06-ruling.png) | D001 reopened by a reviewer, with accept and override controls | 262,480 |
| Notify | [07-notify.png](07-notify.png) | D007, live Hy3 run; a reviewer decided $6.90, before sending | 202,344 |
| Closed case | [08-closed-case.png](08-closed-case.png) | D001 after a correction, with the sent history open | 252,246 |
| Mobile | [09-mobile.png](09-mobile.png) | Reviewer home, 375 px wide | 60,477 |
| Dark | [10-dark.png](10-dark.png) | Reviewer home, dark theme, 1280 × 800 | 94,769 |
| Auto-resolved | [11-auto-resolved.png](11-auto-resolved.png) | D001 closed by itself under the policy, right after its run | 205,975 |
| Rules for This Case | [12-rules-for-this-case.png](12-rules-for-this-case.png) | D008 escalated for bad-faith risk, with its reasons and the rules panel, 1900 px wide | 289,666 |
| Case report | [13-case-report.png](13-case-report.png) | The D008 report on screen; the browser saves this page as a PDF | 530,768 |
| AI Review confirmation | [14-ai-review-confirm.png](14-ai-review-confirm.png) | The message shown before AI Review runs nine cases | 125,034 |

Total curated image size: **3,133,510 bytes**. Every image is below 600 KB.

The live-progress view is a still taken during the run. The reviewer decisions in these views are simulated
in the prototype, and no real message or payment was sent. Sample cases were run one at a time and repeated
where a step used fallback text, so these views show AI-written text on every step; a real run can fall back, and the
console labels it when it does.

## Repository cover

[cover.jpg](cover.jpg) is an optimised copy of the cover artwork supplied by the team on 16 October 2026.
It is separate from the fourteen synthetic UI screenshots above: 1280 × 731 px, **66,709 bytes**, resized
proportionally from 2016 × 1152 px and exported as JPEG at quality 85 with 4:4:4 chroma sampling.
No crop or new artwork was applied; embedded metadata is stripped. The original file is unchanged.
The original PNG was 2,242,934 bytes, so this export reduces the download by **97.0%**.
