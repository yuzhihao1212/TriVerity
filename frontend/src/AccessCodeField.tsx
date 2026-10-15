import { forwardRef, useId } from "react";

import { ACCESS_CODE_HELP } from "./consoleHeader";

/** The judge access code, shown only where it is used: own disputes (run panel and new-dispute form). */
export const AccessCodeField = forwardRef<HTMLInputElement, {
  value: string; onChange: (value: string) => void; id?: string; optional?: boolean;
}>(function AccessCodeField({ value, onChange, id, optional = false }, ref) {
  const fallback = useId();
  const inputId = id ?? fallback;
  return (
    <div className="access-code-field">
      <label htmlFor={inputId}>Judge access code{optional && <span className="muted"> (optional)</span>}</label>
      <input ref={ref} id={inputId} type="password" autoComplete="off" spellCheck={false}
        value={value} onChange={event => onChange(event.target.value)} aria-describedby={`${inputId}-help`} />
      <p id={`${inputId}-help`} className="access-code-help">{ACCESS_CODE_HELP}</p>
    </div>
  );
});
