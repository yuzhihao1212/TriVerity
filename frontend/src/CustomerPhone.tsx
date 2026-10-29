import { useEffect, useId, useRef, useState } from "react";

import { AppealForm } from "./Appeals";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { CUSTOMER_COPY as COPY } from "./customerCopy";
import { createFeedbackStore, customerName, customerResult, ratingIndex } from "./customerState";
import { NOTE_LIMIT, type FinalOutcome, type Party } from "./notifyState";
import type { Appeal, DisputeCase } from "./types";

let feedbackStore: ReturnType<typeof createFeedbackStore> | null = null;
function feedbackRecords() {
  if (!feedbackStore) {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Use memory for this session. */ }
    feedbackStore = createFeedbackStore(storage);
  }
  return feedbackStore;
}

type Screen = "main" | "info" | "rate" | "thanks";
const MOODS = ["mood-cry", "mood-sad", "mood-neutral", "mood-smile", "mood-happy"];

export function CustomerPhone({ party, outcome, message, note, live, deliveredAt, dispute, existing, onAppealed, appealsAvailable, name }: {
  party: Party; outcome: FinalOutcome; message: string; note: string; live: boolean; deliveredAt?: string;
  dispute: DisputeCase; existing: Appeal | null; onAppealed: (appeal: Appeal) => void; appealsAvailable: boolean; name?: string | null;
}) {
  const id = useId();
  const feedbackKey = `${dispute.dispute_id}.${party}`;
  const [feedback, setFeedback] = useState(() => feedbackRecords().get(feedbackKey));
  const [rating, setRating] = useState<number | null>(feedback?.rating ?? null);
  const [comment, setComment] = useState(feedback?.comment ?? "");
  const [error, setError] = useState(false);
  const [screen, setScreen] = useState<Screen>("main");
  const [backwards, setBackwards] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const previousScreen = useRef(screen);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const who = customerName(name);
  const result = customerResult(party, outcome);
  useEffect(() => {
    if (previousScreen.current !== screen) {
      if (screen === "main") more.current?.focus();
      else heading.current?.focus();
      previousScreen.current = screen;
    }
  }, [screen]);
  function go(next: Screen) {
    setBackwards(next === "main" || (screen === "rate" && next === "info"));
    setScreen(next);
  }
  function saveFeedback() {
    if (rating == null) { setError(true); radios.current[0]?.focus(); return; }
    const value = { rating, comment: comment.trim().slice(0, NOTE_LIMIT) };
    feedbackRecords().set(feedbackKey, value);
    setFeedback(value);
    go("thanks");
  }
  return <figure className={`phone-wrap ${live ? "delivered" : "preview"}`}>
    <figcaption className="section-label">{COPY.region(party)} <span className="phone-tag">{live ? `Delivered ${deliveredAt ?? ""}` : "Preview"}</span></figcaption>
    <div className="phone customer-phone" role="region" aria-label={COPY.region(party)}>
      <div className="phone-bar" aria-hidden="true"><span>9:41</span><span className="phone-notch" /><span>●●●</span></div>
      <div className={`phone-page${backwards ? " backwards" : ""}`} key={screen}>
        <div className="phone-top">
          {screen === "info" || screen === "rate"
            ? <button type="button" className="phone-back" onClick={() => go(screen === "rate" ? "info" : "main")}>{COPY.back}</button>
            : <span className="phone-brand">{COPY.app}</span>}
          <span className="phone-case">{COPY.caseTag(dispute.dispute_id)}</span>
        </div>
        {screen === "main" && <>
          <div className="phone-result">
            <span className="phone-status-icon"><Icon name={result.icon} /></span>
            <Chip tone="neutral" size="sm">{result.status}</Chip>
            <p className="phone-greeting">{COPY.greeting(who)}</p>
            <h3>{result.line}</h3>
            <div className="phone-next-lines">{result.next.map(line => <p key={line}><Icon name="info" /><span>{line}</span></p>)}</div>
          </div>
          {note && <div className="phone-note"><p className="phone-note-label">{COPY.note}</p><p className="phone-note-text">{note}</p></div>}
          <button type="button" className="phone-more" ref={more} onClick={() => go("info")}>{COPY.more}</button>
          <p className="phone-footer">{COPY.footer}</p>
        </>}
        {screen === "info" && <>
          <h3 ref={heading} tabIndex={-1}>{COPY.message}</h3>
          <p className="phone-generated">{message}</p>
          <div className="phone-actions">
            <button type="button" className="secondary-button" aria-disabled={!live} aria-describedby={!live ? `${id}-locked` : undefined}
              onClick={() => { if (live) go(feedback ? "thanks" : "rate"); }}>
              {!live && <Icon name="lock" />}{COPY.rate}</button>
            {!live ? <>
              <button type="button" className="secondary-button" aria-disabled="true" aria-describedby={`${id}-locked`}><Icon name="lock" />{COPY.appeal}</button>
              <p className="phone-caption" id={`${id}-locked`}>{COPY.locked(party)}</p>
            </> : appealsAvailable && outcome.decision !== "needs_review" && <>
              <AppealForm dispute={dispute} party={party} decision={outcome.decision} onFiled={onAppealed} existing={existing} buttonLabel={COPY.appeal} />
              <p className="phone-caption">{COPY.appealWindow}</p>
            </>}
          </div>
        </>}
        {screen === "rate" && <>
          <h3 ref={heading} tabIndex={-1} className="phone-feedback-title">{COPY.feedback.title}</h3>
          <div className="feedback-faces" role="radiogroup" aria-label={COPY.feedback.group}>
            {COPY.feedback.ratings.map((label, index) => <div className="feedback-choice" key={label}>
              <button type="button" className="feedback-face" role="radio" aria-label={label} aria-checked={rating === index}
                tabIndex={(rating ?? 0) === index ? 0 : -1} ref={element => { radios.current[index] = element; }}
                onClick={() => { setRating(index); setError(false); }}
                onKeyDown={event => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next = ratingIndex(index, event.key)!;
                  setRating(next); setError(false); radios.current[next]?.focus();
                }}><Icon name={MOODS[index]} /></button>
              <span className="feedback-face-label" aria-hidden="true">{rating === index ? label : ""}</span>
            </div>)}
          </div>
          <label className="phone-comment-label" htmlFor={`${id}-comment`}>{COPY.feedback.comment}</label>
          <textarea id={`${id}-comment`} className="phone-comment" rows={3} maxLength={NOTE_LIMIT} value={comment}
            placeholder={COPY.feedback.placeholder} onChange={event => setComment(event.target.value.slice(0, NOTE_LIMIT))} />
          <p className="phone-caption">{COPY.feedback.simulated}</p>
          <div role="alert">{error && <p className="phone-caption error-text">{COPY.feedback.pick}</p>}</div>
          <div className="phone-actions"><button type="button" className="run-button" onClick={saveFeedback}>{COPY.feedback.send} <span>{COPY.feedback.simulatedTag}</span></button></div>
        </>}
        {screen === "thanks" && feedback && <>
          <span className="phone-status-icon phone-thanks"><Icon name="check" /></span>
          <h3 ref={heading} tabIndex={-1} className="phone-feedback-title">{COPY.feedback.thanks(who)}</h3>
          <p className="phone-caption">{COPY.feedback.saved}</p>
          <div className="phone-rating-summary"><Chip tone="neutral">{COPY.feedback.rated(COPY.feedback.ratings[feedback.rating])}</Chip></div>
          <p className="phone-caption">{COPY.feedback.simulated}</p>
          <div className="phone-actions">
            <button type="button" className="secondary-button" onClick={() => { setRating(feedback.rating); setComment(feedback.comment); setError(false); go("rate"); }}>{COPY.feedback.change}</button>
            <button type="button" className="secondary-button" onClick={() => go("main")}>{COPY.feedback.back}</button>
          </div>
        </>}
      </div>
    </div>
  </figure>;
}
