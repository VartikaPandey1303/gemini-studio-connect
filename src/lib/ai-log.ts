// Every AI call is logged in this browser so the demo's AI log page can show how the AI performed.
export type AiAction = "draftSplit" | "readMessage" | "write";
export interface AiLogEntry {
  time: string;
  action: AiAction;
  input: string;
  output: string;
  source: "gemini" | "built-in";
  latencyMs: number;
  rejected: boolean;
  reason?: string;
}

const KEY = "shared-collect-ai-log";
const MAX = 200;

export function readLogs(): AiLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as AiLogEntry[];
  } catch {
    return [];
  }
}

export function addLog(e: AiLogEntry) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify([e, ...readLogs()].slice(0, MAX)));
  } catch {
    /* storage full — skip */
  }
}

export function clearLogs() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

export function summarize(logs: AiLogEntry[]) {
  const n = logs.length;
  const pct = (k: number) => (n ? Math.round((k / n) * 100) : 0);
  return {
    count: n,
    pctGemini: pct(logs.filter((l) => l.source === "gemini").length),
    pctRejected: pct(logs.filter((l) => l.rejected).length),
    avgLatency: n ? Math.round(logs.reduce((a, l) => a + l.latencyMs, 0) / n) : 0,
  };
}
