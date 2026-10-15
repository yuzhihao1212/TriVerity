# Calm console — 16 October 2026

- **Fewer small labels:** the uppercase grey eyebrows above console headings are gone ("Dispute file", "Step 1", "Policy decides · D001", "The advocates argue", "Notify parties", "Human in the loop"). The labels that label data ("Amount approved", "Confidence", "Policy applied", "Rider's claim", "Chat log", "Rider's phone", form labels, fact tile labels, tool column titles) are now sentence case, `--muted`, 12 px, with no letter-spacing.
- **Privacy markers:** "Internal review only …" and "Computed facts · internal record" are now one lock badge, "Internal", beside the heading (`InternalBadge` in `Chip.tsx`). The full original sentence, plus "Riders and drivers never see this.", is in the tooltip and in screen-reader text.
- **One chip system:** `.chip` / `.chip.sm` with one tone class each (`tone-neutral`, `tone-ok`, `tone-warn`, `tone-danger`, `tone-brand`, `tone-outline`), rendered by `<Chip>` (`Chip.tsx`). The class mapping is in `chipStyle.ts`. The old chip classes and their CSS are deleted.
- **Landing page:** its section eyebrows are unchanged. Its AI/Code step badges now use the same chips.

Visible uppercase labels in the active step panel (D001, light, 1280 px; the Notify step's two are the "Ryde · Dispute update" header inside each phone mock-up):

| Step | Before | After |
| --- | --- | --- |
| Intake | 7 | 0 |
| Evidence | 4 | 0 |
| Hearing | 6 | 0 |
| Ruling | 12 | 0 |
| Notify | 6 | 2 |

All captures are headless Chrome with AI Offline and reduced motion (so the intros are static). Before is main at `6fa24e1` (#67, with #68). Each capture is a full page of D001 after "Run agents".

| Step | Light 1280 | Dark 1280 | Light 375 | Dark 375 |
| --- | --- | --- | --- | --- |
| Intake | [before](before/d001-intake-light-1280.png) · [after](after/d001-intake-light-1280.png) | [before](before/d001-intake-dark-1280.png) · [after](after/d001-intake-dark-1280.png) | [before](before/d001-intake-light-375.png) · [after](after/d001-intake-light-375.png) | [before](before/d001-intake-dark-375.png) · [after](after/d001-intake-dark-375.png) |
| Evidence | [before](before/d001-evidence-light-1280.png) · [after](after/d001-evidence-light-1280.png) | [before](before/d001-evidence-dark-1280.png) · [after](after/d001-evidence-dark-1280.png) | [before](before/d001-evidence-light-375.png) · [after](after/d001-evidence-light-375.png) | [before](before/d001-evidence-dark-375.png) · [after](after/d001-evidence-dark-375.png) |
| Hearing | [before](before/d001-hearing-light-1280.png) · [after](after/d001-hearing-light-1280.png) | [before](before/d001-hearing-dark-1280.png) · [after](after/d001-hearing-dark-1280.png) | [before](before/d001-hearing-light-375.png) · [after](after/d001-hearing-light-375.png) | [before](before/d001-hearing-dark-375.png) · [after](after/d001-hearing-dark-375.png) |
| Ruling | [before](before/d001-ruling-light-1280.png) · [after](after/d001-ruling-light-1280.png) | [before](before/d001-ruling-dark-1280.png) · [after](after/d001-ruling-dark-1280.png) | [before](before/d001-ruling-light-375.png) · [after](after/d001-ruling-light-375.png) | [before](before/d001-ruling-dark-375.png) · [after](after/d001-ruling-dark-375.png) |
| Notify | [before](before/d001-notify-light-1280.png) · [after](after/d001-notify-light-1280.png) | [before](before/d001-notify-dark-1280.png) · [after](after/d001-notify-dark-1280.png) | [before](before/d001-notify-light-375.png) · [after](after/d001-notify-light-375.png) | [before](before/d001-notify-dark-375.png) · [after](after/d001-notify-dark-375.png) |

Also:

- **D007 (threat, fraud risk):** Evidence [before](before/d007-evidence-light-1280.png) · [after](after/d007-evidence-light-1280.png); Ruling [before](before/d007-ruling-light-1280.png) · [after](after/d007-ruling-light-1280.png).
- **Presentation mode:** [D001 Ruling](after/d001-ruling-presentation-1280.png).
- **Landing:** [before](before/landing-light-1280.png) · [after, light](after/landing-light-1280.png) · [after, dark](after/landing-dark-1280.png).
