# Judge-ready documentation review

Captured on 16 October 2026 from `docs/judge-ready`, based on main `dde4d26`.
Application code, tests, prompts and policies are unchanged.

## README first screen

| Width | Before | After |
| --- | --- | --- |
| 1280 px | [Before desktop](readme-before-1280.png) | [After desktop](readme-after-1280.png) |
| 375 px | [Before phone](readme-before-375.png) | [After phone](readme-after-375.png) |

Rendered with a local Markdown preview and GitHub-like typography, not a capture of GitHub itself.
Both widths have no broken images or horizontal page overflow. The two-column gallery links each
image to its full-size file; the local setup disclosure opens and closes with the keyboard-accessible
native summary control. The intentionally absent cover is commented out.

## Architecture and gallery

[Rendered SVG](architecture.png): inspected visually after rendering, with zero text overflow from
node boxes. SVG body labels are 18 px at a native width of 1400 px (11.6 px at README width 900 px).
Pink still means Tencent Hy3; grey means deterministic code.

[Curated gallery and source paths](../../screenshots/README.md): nine existing review images copied
unchanged, plus a fresh offline landing capture. No API requests were made for the new landing
capture; no LLM calls were made. All ten images were visually checked for keys, emails and access
codes. The historical progress view has an empty access-code field, not a saved code.

Curated images: **1,696,915 bytes**. README comparison and diagram renders: **935,316 bytes**.
Total new raster images: **2,632,231 bytes** across 15 PNGs. Each PNG is below 600 KB.

## Verification

- 810 backend tests pass, with `LLM_API_KEY=''` and no backend `.env` in this isolated checkout.
- 169 frontend tests pass; TypeScript and the production build pass.
- 138 relative file/image links and Markdown anchors pass across README and the 14 top-level docs.
- Developer setup, environment examples and evaluation commands remain inside the local-run disclosure.
- Remaining placeholders are the cover, live demo, video and AI-tool evidence links. Test counts are verified.
- No full live-timeline GIF was available; the gallery uses a still. Original review records stay in place.
