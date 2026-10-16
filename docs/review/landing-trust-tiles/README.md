# Landing trust tiles — 16 October 2026

Six large-title tiles replace the always-visible paragraphs. They reuse the existing stroke icons, stage-icon squares and theme/spacing tokens. The fairness tile replaces counterfactuals; its 500/500 figure comes from README. Injection figures retain the documented 23 offline scenarios / 17 attacks / 68 live runs. None of the headline Results measures is repeated.

## Before / after

Baseline is main at `d7052bc` (#73). Captures use Chrome with the actual desktop or touch viewport, in light/dark mode. Images crop the trust section; mobile captures include all six stacked tiles. Before has no open/closed state: every paragraph is always visible. After-open shows the fairness tile. Reduced motion was enabled for stable captures; the ordinary 180 ms fade was checked separately.

No backend was running or needed. All landing checks made **zero `/api` requests** and no LLM calls.

| View | Before | After, closed | After, open |
| --- | --- | --- | --- |
| Desktop light, 1280×900 | [Before](before-light-1280.png) | [Closed](after-closed-light-1280.png) | [Open](after-open-light-1280.png) |
| Desktop dark, 1280×900 | [Before](before-dark-1280.png) | [Closed](after-closed-dark-1280.png) | [Open](after-open-dark-1280.png) |
| Phone light, 375×812 | [Before](before-light-375.png) | [Closed](after-closed-light-375.png) | [Open](after-open-light-375.png) |
| Phone dark, 375×812 | [Before](before-dark-375.png) | [Closed](after-closed-dark-375.png) | [Open](after-open-dark-375.png) |

## Interaction and accessibility

- Mouse hover reveals only when `(hover: hover)` matches; leaving closes a hover reveal. Keyboard focus also reveals. Native click, Enter or Space toggles; Escape closes without reopening from lingering hover/focus. Click/tap-pinned details stay open until closed or another tile opens. Only one tile opens at a time.
- Touch checks: first tap opens, second closes, tapping another tile closes the previous one, and tapping the bottom-right cross closes. The subtitle uses the permitted neutral wording **“Select a card for details.”** for every input method.
- Each tile is a real button with stable `aria-labelledby`, `aria-describedby`, `aria-expanded` and `aria-controls`. Details remain in the DOM while closed, visually clipped with opacity rather than `display:none`. Chrome's accessibility tree exposed every button's title and full description in closed and open states. No physical screen-reader listening session was performed.
- Titles and proof lines remain visible above the detail's own scroll area. When needed, keyboard arrows/Home/End scroll that area without moving the tile or adding a nested focus stop. Decorative icons/hints are hidden from screen readers. Focus rings are visible.
- All six tiles have equal heights and no reveal layout shift. Layout is three columns at 1280 px, two at 768 px, one at 375 px. Light/dark presentation mode, internal scrolling and zero horizontal overflow checked at all three sizes.
- **300 visible-text contrast checks**, including every revealed description, proof and the muted public-demo note: minimum **5.26:1 light**, **6.89:1 dark**, all above 4.5:1. No new colour tokens. Reduced motion removes the fade; ordinary motion uses 180 ms opacity transitions, with no flip or new keyframes.

## Verification and preserved UI

`npm ci`, `npx tsc`, **116 frontend tests** and `npm run build` pass. Five new tests cover hover/focus exits, pinned toggles, one-open behavior, explicit dismissal, the exact tile order/proofs/note, and the absence of duplicated Results headline values. Copy is tested through its literal TypeScript array, without loading the page's image assets or browser effects.

The Try cards retain identical copy and computed typography, colours, spacing and card styling before/after. Their shared `.landing-card` styles were untouched. Hero/rotating ruling, problem photo, three-stage workflow, Results, footer and console-intro code remain unchanged. No backend changes or dependencies added. No open questions.
