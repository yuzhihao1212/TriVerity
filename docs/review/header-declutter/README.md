# Decluttered console header — 16 October 2026

The console header is now one line on desktop and on phones: "TriVerity By OeroAI · Reviewer console" on the left, and the AI switch, a divider and two icon buttons (theme, presentation mode) on the right. "Reviewer console" is a plain context label rather than a pill, and its explanation is in the `title` and in screen-reader text. The judge access code has moved out of the header to the places it is used, which are reviewer-added disputes only: above Run agents, and at the end of the new-dispute form. The landing page uses the same theme and presentation icon buttons.

All captures are headless Chrome. The access-code checks ran against a local public-demo backend (`PUBLIC_DEMO=true`, a test access code) with AI Offline. Before is main at `b2eb57f` (#63).

| View | Before | After |
| --- | --- | --- |
| Console, light, 1280 px | [Before](before/console-light-1280.png) | [After](after/console-light-1280.png) |
| Console, dark, 1280 px | [Before](before/console-dark-1280.png) | [After](after/console-dark-1280.png) |
| Console, light, 375 px | [Before](before/console-light-375.png) | [After](after/console-light-375.png) |
| Console, dark, 375 px | [Before](before/console-dark-375.png) | [After](after/console-dark-375.png) |
| Console, presentation mode | [Before](before/console-presentation-1280.png) | [After](after/console-presentation-1280.png) |
| Landing, light, 1280 px | [Before](before/landing-light-1280.png) | [After](after/landing-light-1280.png) |
| Landing, dark, 1280 px | [Before](before/landing-dark-1280.png) | [After](after/landing-dark-1280.png) |
| Landing, light, 375 px | [Before](before/landing-light-375.png) | [After](after/landing-light-375.png) |

These views exist only after the change:

- The console in dark mode with presentation mode on: [screenshot](after/console-dark-presentation-on.png).
- The access-code field above Run agents for a reviewer-added dispute: [screenshot](after/own-dispute-run-panel.png).
- The same field at the end of the new-dispute form: [screenshot](after/new-dispute-form.png).
