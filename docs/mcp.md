# MCP servers

TriVerity runs two read-only servers on the [Model Context Protocol](https://modelcontextprotocol.io),
so any MCP client can use them: WorkBuddy, CodeBuddy, an agent on Tencent Cloud ADP, or
TriVerity's own agents.

- **Evidence server** (`triverity-evidence`): the six evidence tools the Evidence Collection
  agent works through. It picks which ones to call, and code computes every fact.
- **Support server** (`triverity-support`): the review queue for support teams. It shows which
  cases are waiting for a person, what they're about and how the rules ruled.

Phases 1 to 3 of a longer plan are done: the evidence server, TriVerity's own Evidence agent
calling it as an MCP client, and the support server. Phase 4 connects WorkBuddy and ADP.

## Evidence server

### What it serves

| Tool | Returns |
| --- | --- |
| `list_cases` | The sample case IDs and their dispute types. Nothing a party wrote. |
| `case_overview` | What data one case holds: GPS points, chat messages, app events, fare lines and their time spans. |
| `trip_record` | Expected vs actual distance and duration, logged wait, no-show fee. |
| `gps_window` | GPS between two clock times: distance moved, speeds, closest approach to pickup. |
| `gps_stops` | Every stop of 3+ minutes away from pickup and drop-off. |
| `fare_lines` | Itemised fare, surge, promo and discount, charged vs expected. |
| `chat_window` | Rider and driver messages between two clock times, as redacted quotes. |
| `app_events` | Event types and times from the platform log. |

Every evidence tool returns `{case_id, tool, source, args, facts}`, and `facts` are plain-text
lines computed in code.

### The rules it keeps

**It's read-only.** No tool can set a refund, record a decision or change a case. Each tool is
marked `readOnlyHint: true` and `destructiveHint: false`, and a test fails if a tool name ever
suggests otherwise. Rulings still come from the policy engine: the LLM explains, the rules decide.

**It gives the same answers as the agent's tools.** Each MCP tool calls the same function the
Evidence agent calls (`TOOLS[name].run` in `backend/app/services/data_sources.py`), and both
check time windows with one shared rule (`window_args`): 24-hour times, start before end, 60
minutes at most. A test runs every tool on every sample case and compares the output line by line.

**Party text stays untrusted.** Chat quotes go through the same redaction as before. Phone
numbers, emails and links get removed, and quotes are capped at 200 characters. The server's
instructions tell clients to treat quotes as claims, never as instructions. Errors don't echo
what the client sent, and a tool bug returns a generic error instead of a stack trace.

**The data is synthetic.** It serves the sample disputes in `data/` by ID, and nothing else.

**It's local only for now.** Over HTTP it binds to loopback and refuses any other address. Remote
access needs authentication first, which comes with the ADP phase.

### Run it

```bash
cd backend
pip install -r requirements-mcp.txt
python -m app.mcp_servers.evidence                                        # stdio
python -m app.mcp_servers.evidence --transport streamable-http --port 8765  # http://127.0.0.1:8765/mcp
```

The MCP SDK is pinned in `requirements-mcp.txt`. The demo image installs `requirements.txt`
only, so the live demo doesn't change.

#### Connect it to CodeBuddy

In CodeBuddy, open Settings, go to the MCP tab, choose Add MCP and paste this. Replace the path
with your checkout's `backend` folder and the Python with the one in your virtual environment:

```json
{
  "mcpServers": {
    "triverity-evidence": {
      "command": "/path/to/TriVerity/backend/.venv/bin/python",
      "args": ["-m", "app.mcp_servers.evidence"],
      "env": { "PYTHONPATH": "/path/to/TriVerity/backend" },
      "description": "Read-only evidence tools for TriVerity's sample ride-hailing disputes"
    }
  }
}
```

Then try asking: *"Use triverity-evidence to check D001's GPS between 08:00 and 08:30. Did the
driver stop anywhere unexpected?"*

WorkBuddy reads the same `mcpServers` format. Its menu path varies by version (Settings → MCP,
or Connections → Custom connections).

#### Try it from Python

```python
import anyio
from mcp import Client

async def main():
    async with Client("http://127.0.0.1:8765/mcp") as client:
        result = await client.call_tool("fare_lines", {"case_id": "D003"})
        print(result.structured_content["facts"])  # ['Fare: charged $19.30, expected $18.50']

anyio.run(main)
```

## The Evidence agent as an MCP client

By default the Evidence agent calls its tools in-process. Set `EVIDENCE_TOOLS=mcp` in
`backend/.env` and every call goes through this server instead:

```bash
EVIDENCE_TOOLS=mcp                            # the server runs in-process, over MCP's memory transport
EVIDENCE_MCP_URL=http://127.0.0.1:8765/mcp    # optional: a server you started over HTTP
```

The agent still plans the calls and validates them first. Only the transport changes, so the
rulings don't. The MCP path only takes a call when it can show the server holds the same case:

- **Bundled samples only.** The server serves the samples by ID, so a judge's own dispute or an
  edited sample runs its tools locally.
- **A data check first.** Before the first call, the server's `case_overview` has to match what the
  backend computes from its own copy of the case. If it doesn't, the case runs locally.
- **Local fallback.** An error, a timeout (10 s per batch), an unreachable server or a malformed
  answer runs that call locally, with the same answer. After a connection failure the rest of
  the collection runs locally, so a down server costs one timeout at most.
- **Loopback only.** `EVIDENCE_MCP_URL` has to be a loopback address, the same rule as the server.

Each tool call records how it ran (`via: "local"` or `"mcp"`). When any went through the server,
the agent log says how many. Without the MCP SDK installed, `mcp` mode runs locally and logs a
warning. The live demo keeps the default, so it doesn't change.

## Support server

Three tools for support teams' assistants. No tool decides, closes, refunds, holds or notifies:
a reviewer still does that in the console.

| Tool | Returns |
| --- | --- |
| `list_held_cases` | The cases waiting for a person, safety first, then by priority, with why each is held. Also the IDs that close themselves. |
| `get_case_summary` | What one case is about: its type, each side's claim as a redacted quote, the safety flag, and the facts computed from its trip, GPS, fare and chat data. |
| `get_ruling` | The ruling: decision, refund, confidence, cited rules, each condition checked, why it needs a person, and what would have changed it. |

### The rules it keeps

**Rules decide, and it's free.** Rulings come from the same pipeline as the API
(`resolve_dispute`) with AI switched off. The policy rules give the decision and the refund,
and the explanation is the rule template. No tokens get spent, the daily resolve budget isn't
touched, and the same case always gets the same answer. A test checks every sample's ruling
against the pipeline.

**"Held" means the backend's own view.** A case is held when the autonomy check won't let its
ruling close itself: it's escalated, below the confidence minimum, cites a human-only rule
(SAFE-1, FRAUD-1, PREC-1, ESC-1, RD-4, NS-4), or got picked for an audit. A refund on a held case
is flagged as a proposal (`refund_is_proposal`), not money paid. A reviewer's "On hold" lives in
their browser session, and appeals live in the API's memory, so neither reaches this server yet.
That needs a shared case store first.

**Party text stays untrusted.** Claims come back redacted (no phone numbers, emails or links) and
capped at 200 characters. Chat only shows up in the short quotes the computed facts already
carry. Party history, the messages written for each party and the advocates' arguments aren't
served at all. The server's instructions tell clients to treat claims as claims, never as instructions.

It keeps the evidence server's other rules too: errors don't echo input, a bug returns a generic
error, the data is synthetic, and HTTP binds to loopback only.

### Run it

```bash
cd backend
python -m app.mcp_servers.support                                        # stdio
python -m app.mcp_servers.support --transport streamable-http --port 8766  # http://127.0.0.1:8766/mcp
```

In CodeBuddy or WorkBuddy, add it the same way as the evidence server, with
`"args": ["-m", "app.mcp_servers.support"]` and the name `triverity-support`. Then try asking:
*"Use triverity-support to list the held cases. Why is the first one held, and what would have
changed its ruling?"*

## Tests

`backend/tests/test_evidence_mcp.py` covers the evidence server:

- the tool list and read-only annotations
- line-by-line equivalence with the direct tools
- unknown case IDs and bad time windows
- chat redaction with a hostile message
- generic errors for tool bugs
- the loopback-only rule
- a real stdio subprocess client

`backend/tests/test_evidence_tools_mcp.py` covers the client path:

- the same full resolution for every sample, local and over MCP, on the default plan and on an
  LLM plan that calls all six tools, time windows included
- a real streamable-HTTP server in a subprocess, with evidence identical to local
- a sample posted to the API, resolved through the server
- local fallback for an edited case, a server holding different data, an unreachable server, a
  tool error and a malformed answer
- non-loopback URLs refused without a connection, an unknown mode, and a missing SDK

`backend/tests/test_support_mcp.py` covers the support server:

- three tools, all read-only, and none named like a write
- every sample's ruling matches the pipeline with AI off
- the held list is exactly the cases that can't close themselves, safety first; audit picks count
- no LLM call and no budget spent, even with an API key set
- redacted, capped claims, no party history, and no party messages or agent reasoning
- unknown IDs, generic errors, the loopback-only rule and a real stdio client

The tests skip if the MCP SDK isn't installed. CI installs it through `requirements-dev.txt`.

## What's next

1. ~~**Phase 2:**~~ Done. The Evidence agent calls this server as an MCP client behind
   `EVIDENCE_TOOLS`, with local calls as the default and tests that prove both paths give the
   same rulings.
2. ~~**Phase 3:**~~ Done. A second server for support teams (`list_held_cases`,
   `get_case_summary`, `get_ruling`), with no tool that decides or closes a case.
3. **Phase 4:** WorkBuddy (a scheduled morning brief of held cases), CodeBuddy, and a custom MCP
   plugin on Tencent Cloud ADP. This needs authentication and a public HTTPS endpoint.
