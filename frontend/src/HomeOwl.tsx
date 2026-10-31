import { useEffect, useRef, useState } from "react";

import { Mascot } from "./Mascot";
import { OWL_TIPS, reviewedLine, RUFFLED_LINE, TIP_MS, watchLine, WATCH_LINE_MS } from "./mascotState";

/**
 * The owl on the home page, and what it says: a tip when clicked, what's happening during AI
 * Review and how it went, otherwise the greeting. It stays awake in Presentation mode.
 */
export function HomeOwl({ hello, greeting, rows, progress, presentation }: {
  hello: string; greeting: string; rows: { id: string; status: string }[];
  progress?: { done: number; total: number; running: boolean; ids: string[] } | null; presentation: boolean;
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
  const [finished, setFinished] = useState<{ key: number; line: string } | null>(null);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running && progress) {
      const line = reviewedLine(rows, progress.ids);
      if (line) setFinished({ key: Date.now(), line });
    }
    wasRunning.current = running;
  }, [running, progress, rows]);
  const [showFinished, setShowFinished] = useState(false);
  useEffect(() => {
    if (!finished) return;
    setShowFinished(true);
    const timer = window.setTimeout(() => setShowFinished(false), TIP_MS);
    return () => window.clearTimeout(timer);
  }, [finished]);

  const line = running && progress ? watchLine({ done: progress.done, total: progress.total, tick })
    : tip ?? (showFinished && finished ? finished.line : greeting);
  return <Mascot size={112} cheer={finished?.key} watching={running} naps={!presentation} onPoke={onPoke} pokeLabel="Click the owl for a tip">
    <p className="home-hello">{hello}!</p>
    <p className="home-hello-line" aria-hidden={tip ? true : undefined}>{line}</p>
    <p className="sr-only" role="status">{tip}</p>
  </Mascot>;
}
