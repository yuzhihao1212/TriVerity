// The one chip system: class names for <Chip> (Chip.tsx) and anything that must be a chip
// without being a <span> (the filter chip <button>, the tool chips' <summary>). No imports,
// so tests can load it directly.
//
//   neutral  amounts, IDs, types            ok      refunds, completed
//   warn     escalated, fallback, deviations danger  threats, high risk
//   brand    selected filter                outline secondary info (tool chips)
//   ai       Hunyuan AI source badge (blue; only for text Tencent Hy3 wrote)

export type ChipTone = "neutral" | "ok" | "warn" | "danger" | "brand" | "outline" | "ai";
export type ChipSize = "md" | "sm";

export const CHIP_TONES: readonly ChipTone[] = ["neutral", "ok", "warn", "danger", "brand", "outline", "ai"];

export function chipClass({ tone = "neutral", size = "md", className }: { tone?: ChipTone; size?: ChipSize; className?: string } = {}): string {
  return ["chip", size === "sm" && "sm", `tone-${tone}`, className].filter(Boolean).join(" ");
}

/**
 * Normalises the tones the existing helpers return (outcomeTone, stepVisuals, factVisuals,
 * disputeList) onto chip tones. "accent" is the brand colour (e.g. "Agents working"); the
 * risk levels map low -> neutral, medium -> warn, high -> danger. Unknown values are neutral.
 */
export function chipTone(tone: string | null | undefined): ChipTone {
  switch (tone) {
    case "ok": case "warn": case "danger": case "neutral": case "brand": case "outline": case "ai": return tone;
    case "accent": return "brand";
    case "high": return "danger";
    case "medium": return "warn";
    default: return "neutral";
  }
}

/** Output source badges: AI in blue, Rules and Fallback in neutral grey (red stays brand and alarm). */
export function sourceTone(source: "llm" | "fallback" | "code"): ChipTone {
  return source === "llm" ? "ai" : "neutral";
}

/**
 * Value chips inside a fact (factVisuals): a plain value, or one within tolerance ("ok"), is an
 * outline (it sits on tinted source cards, where a neutral fill would vanish); green is kept for
 * outcomes in a party's favour, not for a fact being unremarkable.
 */
export function valueChipTone(tone: string): ChipTone {
  return tone === "ok" || tone === "neutral" ? "outline" : chipTone(tone);
}
