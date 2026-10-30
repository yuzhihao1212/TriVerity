import { useId, useRef, useState, type ReactNode } from "react";

import { tooltipLeft } from "./tooltipPlacement";

import { ruleText, TERMS } from "./glossary";

/**
 * A term that explains itself on hover or keyboard focus (recognition rather than recall).
 * Pass a policy rule ID (e.g. "RD-3") or a glossary key (e.g. "precedent").
 */
export function Term({ rule, term, children, contained = false }: { rule?: string; term?: keyof typeof TERMS; children?: ReactNode; contained?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [left, setLeft] = useState(0);
  function place() {
    const trigger = ref.current;
    const tip = trigger?.querySelector<HTMLElement>(".term-tip");
    if (!trigger || !tip) return;
    const rect = trigger.getBoundingClientRect();
    setLeft(tooltipLeft(rect.left, rect.width, tip.getBoundingClientRect().width, document.documentElement.clientWidth));
  }
  const text = rule ? ruleText(rule) : term ? TERMS[term] : undefined;
  const label = children ?? rule;
  if (!text) return <>{label}</>;
  return (
    <span ref={ref} className={`term${contained ? " term-contained" : ""}`} tabIndex={0} aria-describedby={id}
      onFocus={contained ? place : undefined} onMouseEnter={contained ? place : undefined}>
      {label}
      <span role="tooltip" id={id} className="term-tip" style={contained ? { left, transform: "none" } : undefined}>{rule ? `${rule}: ${text}` : text}</span>
    </span>
  );
}
