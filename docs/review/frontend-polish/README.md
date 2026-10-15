# Frontend polish review — 15 October 2026

P1 puts the policy ruling first, then the case comparisons, workflow, two debate rounds,
internal risk, detailed reasoning and party-safe messages. Statements/chat/history,
agent log entries and long evidence lists are available through keyboard-operable
native disclosures. No evidence, arguments or rulings are removed.

The loading panel lists the stages without asserting progress. It waits for one response,
then focuses the completed ruling. Selecting or revisiting a case never resolves it.

## Before / after screenshots

Each pair uses the same offline backend response. Screenshots start at the main case/results
area so the change in information order is visible at the same viewport size. Light/dark
are 1440×1000, mobile is 375×812, projector is 1280×720. The mobile sidebar remains a
bounded, scrollable case picker; the header and judge access-code field are retained.

| Case | Light | Dark | Mobile 375 px | Projector 1280×720 |
|---|---|---|---|---|
| D001 | [Before](before/D001-light.png) · [After](after/D001-light.png) | [Before](before/D001-dark.png) · [After](after/D001-dark.png) | [Before](before/D001-mobile.png) · [After](after/D001-mobile.png) | [Before](before/D001-projector.png) · [After](after/D001-projector.png) |
| D005 | [Before](before/D005-light.png) · [After](after/D005-light.png) | [Before](before/D005-dark.png) · [After](after/D005-dark.png) | [Before](before/D005-mobile.png) · [After](after/D005-mobile.png) | [Before](before/D005-projector.png) · [After](after/D005-projector.png) |
| D007 | [Before](before/D007-light.png) · [After](after/D007-light.png) | [Before](before/D007-dark.png) · [After](after/D007-dark.png) | [Before](before/D007-mobile.png) · [After](after/D007-mobile.png) | [Before](before/D007-projector.png) · [After](after/D007-projector.png) |

## P1 verification

- Started a separate backend with `LLM_API_KEY=''`, public demo disabled and no access codes.
  Resolved D001, D005 and D007 through the UI: all Fallback. The screenshot/browser checks
  then replayed those saved offline responses. No real LLM calls or secrets in artifacts.
- `npm ci`, `npm test` (**16 passed**), `npx tsc`, `npm run build`: passed. No dependencies
  or lockfile changes. Added a frontend CI job with all four checks.
- New pure-logic tests cover missing/zero/invalid comparison values, signed deltas,
  currency formatting, evidence source labels and conservative ID alignment, policy ID
  display and skipped versus fallback/AI outputs. Existing party-safe tests remain intact.
- Browser checked one h1, header/nav/main, logical headings, keyboard skip link, dispute
  selection, Resolve, focus moving to the completed verdict, disclosure toggles, party
  tabs, live status/errors, reduced-motion behaviour and cached-case selection.
- Honest indeterminate loading: no per-step completion claims and no `aria-valuenow`.
- Computed-colour contrast checks pass for expanded content in light and dark themes.
  New dark links on driver cards use #FF7396 after the original pink measured only
  4.27:1 on that surface; existing accessible palette and focus styles are retained.
- All 12 after views have no horizontal overflow. Party tabs were checked for every
  reviewed case: no risk, signals, history or evidence; no proposed amount for D007.
- The browser deliberately returned a 503 to verify error recovery. Only explicit button
  clicks generated POSTs; tabs, disclosures and cached selection generated none.

## Limits

Screen-reader speech was not tested; semantic structure and keyboard behaviour were checked.
Fallback advocate evidence can contain an extra party statement, so its text list and ID
list sometimes differ in length. IDs are displayed only when supplied lists align; this
frontend does not guess new IDs or alter any evidence. Source labels are display categories,
with unrecognised text retained as “Case evidence”. Skipped rebuttals remain visibly empty,
with no simulated AI reply. The existing build/dev-tool dependency advisories are unchanged.

## P2 added after the P1 push

- Clicking an unambiguous evidence ID opens its reference list, scrolls to the exact fact
  and focuses/highlights it. The same action works from rebuttal evidence and on repeated
  selection after closing the reference list. Contradictory ID/text pairs are not linked.
- Sidebar route/clock icons are decorative inline SVGs; the labelled type filter keeps
  current selection and cached resolved badges. It does not run agents or auto-select a case.
- Presentation mode increases body, controls and metadata type sizes for projectors. The
  pressed-state button persists a boolean preference in localStorage; reads and writes
  tolerate blocked storage. It still works for the current session if storage is unavailable.
- **19 frontend tests pass**. Added tests for reference conflicts, stable filtering, and
  enabled/disabled/blocked-storage preferences. TypeScript and the production build pass.
- Browser tested filters, persisted mode after reload, blocked storage, repeated fact focus,
  cached badges, and zero extra requests from these controls. An explicitly constructed
  aligned-ID fixture exercised reference navigation; committed screenshots use the three
  original offline responses and retain Fallback badges, without fabricated model output.
- In presentation mode, all 162 sampled text nodes pass contrast: minimum **4.87:1 light**
  and **4.58:1 dark**. No overflow at 1280×720 or 375×812. The full P1 regression checks
  also pass after P2. No screen-reader speech testing was performed.

Additional inspected views:

- [Two debate rounds](debate-light.png)
- [Honest loading on a projector](loading-projector.png), captured with a deliberately delayed
  offline response; it shows no completed stages or simulated progress.
- [Presentation mode on a projector](presentation-projector.png)

The evidence-ID limitation above remains: unequal lists are preserved without a guessed
mapping. Reference navigation is available only where the response supplies a unique,
aligned ID/text pair. Nothing here changes that backend contract.
