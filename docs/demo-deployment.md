# Running the public demo

How to put TriVerity on a link for the judges without exposing the API key or the
token budget. The controls behind it are described in `docs/api-contract.md`
("Limits and errors", "Public demo mode", "Access codes").

## What visitors can do

| Visitor | Can | Cost |
| --- | --- | --- |
| Anyone with the link | Resolve the 9 sample disputes. The server uses its own copy of each sample and caches the result for 6 hours. | At most 9 resolves per 6 hours |
| Invited judge with an access code | Also type in their own dispute ("+ New dispute", or "Edit as new dispute" on a sample). | At most 3 per minute and 20 per day per code |
| Everyone together | At most 10 resolves per minute. After 300,000 tokens or 75 resolves in a day, rulings continue with Fallback badges instead of the LLM. | Capped |

All numbers are in `backend/app/core/limits.py`. They can be overridden in `backend/.env`
(see the two presets in `.env.example`: local development and evaluation, and the demo server);
on the demo server, use Preset 2 and check the backend's start-up log: it prints one
"Limit override from backend/.env" line per setting, which should match the preset.

## 1. A separate LLM key for the demo

In the TokenHub console, create a **new API key** just for the demo, with a small
**Total Quota** (for example 150,000 tokens, about 35 resolves). If the link is abused,
only this key runs dry, and you can revoke it without touching your development key.
Put it in the demo server's `backend/.env` as `LLM_API_KEY`. Never paste it into chat,
code, screenshots or the frontend.

## 2. Public demo mode and access codes

On the demo server, from the repo root:

```bash
python scripts/setup_demo_access.py public-demo on
python scripts/setup_demo_access.py add alice bob carol   # one code per judge
python scripts/setup_demo_access.py list                  # who has a code (codes not shown)
```

`add` prints each new code **once**. Send each judge their own code privately (for
example in the submission form). Codes are stored only in `backend/.env`. The script
changes only the `PUBLIC_DEMO` and `DEMO_ACCESS_CODES` lines and never prints the rest
of the file. Restart the backend after any change.

To cut someone off: `python scripts/setup_demo_access.py revoke bob`.

## 3. Host it on Render (free, the team's choice)

The repo has everything Render needs: `Dockerfile` (builds the frontend, then serves the
API and the frontend from one service at one HTTPS address) and `render.yaml` (a Render
Blueprint with the public-demo settings and the Preset 2 limits). Render provides HTTPS.

**Setup, once (about 20 minutes):**

1. **Account.** Sign up at render.com with **Sign in with GitHub**. The repo is public
   (since 15 Oct 2026, for the submission), so any team member's Render account can
   deploy it.
2. **Blueprint.** In the Render dashboard: **New → Blueprint**, pick the `TriVerity` repo
   and branch `main`. Render reads `render.yaml` and shows one free web service,
   `triverity-demo`, in Singapore.
3. **Secrets.** Render asks for the two values marked `sync: false`:
   - `LLM_API_KEY`: the **demo** TokenHub key with a small quota (step 1 above). Paste it
     only into Render's form, never into chat, code or screenshots.
   - `DEMO_ACCESS_CODES`: one code per judge, comma-separated. Make them on your own
     machine with `python -c "import secrets; print(','.join('judge' + str(i) + '-' + secrets.token_urlsafe(18) for i in range(1, 6)))"`
     (five codes; change the 6 for more), and keep the output somewhere private to send
     each judge their own code.
4. **Apply.** Render builds the image (about 5 minutes) and gives the link, e.g.
   `https://triverity-demo.onrender.com`. Open it: the samples should load.
5. **Warm the cache** so the first judges don't wait for the AI (spends about 50,000
   tokens for the 9 samples): `python scripts/prewarm_demo.py --base-url https://<your-link> --yes`.
6. **Keep it awake.** The free plan sleeps after 15 minutes without visits, and the first
   visit then takes about a minute to wake it (and empties the cache). Add a free monitor
   at uptimerobot.com: **New monitor → HTTP(s)**, URL `https://<your-link>/health`,
   interval 5 minutes. This also emails you if the demo goes down.

**Changing it later.** `autoDeploy` is off, so pushing to `main` does not restart the demo
while judges are using it. To ship a fix: Render dashboard → `triverity-demo` → **Manual
Deploy → Deploy latest commit**, then warm the cache again. To revoke a judge's code, edit
`DEMO_ACCESS_CODES` under **Environment** and save (Render restarts the service).

**What to know about this setup:**

- Rate limits, the budget and the sample cache are in memory, so they reset whenever the
  service restarts or sleeps. That's acceptable for a week-long demo; the provider quota on
  the demo key stays the hard limit.
- The container is only reachable through Render's proxy, so uvicorn trusts its
  `X-Forwarded-For` header (`--forwarded-allow-ips='*'`). A caller could forge that header
  to get a fresh per-IP limit; the global limit (10 a minute), the daily budget and the
  demo key's quota still cap what anyone can spend.
- The image never contains `.env` (see `.dockerignore`), runs as a non-root user, and has
  the API docs switched off (`PUBLIC_DEMO=true`).

## 3b. Or serve it from your own VM

Access codes travel in a request header, so the link must be HTTPS. A simple setup is
one small VM running Caddy, which gets a TLS certificate automatically, in front of
uvicorn. (The `Dockerfile` also works on a VM: `docker build -t triverity .` then
`docker run -p 8000:8000 --env-file backend/.env triverity`, behind Caddy.)

Build the frontend once:

```bash
cd frontend && npm ci && npm run build      # output in frontend/dist
```

Run the backend with **one worker** (the rate-limit and budget counters are in memory)
and **without `--reload`**, listening on localhost only:

```bash
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 \
  --proxy-headers --forwarded-allow-ips=127.0.0.1
```

`--forwarded-allow-ips` must be the proxy's address, never `*`. Otherwise any caller
can forge `X-Forwarded-For` and get a fresh rate limit on every request.

`Caddyfile` (replace the domain and path):

```caddy
demo.example.com {
    encode gzip
    request_body {
        max_size 512KB
    }
    @api path /api/* /health
    handle @api {
        reverse_proxy 127.0.0.1:8000
    }
    handle {
        root * /srv/triverity/frontend/dist
        try_files {path} /index.html
        file_server
    }
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
        X-Frame-Options "DENY"
    }
}
```

The frontend and the API share one origin, so no CORS setup is needed. Caddy
overwrites any `X-Forwarded-For` a client sends, so uvicorn sees the real client IP.
Never expose the Vite dev server (`npm run dev`) beyond localhost; it has known
advisories (esbuild GHSA-67mh-4wv8-2f99).

## 4. Demo-day checklist

Before judging:

- [ ] `python scripts/setup_demo_access.py list` shows `PUBLIC_DEMO=true` and the judges' names.
- [ ] Backend restarted after the last `.env` change.
- [ ] Warm the cache so the samples answer instantly (spends about 50,000 tokens):
      `python scripts/prewarm_demo.py --base-url https://demo.example.com --yes`.
      Every line should show `llm` sources; `fallback` means the key or budget is not working.
- [ ] Open the link in a private window: a sample resolves, and "+ New dispute" without a code shows
      "Enter your access code".
- [ ] For screenshots and the demo video: close `backend/.env`, hide terminals that show
      environment variables, and never type a real access code on screen.

The UI is labelled **Reviewer console**: it is the internal view and shows fraud
signals and both parties' history, which riders and drivers never see.

After judging:

- [ ] `python scripts/setup_demo_access.py revoke --all`
- [ ] `python scripts/setup_demo_access.py public-demo off`
- [ ] Revoke the demo key in the TokenHub console.
