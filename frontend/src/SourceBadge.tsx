import { Chip } from "./Chip";
import { sourceTone } from "./chipStyle";
import { AI_TOOLTIP, FALLBACK_TOOLTIP, RULES_TOOLTIP } from "./stepVisuals";
import hunyuanMark from "./assets/logos/hunyuan-mark.webp";

/** The Hunyuan mark: only ever beside text Tencent Hy3 actually wrote. Decorative; "AI" carries the meaning. */
export function HunyuanMark() {
  return <img className="source-logo" src={hunyuanMark} alt="" width={14} height={14} />;
}

/**
 * The one source badge: AI (Hunyuan mark, blue), Rules (function icon, grey) or Fallback (grey,
 * no logo). `explain` also gives screen readers the tooltip sentence.
 */
export function SourceBadge({ source, explain = false }: { source: "llm" | "fallback" | "code"; explain?: boolean }) {
  const tip = source === "llm" ? AI_TOOLTIP : source === "code" ? RULES_TOOLTIP : FALLBACK_TOOLTIP;
  return <Chip size="sm" tone={sourceTone(source)} icon={source === "code" ? "function" : undefined} className="source-badge has-tooltip" title={tip}>
    {source === "llm" && <HunyuanMark />}
    {source === "llm" ? "AI" : source === "code" ? "Rules" : "Fallback"}
    {explain && <span className="sr-only">: {tip}</span>}
  </Chip>;
}
