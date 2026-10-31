import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { tooltipLeft, tooltipTop } from "./tooltipPlacement";

import { ruleText, TERMS } from "./glossary";

/**
 * A term that explains itself on hover or keyboard focus (recognition rather than recall).
 * Pass a policy rule ID (e.g. "RD-3") or a glossary key (e.g. "precedent").
 */
export function Term({ rule, term, children }: { rule?: string; term?: keyof typeof TERMS; children?: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [showing, setShowing] = useState(false);
  const [spot, setSpot] = useState({ left: 0, top: 0 });
  // Placed before it paints, and again on scroll so it follows the term.
  useLayoutEffect(() => {
    if (!showing) return;
    function place() {
      if (!ref.current || !tip.current) return;
      const rect = ref.current.getBoundingClientRect();
      const size = tip.current.getBoundingClientRect();
      const root = document.documentElement;
      setSpot({ left: rect.left + tooltipLeft(rect.left, rect.width, size.width, root.clientWidth), top: tooltipTop(rect.top, rect.bottom, size.height, root.clientHeight) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [showing]);
  const text = rule ? ruleText(rule) : term ? TERMS[term] : undefined;
  const label = children ?? rule;
  if (!text) return <>{label}</>;
  return (
    <span ref={ref} className="term" tabIndex={0} aria-describedby={id}
      onFocus={() => setShowing(true)} onBlur={() => setShowing(false)} onMouseEnter={() => setShowing(true)} onMouseLeave={() => setShowing(document.activeElement === ref.current)}>
      {label}
      {/* On the page itself: a scrolling panel or an animated card can't cut it off or move it. */}
      {createPortal(<span ref={tip} role="tooltip" id={id} className={`term-tip${showing ? " is-showing" : ""}`} style={spot}>{rule ? `${rule}: ${text}` : text}</span>, document.body)}
    </span>
  );
}
