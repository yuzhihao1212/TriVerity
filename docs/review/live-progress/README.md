# Live agent progress review — 16 October 2026

Built on merged progress-hook PR #45. The stream and ordinary resolve share sample lookup, source-aware caching, access-code handling, rate limits and budget accounting. Neither policy nor LLM prompts changed.

## Captures (offline)

All captures use the production frontend build hosted by FastAPI, with **`LLM_API_KEY=''`**. The slow QA server delays delivery of each actual offline progress callback by 650 ms, so intermediate states are visible. These delays are **test-only**, not UI animation or production progress simulation. Fallback badges and subsecond step times are expected: agents are not calling a model. The elapsed clock includes the artificial callback delays.

| View | Capture |
| --- | --- |
| First finished step, 1280×720, light | [First step](live-light-first-step.png) |
| Four finished steps, 1280×720, light | [Light](live-light.png) |
| Four finished steps, 1280×720, dark | [Dark](live-dark.png) |
| Four finished steps, 375×812, light | [Mobile light](live-light-375.png) |
| Four finished steps, 375×812, dark | [Mobile dark](live-dark-375.png) |
| Evidence collector record after completion | [Collector calls](collector-calls-light.png) |

Screenshots are full-page captures at the stated viewport sizes. The pink heading outline is keyboard focus, retained while agents work. The record shown here has one fallback planning round for each advocate, with Rider/Driver labels from merged PR #47; an additional fixture checked two rounds.

## Verification

- Backend: **804 tests passed**, including 14 new transport tests. A fresh isolated environment was installed from the existing pinned development requirements; no `.env` is present. The only warning is the existing Starlette/httpx deprecation warning.
- Frontend: `npm ci`, **38 tests**, `npx tsc` and `npm run build` pass, with no new dependencies. New tests cover split chunks/CRLF/BOM, multi-line data, ignored unknown events, byte-split UTF-8, incomplete/malformed responses, HTTP/network/error-event failures, exactly one fallback attempt, source badges, durations and call grouping.
- Backend tests verify step-before-result ordering, exact step/log agreement, full offline ruling equivalence excluding run-specific clocks, shared cache in both directions, server-side sample facts, uncached access-code cases, rate limits/budget counts, 401/422/429/503 and safe 500 errors, steps delivered before the worker returns, and completion/cache fill after disconnect. Existing cache TTL tests still pass through the shared functions.
- Browser: actual SSE over HTTP with the local public-demo backend, plus delayed offline callbacks at **375 and 1280 px, light/dark**. Steps appeared one by one, pending state and elapsed clock remained visible, and no horizontal overflow occurred. One stream POST per successful click; sample navigation made no resolve calls. Completion focused Evidence, revealed collector calls, and retained durations in the agent strip.
- Browser failure fixtures: SSE error, network abort, truncated stream and non-2xx HTTP each produced exactly one ordinary POST retry. When both attempts failed, the existing actionable error UI appeared. No further automatic attempts.
- Browser collector fixtures: numeric round grouping, arguments/results, Rider/Driver labels when supplied, and hiding when calls are empty. The real offline fallback plan shows trip record, GPS stops and fare lines for both parties.

## Accessibility

Keyboard Enter starts a run, focus moves to the loading heading, and completion focuses the Evidence tab as before. The visual timeline is an ordered list. A separate persistent **polite log** receives one named completion item per step, including AI/Fallback/Code and duration where supplied. It stays mounted after the result, so final steps coalesced with the result are not lost. DOM observation confirmed **nine additions**, with no timer-driven mutations, in each delayed run. The elapsed timer and decorative spinner are outside the log; the timer uses `aria-live="off"`. A fallback status is announced once.

Live-region semantics and DOM additions were inspected in Chrome; no physical screen-reader listening session was performed. Reduced-motion mode disables the spinner animation. Existing contrast, focus and theme tokens are reused; no new colours. Party preview content and access-code controls remain unchanged.

## Boundaries

The transport forwards the hook exactly as published in #45. That hook currently reports advocates/rebuttals after each parallel pair joins, and reports the precedent entry alongside the Judge at the end. The stream does not manufacture earlier completions or change that orchestration. It still delivers evidence collection, fraud and later stages during the run. Future finer-grained hook delivery can use the same endpoint/UI.

Preflight failures keep their HTTP status and an SSE error body. Worker failures after headers use a terminal error event. A disconnected run continues; the requested one-time JSON retry may spend another run on a custom dispute if the first is still finishing. Completed public samples share their existing cache; no new idempotency or cancellation policy was added. See [API contract](../../api-contract.md#post-apidisputesresolvestream).
