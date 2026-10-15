import type { AgentLogEntry, Resolution } from "../types";

export interface SseEvent { event: "step" | "result" | "error"; data: string }

/** Incremental SSE framing: handles split lines, CR/LF, comments and data fields. */
export function createSseParser(emit: (event: SseEvent) => void) {
  let buffer = "", name = "", data: string[] = [];
  let firstLine = true;
  function line(text: string) {
    if (firstLine) { text = text.replace(/^\uFEFF/, ""); firstLine = false; }
    if (!text) {
      if (data.length && ["step", "result", "error"].includes(name)) {
        emit({ event: name as SseEvent["event"], data: data.join("\n") });
      }
      name = ""; data = []; return;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") name = value;
    if (field === "data") data.push(value);
  }
  return {
    push(chunk: string) {
      buffer += chunk;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] !== "\r" && buffer[i] !== "\n") continue;
        if (buffer[i] === "\r" && i === buffer.length - 1) break;
        line(buffer.slice(start, i));
        if (buffer[i] === "\r" && buffer[i + 1] === "\n") i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
    end() {
      // SSE dispatch requires an empty line. Incomplete trailing data is not a
      // result; callers treat EOF without a result as a transport failure.
      if (buffer.endsWith("\r")) this.push("\n");
      buffer = ""; name = ""; data = [];
    },
  };
}

export async function readResolveStream(response: Response, onStep: (step: AgentLogEntry) => void): Promise<Resolution> {
  if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
    throw new Error("Agent stream is unavailable.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  const parser = createSseParser(event => events.push(event));
  try {
    while (true) {
      const { value, done } = await reader.read();
      parser.push(decoder.decode(value, { stream: !done }));
      if (done) parser.end();
      for (const event of events.splice(0)) {
        const data = JSON.parse(event.data);
        if (event.event === "error") throw new Error("The agent stream could not finish.");
        if (event.event === "step") {
          if (!data || !Number.isInteger(data.step) || data.step < 1 || typeof data.agent !== "string"
            || typeof data.status !== "string" || typeof data.message !== "string") throw new Error("Invalid agent step.");
          onStep(data as AgentLogEntry);
        }
        if (event.event === "result") {
          if (!data || !["partial_refund", "full_refund", "compensation", "no_action", "needs_review"].includes(data.decision)
            || !Array.isArray(data.agent_log) || !data.rider_case || !data.driver_case) throw new Error("Invalid agent result.");
          return data as Resolution;
        }
      }
      if (done) throw new Error("Agent stream ended without a result.");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Exactly one ordinary POST retry, only when the streaming attempt failed. */
export async function withResolveFallback<T>(stream: () => Promise<T>, fallback: () => Promise<T>, onFallback: () => void): Promise<T> {
  try { return await stream(); }
  catch {
    onFallback();
    return fallback();
  }
}
