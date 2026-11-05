# Evidence MCP server

TriVerity's Evidence Collection agent already works through a small catalogue of tools. It
picks which ones to call, and code computes every fact. This server puts those same six tools
behind the [Model Context Protocol](https://modelcontextprotocol.io), so any MCP client can use
them: WorkBuddy, CodeBuddy, an agent on Tencent Cloud ADP, or TriVerity's own agents.

It's phase 1 of a longer plan. Phase 2 points the Evidence agent at this server, and later phases
connect WorkBuddy and ADP.

## What it serves

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

## The rules it keeps

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

## Run it

```bash
cd backend
pip install -r requirements-mcp.txt
python -m app.mcp_servers.evidence                                        # stdio
python -m app.mcp_servers.evidence --transport streamable-http --port 8765  # http://127.0.0.1:8765/mcp
```

The MCP SDK is pinned in `requirements-mcp.txt`. The demo image installs `requirements.txt`
only, so the live demo doesn't change.

### Connect it to CodeBuddy

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

### Try it from Python

```python
import anyio
from mcp import Client

async def main():
    async with Client("http://127.0.0.1:8765/mcp") as client:
        result = await client.call_tool("fare_lines", {"case_id": "D003"})
        print(result.structured_content["facts"])  # ['Fare: charged $19.30, expected $18.50']

anyio.run(main)
```

## Tests

`backend/tests/test_evidence_mcp.py` covers:

- the tool list and read-only annotations
- line-by-line equivalence with the direct tools
- unknown case IDs and bad time windows
- chat redaction with a hostile message
- generic errors for tool bugs
- the loopback-only rule
- a real stdio subprocess client

The tests skip if the MCP SDK isn't installed.

## What's next

1. **Phase 2:** the Evidence agent calls this server as an MCP client behind a setting, with local
   calls as the default and a test that proves both paths give the same rulings.
2. **Phase 3:** a second server for support teams (`list_held_cases`, `get_case_summary`,
   `get_ruling`), still with no tool that decides or closes a case.
3. **Phase 4:** WorkBuddy (a scheduled morning brief of held cases), CodeBuddy, and a custom MCP
   plugin on Tencent Cloud ADP. This needs authentication and a public HTTPS endpoint.
