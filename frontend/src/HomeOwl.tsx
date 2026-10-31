import { useEffect, useRef, useState } from "react";

import { GUIDE_STEPS, type HomeGuide } from "./firstVisitGuide";
import { Mascot } from "./Mascot";
import { ARRIVAL, arrivalDelay, OWL_TIPS, reviewedLine, RUFFLED_LINE, THEME_LINES, TIP_MS, typedLength, watchLine, WATCH_LINE_MS } from "./mascotState";
import { THEME_EVENT, type Theme } from "./theme";

/**
 * The owl on the home page, and what it says: a tip when clicked, what's happening during AI
 * Review and how it went, otherwise the greeting. Below that, on a first visit, the guide's next step.
 * It stays awake in Presentation mode. With `arrive` (once per tab) it flies in and its line types itself out.
 */
export function HomeOwl({ hello, greeting, rows, progress, presentation, guide, onSkipGuide, arrive = false }: {
  hello: string; greeting: string; rows: { id: string; status: string }[];
  progress?: { done: number; total: number; running: boolean; ids: string[] } | null; presentation: boolean;
  guide?: HomeGuide | null; onSkipGuide?: () => void; arrive?: boolean;
}) {
  // Wait for the landing page's intro, if it is still fading over the console.
  const [entrance] = useState(() => arrive ? { delay: arrivalDelay(!!document.querySelector(".console-intro")) } : null);
  const [typedAt, setTypedAt] = useState<number | null>(() => entrance ? 0 : null);
  const stopTyping = useRef(() => {});
  useEffect(() => {
    if (!entrance) return;
    let timer = 0;
    const start = window.setTimeout(() => {
      const began = performance.now();
      timer = window.setInterval(() => setTypedAt(performance.now() - began), 30);
    }, entrance.delay + ARRIVAL.type);
    stopTyping.current = () => { window.clearTimeout(start); window.clearInterval(timer); };
    return () => stopTyping.current();
  }, [entrance]);
  // Typed out, or skipped: the whole line, from then on.
  function arrived() { stopTyping.current(); setTypedAt(null); }
  const running = !!progress?.running;
  const [tip, setTip] = useState<string | null>(null);
  const nextTip = useRef(Math.floor(Math.random() * OWL_TIPS.length));
  const tipTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);
  function showTip(text: string) {
    setTip(text);
    window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setTip(null), TIP_MS);
  }
  // A theme switch gets a line, unless a run is out (then the owl is reporting on it).
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    const say = (event: Event) => { if (!runningRef.current) showTip(THEME_LINES[(event as CustomEvent<Theme>).detail]); };
    window.addEventListener(THEME_EVENT, say);
    return () => window.removeEventListener(THEME_EVENT, say);
  }, []);
  function onPoke(ruffled: boolean) {
    if (running) return;
    if (ruffled) return showTip(RUFFLED_LINE);
    showTip(OWL_TIPS[nextTip.current % OWL_TIPS.length]);
    nextTip.current += 1;
  }

  // The line changes every few seconds while the batch is out, since it has no count to show yet.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    setTip(null);
    setTick(0);
    const timer = window.setInterval(() => setTick(count => count + 1), WATCH_LINE_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  // When a run finishes here: a cheer, and how it went for as long as a tip would stay.
  const [finished, setFinished] = useState<{ key: number; ids: string[] } | null>(null);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running && progress) setFinished({ key: Date.now(), ids: progress.ids });
    wasRunning.current = running;
  }, [running, progress]);
  const [showFinished, setShowFinished] = useState(false);
  useEffect(() => {
    if (!finished) return;
    setShowFinished(true);
    const timer = window.setTimeout(() => setShowFinished(false), TIP_MS);
    return () => window.clearTimeout(timer);
  }, [finished]);

  // Read from the rows each time: routine cases close themselves just after the run ends.
  const finishedLine = showFinished && finished ? reviewedLine(rows, finished.ids) : null;
  const line = running && progress ? watchLine({ done: progress.done, total: progress.total, tick })
    : tip ?? finishedLine ?? greeting;
  // While it types, the rest of the line holds its space (so the bubble never grows), and screen readers get it whole.
  const typed = typedAt === null ? null : typedLength(line, typedAt);
  const typedAll = typed !== null && typed >= line.length;
  useEffect(() => { if (typedAll) arrived(); }, [typedAll]);
  return <Mascot size={112} cheer={finished?.key} watching={running} naps={!presentation} onPoke={onPoke} pokeLabel="Click the owl for a tip"
    entrance={entrance} onArrived={arrived}>
    <p className="home-hello">{hello}!</p>
    {typed === null
      ? <p className="home-hello-line" aria-hidden={tip ? true : undefined}>{line}</p>
      : <p className="home-hello-line"><span aria-hidden="true">{line.slice(0, typed)}<span className="home-hello-rest">{line.slice(typed)}</span></span><span className="sr-only">{line}</span></p>}
    <p className="sr-only" role="status">{tip}</p>
    {guide && <p className="owl-guide" role="status"><strong>Step {guide.step} of {GUIDE_STEPS}.</strong> {guide.text} <button type="button" className="text-button" onClick={onSkipGuide}>Skip</button></p>}
  </Mascot>;
}
