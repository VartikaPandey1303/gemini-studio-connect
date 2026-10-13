// Built-in rule-based stand-ins for the AI. Used when Gemini is unavailable, and as the
// shared post-processing for Gemini drafts (name resolution, questions).
import { money, fmtDate, type Cost, type Method, type Part } from "./rules";

export interface DraftCost {
  name: string;
  amount: number | null;
  payDay: number | null;
  method: Method;
  measure: string | null;
  shareTargets: { name: string; fraction: number }[];
  fixedTargets: { name: string; amount: number }[];
  assumed: boolean;
}
export interface Draft {
  costs: DraftCost[];
}
export interface Question {
  id: string;
  costId: string;
  rawName: string;
  kind: "share" | "fixed";
  value: number;
  text: string;
}
export type Tone = "warm" | "direct" | "formal";
export type Intent = "more-time" | "question" | "dispute" | "paid" | "other";
export interface ReadResult {
  intent: Intent;
  date: string | null;
  why: string;
}

const FRACTIONS: [RegExp, number][] = [
  [/^(one[- ]third|a third|1\/3)$/i, 1 / 3],
  [/^(two[- ]thirds|2\/3)$/i, 2 / 3],
  [/^(a quarter|one[- ]quarter|quarter|1\/4)$/i, 1 / 4],
  [/^(half|one[- ]half|1\/2)$/i, 1 / 2],
  [/^(three[- ]quarters|3\/4)$/i, 3 / 4],
];
function parseFraction(s: string): number | null {
  for (const [re, v] of FRACTIONS) if (re.test(s.trim())) return v;
  const p = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (p) return Number(p[1]) / 100;
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  return null;
}
function parseRupees(num: string, unit?: string): number {
  let n = Number(num.replace(/,/g, ""));
  const u = (unit ?? "").toLowerCase();
  if (u === "k") n *= 1000;
  if (u.startsWith("l")) n *= 100000;
  return Math.round(n);
}

const FRAC_WORDS = "one[- ]third|a third|two[- ]thirds|a quarter|one[- ]quarter|half|three[- ]quarters|\\d+(?:\\.\\d+)?\\s*%|\\d+\\/\\d+";

export function localDraftSplit(text: string): Draft {
  const sentences = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const costs: DraftCost[] = [];
  for (const raw of sentences) {
    let s = raw;
    const shareTargets: DraftCost["shareTargets"] = [];
    const fixedTargets: DraftCost["fixedTargets"] = [];
    const shareRe = new RegExp(`(?:dr\\.?\\s+)?([A-Z][a-zA-Z]+)\\s+pays\\s+(${FRAC_WORDS})(\\s+of)?`, "i");
    let m: RegExpMatchArray | null;
    while ((m = s.match(shareRe))) {
      const f = parseFraction(m[2]);
      if (f !== null) shareTargets.push({ name: m[1], fraction: f });
      s = s.replace(m[0], " ");
    }
    const fixedRe = /(?:dr\.?\s+)?([A-Z][a-zA-Z]+)\s+pays\s+(?:₹|rs\.?|inr)\s*([\d,]+)\s*(k)?(?:\s+flat)?/i;
    while ((m = s.match(fixedRe))) {
      fixedTargets.push({ name: m[1], amount: parseRupees(m[2], m[3]) });
      s = s.replace(m[0], " ");
    }
    const am =
      s.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|lakhs?|l)?\b/i) ?? s.match(/\b(\d+(?:\.\d+)?)\s*(k|lakhs?)\b/i);
    if (!am) continue;
    const amount = parseRupees(am[1], am[2]);
    const pd = s.match(/(?:on the|on|by the)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
    const payDay = pd ? Math.min(28, Math.max(1, Number(pd[1]))) : null;
    const ms = s.match(/(?:split|divided|shared)\s+(?:by|based on|according to)\s+(?:the\s+)?(?:number of\s+)?([a-zA-Z ]+?)(?=\s*(?:,|\.|;|$|\bpaid\b|\beach\b|\bper\b|\band\b|\bon\b))/i);
    let method: Method = "equal";
    let measure: string | null = null;
    let assumed = false;
    if (shareTargets.length) method = "share";
    else if (fixedTargets.length) method = "fixed";
    else if (ms && !/^equal/i.test(ms[1].trim())) {
      method = "count";
      measure = ms[1].trim().toLowerCase();
    } else if (/equal/i.test(s)) method = "equal";
    else assumed = true;
    let name = s
      .split(/\s*(?:,|\bof\s*(?:₹|rs)|₹|\brs\.?\s*\d|\(|\bsplit\b|\bpaid\b|\bequally\b|\bdivided\b|\d)/i)[0]
      .trim()
      .replace(/^(of|and|the|our|my)\s+/i, "")
      .trim();
    if (!name) name = "Cost";
    name = name.charAt(0).toUpperCase() + name.slice(1);
    costs.push({ name, amount, payDay, method, measure, shareTargets, fixedTargets, assumed });
  }
  return { costs };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bdr\.?\s*/g, "")
    .trim();

export function resolveName(raw: string, people: { id: string; name: string }[], ownerName = "Meera"): string | null {
  const n = norm(raw);
  if (["me", "i", "myself", norm(ownerName)].includes(n)) return "me";
  const hit = people.find((p) => norm(p.name) === n || norm(p.name).split(/\s+/).includes(n));
  return hit?.id ?? null;
}

