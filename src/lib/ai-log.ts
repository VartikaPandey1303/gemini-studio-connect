// Every AI call is logged in this browser so the demo's AI log page can show how the AI performed.
import { fmtDate, money } from "./rules";
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

export function readableOutput(entry: Pick<AiLogEntry, "action" | "output">): string {
  if (entry.action === "write") return entry.output;
  try {
    const value: unknown = JSON.parse(entry.output);
    if (entry.action === "draftSplit" && Array.isArray(value)) {
      const costs = value.map((cost: unknown) => {
        if (!cost || typeof cost !== "object") return "Cost";
        const c = cost as Record<string, unknown>;
        const how = c['method'] === "count" ? `by ${c['measure'] || "counts"}`
          : c['method'] === "fixed" ? "fixed amount, rest equal"
          : c['method'] === "share" ? "fixed share, rest equal" : "equally";
        return `${c['name'] || "Cost"} ${typeof c['amount'] === "number" ? money(c['amount']) : "amount not set"} ${how}${typeof c['payDay'] === "number" ? `, paid day ${c['payDay']}` : ""}`;
      });
      return `${costs.length} costs: ${costs.join("; ")}`;
    }
    if (entry.action === "readMessage" && value && typeof value === "object") {
      const r = value as Record<string, unknown>;
      return `${r['intent'] || "other"}${typeof r['date'] === "string" ? `, by ${fmtDate(r['date'])}` : ""}${typeof r['why'] === "string" ? ` — ${r['why']}` : ""}`;
    }
  } catch {
    // Older logs may have truncated JSON. Show a readable label instead.
    if (/^\s*[\[{]/.test(entry.output)) return entry.action === "draftSplit" ? "Split draft (older log)" : "Message interpretation (older log)";
  }
  return entry.output;
}

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
