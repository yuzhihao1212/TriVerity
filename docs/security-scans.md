# Security scans

Every scan with the command, date, commit and result, so anyone can repeat it. A scan
that has not been run is marked **to run**, never as clean.

## Summary

| Check | Tool | Date (UTC) | Commit | Result |
| --- | --- | --- | --- | --- |
| Python dependencies (runtime) | pip-audit 2.10.1 | 2026-10-12 | 20a9949 (`backend/requirements.txt`) | No known vulnerabilities |
| Python dependencies (runtime + test) | pip-audit 2.10.1 | 2026-10-12 | 20a9949 (`backend/requirements-dev.txt`) | No known vulnerabilities |
| Frontend, before fix | npm 11.9.0, Node 24.14.0 | 2026-10-12 | 20a9949 | 3 (1 moderate, 2 high) |
| Frontend, after fix | npm 11.9.0 | 2026-10-12 | f57d68a | all deps: 2 (1 moderate, 1 high), dev only; `--omit=dev`: **0** |
| Logs carry no personal data | pytest | 2026-10-12 | b51e1d5 | `backend/tests/test_log_privacy.py` passes (failure modes of guide 3.2) |
| Git history, interim regex pass (not gitleaks) | Python regex over `git log --all -p` | 2026-10-12 13:53 | 495a4a6 | 0 findings in 54 commits on 10 refs (local and remote-tracking; no PR refs) |
| Git history on GitHub, all refs incl. 7 pull-request refs | gitleaks 8.24.2 (Docker), repo config | 2026-10-12 14:08 | mirror of origin at that time (`main` f5eb144, `security/api-hardening` f03845a) | **no leaks found** (35 commits scanned, 333 KB) |
| Local history, every local branch (incl. unpushed PR 2-4) | gitleaks 8.24.2 (Docker), repo config | 2026-10-12 14:08 | local tips incl. cbfd76d | **no leaks found** (51 commits scanned, 462 KB) |
| Working tree, incl. untracked and ignored files | gitleaks 8.24.2 `dir` (Docker) | 2026-10-12 14:09 | cbfd76d | 1 finding, **expected**: `llm-api-key-assignment` in `backend/.env` line 2 (the real key, git-ignored, never committed); nothing else |
| Git history on GitHub, all refs incl. pull-request refs | trufflehog 3.88.0 (Docker), `--no-verification` | 2026-10-12 14:12 | same mirror, as a full clone | **0 findings** (344 chunks, 349 KB, 41 commits) |
| Local history, every local branch | trufflehog 3.88.0 (Docker), `--no-verification` | 2026-10-12 14:11 | local tips | **0 findings** (540 chunks, 487 KB) |

## Python dependencies

Requirements are now pinned (`backend/requirements.txt` for runtime, `requirements-dev.txt`
adds pytest), so the result is reproducible. Before pinning, each install pulled the newest
releases (finding F12).

```bash
python -m venv .venv-audit && .venv-audit/bin/pip install pip-audit==2.10.1
.venv-audit/bin/pip-audit -r backend/requirements.txt       # No known vulnerabilities found
.venv-audit/bin/pip-audit -r backend/requirements-dev.txt   # No known vulnerabilities found
```

On Windows machines with Application Control, run `python -m pip_audit ...` instead of the
`pip-audit.exe` launcher, which may be blocked. CI runs the same audit
(`.github/workflows/security.yml`) on every pull request and weekly.

## Frontend dependencies

```bash
cd frontend
npm audit                 # before: 3 vulnerabilities (1 moderate, 2 high)
npm audit fix             # without --force: source-map-js 1.2.1 -> 1.2.2
npm audit                 # after: 2 (1 moderate, 1 high), both dev-only
npm audit --omit=dev      # after: found 0 vulnerabilities
npm run build             # passes
```

`vite`, `typescript` and `@vitejs/plugin-react` moved from `dependencies` to
`devDependencies`: the built SPA ships only React, so `--omit=dev` now reports the true
runtime exposure.

