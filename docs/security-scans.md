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
| Git history, full scan | gitleaks | **to run** | | |
| Git history, second tool | trufflehog | **to run** | | |
| Working tree and docs | gitleaks `dir` | **to run** | | |

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

## Secrets in git history: to run

gitleaks and trufflehog are not installed on the machine that prepared this file, so they
have not been run. Run them as below and fill in the summary table (date, commit, result).

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
   TokenHub keys anyway, so "0 verified" would not mean clean):

   ```bash
   trufflehog git file://triverity-mirror.git --no-verification
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
