# Landing page review — 16 October 2026

The public entry point introduces TriVerity before opening the five-tab reviewer console. `/` and `#/` show the landing page; `#/console` opens the console; `#/console/D001` (or another sample ID) selects a sample without running agents. Unknown hashes return home; unknown sample IDs select the server's first sample.

## Screenshots

Captured in Chrome with a **local offline backend**, `LLM_API_KEY=''` and `PUBLIC_DEMO=true`. Browser API requests were forwarded only to that isolated local backend. No real LLM calls, keys or judge access codes were used. The console screenshot shows Intake **before** any resolve. Fonts use the existing Google Fonts stylesheet.

| View | Screenshot |
| --- | --- |
| Landing light, 1280×720 viewport, full page | [Light](landing-light.png) |
| Landing dark, 1280×720 viewport, full page | [Dark](landing-dark.png) |
| Landing light, 375×812 viewport, full page | [Mobile light](landing-light-375.png) |
| Landing dark, 375×812 viewport, full page | [Mobile dark](landing-dark-375.png) |
| Mobile first screen, light / dark | [Light hero](landing-light-375-hero.png) · [Dark hero](landing-dark-375-hero.png) |
| Dark presentation mode, full page | [Presentation](landing-dark-presentation.png) |
| Console after **Try the escalation case**, D007, presentation mode | [Console](console-D007-from-try.png) |

All screenshots were inspected visually. At desktop width the six steps run horizontally; tablet uses two rows and mobile stacks the flow.

## Verification

- `npm ci`, `npm test` (**32 tests**), `npx tsc` and `npm run build` pass. No dependencies added. Three route tests cover root/empty/unknown hashes, console/deep links, malformed encoding, server-driven sample selection, unknown IDs and an empty sample list.
- Backend `LLM_API_KEY='' pytest -q`: **762 passed**, with the existing Starlette/httpx deprecation warning. No backend files changed; this worktree contains no `.env`.
- Browser matrix: 375×812, 768×1024, 1280×720 and 1440×900, light/dark, presentation on/off (**16 combinations**). Every landing load made **zero `/api` requests**, had one visible h1 and no horizontal overflow.
- Main CTA selected D001; the three Try links selected D001, D007 and DISP-002. Four later workflow tabs stayed locked and **zero resolve requests** were made by navigation. Back, home, unknown hash and unknown ID behavior passed.
- One deliberate offline resolve checked the existing five-tab flow, evidence and rebuttal navigation. The rebuttal's “Answers…” link focuses its argument without changing the route. Returning home and reopening D001 preserved its saved result with **no second resolve** and no sample reload. The development StrictMode mount made two free sample GETs on first console entry only.
- Keyboard: skip link is first on initial load and visible on focus, Enter moves focus into the main content without changing the hash, all CTAs are real links, presentation is a named toggle, and route transitions focus the destination. Header/navigation/main/footer landmarks and logical h1 → h2 → h3 headings checked. Hidden retained console content is excluded from the accessible view.
- **206 text-contrast checks** across light/dark: minimum **5.13:1** light, **6.89:1** dark, no WCAG AA text failures. Existing badge/focus/colour tokens are reused. Primary CTA is 19 px bold. Reduced-motion styles remain active; the landing page adds no animation. Blocked localStorage still allows presentation mode during the session.
- Theme follows the existing system preference. Presentation state is shared between landing and console and saved through the existing guarded storage helper. The access-code form, per-case results, manual Run/Re-run controls and token warning remain in the console.

## Content sources and boundaries

Results live in `LANDING_RESULTS` in `frontend/src/Landing.tsx`: README's live nine-sample Hy3 evaluation supplies 9/9, approximately 16 s and $0.002; `docs/simulation.md` supplies 390/500 (78%) and 100/100 repeated rulings from the offline simulation. The synthetic-data footnote distinguishes these measurements.

The red-team card distinguishes the **23 catalogued/tested scenarios** from the **17 live-tested attacks / 68 runs** in README and `docs/redteam/findings.md`. It does not claim all 23 were tested live or that forged input facts cannot affect code. Appeals are described as implemented but disabled in the public demo. Party notification means the separate prepared messages already shown by the console; no external messaging is added.

No open questions. No backend, API contract, policy, prompt or deployment changes.
