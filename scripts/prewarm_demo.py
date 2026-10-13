"""Resolve every sample once so the public demo answers instantly from its cache.

Run against your own demo server after starting it with PUBLIC_DEMO=true.
Spends real LLM tokens: about 4,000 per sample, ~32,000 for the 8 samples.
Respects the server's rate limits (waits on 429/503), so it takes a few minutes.

    python scripts/prewarm_demo.py --yes
    python scripts/prewarm_demo.py --base-url https://demo.example.com --yes
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def call(url: str, payload: dict | None = None) -> tuple[int, dict, dict]:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, dict(resp.headers), json.load(resp)
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), {}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--yes", action="store_true", help="confirm spending real LLM tokens")
    args = parser.parse_args()
    if not args.yes:
        sys.exit("This spends real LLM tokens (~32,000). Re-run with --yes to continue.")

    base = args.base_url.rstrip("/")
    status, _, samples = call(f"{base}/api/disputes/samples")
    if status != 200:
        sys.exit(f"Could not load samples: HTTP {status}")

    for case in samples:
        while True:
            status, headers, result = call(f"{base}/api/disputes/resolve", case)
            if status in (429, 503):
                wait = int(headers.get("Retry-After", "10"))
                print(f"  {case['dispute_id']}: HTTP {status}, waiting {wait}s")
                time.sleep(wait)
                continue
            break
        if status != 200:
            print(f"{case['dispute_id']}: HTTP {status}")
            continue
        sources = [result["rider_case"]["source"], result["driver_case"]["source"], result["explanation_source"]]
        print(f"{case['dispute_id']}: {result['decision']} (sources: {', '.join(sources)})")
    print("Done. Samples are cached on the server; any 'fallback' source means the LLM was not used.")


if __name__ == "__main__":
    main()
