# Landing case cards — 16 October 2026

Baseline: main at `77fb9b6`, after trust tiles #75 and Results illustrations #77 merged. No backend server was running. Screenshot checks use the offline frontend; navigation checks intercept the sample-list response with the repository's nine synthetic samples, loaded through the existing sample loader and organiser adapter with `LLM_API_KEY=''`. No resolve requests or real LLM calls were made.

## What changed

Each of the same three cases is one full-card link: a decorative type icon, the existing title, two small outline evidence chips, a bold outcome with a decorative status dot, and the uniform `ID · Open case →` footer. D007's shield square is warn-tinted. All icons reuse `Icon.tsx`; outcomes come from `decisionTone` in `outcomeTone.ts`.

| Case | Facts | Outcome |
| --- | --- | --- |
| D001 | +44% route · 6-min stop | Partial refund $6.30 (ok) |
| D007 | Threat in chat · Fraud risk | Escalated to a human (warn) |
| DISP-002 | 0 m from pickup · Waited 8 min | Fee upheld (neutral) |

The data lives in `landingCases.ts`. Only D001 has a refund amount; escalation and fee-upheld cards never show money. Unit tests check these decisions against `data/expected_rulings.json`. The heading, honest “Run agents” subtitle and the rest of the page remain unchanged. Old paragraphs, varied link labels and unused `.landing-card` rules were removed; trust tiles have independent styles.

The requested stopwatch follow-up is a separate commit: its dial/arc stroke increases from 4 to 8 viewBox units, with unchanged 17/60 geometry and motion.

## Before / after

Chrome with explicit themes. Static captures enable reduced motion. Desktop viewport: 1280×812; phone: 375×812. Images crop the entire case section, so stacked phone captures extend below the viewport.

| View | Before | After | Presentation |
| --- | --- | --- | --- |
| Desktop light | [Before](before-light-1280.png) | [After](after-light-1280.png) | [Presentation](presentation-light-1280.png) |
| Desktop dark | [Before](before-dark-1280.png) | [After](after-dark-1280.png) | [Presentation](presentation-dark-1280.png) |
| Phone light | [Before](before-light-375.png) | [After](after-light-375.png) | [Presentation](presentation-light-375.png) |
| Phone dark | [Before](before-dark-375.png) | [After](after-dark-375.png) | [Presentation](presentation-dark-375.png) |

Stopwatch: [before](stopwatch-before.png) / [after](stopwatch-after.png).

## Checks

- `npm ci`, `npx tsc`, **143 frontend tests**, `npm run build`: pass. Three new tests cover ordered case links, shared tone mapping and actual expected decisions/refund, clear spoken names and absence of money on non-refund cards. Existing Results tests still check the heavier stopwatch stays inside its viewBox.
- Light/dark, 1280/375 px normal mode and 1280/768/375 px presentation mode: no horizontal overflow, equal card heights, aligned desktop outcomes/footers. Three columns on desktop, two on tablets, one on phones. Heading order remains unchanged.
- All six evidence chips use `Chip size="sm" tone="outline"`; outcomes reuse semantic theme tokens. Visible chip/outcome/footer text contrast: minimum **5.26:1 light / 6.89:1 dark**, above AA 4.5:1.
- Each card is a single native anchor with no nested controls. Chrome's accessibility tree exposes exactly three clear “Open case … Outcome …” link names. Icons and outcome dots are decorative. No physical screen-reader listening session was performed.
- Tab visits each card once, focus outlines surround the whole card, Enter opens D001. Clicking D007's title and DISP-002's padding also opens the correct sample. Browser Back returns to the landing page. “Run agents” remains unpressed and available; **zero resolve requests**. The landing itself makes **zero `/api` requests**.
- Ordinary-motion hover raises a card 2 px; reduced motion has no lift or transition. No new runtime dependencies or backend changes; console routing/intro and token protection remain intact.

No open questions. PR left unmerged.