let qid = 0;
export function finalizeDraft(draft: Draft, people: { id: string; name: string }[]): { costs: Cost[]; questions: Question[] } {
  const questions: Question[] = [];
  const costs: Cost[] = draft.costs.map((d, i) => {
    const id = `c${Date.now().toString(36)}${i}`;
    const c: Cost = {
      id,
      name: d.name,
      amount: d.amount ?? 0,
      payDay: d.payDay,
      method: d.method,
      assumed: d.assumed,
    };
    if (d.method === "count") c.measure = d.measure ?? "";
    if (d.method === "share") {
      c.shares = {};
      for (const t of d.shareTargets) {
        const pid = resolveName(t.name, people);
        if (pid) c.shares[pid] = t.fraction;
        else
          questions.push({ id: `q${++qid}`, costId: id, rawName: t.name, kind: "share", value: t.fraction, text: `Who is "${t.name}" in "${d.name}"?` });
      }
    }
    if (d.method === "fixed") {
      c.fixed = {};
      for (const t of d.fixedTargets) {
        const pid = resolveName(t.name, people);
        if (pid) c.fixed[pid] = t.amount;
        else
          questions.push({ id: `q${++qid}`, costId: id, rawName: t.name, kind: "fixed", value: t.amount, text: `Who is "${t.name}" in "${d.name}"?` });
      }
    }
    return c;
  });
  return { costs, questions };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function localReadMessage(text: string, today: string): ReadResult {
  const t = text.toLowerCase();
  let date: string | null = null;
  const dm = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\s*(?:tak|tk|ko|tak tak)?\b/);
  const hasDateCue = /(\d{1,2})(?:st|nd|rd|th)?\s*(tak|tk|ko)\b|(?:on|by|till|until)\s+(?:the\s+)?\d{1,2}/.test(t);
  if (dm && hasDateCue) {
    const day = Number(dm[1]);
    const [y, mo, d] = today.split("-").map(Number);
    let month = dm[2] ? MONTHS[dm[2]] : day <= d ? mo + 1 : mo;
    let year = y;
    if (month > 12) {
      month = 1;
      year++;
    }
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (/\b(paid|transferred|bhej diya|sent it|done the payment)\b/.test(t))
    return { intent: "paid", date, why: "Says the money has been sent." };
  if (/wrong|too high|mistake|galat|zyada|incorrect/.test(t))
    return { intent: "dispute", date, why: "Says something in the bill doesn't look right." };
  if (/tight|time|tak|later|can i pay on|pay by|baad me|next week/.test(t))
    return {
      intent: "more-time",
      date,
      why: date ? `Names a date (${fmtDate(date)}) and sounds firm about it.` : "Asks for more time but doesn't name a date.",
    };
  if (/\?|\bwhy\b|\bhow\b|kyu|kaise/.test(t)) return { intent: "question", date, why: "Asks a question about the split or the bill." };
  return { intent: "other", date, why: "Doesn't ask for anything specific." };
}

export const PLAN_ENDING = "Agar nahi, batao kya possible hai.";

/** Costs the owner pays on the key date, e.g. { names: "technician salary", date: "2026-10-07" }. */
export interface Reason {
  names: string;
  date: string;
}
const plural = (r: Reason) => / and /.test(r.names);
export const reasonEn = (r: Reason) => `my ${r.names} ${plural(r) ? "go" : "goes"} out on ${fmtDate(r.date)}`;
export const reasonHi = (r: Reason) => `Mera ${r.names} ka payment ${fmtDate(r.date)} ko hai.`;

export interface WriteCtx {
  ownerName: string;
  name: string; // colleague short name e.g. "Arjun"
  parts?: Part[];
  amount?: number;
  due?: string;
  question?: string;
  facts?: string;
  reason?: Reason | undefined;
}

export function localWrite(kind: "plan" | "answer" | "nudge" | "due", tone: Tone, ctx: WriteCtx): string {
  const n = ctx.name;
  if (kind === "plan" && ctx.parts) {
    const [p1, p2] = ctx.parts;
    const rest = p2 ? ` Baaki ${money(p2.amount)} ${fmtDate(p2.date)} tak chalega.` : "";
    if (tone === "warm")
      return `${n} ji, koi baat nahi, samajh sakti hoon. Bas ek request — kya ${money(p1.amount)} ${fmtDate(p1.date)} tak bhej sakte ho? ${ctx.reason ? reasonHi(ctx.reason) : ""}${rest} ${PLAN_ENDING}`;
    if (tone === "direct")
      return `${n}, ${money(p1.amount)} ${fmtDate(p1.date)} tak chahiye${ctx.reason ? ` — ${reasonEn(ctx.reason)}` : " — mere payments due hain"}.${rest} ${PLAN_ENDING}`;
    return `Dear ${n}, thank you for letting me know. Could you please pay ${money(p1.amount)} by ${fmtDate(p1.date)}${ctx.reason ? `, as ${reasonEn(ctx.reason)}` : ""}?${p2 ? ` The remaining ${money(p2.amount)} can come by ${fmtDate(p2.date)}.` : ""} ${PLAN_ENDING}`;
  }
  if (kind === "answer")
    return `${n} ji, good question. ${ctx.facts ?? "The split follows what each person used this month."} Koi aur sawaal ho toh batao.`;
  if (kind === "nudge")
    return tone === "formal"
      ? `Dear ${n}, a gentle reminder that your share of ${money(ctx.amount ?? 0)} is due on ${fmtDate(ctx.due ?? "")}. Thank you.`
      : `${n} ji, ek chhota sa reminder — aapka ${money(ctx.amount ?? 0)} ${fmtDate(ctx.due ?? "")} tak due hai. Thank you!`;
  return `${n} ji, kya aap pura ${money(ctx.amount ?? 0)} ${fmtDate(ctx.due ?? "")} tak bhej sakte ho? Mere payments usi ke baad due hain.`;
}
