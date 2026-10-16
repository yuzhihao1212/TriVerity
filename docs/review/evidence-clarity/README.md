# Evidence clarity — 16 October 2026

The Evidence step's cards now say what they show, and the cited evidence in the Hearing and Ruling steps opens by category.

- **Count-up:** the Trip tiles count from 0 to "+44%" / "+59%" in 600 ms, once per case per browser session, the first time Evidence is shown (`triverity.evidenceIntroSeen`).
- **No needless decimals:** "Expected 22 → actual 35 min".
- **GPS:** a one-line headline, a route sketch (planned dashed; driven, amber where more than 150 m off the plan; start, end and stop pins), a timeline bar (on/off route, stop pins, hatched data gaps), and plain details: "Off route **08:05–08:32**: **11.3 km** driven, up to **2.7 km** from the planned path." and "**78%** of GPS readings were off the planned route (8 of 36 within 150 m)." The red 22% bar is gone.
- **Fare:** a verdict ("**Charged $6.30 more than expected (+34%)**, because the trip was 4.5 km and 13 minutes longer than planned."), three checks (lines, surge, promo), a compact receipt total ("**$24.80** charged · expected $18.50 · **+$6.30**") and the link to the ruling ("→ This difference is the **$6.30 refund** the ruling approved (RD-3).").
- **History:** two calm profiles ("2.2 yrs on Ryde · ★ 4.8 / 214 trips · 0 disputes (90d)"), a fairness note, and a tone only when the fraud detector's own risk is medium or high.
- **How the evidence was gathered:** an "Audit trail" with a plain summary that stays visible; the lookups are collapsed by default. "Full lookup details ↓" opens it first, then scrolls and flashes. "default plan" is never shown.
- **Cited evidence:** "Key facts" (up to 3), then category buttons ("Trip (5) · GPS (5) · Fare (7) …") that open one or more panels, each with a one-line summary. "Both sides cite the same 23 facts." or "Only the rider cites this" tags in the Hearing step.

All captures are headless Chrome with AI Offline and reduced motion (so the intros show their final state). Before is main at `6be7b48` (#71).

| Step | Light 1280 | Dark 1280 | Light 375 | Dark 375 |
| --- | --- | --- | --- | --- |
| Evidence | [before](before/d001-evidence-light-1280.png) · [after](after/d001-evidence-light-1280.png) | [before](before/d001-evidence-dark-1280.png) · [after](after/d001-evidence-dark-1280.png) | [before](before/d001-evidence-light-375.png) · [after](after/d001-evidence-light-375.png) | [before](before/d001-evidence-dark-375.png) · [after](after/d001-evidence-dark-375.png) |
| Hearing | [before](before/d001-hearing-light-1280.png) · [after](after/d001-hearing-light-1280.png) | [before](before/d001-hearing-dark-1280.png) · [after](after/d001-hearing-dark-1280.png) | [before](before/d001-hearing-light-375.png) · [after](after/d001-hearing-light-375.png) | [before](before/d001-hearing-dark-375.png) · [after](after/d001-hearing-dark-375.png) |
| Ruling | [before](before/d001-ruling-light-1280.png) · [after](after/d001-ruling-light-1280.png) | [before](before/d001-ruling-dark-1280.png) · [after](after/d001-ruling-dark-1280.png) | [before](before/d001-ruling-light-375.png) · [after](after/d001-ruling-light-375.png) | [before](before/d001-ruling-dark-375.png) · [after](after/d001-ruling-dark-375.png) |

Also:

- **Animations (real speed):** [light](after/evidence-intro-light.gif) · [dark](after/evidence-intro-dark.gif).
- **Opened:** [Hearing with every category open](after/d001-hearing-categories-open-light-1280.png) · [Evidence with the audit trail open](after/d001-evidence-audit-open-light-1280.png).
- **Other cases:** D005 no-show [before](before/d005-evidence-light-1280.png) · [after](after/d005-evidence-light-1280.png); D007 threat and high driver risk [before](before/d007-evidence-light-1280.png) · [after](after/d007-evidence-light-1280.png); [D008 high rider risk](after/d008-evidence-light-1280.png); [DISP-002 data gap, medium rider risk](after/disp-002-evidence-light-1280.png).
- **Presentation mode:** [D001 Evidence](after/d001-evidence-presentation-1280.png).
