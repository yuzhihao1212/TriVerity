// Number formatting for display: no needless decimals, thousands separators, metres -> km.
// Pure, no imports.

/** "22.0" -> "22", "10.2" -> "10.2", "14.70" -> "14.7", 35 -> "35". Non-numbers pass through. */
export function trimDecimal(value: number | string): string {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^[+-]?\d[\d,]*(\.\d+)?$/.test(text)) return text;
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** 1 decimal at most, trailing ".0" dropped: 4.46 -> "4.5", 13 -> "13". */
export function oneDecimal(value: number): string {
  return trimDecimal(value.toFixed(1));
}

/** 3890 -> "3,890". */
export function thousands(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** A distance in metres: under 1,000 m in metres, otherwise km with one decimal ("2,704" -> "2.7 km"). */
export function distanceText(metres: number): string {
  return metres >= 1000 ? `${oneDecimal(metres / 1000)} km` : `${thousands(metres)} m`;
}

/** "$6.30". */
export function dollars(value: number): string {
  return `$${Math.abs(value).toFixed(2)}`;
}

/** "1 minute" / "27 minutes". */
export function minutesText(minutes: number): string {
  const n = Math.round(minutes);
  return `${n} ${n === 1 ? "minute" : "minutes"}`;
}
