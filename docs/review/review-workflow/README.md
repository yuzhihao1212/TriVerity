# Review workflow — 16 October 2026

- **Notify parties:**
  - The editors open only after the ruling is accepted or overridden. Until then the step shows "Accept or override the ruling first" with a button to the Ruling step. In the public demo (403), opening Ruling is enough.
  - Each party gets a message editor beside its phone, and the phone updates as you type. The outcome and amount are locked to the final decision; a partial-refund override asks for the amount ($0.01 up to the fare charged, REF-1).
  - A privacy check flags internal wording ("fraud", "history", evidence IDs, "FRAUD-1" and so on). Sending stays blocked until the wording is removed or "Send anyway" is ticked.
  - "Approve & send (simulated)" locks both messages and shows "✓ Sent to rider and driver · HH:MM · edited by reviewer". It ticks Notify on the stepper, then a "Review complete" card offers the next case or the queue.
- **Home (`#/console`):** "Your queue", with four tiles (Queue, Ready, Decide, Done; plus Appeals when some are waiting) and one row per case: an icon and one word for its status, plus an outcome dot. Escalated cases come first, safety tier first. "Start here" shows until the first case has been run, and the sidebar is hidden on this page.
- **Navigation:**
  - A home button in the sidebar, and a "Console › D001" breadcrumb.
  - An unknown ID (`#/console/D099`) shows home with a dismissible "Case D099 not found".
  - The landing intro lands on home.

Before is main at `285f3de` (#76), where `#/console` opened the first sample. All captures are headless Chrome with AI Offline.

| View | Light 1280 | Dark 1280 | Light 375 | Dark 375 |
| --- | --- | --- | --- | --- |
| `#/console` before | [before](before/home-light-1280.png) | [before](before/home-dark-1280.png) | [before](before/home-light-375.png) | [before](before/home-dark-375.png) |
| Home after | [after](after/01-home-light-1280.png) | [after](after/01-home-dark-1280.png) | [after](after/01-home-light-375.png) | [after](after/01-home-dark-375.png) |
| Notify before | [before](before/d001-notify-light-1280.png) | [before](before/d001-notify-dark-1280.png) | [before](before/d001-notify-light-375.png) | [before](before/d001-notify-dark-375.png) |
| Notify, before deciding | [after](after/02-notify-locked-light-1280.png) | [after](after/02-notify-locked-dark-1280.png) | [after](after/02-notify-locked-light-375.png) | [after](after/02-notify-locked-dark-375.png) |
| Privacy warning | [after](after/03-notify-warning-light-1280.png) | [after](after/03-notify-warning-dark-1280.png) | [after](after/03-notify-warning-light-375.png) | [after](after/03-notify-warning-dark-375.png) |
| Sent, review complete | [after](after/04-notify-sent-light-1280.png) | [after](after/04-notify-sent-dark-1280.png) | [after](after/04-notify-sent-light-375.png) | [after](after/04-notify-sent-dark-375.png) |
| D003 partial refund override | [after](after/05-notify-partial-light-1280.png) | [after](after/05-notify-partial-dark-1280.png) | [after](after/05-notify-partial-light-375.png) | [after](after/05-notify-partial-dark-375.png) |
| Home after reviewing | [after](after/06-home-after-light-1280.png) | [after](after/06-home-after-dark-1280.png) | [after](after/06-home-after-light-375.png) | [after](after/06-home-after-dark-375.png) |
| `#/console/D099` | [after](after/07-home-unknown-light-1280.png) | [after](after/07-home-unknown-dark-1280.png) | [after](after/07-home-unknown-light-375.png) | [after](after/07-home-unknown-dark-375.png) |

**The review flow (real speed):** [GIF](after/review-flow-light.gif). It goes home → D001 → accept → edit the rider's message (the warning appears, then goes) → Approve & send → Review complete → back to the queue.
