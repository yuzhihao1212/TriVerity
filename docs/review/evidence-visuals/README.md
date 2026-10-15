# Evidence tab: fact cards — 16 October 2026

The Evidence tab's fact list is now a grid of per-source cards. Values show as chips, duplicate facts are merged, and each source gets a format that suits it. Trip shows stat tiles, GPS a route-coverage bar and a stop timeline, Fare a receipt and Chat speech bubbles. All of it is display-only: the fact sentences, the backend and the IDs the agents cite are unchanged. Parsing lives in `frontend/src/factVisuals.ts`, and anything it does not recognise renders as the original sentence.

## Screenshots

All captures are local headless Chrome against the sample disputes with AI set to Offline (`?ai=off`), so no LLM calls were made. Before is main at `560f1ff` (#57).

| View | Before | After |
| --- | --- | --- |
| D001, light, 1280 px | [Before](before/D001-light-1280.png) | [After](after/D001-light-1280.png) |
| D001, dark, 1280 px | [Before](before/D001-dark-1280.png) | [After](after/D001-dark-1280.png) |
| D001, light, 375 px | [Before](before/D001-light-375.png) | [After](after/D001-light-375.png) |
| D001, dark, 375 px | [Before](before/D001-dark-375.png) | [After](after/D001-dark-375.png) |
| D001, presentation mode | [Before](before/D001-presentation-1280.png) | [After](after/D001-presentation-1280.png) |
| D004, light, 1280 px | [Before](before/D004-light-1280.png) | [After](after/D004-light-1280.png) |
| D002 (no-show), light, 375 px | [Before](before/D002-light-375.png) | [After](after/D002-light-375.png) |
| D007 (threat, promo, surge), light, 1280 px | [Before](before/D007-light-1280.png) | [After](after/D007-light-1280.png) |

### Evidence IDs

Offline runs return one extra party-claim line in each advocate's evidence, so the console pairs no IDs and none are shown. This behaviour is unchanged.

To exercise IDs without spending tokens, the probe dropped that line from the response in the browser. This reproduces a live response's aligned ID/text pairs.

- [D001 with IDs](after/D001-with-ids-light-1280.png).
- [Jump to a merged fact](after/jump-to-merged-TRIP-3.png): `TRIP-3` was clicked in the Hearing tab. Its row's "+2 related" disclosure opened, and the fact is highlighted and focused.

Every one of D001's 23 evidence IDs was clicked in the Hearing tab. Each landed on a visible, focused, highlighted `#fact-<ID>`, and the 5 merged ones opened their disclosure.
