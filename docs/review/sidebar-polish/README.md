# Sidebar polish — 16 October 2026

The navigation now shows only each dispute's icon, ID/type and saved-result badge. The complete rider claim and driver statement remain visible in the selected case's Intake content, without duplicating the claim in every navigation row.

The filter remains a labelled native select. A decorative inline SVG chevron replaces the edge-aligned platform arrow, with 12 px inset, vertical centring and reserved text space. The icon ignores pointer events. Forced-colors mode restores the native arrow. Filter/case targets are at least 44 px high, and the bounded mobile sidebar exposes case rows below the controls.

| Theme | Before, 1280×720 | After, 1280×720 | After, 375×812 |
| --- | --- | --- | --- |
| Light | [Before](before-light.png) | [After](after-light.png) | [Mobile](after-light-mobile.png) |
| Dark | [Before](before-dark.png) | [After](after-dark.png) | [Mobile](after-dark-mobile.png) |

Verification:

- `npm ci`, `npm test` (28 passing), `npx tsc` and `npm run build` passed.
- Browser replay verified title-only rows, full D005 rider/driver statements in Intake, type filtering, native keyboard type-ahead and focus, Enter case selection, saved badges and cached selection.
- Chevron geometry, pointer behavior and forced-colors native-arrow fallback checked. Existing theme color tokens and focus styles reused.
- Light/dark layouts checked at 375×812 and 1280×720 without horizontal overflow; presentation mode checked. Mobile screenshots were captured in fresh viewports to avoid a headless-Chrome resize repaint artifact.
- All API traffic intercepted with saved offline fixtures. Only one deliberate mocked resolve was sent during the checks; navigation/filtering sent none. No real LLM calls, secrets or new dependencies.
