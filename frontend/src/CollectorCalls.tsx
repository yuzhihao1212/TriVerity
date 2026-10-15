import { SourceBadge } from "./Debate";
import { callsByRound } from "./progress";
import type { Resolution } from "./types";

export function CollectorCalls({ collection }: { collection?: Resolution["evidence_collection"] }) {
  if (!collection?.calls?.length) return null;
  return <section className="card collector-calls" aria-labelledby="collector-calls-title">
    <div className="card-head"><h2 id="collector-calls-title">What the evidence collector looked up</h2><SourceBadge source={collection.source} /></div>
    {callsByRound(collection.calls).map(({ round, calls }) => <section className="collector-round" key={round}>
      <h3>Round {round}</h3>
      <ol className="collector-call-list">{calls.map((call, index) => <li key={index}>
        <div className="card-head"><h4><code>{call.tool}</code></h4>{call.party && <span className="tag">{call.party === "rider" ? "Rider" : "Driver"}</span>}</div>
        {Object.keys(call.args).length > 0 && <dl className="collector-args">{Object.entries(call.args).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>}
        <p className="small"><strong>Reason:</strong> {call.reason || "No reason recorded."}</p>
        {call.results.length > 0 ? <ul className="small">{call.results.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="small muted">No result lines returned.</p>}
      </li>)}</ol>
    </section>)}
  </section>;
}
