import { useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import App from "./App";
import { ConsoleIntro } from "./ConsoleIntro";
import { introPlayed, markIntroPlayed, shouldPlayIntro } from "./consoleIntroTiming";
import { Landing } from "./Landing";
import { CURTAIN_COVER_MS, readPresentationPreference, writePresentationPreference } from "./presentation";
import { applyTheme, readTheme, resolveTheme, revealTheme, THEME_EVENT, writeTheme, type Point, type Theme } from "./theme";
import { focusSection, parseRoute, type Route } from "./routes";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export default function Router() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  // Bumped on every navigation, so following a link to the case already in the URL still opens it.
  const [navigation, setNavigation] = useState(0);
  // Mount the console only on first entry; retain its saved results when the
  // presenter visits home, so returning never discards a token-paid result.
  const [consoleRoute, setConsoleRoute] = useState<Extract<Route, { page: "console" }> | null>(
    () => route.page === "console" ? route : null,
  );
  const [presentation, setPresentation] = useState(() => {
    try { return readPresentationPreference(localStorage); } catch { return false; }
  });
  useEffect(() => {
    function navigate() {
      const next = parseRoute(window.location.hash);
      setRoute(next);
      setNavigation(n => n + 1);
      if (next.page === "console") setConsoleRoute(next);
    }
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const previousRoute = useRef(route);
  useEffect(() => {
    // Keep initial keyboard focus at the document start (the skip link).
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    focusSection(route.page === "landing" ? "landing-title" : "main-content", { instant: true });
    window.scrollTo(0, 0);
  }, [route]);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(readTheme(localStorage),
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    // Until the viewer chooses, follow the system setting as it changes.
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const follow = (event: MediaQueryListEvent) => { if (!readTheme(localStorage)) setTheme(event.matches ? "dark" : "light"); };
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);
  function toggleTheme(origin: Point | null = null) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    // Inside the transition the page must be in its new theme when the callback returns; the owl
    // hears about it there too, so its reaction plays in the new theme, not the snapshot of the old.
    revealTheme(() => {
      flushSync(() => setTheme(next));
      applyTheme(next);
      window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
    }, origin);
    writeTheme(localStorage, next);
  }
  // Turning presentation mode on drops a brand curtain; the larger sizes switch on behind it.
  const [curtain, setCurtain] = useState(0);
  const curtainTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(curtainTimer.current), []);
  function togglePresentation() {
    const next = !presentation;
    const apply = () => {
      setPresentation(next);
      try { writePresentationPreference(localStorage, next); } catch { /* Storage may be blocked. */ }
    };
    if (!next || reducedMotion()) return apply();
    if (curtainTimer.current) return; // Already on its way in.
    setCurtain(count => count + 1);
    curtainTimer.current = window.setTimeout(() => { curtainTimer.current = 0; apply(); }, CURTAIN_COVER_MS);
  }
  // While presenting, every click leaves a ring where it landed, so the room sees what was pressed.
  useEffect(() => {
    if (!presentation || reducedMotion()) return;
    function pulse(event: PointerEvent) {
      if (event.button !== 0) return;
      const ring = document.createElement("span");
      ring.className = "click-pulse";
      ring.setAttribute("aria-hidden", "true");
      ring.style.left = `${event.clientX}px`;
      ring.style.top = `${event.clientY}px`;
      ring.addEventListener("animationend", () => ring.remove());
      // A paused or throttled page may never end the animation: the ring goes anyway.
      window.setTimeout(() => ring.remove(), 1000);
      document.body.append(ring);
    }
    window.addEventListener("pointerdown", pulse, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", pulse, { capture: true });
  }, [presentation]);
  // The intro lives here, not in Landing: Landing unmounts at the hand-off while
  // the overlay keeps fading over the freshly mounted console.
  const [intro, setIntro] = useState(false);
  const introActive = useRef(false);
  const introSeen = useRef(false);
  function openConsole(event: MouseEvent<HTMLAnchorElement>) {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!shouldPlayIntro(event, reducedMotion)) return; // Native link: new tab, reduced motion, etc.
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Blocked storage: memory only. */ }
    if (introSeen.current || introPlayed(storage)) return; // Once per tab: the link navigates natively.
    event.preventDefault();
    if (introActive.current) return; // One intro at a time.
    introActive.current = true;
    introSeen.current = true;
    markIntroPlayed(storage);
    setIntro(true);
  }
  function endIntro() {
    introActive.current = false;
    setIntro(false);
  }
  return <>
    {route.page === "landing" && <Landing presentation={presentation} onTogglePresentation={togglePresentation} theme={theme} onToggleTheme={toggleTheme} onOpenConsole={openConsole} />}
    {consoleRoute && <div hidden={route.page !== "console"}>
      <App active={route.page === "console"} sampleId={consoleRoute.sampleId} navigation={navigation}
        presentation={presentation} onTogglePresentation={togglePresentation} theme={theme} onToggleTheme={toggleTheme} />
    </div>}
    {intro && <ConsoleIntro onNavigate={() => { window.location.hash = "#/console"; }} onDone={endIntro} />}
    {curtain > 0 && <div key={curtain} className="presentation-curtain" aria-hidden="true" onAnimationEnd={event => { if (event.target === event.currentTarget) setCurtain(0); }}>
      <span className="presentation-curtain-mark">TriVerity<span>.</span></span>
    </div>}
  </>;
}
