// Client-side AI adapter: Gemini first, built-in rules as a safe fallback so the demo never breaks.
import { aiDraftSplit, aiReadMessage, aiWrite } from "./ai.functions";
import {
  finalizeDraft,
  localDraftSplit,
  localReadMessage,
  localWrite,
  PLAN_ENDING,
  reasonEn,
  type Draft,
  type ReadResult,
  type Tone,
  type WriteCtx,
} from "./ai-local";
import { fmtDate, money } from "./rules";
import { addLog, type AiAction } from "./ai-log";

function track(action: AiAction, input: string, t0: number, source: Source, output: unknown, note?: string, rejected = false) {
  if (source === "built-in" && note) console.warn(`[AI fallback] ${action}: ${note}`);
  addLog({
    time: new Date().toISOString(),
    action,
    input: input.slice(0, 400),
    output: typeof output === "string" ? output : JSON.stringify(output),
    source,
    latencyMs: Date.now() - t0,
    rejected,
    reason: note,
  });
}

export type Source = "gemini" | "built-in";
export interface AiMeta {
  source: Source;
  note?: string;
}

export async function draftSplit(text: string, people: { id: string; name: string }[]) {
  const out = await draftSplitRaw(text, people);
  return out;
}
async function draftSplitRaw(text: string, people: { id: string; name: string }[]) {
  const t0 = Date.now();
  const done = <T extends { costs: unknown; meta: AiMeta }>(r: T) => (track("draftSplit", text, t0, r.meta.source, r.costs, r.meta.note), r);
  try {
    const r = await aiDraftSplit({ data: { text, people: people.map((p) => p.name.replace(/^dr\.?\s*/i, "")) } });
    if (r.ok) {
      const d = finalizeDraft(r.data as Draft, people);
      if (d.costs.length) return done({ ...d, meta: { source: "gemini" as Source } as AiMeta });
    }
    const local = finalizeDraft(localDraftSplit(text, people), people);
    return done({ ...local, meta: { source: "built-in" as Source, note: r.ok ? "AI found no costs" : r.error } as AiMeta });
  } catch (e) {
    const local = finalizeDraft(localDraftSplit(text, people), people);
    return done({ ...local, meta: { source: "built-in" as Source, note: (e as Error).message } as AiMeta });
  }
}

export async function readMessage(text: string, today: string): Promise<ReadResult & AiMeta> {
  const t0 = Date.now();
  const r = await readMessageRaw(text, today);
  track("readMessage", text, t0, r.source, { intent: r.intent, date: r.date, why: r.why }, r.note);
  return r;
}
async function readMessageRaw(text: string, today: string): Promise<ReadResult & AiMeta> {
  try {
    const r = await aiReadMessage({ data: { text, today } });
    if (r.ok) {
      const d = r.data;
      const date = d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null;
      return { intent: d.intent as ReadResult["intent"], date, why: d.why, source: "gemini" };
    }
    return { ...localReadMessage(text, today), source: "built-in", note: r.error };
  } catch (e) {
    return { ...localReadMessage(text, today), source: "built-in", note: (e as Error).message };
  }
}

export type WriteKind = "plan" | "answer" | "nudge" | "due";

export async function write(kind: WriteKind, tone: Tone, ctx: WriteCtx): Promise<{ text: string } & AiMeta> {
  const fallback = localWrite(kind, tone, ctx);
  let brief = "";
  let amounts: number[] = [];
  let mustEndWith: string | undefined;
  if (kind === "plan" && ctx.parts) {
    amounts = ctx.parts.map((p) => p.amount);
    brief = `${ctx.name} asked for more time to pay. Ask them to pay ${ctx.parts
      .map((p) => `${money(p.amount)} by ${fmtDate(p.date)}`)
      .join(" and the rest, ")}.${ctx.reason ? ` Explain briefly the first part is needed because ${reasonEn(ctx.reason)}.` : ""}`;
    mustEndWith = PLAN_ENDING;
  } else if (kind === "answer") {
    brief = `${ctx.name} asked: "${ctx.question}". Answer using only these facts: ${ctx.facts}. Do not mention any rupee amount.`;
  } else if (kind === "nudge") {
    amounts = [ctx.amount ?? 0];
    brief = `Gentle reminder to ${ctx.name} that their share of ${money(ctx.amount ?? 0)} is due on ${fmtDate(ctx.due ?? "")}. Friendly, no pressure.`;
  } else {
    amounts = [ctx.amount ?? 0];
    brief = `Ask ${ctx.name} kindly to pay the full ${money(ctx.amount ?? 0)} by the due date ${fmtDate(ctx.due ?? "")}, because the owner's own payments fall due right after.`;
  }
  const t0 = Date.now();
  const res = await writeRaw(kind, tone, brief, amounts, mustEndWith, fallback);
  track("write", `${kind}/${tone}: ${brief}`, t0, res.source, res.text, res.note, !!res.rejected);
  return { text: res.text, source: res.source, ...(res.note ? { note: res.note } : {}) };
}

async function writeRaw(kind: WriteKind, tone: Tone, brief: string, amounts: number[], mustEndWith: string | undefined, fallback: string): Promise<{ text: string; rejected?: boolean } & AiMeta> {
  try {
    const r = await aiWrite({ data: { kind, tone, brief, amounts, mustEndWith } });
    if (r.ok) return { text: r.data, source: "gemini" };
    if (r.error === "rejected-amounts")
      return { text: fallback, source: "built-in", note: "The AI draft changed an amount, so it was rejected.", rejected: true };
    return { text: fallback, source: "built-in", note: r.error };
  } catch (e) {
    return { text: fallback, source: "built-in", note: (e as Error).message };
  }
}
