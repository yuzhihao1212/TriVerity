import { useEffect, useRef, useState } from "react";

import { GUIDE_STEPS, type HomeGuide } from "./firstVisitGuide";
import { Mascot } from "./Mascot";
import { OWL_TIPS, reviewedLine, RUFFLED_LINE, TIP_MS, watchLine, WATCH_LINE_MS } from "./mascotState";

/**
 * The owl on the home page, and what it says: a tip when clicked, what's happening during AI
 * Review and how it went, otherwise the greeting. Below that, on a first visit, the guide's next step.
 * It stays awake in Presentation mode.
 */
export function HomeOwl({ hello, greeting, rows, progress, presentation, guide, onSkipGuide }: {
  hello: string; greeting: string; rows: { id: string; status: string }[];
  progress?: { done: number; total: number; running: boolean; ids: string[] } | null; presentation: boolean;
  guide?: HomeGuide | null; onSkipGuide?: () => void;
}) {
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
  return <Mascot size={112} cheer={finished?.key} watching={running} naps={!presentation} onPoke={onPoke} pokeLabel="Click the owl for a tip">
    <p className="home-hello">{hello}!</p>
    <p className="home-hello-line" aria-hidden={tip ? true : undefined}>{line}</p>
    <p className="sr-only" role="status">{tip}</p>
    {guide && <p className="owl-guide" role="status"><strong>Step {guide.step} of {GUIDE_STEPS}.</strong> {guide.text} <button type="button" className="text-button" onClick={onSkipGuide}>Skip</button></p>}
  </Mascot>;
}
