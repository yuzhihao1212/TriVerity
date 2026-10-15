import { useEffect, useRef, useState } from "react";
import App from "./App";
import { Landing } from "./Landing";
import { readPresentationPreference, writePresentationPreference } from "./presentation";
import { applyTheme, readTheme, resolveTheme, writeTheme, type Theme } from "./theme";
import { focusSection, parseRoute, type Route } from "./routes";

export default function Router() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
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
    focusSection(route.page === "landing" ? "landing-title" : "main-content");
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
  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeTheme(localStorage, next);
  }
  function togglePresentation() {
    const next = !presentation;
    setPresentation(next);
    try { writePresentationPreference(localStorage, next); } catch { /* Storage may be blocked. */ }
  }
  return <>
    {route.page === "landing" && <Landing presentation={presentation} onTogglePresentation={togglePresentation} theme={theme} onToggleTheme={toggleTheme} />}
    {consoleRoute && <div hidden={route.page !== "console"}>
      <App active={route.page === "console"} sampleId={consoleRoute.sampleId}
        presentation={presentation} onTogglePresentation={togglePresentation} theme={theme} onToggleTheme={toggleTheme} />
    </div>}
  </>;
}
