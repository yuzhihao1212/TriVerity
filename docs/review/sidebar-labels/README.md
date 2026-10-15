# Public-demo cache and sidebar labels — 16 October 2026

The sidebar now gives every sample a short, curated subtitle under its ID/type. The full rider claim remains in Intake. Labels are display-only metadata, not agent evidence; form-created disputes without a label show their rider claim on one line instead.

## Screenshots

All captures use local browser replay of samples and results generated with `LLM_API_KEY=''`. No real LLM calls or access codes were used. Before is main at `d10bbb5` (#38); after adds the labels. Both use the same selected case and viewport.

| View | Before | After |
| --- | --- | --- |
| Light, 1280×720 | [Before](before-light.png) | [After](after-light.png) |
| Dark, 1280×720 | [Before](before-dark.png) | [After](after-dark.png) |
| Light, 375×812 | [Before](before-light-375.png) | [After](after-light-375.png) |
| Dark, 375×812 | [Before](before-dark-375.png) | [After](after-dark-375.png) |

## Curated labels

| Case | Label |
| --- | --- |
| D001 | 6-min stop, long detour |
| D002 | Wait time missing |
| D003 | Slightly different route |
| D004 | Longer route, 4 min faster |
| D005 | Driver stopped 378 m away |
| D006 | 7-min wait, rider contacted |
| D007 | Threat in chat, fraud risk |
| D008 | Detour, high bad-faith risk |
| DISP-002 | Organisers' case: lobby no-show |

Each label was checked against the actual sample. D002 has arrival coordinates (about 87 m from pickup), so it would be inaccurate to say arrival data is missing. D006 records seven minutes of waiting and driver contact; the label uses those facts rather than treating the rider's account of lateness as independently verified. DISP-002's label is supplied by the adapter; its organiser JSON is unchanged.

## Verification

- Backend: **690 tests pass**, including a clean Git export with no `backend/.env`. Offline evaluation: **9/9 rulings correct**.
- Frontend: `npm ci`, **29 tests**, `npx tsc` and `npm run build` pass. No added dependencies.
- New fake-clock cache tests exercise six hours, six days, just before/exactly seven days, every individual fallback source, absent/empty replies, 299/300 seconds, successful retry upgrading to seven days, independent sample entries, unchanged rate limits/budget counting, and access-code bypass (including a sample ID).
- Labels are validated as optional plain text, max 60 characters. Full sample resolutions and facts match with/without labels. A sentinel label stays out of all seven mocked prompt calls: two collector rounds, two advocates, two accepted rebuttals and the Judge; all six language outputs use the mocked AI path.
- Browser: all nine labels match; unresolved rows remain **44 px** high; subtitles use one-line ellipsis. Native keyboard filtering and Enter case selection work. Saved-result badges/cache, full Intake claims, form-created claim fallback, and presentation-mode text sizes remain correct.
- Light/dark checked at 375 and 1280 px without horizontal overflow. **36 subtitle contrast checks**, minimum **5.13:1**. Screenshots inspected visually.
- Browser requests were intercepted. One deliberate mocked resolve checked the saved badge; filtering and case changes issued none.

## Cache behavior and operations

All-AI results live for seven days; any fallback or skipped/empty rebuttal lives for five minutes. The six required AI outputs are the collector, two advocates, two replies and Judge explanation. Deterministic fraud/precedent steps do not count against the AI classification. Cache keys, locking, rate limits and budget behavior are unchanged; access-code resolves are not cached.

Prewarm after each deploy/restart/wake and check every sample's language-step AI badges. If a run falls back, fix the cause, wait for its five-minute entry to expire, then rerun prewarm. The cache remains in memory and is lost on restart or service sleep.