| Advisory | Reachable? | Action | Status |
| --- | --- | --- | --- |
| source-map-js GHSA-68fv-2mgg-jv7q (event-loop DoS from crafted source maps) | build time only | `npm audit fix` | fixed |
| esbuild GHSA-67mh-4wv8-2f99 (any website can send requests to the dev server and read the response) | only while `npm run dev` runs; not in the built bundle | the fix is Vite 8, a major upgrade; not done before the freeze | **accepted risk**: never expose the dev server beyond localhost; the demo serves the built `dist/` (docs/demo-deployment.md) |
| vite <= 6.4.2 (depends on that esbuild) | as above | same Vite upgrade | accepted risk, as above |

CI fails on any runtime advisory of high severity (`npm audit --omit=dev --audit-level=high`)
and reports the full audit without failing.

## Secrets in git history

Run on 2026-10-12 with the official Docker images (gitleaks 8.24.2, trufflehog 3.88.0);
results are in the summary table. **No secret was found in any commit on any ref**,
including closed pull requests. The only working-tree finding is the real key in
`backend/.env`, which is expected: `git check-ignore backend/.env` prints the path,
`git ls-files backend/.env` prints nothing, and `git log --all -- backend/.env` lists no
commit. The custom `llm-api-key-assignment` rule matching that file also shows the rule
catches the real key's format. Reports used `--redact` and were deleted after reading.

Two practical notes from the run: trufflehog reads nothing from a bare `--mirror` clone
(it reported 0 chunks, which is not a clean result), so scan a normal clone with the
pull-request refs fetched; and on Windows, Docker Desktop must be running. To repeat:

1. Get every ref, including closed pull requests (a mirror clone fetches `refs/pull/*`):

   ```bash
   git clone --mirror https://github.com/yuzhihao1212/TriVerity.git triverity-mirror.git
   ```

2. gitleaks (install: `winget install gitleaks`, or the release binary from
   https://github.com/gitleaks/gitleaks/releases, version 8.24.2 to match CI):

   ```bash
   # full history of every ref, with this repo's rules; --redact keeps secrets out of the output
   gitleaks git --config TriVerity/.gitleaks.toml --redact -v \
     --report-format json --report-path gitleaks-history.json triverity-mirror.git
   # working tree, including untracked files, docs/ and .claude/
   cd TriVerity && gitleaks dir --config .gitleaks.toml --redact -v .
   ```

   With Docker instead: `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.24.2 git --redact -v /repo`.

   The `dir` scan reads `backend/.env`, so a finding there is expected if it holds your key.
   That file is git-ignored; confirm with `git check-ignore backend/.env` (prints the path)
   and `git ls-files backend/.env` (prints nothing).

3. trufflehog, which catches different things (`--no-verification`: it can't verify
   TokenHub keys anyway, so "0 verified" would not mean clean). It needs a normal clone:

   ```bash
   git clone triverity-mirror.git triverity-full
   git -C triverity-full fetch origin "+refs/pull/*:refs/remotes/origin/pr/*"
   docker run --rm -v "$PWD:/scan:ro" trufflesecurity/trufflehog:3.88.0 \
     git file:///scan/triverity-full --no-verification --no-update
   ```

4. Also check by eye the CodeBuddy proof screenshots and any exported chat logs: a key in
   a screenshot is as leaked as one in git.

If a real key is found: revoke it in TokenHub and create a new one first (that is the fix),
then tell the lead before any history rewrite, since rewriting changes every commit hash
the CodeBuddy proof relies on. Forks and clones may still hold old commits.

## Prevention in place

- `.gitignore` covers `.env`; `.env.example` holds placeholders only.
- `.pre-commit-config.yaml` runs gitleaks on staged changes (`pip install pre-commit && pre-commit install`).
- `.github/workflows/security.yml` runs gitleaks over the full history, pip-audit and npm audit
  on pull requests, pushes to `main` and weekly.
- To ask the lead (needs repo admin): turn on GitHub secret scanning, push protection,
  Dependabot alerts and branch protection on `main`.
