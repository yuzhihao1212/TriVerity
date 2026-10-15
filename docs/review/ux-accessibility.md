# UX and accessibility verification — 15 October 2026

The existing reviewer console keeps its layout, fonts, rounded cards and Ryde pink
(`#E93864`). The new party preview sits below the ruling. It mirrors `PartyResolution.of`
from the already loaded resolution and never fetches another response.

## Checks performed

- One `header`, named `nav`, and `main`, one `h1`, and no skipped heading levels.
- Keyboard: skip link focuses the main content; native dispute buttons select with Enter
  and Space; Resolve works with Enter and displays a visible focus outline.
- Selected dispute has `aria-current`. All form inputs have visible associated labels;
  buttons have text names and the confidence meter has an accessible name.
- Party tabs expose `tablist` / `tab` / `tabpanel`, selected states and ID relationships.
  Left/Right wrap, Home/End select endpoints, and Tab reaches the panel. Inactive tabs
  and panels are removed from the keyboard sequence. Enter/Space retain native activation.
- A persistent polite status region reports agents working and the saved ruling. API and
  form-validation errors use alert regions. Checked delayed mocked resolution, a 503,
  and malformed chat validation. Browser checks verified state and semantics; speech
  output with VoiceOver or another screen reader was not tested.
- No content images are present; the decorative warning SVG is hidden from assistive
  technology. New screenshots are documentation, not unlabeled UI images.
- Emulated reduced motion: animations/transitions are disabled and scrolling stays instant.
- Checked 1440 px desktop and 390 px mobile layouts, including no horizontal overflow.
- Tested both party tabs for a refund and for review. D007's proposed $6.90 is absent
  from both party previews. Risk, signals, histories, internal explanations, evidence
  and the other party's message are never selected into the visible party view.
- Tab switching and revisiting a saved case made zero extra requests. The browser test
  sent only three mocked resolves: a refund, a review, and a deliberate 503. All API
  responses were intercepted; no real LLM was called.

## Contrast

Used the WCAG relative-luminance calculation with computed foreground/background colours,
not screenshot pixel sampling. The light and dark D001 result each had 146 checked text
nodes; the mobile result had 147. All passed at least 4.5:1 (minimum light/mobile 4.87:1,
dark 4.58:1). Disabled buttons and the brand logotype were excluded; placeholder colours
are explicitly the muted token. Form control borders and focus outlines are separately
chosen to exceed 3:1 against their adjacent surfaces.

| Failed combination before | Before | Change | After |
|---|---:|---|---:|
| Muted #69727D on #F3F3F3 | 4.40:1 | #626B75 | 4.88:1 |
| White on pink #E93864 (small buttons/badges) | 4.03:1 | Deeper control pink #C52650 | 5.57:1 |
| Pink small text on pale pink | <4.5:1 | Text pink #BB254A | 5.63:1 |
| Green on pale green | 3.93:1 | #1B7540 | 5.14:1 |
| Amber on pale amber | 3.85:1 | #936000 | 4.88:1 |
| White on dark-theme pink #F0557B | <4.5:1 | Dark text #15181C | 5.33:1 |

References: [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
This is a focused implementation audit, not a claim of complete WCAG conformance.

## Automated verification

- Existing backend: **534 passed**; offline evaluation **9/9 rulings correct**.
- `npm ci`, `npx tsc`, `npm run build`: passed, with no lockfile or dependency changes.
- `cd frontend && node --test tests/partyView.test.mjs`: **11 passed**. The tests cover
  both parties and all five decision types, allowed fields, proposal suppression and
  missing refund amounts, using the existing TypeScript compiler.
- Browser keyboard, semantics, live-region states, privacy, request counts, contrast,
  reduced-motion and mobile checks passed against deterministic offline fixtures.
- Existing build/dev-tool advisories are left for Group 3 after 16 October.

## Screenshots inspected

- [Console layout, light](ux-console-light.png)
- [Refund preview and keyboard focus, light](ux-party-light.png)
- [Refund preview and keyboard focus, dark](ux-party-dark.png)
- [Human review, driver tab, dark](ux-review-dark.png)
- [Mobile preview, light](ux-mobile-light.png)
