import { useEffect, useRef, useState } from "react";

import { caseReport, reportFileTitle, type CaseReportInput } from "./caseReport";
import { Icon } from "./Icon";
import { money, titleCase } from "./presentation";

/** The same semantic document is read on screen and printed by the browser. */
export function CaseReport({ onBack, ...input }: CaseReportInput & { onBack: () => void }) {
  const report = caseReport(input);
  const heading = useRef<HTMLHeadingElement>(null);
  const [generated] = useState(() => new Date());
  useEffect(() => {
    const previous = document.title;
    document.title = reportFileTitle(report.id);
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    return () => { document.title = previous; };
  }, [report.id]);

  return <article className="case-report" aria-labelledby="case-report-title">
    <div className="case-report-actions">
      <button type="button" className="secondary-button" onClick={onBack}>{titleCase("Back to case")}</button>
      <button type="button" className="run-button" onClick={() => window.print()}><Icon name="printer" />{titleCase("Save as PDF")}</button>
    </div>
    <header className="case-report-header">
      <p className="case-report-internal"><Icon name="lock" />Internal: includes reviewer-only signals. Do not share with the rider or driver.</p>
      <h1 ref={heading} tabIndex={-1} id="case-report-title">{report.title}</h1>
      <p className="case-report-meta">Review {report.reviewNumber} · Generated <time dateTime={generated.toISOString()}>{generated.toLocaleString()}</time> · Raised {report.raised
        ? <time dateTime={report.raised}>{report.raised}</time> : "not recorded"}</p>
      <div className={`case-report-status${report.status.final ? " is-final" : ""}`} role="status">
        <strong><Icon name={report.status.final ? "check" : "warning"} />{report.status.label}</strong>
        <p>{report.status.note}</p>
      </div>
    </header>

    <section aria-labelledby="case-report-outcome">
      <h2 id="case-report-outcome">{titleCase("Outcome")}</h2>
      <p>{report.ruling.brief.reason}</p>
      <dl className="case-report-values">
        <div><dt>{titleCase("Policy outcome")}</dt><dd>{report.ruling.outcome}</dd></div>
        <div><dt>{titleCase("Recommended action")}</dt><dd>{report.ruling.action}</dd></div>
        <div><dt>{titleCase("Confidence")}</dt><dd>{report.ruling.confidence.percent}%. {report.ruling.confidence.caption}</dd></div>
        {report.ruling.brief.missing && <div><dt>{titleCase("Missing data")}</dt><dd>{report.ruling.brief.missing.fact}</dd></div>}
        {report.ruling.brief.proposed && <div><dt>{titleCase("Proposed action")}</dt><dd>{report.ruling.brief.proposed}</dd></div>}
      </dl>
      {report.reviewer && <>
        <h3>{titleCase("Reviewer action")}</h3>
        <dl className="case-report-values">
          <div><dt>{titleCase("Action")}</dt><dd>{report.reviewer.action}</dd></div>
          <div><dt>{titleCase("Outcome")}</dt><dd>{report.reviewer.outcome}</dd></div>
          {report.reviewer.reason && <div><dt>{titleCase("Reason")}</dt><dd>{report.reviewer.reason}</dd></div>}
          {report.reviewer.at && <div><dt>{titleCase("Time")}</dt><dd>{report.reviewer.at}</dd></div>}
          {report.reviewer.precedentId && <div><dt>{titleCase("Saved precedent")}</dt><dd>{report.reviewer.precedentId}</dd></div>}
        </dl>
      </>}
      {report.hold && <>
        <h3>{titleCase("On hold")}</h3>
        <dl className="case-report-values">
          <div><dt>{titleCase("Waiting for")}</dt><dd>{report.hold.why}</dd></div>
          <div><dt>{titleCase("Reason")}</dt><dd>{report.hold.reason}</dd></div>
          <div><dt>{titleCase("Time")}</dt><dd>{report.hold.at}</dd></div>
          {report.hold.amount != null && <div><dt>{titleCase("Amount awaiting approval")}</dt><dd>{money(report.hold.amount)}</dd></div>}
        </dl>
      </>}
    </section>

    <section aria-labelledby="case-report-claims">
      <h2 id="case-report-claims">{titleCase("What each side said")}</h2>
      <h3>{titleCase("Rider's claim")}</h3><p>{report.claims.rider}</p>
      <h3>{titleCase("Driver's statement")}</h3><p>{report.claims.driver}</p>
    </section>

    {report.rules && <section aria-labelledby="case-report-rules">
      <h2 id="case-report-rules">{titleCase("Rules")}: {report.rules.policy}</h2>
      <table className="case-report-rules"><caption className="sr-only">Rules checked on this case</caption>
        <thead><tr><th scope="col">{titleCase("Rule")}</th><th scope="col">{titleCase("What it requires")}</th><th scope="col">{titleCase("On this case")}</th></tr></thead>
        <tbody>{report.rules.rows.map(row => <tr key={row.rule}><th scope="row">{row.rule}</th><td>{row.text}</td><td>{row.result}</td></tr>)}</tbody>
      </table>
      {report.rules.note && <p>{report.rules.note}</p>}
      {report.rules.otherChecks && <p>{report.rules.otherChecks}</p>}
    </section>}

    <section aria-labelledby="case-report-evidence">
      <h2 id="case-report-evidence">{titleCase("Evidence")}</h2>
      {report.facts.length ? <table className="case-report-evidence"><caption className="sr-only">Recorded evidence, ordered by fact ID</caption>
        <thead><tr><th scope="col">{titleCase("Source")}</th><th scope="col">{titleCase("Fact")}</th></tr></thead>
        <tbody>{report.facts.map(fact => <tr key={fact.id}><th scope="row">{fact.source}<span className="case-report-fact-id">{fact.id}</span></th><td>{fact.text}</td></tr>)}</tbody>
      </table> : <p>No fact IDs recorded in this result.</p>}
    </section>

    <section aria-labelledby="case-report-arguments">
      <h2 id="case-report-arguments">{titleCase("Arguments")}</h2>
      <p>Written for each side. They do not decide the outcome: the rules do.</p>
      {report.arguments.map(item => <div key={item.party}>
        <h3>{item.party} {titleCase("argument")}</h3>
        <p className="case-report-author">Written by: {item.argument.author}</p><p>{item.argument.text ?? "No argument recorded."}</p>
        <h3>{item.party} {titleCase("reply")}</h3>
        <p className="case-report-author">Written by: {item.reply.author}</p><p>{item.reply.text ?? "No reply recorded."}</p>
      </div>)}
      <h3>{titleCase("Judge's explanation")}</h3>
      <p className="case-report-author">Written by: {report.explanation.author}</p><p>{report.explanation.text ?? "No explanation recorded."}</p>
    </section>

    {(report.signals.length > 0 || report.precedents.length > 0) && <section aria-labelledby="case-report-reviewer">
      <h2 id="case-report-reviewer">{titleCase("Reviewer only")}</h2>
      {report.signals.length > 0 && <>
        <h3>{titleCase("Risk signals")}</h3>
        <p>A signal isn't proof. It's a reason to look closer.</p>
        <ul>{report.signals.map((signal, index) => <li key={index}>{signal}</li>)}</ul>
      </>}
      {report.precedents.length > 0 && <>
        <h3>{titleCase("Similar cases")}</h3>
        <table><caption className="sr-only">Similar cases and their outcomes</caption>
          <thead><tr><th scope="col">{titleCase("Case")}</th><th scope="col">{titleCase("What happened")}</th><th scope="col">{titleCase("Outcome")}</th><th scope="col">{titleCase("Similarity")}</th></tr></thead>
          <tbody>{report.precedents.map(item => <tr key={item.id}><th scope="row">{item.id}</th><td>{item.summary}</td><td>{item.outcome}<span className="case-report-fact-id">{item.decidedBy}</span></td><td>{item.similarity}</td></tr>)}</tbody>
        </table>
      </>}
    </section>}

    {report.messages && <section aria-labelledby="case-report-messages">
      <h2 id="case-report-messages">{titleCase("Messages sent")}</h2>
      <p>Sent at {report.messages.at}. Delivery is simulated.</p>
      {(["rider", "driver"] as const).map(party => <div key={party}>
        <h3>{titleCase(`Message to the ${party}`)}</h3><p>{report.messages!.messages[party]}</p>
        {report.messages!.notes[party] && <><p className="case-report-author">Reviewer note:</p><p>{report.messages!.notes[party]}</p></>}
      </div>)}
    </section>}

    <section aria-labelledby="case-report-sources">
      <h2 id="case-report-sources">{titleCase("How AI was used")}</h2>
      <p>Fixed rules decided the outcome. AI only wrote the text marked Hy3 below.</p>
      <table><caption className="sr-only">Sources of the report's arguments and explanation</caption>
        <thead><tr><th scope="col">{titleCase("Step")}</th><th scope="col">{titleCase("Who wrote it")}</th></tr></thead>
        <tbody>{report.sources.map(source => <tr key={source.step}><th scope="row">{source.step}</th><td>{source.author}</td></tr>)}</tbody>
      </table>
    </section>
    <footer>TriVerity prototype. Delivery to the rider and driver is simulated.</footer>
  </article>;
}
