"""Manage the public demo settings in backend/.env: access codes and PUBLIC_DEMO.

Run it yourself; it only touches the PUBLIC_DEMO and DEMO_ACCESS_CODES lines and
never prints anything else from .env. New codes are shown once, in your
terminal: copy each one to its judge privately. Each code starts with the
judge's name so it can be revoked by name.

    python scripts/setup_demo_access.py add alice bob carol   # one new code each
    python scripts/setup_demo_access.py list                  # names only, no codes
    python scripts/setup_demo_access.py revoke bob            # remove bob's code
    python scripts/setup_demo_access.py revoke --all
    python scripts/setup_demo_access.py public-demo on        # or off

Restart the backend afterwards; it reads .env at start-up.
"""

import argparse
import re
import secrets
import sys
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[1] / "backend" / ".env"
CODES_KEY = "DEMO_ACCESS_CODES"
DEMO_KEY = "PUBLIC_DEMO"
NAME_RE = re.compile(r"^[a-z0-9]{1,20}$")


def read_env() -> list[str]:
    return ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []


def get_value(lines: list[str], key: str) -> str:
    for line in lines:
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return ""


def set_value(lines: list[str], key: str, value: str) -> list[str]:
    out = [line for line in lines if not line.startswith(f"{key}=")]
    out.append(f"{key}={value}")
    return out


def write_env(lines: list[str]) -> None:
    tmp = ENV_FILE.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp.replace(ENV_FILE)


def codes_of(lines: list[str]) -> list[str]:
    return [c for c in (c.strip() for c in get_value(lines, CODES_KEY).split(",")) if c]


def name_of(code: str) -> str:
    return code.split("-", 1)[0]


def cmd_add(names: list[str]) -> None:
    bad = [n for n in names if not NAME_RE.match(n)]
    if bad:
        sys.exit(f"Names must be 1-20 lowercase letters or digits: {bad}")
    lines = read_env()
    codes = codes_of(lines)
    taken = {name_of(c) for c in codes}
    clash = [n for n in names if n in taken]
    if clash:
        sys.exit(f"Already have a code: {clash}. Revoke first to issue a new one.")
    new = {n: f"{n}-{secrets.token_urlsafe(18)}" for n in names}
    write_env(set_value(lines, CODES_KEY, ",".join([*codes, *new.values()])))
    print(f"Added {len(new)} code(s) to {ENV_FILE}. Shown once; send each privately:\n")
    for name, code in new.items():
        print(f"  {name:<20} {code}")
    print("\nRestart the backend to apply.")


def cmd_list() -> None:
    lines = read_env()
    names = [name_of(c) for c in codes_of(lines)]
    print(f"{DEMO_KEY}={get_value(lines, DEMO_KEY) or '(not set: off)'}")
    print(f"Codes issued to: {', '.join(names) if names else '(none)'}")


def cmd_revoke(names: list[str], revoke_all: bool) -> None:
    lines = read_env()
    codes = codes_of(lines)
    keep = [] if revoke_all else [c for c in codes if name_of(c) not in names]
    removed = len(codes) - len(keep)
    write_env(set_value(lines, CODES_KEY, ",".join(keep)))
    print(f"Revoked {removed} code(s). Restart the backend to apply.")


def cmd_public_demo(state: str) -> None:
    write_env(set_value(read_env(), DEMO_KEY, "true" if state == "on" else "false"))
    print(f"{DEMO_KEY} set to {state}. Restart the backend to apply.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="issue one new code per name")
    add.add_argument("names", nargs="+")
    sub.add_parser("list", help="show who has a code (not the codes)")
    revoke = sub.add_parser("revoke", help="remove codes by name")
    revoke.add_argument("names", nargs="*")
    revoke.add_argument("--all", action="store_true")
    demo = sub.add_parser("public-demo", help="turn public demo mode on or off")
    demo.add_argument("state", choices=["on", "off"])
    args = parser.parse_args()

    if args.cmd == "add":
        cmd_add(args.names)
    elif args.cmd == "list":
        cmd_list()
    elif args.cmd == "revoke":
        if not args.names and not args.all:
            parser.error("give names to revoke, or --all")
        cmd_revoke(args.names, args.all)
    else:
        cmd_public_demo(args.state)


if __name__ == "__main__":
    main()
