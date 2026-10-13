// Client-side AI adapter: Gemini first, built-in rules as a safe fallback so the demo never breaks.
import { aiDraftSplit, aiReadMessage, aiWrite } from "./ai.functions";
import {
  finalizeDraft,
  localDraftSplit,
  localReadMessage,
  localWrite,
  PLAN_ENDING,
  type Draft,
  type ReadResult,
  type Tone,
  type WriteCtx,
} from "./ai-local";
import { fmtDate, money } from "./rules";

export type Source = "gemini" | "built-in";
export interface AiMeta {
  source: Source;
  note?: string;
}

export async function draftSplit(text: string, people: { id: string; name: string }[]) {
  try {
    const r = await aiDraftSplit({ data: { text, people: people.map((p) => p.name.replace(/^dr\.?\s*/i, "")) } });
    if (r.ok) {
      const d = finalizeDraft(r.data as Draft, people);
      if (d.costs.length) return { ...d, meta: { source: "gemini" as Source } };
    }
    const local = finalizeDraft(localDraftSplit(text), people);
    return { ...local, meta: { source: "built-in" as Source, note: r.ok ? "AI found no costs" : r.error } };
  } catch (e) {
    const local = finalizeDraft(localDraftSplit(text), people);
    return { ...local, meta: { source: "built-in" as Source, note: (e as Error).message } };
  }
}

export async function readMessage(text: string, today: string): Promise<ReadResult & AiMeta> {
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
      .join(" and the rest, ")}. Explain briefly the first part is needed because the owner pays salary on 7 Oct.`;
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
  try {
    const r = await aiWrite({ data: { kind, tone, brief, amounts, mustEndWith } });
    if (r.ok) return { text: r.data, source: "gemini" };
    if (r.error === "rejected-amounts")
      return { text: fallback, source: "built-in", note: "The AI draft changed an amount, so it was rejected." };
    return { text: fallback, source: "built-in", note: r.error };
  } catch (e) {
    return { text: fallback, source: "built-in", note: (e as Error).message };
  }
}
