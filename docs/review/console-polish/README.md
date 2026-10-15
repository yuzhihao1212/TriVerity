# Console polish — 16 October 2026

- **Outcome first:** each step shows its own content first. The agents now sit below it, in a collapsible "How this step was decided" block: one line per agent when collapsed, the full cards and flow when expanded. The choice is remembered for the session.
- **Sticky decision bar:** the Ruling step has a decision bar pinned to the bottom of the case area. It shows the outcome in its tone, with Accept / Override, or only Decide on an escalated case. It shares one state with "Your decision", so a decision is saved once whichever button is used.
- **One outcome-tone mapping** (`outcomeTone.ts`):
  - ok (green): a refund or compensation;
  - warn (amber): an escalation, a fallback badge, a positive deviation, a pending appeal;
  - danger (error colour): only threats and high bad-faith risk;
  - neutral: no action and plain facts.

  Brand red stays for identity, navigation, selection and primary actions.
- **Agent text** (`agentText.ts`) is rebuilt from the structured result. No `[fallback]` tag, `snake_case` token or bare 0.xx similarity is shown.

All captures are headless Chrome with AI Offline. Before is main at `98d7597` (#65), showing D001's Ruling step.

| View | Before | After |
| --- | --- | --- |
| Ruling, light, 1280 px | [Before](before/ruling-light-1280.png) | [After](after/ruling-light-1280.png) |
| Ruling, dark, 1280 px | [Before](before/ruling-dark-1280.png) | [After](after/ruling-dark-1280.png) |
| Ruling, light, 375 px | [Before](before/ruling-light-375.png) | [After](after/ruling-light-375.png) |
| Ruling, dark, 375 px | [Before](before/ruling-dark-375.png) | [After](after/ruling-dark-375.png) |
| Presentation mode | | [After](after/ruling-presentation-1280.png) |

Additional after captures:

- **Decision bar:** [after Accept](after/ruling-accepted-light-1280.png) and [an escalated case (Decide only)](after/ruling-escalated-light-1280.png).
- **D007:** [the threat (danger) next to a disagreement (warn)](after/d007-evidence-chat.png).
- **"How this step was decided":** [collapsed](after/agents-collapsed-ruling.png), [expanded on Ruling](after/agents-expanded-ruling.png) and [expanded on Evidence](after/agents-expanded-evidence.png).
