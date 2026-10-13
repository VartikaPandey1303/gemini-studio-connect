// Server functions that call Google Gemini through Lovable AI. AI only reads and drafts words;
// every amount is supplied by the rules engine and checked after generation.
import { createServerFn } from "@tanstack/react-start";
import { amountsMatch } from "./rules";

const MODEL = "google/gemini-3.8-flash";

type AiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

async function gemini(system: string, user: string, schema: object | null): Promise<AiResult<string>> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "AI is not set up for this project." };
  const body: Record<string, unknown> = {
    model: MODEL,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (schema) body.response_format = { type: "json_schema", json_schema: { name: "out", strict: true, schema } };
  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the AI service." };
  }
  if (!res.ok || !res.body) {
    let msg = `AI request failed (${res.status}).`;
    try {
      const j = await res.json();
      msg = j?.error?.message || j?.message || msg;
    } catch {
      /* ignore */
    }
    if (res.status === 402) msg = "AI credits have run out. Add credits in Settings → Plans & credits.";
    if (res.status === 429) msg = "AI is busy right now. Try again in a minute.";
    return { ok: false, error: msg, status: res.status };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const payload = l.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        out += j?.choices?.[0]?.delta?.content ?? "";
      } catch {
        /* partial */
      }
    }
  }
  if (!out.trim()) return { ok: false, error: "The AI returned an empty answer." };
  return { ok: true, data: out };
}

function parseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    return null;
  }
}

// ---------- draftSplit ----------
const splitSchema = {
  type: "object",
  additionalProperties: false,
  required: ["costs"],
  properties: {
    costs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount", "payDay", "method", "measure", "shareTargets", "fixedTargets", "assumed"],
        properties: {
          name: { type: "string" },
          amount: { type: ["integer", "null"] },
          payDay: { type: ["integer", "null"] },
          method: { type: "string", enum: ["equal", "count", "share", "fixed"] },
          measure: { type: ["string", "null"] },
          shareTargets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "fraction"],
              properties: { name: { type: "string" }, fraction: { type: "number" } },
            },
          },
          fixedTargets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "amount"],
              properties: { name: { type: "string" }, amount: { type: "integer" } },
            },
          },
          assumed: { type: "boolean" },
        },
      },
    },
  },
};

export const aiDraftSplit = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; people: string[] }) => ({
    text: String(d.text).slice(0, 4000),
    people: (d.people ?? []).map(String).slice(0, 20),
  }))
  .handler(async ({ data }) => {
    const sys = `You turn a business owner's description of shared monthly costs into structured cost lines. Output JSON only.
Rules:
- One item per cost. amount in whole rupees (40k = 40000, 1.2 lakh = 120000). If no amount, null.
- payDay = day of month the OWNER pays it ("paid on the 5th" -> 5), else null.
- method: "count" if split by something counted (scans, orders, sessions...) and put that thing in measure, lowercase plural, exactly as the owner said it (e.g. "dialysis sessions"). "share" if a named person pays a fraction (one-third = 0.3333333333, 40% = 0.4) -> shareTargets. "fixed" if a named person pays a fixed rupee amount -> fixedTargets. "equal" if equal.
- If the owner did not say how to split, use "equal" with assumed=true. Otherwise assumed=false.
- Copy person names exactly as written (without "Dr"). Never invent costs, amounts or people.
Known people: ${data.people.join(", ")} (plus the owner, "me").`;
    const r = await gemini(sys, data.text, splitSchema);
    if (!r.ok) return r;
    const j = parseJson<{ costs: Record<string, any>[] }>(r.data);
    if (!j || !Array.isArray(j.costs)) return { ok: false as const, error: "The AI answer couldn't be read." };
    return { ok: true as const, data: j };
  });

// ---------- readMessage ----------
const readSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "date", "why"],
  properties: {
    intent: { type: "string", enum: ["more-time", "question", "dispute", "paid", "other"] },
    date: { type: ["string", "null"] },
    why: { type: "string" },
  },
};

export const aiReadMessage = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; today: string }) => ({ text: String(d.text).slice(0, 2000), today: String(d.today) }))
  .handler(async ({ data }) => {
    const sys = `You read a WhatsApp message a colleague sent to a business owner about their monthly shared-cost bill. Messages are often Hinglish.
Today is ${data.today}. Classify intent: more-time (asks to pay later), question, dispute (says amount is wrong), paid (says they paid), other.
date: the date they promise to pay as YYYY-MM-DD, or null. "20 tak" means by the 20th; if that day already passed this month, it's next month.
why: one short plain-English sentence explaining your reading (e.g. "Names a date and sounds firm about it."). Never mention confidence or percentages.`;
    const r = await gemini(sys, data.text, readSchema);
    if (!r.ok) return r;
    const j = parseJson<{ intent: string; date: string | null; why: string }>(r.data);
    if (!j) return { ok: false as const, error: "The AI answer couldn't be read." };
    return { ok: true as const, data: j };
  });

// ---------- write ----------
export const aiWrite = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { kind: string; tone: string; brief: string; amounts: number[]; mustEndWith?: string }) => ({
      kind: String(d.kind),
      tone: String(d.tone),
      brief: String(d.brief).slice(0, 3000),
      amounts: (d.amounts ?? []).map(Number).filter((n) => Number.isFinite(n)),
      mustEndWith: d.mustEndWith ? String(d.mustEndWith) : undefined,
    }),
  )
  .handler(async ({ data }) => {
    const toneGuide: Record<string, string> = {
      warm: "warm and friendly, like a colleague of many years, Hinglish where natural, uses 'ji'",
      direct: "short and direct, polite but clear, light Hinglish",
      formal: "polite and formal English",
    };
    const sys = `You write one WhatsApp message in the voice of a clinic owner to a colleague. Tone: ${toneGuide[data.tone] ?? toneGuide.warm}.
Strict rules: 2-4 short sentences. Plain text, no emojis, no greetings like "Hope you're well". 
Write rupee amounts EXACTLY as given, in the form ₹20,082. Never add, change, round or combine any amount. Mention every amount given. No other ₹ figures.
Never threaten, never waive money, never change anyone's share, never offer a loan.${data.mustEndWith ? `\nEnd the message with exactly: "${data.mustEndWith}"` : ""}`;
    const r = await gemini(sys, data.brief, null);
    if (!r.ok) return r;
    let text = r.data.trim().replace(/^"|"$/g, "");
    if (data.mustEndWith && !text.endsWith(data.mustEndWith)) text = `${text} ${data.mustEndWith}`;
    if (!amountsMatch(text, data.amounts)) return { ok: false as const, error: "rejected-amounts", text };
    return { ok: true as const, data: text };
  });
