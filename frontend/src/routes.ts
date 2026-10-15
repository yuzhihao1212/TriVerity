export type Route = { page: "landing" } | { page: "console"; sampleId?: string };

export function parseRoute(hash: string): Route {
  const match = /^#\/console(?:\/([^/]+))?$/.exec(hash);
  if (!match) return { page: "landing" };
  try {
    return match[1] ? { page: "console", sampleId: decodeURIComponent(match[1]) } : { page: "console" };
  } catch {
    return { page: "landing" };
  }
}

// IDs are checked against the samples actually returned by the server. A stale
// or unknown link still opens the console, using its usual first selection.
export function selectSample<T extends { dispute_id: string }>(samples: T[], sampleId?: string): T | null {
  return samples.find(sample => sample.dispute_id === sampleId) ?? samples[0] ?? null;
}

export function focusSection(id: string): void {
  const target = document.getElementById(id);
  target?.scrollIntoView({ block: "start" });
  target?.focus({ preventScroll: true });
}
