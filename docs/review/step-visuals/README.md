# Case header, workflow stepper and agent cards — 16 October 2026

The dispute page's top half now shows the case and its progress at a glance:

- **Case header:** summary chips (distance deviation, charge, outcome) and a status pill with a coloured dot.
- **Stepper:** a connected stepper, like a delivery tracker, that fills as agents finish.
- **Agents in this step:** each agent is a card with an icon, its role, colour-coded badges and a duration bar. Agents that run in sequence are joined by labelled arrows ("15 facts → +8 facts → 23 facts total").
- **Tool calls:** the collector's raw tool-call string is now Rider/Driver columns of named chips.

The display logic lives in `frontend/src/stepVisuals.ts`, the agent roles in `workflow.ts`, and the icons in `Icon.tsx`.

## Screenshots

All captures are local headless Chrome against the sample disputes with AI set to Offline (`?ai=off`), so no LLM calls were made. Before is main at `d4d61d0` (#59).

| View | Before | After |
| --- | --- | --- |
| D001 Intake, before a run | [Before](before/D001-intake-light-1280.png) | [After](after/D001-intake-light-1280.png) |
| D001 Evidence, light | [Before](before/D001-evidence-light-1280.png) | [After](after/D001-evidence-light-1280.png) |
| D001 Evidence, dark | [Before](before/D001-evidence-dark-1280.png) | [After](after/D001-evidence-dark-1280.png) |
| D001 Evidence, light, 375 px | [Before](before/D001-evidence-light-375.png) | [After](after/D001-evidence-light-375.png) |
| D001 Evidence, dark, 375 px | [Before](before/D001-evidence-dark-375.png) | [After](after/D001-evidence-dark-375.png) |
| D001 Evidence, presentation mode | [Before](before/D001-evidence-presentation-1280.png) | [After](after/D001-evidence-presentation-1280.png) |
| D001 Hearing | [Before](before/D001-hearing-light-1280.png) | [After](after/D001-hearing-light-1280.png) |
| D001 Ruling, light | [Before](before/D001-ruling-light-1280.png) | [After](after/D001-ruling-light-1280.png) |
| D001 Ruling, dark | [Before](before/D001-ruling-dark-1280.png) | [After](after/D001-ruling-dark-1280.png) |
| D002 (no-show, escalated) Evidence | [Before](before/D002-evidence-light-1280.png) | [After](after/D002-evidence-light-1280.png) |
| D007 (escalated) Ruling | [Before](before/D007-ruling-light-1280.png) | [After](after/D007-ruling-light-1280.png) |

These after-only captures come from a run slowed to one event every 450 ms:

- The stepper filling during the run: frames [1](after/stepper-live-0.png), [2](after/stepper-live-1.png), [3](after/stepper-live-4.png) and [done](after/stepper-live-5.png).
- The [live header pill](after/header-live.png).
- The [keyboard focus ring](after/stepper-focus-ring.png).
- D002 at 375 px before any run, with the steps [locked](after/D002-intake-light-375.png).
