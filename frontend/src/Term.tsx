import { useId, type ReactNode } from "react";

import { ruleText, TERMS } from "./glossary";

/**
 * A term that explains itself on hover or keyboard focus (recognition rather than recall).
 * Pass a policy rule ID (e.g. "RD-3") or a glossary key (e.g. "precedent").
 */
export function Term({ rule, term, children }: { rule?: string; term?: keyof typeof TERMS; children?: ReactNode }) {
  const id = useId();
  const text = rule ? ruleText(rule) : term ? TERMS[term] : undefined;
  const label = children ?? rule;
  if (!text) return <>{label}</>;
  return (
    <span className="term" tabIndex={0} aria-describedby={id}>
      {label}
      <span role="tooltip" id={id} className="term-tip">{rule ? `${rule}: ${text}` : text}</span>
    </span>
  );
}
