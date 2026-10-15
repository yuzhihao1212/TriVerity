# Frontend workflow tabs review

The dispute file now follows Intake → Evidence → Hearing → Ruling → Notify parties. This replaces the long results page from [PR #23](https://github.com/yuzhihao1212/TriVerity/pull/23), reusing its comparison, debate, evidence, verdict and party-preview components.

All screenshots were captured offline in headless Chrome using saved backend responses produced with `LLM_API_KEY=''`. Browser API requests were intercepted and replayed; no real LLM calls were made. Language-output badges therefore read **Fallback**, deterministic stages read **Code**, and skipped replies remain explicitly absent. These are actual fallback responses, not fabricated debate transcripts.

## Before and after

Before: [D001 projector](../frontend-polish/after/D001-projector.png), [mobile](../frontend-polish/after/D001-mobile.png), [dark](../frontend-polish/after/D001-dark.png).

| Step | Light screenshot | What changed |
| --- | --- | --- |
| Intake | [Intake](intake-light.png), [header overview](overview-light.png) | Both claims stay visible; expected/actual comparison, key facts and explicit Run agents action. |
| Evidence | [Evidence](evidence-light.png) | All computed facts grouped by source; supplied, unambiguous IDs link to their fact. |
| Hearing | [Hearing](hearing-light.png) | Both opening arguments and replies, with visible agent messages above. |
| Ruling | [Ruling](ruling-light.png) | Verdict first, reasoning next, then clearly labelled internal risk. |
| Notify parties | [Notify parties](notify-light.png) | Existing safe Rider/Driver previews; no internal evidence, history or risk. |

Additional captures:

- Hearing: [375×812 mobile](hearing-mobile.png), [1280×720 projector](hearing-projector.png), [dark](hearing-dark.png).
- Ruling: [375×812 mobile](ruling-mobile.png), [1280×720 projector](ruling-projector.png), [dark](ruling-dark.png).
- Other cases: [D005](D005-ruling-projector.png), [D007](D007-ruling-projector.png), [DISP-002](DISP-002-ruling-projector.png).
- States: [locked tabs](intake-locked-projector.png), [honest indeterminate loading](loading-projector.png).

Some screenshots scroll the dispute file into view, leaving the header above the viewport; the overview shows the pale pink header band. Keyboard focus rings are intentionally visible in captures.

## Verification

- `npm ci`, `npm test` (**27 passing**), `npx tsc`, `npm run build`: passed. No added dependencies or lockfile changes.
- Unit tests cover locked tabs, navigation wrapping/skipping, per-case memory, complete agent mapping, raw unknown labels, missing collector, actual source badges, saved-result counts, and conservative evidence-ID matching. Existing party-safety tests all pass.
- Browser checks on **D001, D005, D007 and DISP-002**: keyboard Run, locked tabs and click guards, Left/Right/Home/End, automatic Evidence selection/focus on completion, Next actions, remembered tabs, cached case selection, visible stage logs, preserved computed facts and both party previews.
- No horizontal overflow on every tab at **375×812** and **1280×720**, in light and dark themes. Presentation mode also checked. Text contrast audit across **3,482 rendered text checks**: lowest ratio **5.13:1**. Disabled controls were excluded; their muted labels still use the same text tokens. Primary button uses darker pink for small white text.
- ARIA tab/panel associations, selected state, roving focus, visible focus rings, logical heading order, honest indeterminate status and reduced-motion spinner checked. This was a browser/DOM and keyboard review, not a screen-reader speech audit.
- Additional replay checks: repeated cross-tab ID focus from arguments/replies, optional collector, unknown agent logs, failed re-run preserving cached results, blocked localStorage, type filtering, presentation preference and access-code request behavior. Tab switches and Next actions issue no resolve requests.

## Trade-offs and integration notes

- The requested base branch was `codex/frontend-polish`. During this work PR #23 merged and its remote branch was deleted. This branch was rebased onto merged `main` and the new PR targets `main`; the frontend base is identical and the diff contains only this rework.
- Some fallback responses have differently sized evidence text/ID arrays. Existing conservative matching is retained: IDs appear only for supplied, unambiguous exact text pairs. Unlabelled facts remain visible with an em dash; no IDs are invented from source counters. Unclassified facts are retained under Case evidence. A separate aligned replay tests ID jumps because those fallback fixtures cannot safely supply them.
- `evidence_collector` is optional. Its friendly name and messages render when present; AI/Fallback appears only if `evidence_collection.source` supplies it. Otherwise the strip says Source not supplied. No backend change is required.
- Unknown agent entries appear in Evidence under their raw name, preserving visibility until a future stage mapping is agreed. Intake and Notify explain that no extra agent runs in those steps.
- Tab-bar counts describe saved results, not live step progress. While running, tab content is replaced by the indeterminate loading panel. Failed re-runs retain the previous result.
- Public Ryde pages could not be loaded for reliable colour sampling. The palette uses the brief's approximate pink/slate values, with darker accessible pink controls/text and equivalent dark tokens. No Ryde logo is used.
