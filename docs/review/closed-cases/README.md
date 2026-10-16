# Closed cases, reopen and corrections — 16 October 2026

Baseline: main at `71d0216` (#78). Frontend only, no new dependencies. Review history and the current result are local to this browser tab's session; no real party messages are sent.

## Behaviour

- Approve & send closes the review. The queue/sidebar say **Closed**, with a check, at the bottom; Done counts Closed. Reopened sorts with Reviewed. **Appeal waiting** shares the urgent Decide group, uses a warn chip and contributes to Appeals. Next case skips Closed.
- The banner sits below the breadcrumb. It shows the delivered outcome/amount, accepted/overridden (or the policy ruling in the public demo), send time and whether a reviewer note was sent. Open appeals add the warn chip. Nothing is blurred.
- Closed Intake has no run/access-code/edit controls. Ruling has an immutable final-decision summary and override reason instead of the decision card/bar. Notify shows the exact delivered messages/notes with no note inputs, Clear note or Approve & send. Available appeal buttons still work. Every step is checked and progress says Review complete.
- Reopen uses a named native modal with Cancel initially focused, forward/backward Tab wrapping, Escape cancellation and focus return. Confirmation unlocks editing, restores the current delivered outcome in Notify with empty notes, and resets only Ruling/Notify ticks.
- History appends each send and reopen. Sent entries expand into the exact messages and notes, including the reviewer decision/reason. Corrections say **Correction sent** and leave earlier entries intact. Re-running after reopen retains an Earlier review disclosure from the new review key.
- The current result is saved in sessionStorage too, so refreshing a resolved sample cannot expose Run agents on a closed review. Existing sent records migrate into history; blocked/full storage falls back to memory. The previous 100-record trimming is not applied to history.
- Open API appeals are called `queued`; the frontend also recognises `pending` without changing the backend. If appeals are unavailable (403), appeal-dependent status/tile/phone controls are hidden. The existing public-demo Notify fallback still works.
- The partial-refund option remains available when overriding a partial refund, allowing the requested $6.30 → $3.00 correction. REF-1 amount validation and note privacy checks stay in place. Party phones use the final delivered decision, including after an override.

## Screenshots

Chrome, 1280×900 and 375×900, explicit light/dark themes. Each standard capture uses a fresh browser context with the exact viewport width checked; cropped history/queue images extend below the viewport. Static captures use reduced motion. These are synthetic cases resolved with `LLM_API_KEY=''` and AI Offline. The local test backend ran on a separate port and was stopped afterward.

The D001 captures show a $3.00 correction after accepting $6.30 with a rider note. History preserves both sends. D003 has an open rider appeal. The final capture pass restores those actual offline results and session records and makes no resolve requests.

| State | Light 1280 | Dark 1280 | Light 375 | Dark 375 |
| --- | --- | --- | --- | --- |
| Closed banner | [View](closed-banner-light-1280.png) | [View](closed-banner-dark-1280.png) | [View](closed-banner-light-375.png) | [View](closed-banner-dark-375.png) |
| Reopen dialog | [View](reopen-dialog-light-1280.png) | [View](reopen-dialog-dark-1280.png) | [View](reopen-dialog-light-375.png) | [View](reopen-dialog-dark-375.png) |
| Expanded history | [View](history-light-1280.png) | [View](history-dark-1280.png) | [View](history-light-375.png) | [View](history-dark-375.png) |
| Queue: Closed and Appeal waiting | [View](queue-light-1280.png) | [View](queue-dark-1280.png) | [View](queue-light-375.png) | [View](queue-dark-375.png) |
| Appeal waiting banner | [View](appeal-banner-light-1280.png) | [View](appeal-banner-dark-1280.png) | [View](appeal-banner-light-375.png) | [View](appeal-banner-dark-375.png) |
| Presentation banner | [View](presentation-banner-light-1280.png) | [View](presentation-banner-dark-1280.png) | [View](presentation-banner-light-375.png) | [View](presentation-banner-dark-375.png) |

## Checks

- `npm ci`, `npx tsc`, **168 frontend tests**, `npm run build`: pass. Nine new tests cover transitions/correction wording, append-only immutable snapshots, legacy migration and blocked writes, earlier reviews/new runs, tick resets, appeal availability, sorting/Next/tiles, closed permissions and refresh restoration. Existing workflow tests rename Sent to Closed.
- Real offline D001: run, accept, rider note, send; queue-bottom Closed; reopen the view, all checks/readonly controls; modal Tab/Escape/focus return; confirm; partial-refund override $3.00 with reason; send correction; both sends and notes intact. A later re-run preserves Earlier review history.
- Real offline D003: run, accept, send; appeal from rider phone; Appeal waiting appears in the banner/sidebar/queue, at the top. Done = 1 and Appeals = 1 with D001 closed and D003 awaiting appeal review. No real LLM calls.
- Refresh preserves both Closed and Reopened in light/dark presentation mode at 1280/375 px, without a resolve request. A separate intercepted 403 public-demo check, with sessionStorage blocked, reaches Closed through the existing fallback and hides unavailable appeals.
- No horizontal overflow in normal or presentation mode. Phone Reopen is full width. All five closed steps show checks; reopened Ruling/Notify checks are cleared. Existing note/privacy/refund tests remain green.
- Chrome accessibility tree exposes the Closed heading and a named `Reopen D001?` modal; buttons have names, focus is visible, Tab/Shift+Tab stay within the modal, Escape cancels and restores the trigger. Closed controls are removed rather than visually disabled. No physical screen-reader listening session was performed.
- Banner text/control contrast: minimum **5.99:1 light / 7.50:1 dark**. Existing theme tokens only; no new animation/keyframes, blur or dependencies.

No open questions. PR left unmerged.
