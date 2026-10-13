import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Question, ReadResult, Tone } from "./ai-local";
import type { AiMeta } from "./ai";
import { computeShares, keyDate, outflows, type Cost, type Counts, type Inflow, type Part, type Payment } from "./rules";

export const OWNER = "me";
export const ACCOUNT = { owner: "Dr Meera", business: "Meera Diagnostics" };
export const USAGE_MONTH = "August";
export const BILL_DATE = "2026-09-01";
export const DUE_DATE = "2026-09-30";
export const OUT_MONTH = "2026-10";

export interface Person {
  id: string;
  name: string;
  phone: string;
  lateBefore?: boolean;
}
export type InviteStatus = "waiting" | "accepted" | "question" | "declined";
export interface Invite {
  status: InviteStatus;
  question?: string;
  answer?: string;
  reason?: string;
}
export interface Plan {
  parts: Part[];
  status: "offered" | "accepted";
  message: string;
}
export type DecisionKind = "more-time" | "message" | "nudge" | "counter";
export interface Decision {
  id: string;
  kind: DecisionKind;
  personId: string;
  text: string;
  created: string;
  status: "open" | "done";
  read?: ReadResult & AiMeta;
  counter?: Part[];
}
export interface HistoryItem {
  date: string;
  text: string;
}
export type Stage = "welcome" | "people" | "describe" | "check" | "numbers" | "send" | "replies" | "live";
export type View = "home" | "people" | "settings" | "bills" | "summary" | `decision:${string}` | `person:${string}`;

export interface AppState {
  v: 1;
  today: string;
  step: number;
  stage: Stage;
  view: View;
  role: string;
  people: Person[];
  description: string;
  costs: Cost[];
  questions: Question[];
  numbers: { kind: "staff" | "manual" | "upload" | null; staffName: string; staffPhone: string };
  invites: Record<string, Invite>;
  tone: Tone | null;
  permissions: { remind: boolean; plan: boolean };
  channels: { whatsapp: boolean; invoices: boolean };
  counts: Counts | null;
  countsFrom: "staff" | "owner" | null;
  billsSent: string | null;
  bills: Record<string, number> | null;
  payments: Payment[];
  plans: Record<string, Plan>;
  promised: Record<string, string>;
  decisions: Decision[];
  history: Record<string, HistoryItem[]>;
  outflowsPaid: string[];
  monthClosed: boolean;
  summarySeen: boolean;
  learned: { text: string; label: "you told it" | "seen once" | "a guess" }[];
}

export const initialState = (): AppState => ({
  v: 1,
  today: "2026-08-28",
  step: 0,
  stage: "welcome",
  view: "home",
  role: OWNER,
  people: [],
  description: "",
  costs: [],
  questions: [],
  numbers: { kind: null, staffName: "", staffPhone: "" },
  invites: {},
  tone: null,
  permissions: { remind: true, plan: true },
  channels: { whatsapp: true, invoices: true },
  counts: null,
  countsFrom: null,
  billsSent: null,
  bills: null,
  payments: [],
  plans: {},
  promised: {},
  decisions: [],
  history: {},
  outflowsPaid: [],
  monthClosed: false,
  summarySeen: false,
  learned: [],
});

export const DEMO_PEOPLE: Person[] = [
  { id: "bhatt", name: "Dr Bhatt", phone: "98200 11111" },
  { id: "arjun", name: "Dr Arjun", phone: "98200 22222" },
  { id: "dhruv", name: "Dr Dhruv", phone: "98200 33333", lateBefore: true },
];
export const DEMO_TEXT =
  "Echo machine EMI of ₹40,000 split by scans, paid on the 5th. Consultation rooms ₹45,000 split by sessions, paid on the 5th. Technician salary ₹25,000 equally, paid on the 7th. Utilities ₹10,000, Dhruv pays one-third, paid on the 20th.";
export const DEMO_COUNTS: Counts = {
  scans: { me: 48, bhatt: 46, arjun: 38, dhruv: 22 },
  sessions: { me: 14, bhatt: 14, arjun: 12, dhruv: 6 },
};
export const ARJUN_MSG = "Meera ji, is month thoda tight hai. 20 tak kar dunga, pakka.";

// ---------- derived helpers ----------
export const ids = (s: AppState) => [OWNER, ...s.people.map((p) => p.id)];
export const personName = (s: AppState, id: string) =>
  id === OWNER ? "You" : s.people.find((p) => p.id === id)?.name ?? id;
export const shortName = (s: AppState, id: string) => personName(s, id).replace(/^Dr\.?\s*/, "");
export const paidBy = (s: AppState, id: string) =>
  s.payments.filter((p) => p.personId === id).reduce((a, p) => a + p.amount, 0);
export const shares = (s: AppState) => computeShares(s.costs, ids(s), s.counts);
export const countCosts = (s: AppState) => s.costs.filter((c) => c.method === "count");

export type BillStatus = "Unpaid" | "Plan offered" | "On a plan" | "Part-paid" | "Paid" | "Late";
export function billStatus(s: AppState, id: string): BillStatus {
  const bill = s.bills?.[id] ?? 0;
  const paid = paidBy(s, id);
  if (paid >= bill) return "Paid";
  const plan = s.plans[id];
  if (plan?.status === "accepted") return "On a plan";
  if (plan?.status === "offered") return "Plan offered";
  if (paid > 0) return "Part-paid";
  if (s.today > DUE_DATE) return "Late";
  return "Unpaid";
}

/** Expected money in, per person. `override` lets the decision screen ask "what if we wait". */
export function expectedInflows(s: AppState, countOn: Record<string, boolean>, override?: { id: string; parts: Part[] }): Inflow[] {
  const out: Inflow[] = [];
  for (const id of ids(s)) {
    const bill = s.bills?.[id] ?? 0;
    for (const p of s.payments.filter((x) => x.personId === id)) out.push({ personId: id, amount: p.amount, date: p.date });
    const left = bill - paidBy(s, id);
    if (left <= 0) continue;
    if (override?.id === id) override.parts.forEach((p) => out.push({ personId: id, ...p }));
    else if (s.plans[id]) {
      let rem = left;
      for (const p of s.plans[id].parts) {
        const a = Math.min(rem, p.amount);
        if (a > 0) out.push({ personId: id, amount: a, date: p.date });
        rem -= a;
      }
    } else if (s.promised[id]) out.push({ personId: id, amount: left, date: s.promised[id] });
    else out.push({ personId: id, amount: left, date: countOn[id] === false ? null : DUE_DATE });
  }
  return out;
}

export function gapFor(s: AppState, countOn: Record<string, boolean>, override?: { id: string; parts: Part[] }) {
  return keyDate(outflows(s.costs, OUT_MONTH), expectedInflows(s, countOn, override));
}

// ---------- mutations ----------
let uid = 0;
export const newId = (p = "x") => `${p}${Date.now().toString(36)}${++uid}`;
export function addHistory(s: AppState, id: string, text: string) {
  (s.history[id] ??= []).push({ date: s.today, text });
}
export function pay(s: AppState, id: string, amount: number, plan = false) {
  const left = (s.bills?.[id] ?? 0) - paidBy(s, id);
  const a = Math.min(left, amount);
  if (a <= 0) return;
  s.payments.push({ id: newId("p"), personId: id, amount: a, date: s.today, plan: plan || !!s.plans[id] });
  addHistory(s, id, `Paid ${"₹" + a.toLocaleString("en-IN")}`);
}

// ---------- demo timeline ----------
interface Ev {
  date: string;
  label: string;
  wait?: (s: AppState) => string | null;
  run: (s: AppState) => void;
}
const hasDemo = (s: AppState) => ["bhatt", "arjun", "dhruv"].every((i) => s.people.some((p) => p.id === i));
const open = (s: AppState, kind: DecisionKind, pid: string) =>
  s.decisions.some((d) => d.kind === kind && d.personId === pid && d.status === "open");

export const TIMELINE: Ev[] = [
  {
    date: "2026-08-28",
    label: "Colleagues reply to the split",
    wait: (s) => (!hasDemo(s) ? "Use “Fill example” in setup to run the demo" : s.stage !== "replies" && s.stage !== "live" ? "Waiting for you to send the split" : null),
    run: (s) => {
      const set = (id: string, inv: Invite, h: string) => {
        if (s.invites[id]?.status === "waiting") {
          s.invites[id] = inv;
          addHistory(s, id, h);
        }
      };
      set("bhatt", { status: "accepted" }, "Accepted the split");
      set("arjun", { status: "question", question: "Why is my scan share higher than Dhruv's?" }, "Asked a question about the split");
      set("dhruv", { status: "accepted" }, "Accepted the split");
    },
  },
  {
    date: "2026-08-28",
    label: "Dr Arjun accepts after your answer",
    wait: (s) => (s.invites.arjun?.status === "question" ? "Waiting for you to answer Dr Arjun" : null),
    run: (s) => {
      if (s.invites.arjun?.status !== "accepted") {
        s.invites.arjun = { ...s.invites.arjun, status: "accepted" };
        addHistory(s, "arjun", "Accepted the split");
      }
    },
  },
  {
    date: "2026-09-01",
    label: "Sunita sends August's numbers",
    wait: (s) =>
      Object.values(s.invites).some((i) => i.status !== "accepted")
        ? "Waiting for everyone to accept"
        : s.stage !== "live"
          ? "Waiting for you to open Home"
          : null,
    run: (s) => {
      if (s.numbers.kind === "staff") {
        const c: Counts = {};
        for (const cost of countCosts(s)) c[cost.measure!] = DEMO_COUNTS[cost.measure!] ?? DEMO_COUNTS.scans;
        s.counts = c;
        s.countsFrom = "staff";
      }
    },
  },
  {
    date: "2026-09-23",
    label: "Razorpay sends invoice reminders",
    wait: (s) => (!s.billsSent ? "Waiting for you to send the bills" : null),
    run: (s) => s.people.forEach((p) => paidBy(s, p.id) < (s.bills?.[p.id] ?? 0) && addHistory(s, p.id, "Razorpay sent a reminder")),
  },
  {
    date: "2026-09-25",
    label: "Dr Arjun replies on WhatsApp",
    run: (s) => {
      if (paidBy(s, "arjun") >= (s.bills?.arjun ?? 0)) return;
      s.decisions.push({ id: newId("d"), kind: "more-time", personId: "arjun", text: ARJUN_MSG, created: s.today, status: "open" });
      addHistory(s, "arjun", `Said: “${ARJUN_MSG}”`);
    },
  },
  {
    date: "2026-09-26",
    label: "Dr Arjun accepts the plan",
    wait: (s) => (open(s, "more-time", "arjun") ? "Waiting for you to reply to Dr Arjun" : null),
    run: (s) => {
      if (s.plans.arjun?.status === "offered") {
        s.plans.arjun.status = "accepted";
        addHistory(s, "arjun", "Accepted the plan");
      }
    },
  },
  {
    date: "2026-09-27",
    label: "Agent flags Dr Dhruv as likely late",
    run: (s) => {
      if (s.permissions.remind && paidBy(s, "dhruv") < (s.bills?.dhruv ?? 0))
        s.decisions.push({ id: newId("d"), kind: "nudge", personId: "dhruv", text: "", created: s.today, status: "open" });
    },
  },
  {
    date: "2026-09-28",
    label: "Dr Bhatt pays",
    wait: (s) => (open(s, "nudge", "dhruv") ? "Waiting for you on Dr Dhruv's reminder" : null),
    run: (s) => pay(s, "bhatt", s.bills?.bhatt ?? 0),
  },
  {
    date: "2026-09-29",
    label: "Dr Arjun pays the first part",
    wait: (s) => (s.plans.arjun?.status === "offered" ? "Waiting for Dr Arjun to accept the plan" : null),
    run: (s) => pay(s, "arjun", s.plans.arjun ? s.plans.arjun.parts[0].amount : s.bills?.arjun ?? 0),
  },
  { date: "2026-09-30", label: "Due date", run: () => {} },
  { date: "2026-10-05", label: "You pay the EMI and rooms", run: (s) => s.outflowsPaid.push("2026-10-05") },
  { date: "2026-10-07", label: "You pay the salary", run: (s) => s.outflowsPaid.push("2026-10-07") },
  {
    date: "2026-10-18",
    label: "Dr Arjun and Dr Dhruv pay",
    run: (s) => {
      pay(s, "arjun", s.bills?.arjun ?? 0);
      pay(s, "dhruv", s.bills?.dhruv ?? 0);
    },
  },
  { date: "2026-10-20", label: "You pay utilities", run: (s) => s.outflowsPaid.push("2026-10-20") },
  {
    date: "2026-10-31",
    label: "August closes",
    run: (s) => {
      s.monthClosed = true;
      s.learned = [
        ...(s.tone ? [{ text: `Dr Arjun gets a ${s.tone} tone`, label: "you told it" as const }] : []),
        { text: "Dr Dhruv pays after the due date", label: "seen once" },
        { text: "Nudge Dr Dhruv 3 days before the due date", label: "a guess" },
      ];
    },
  },
];

export function nextInfo(s: AppState): { label: string; wait: string | null } {
  const ev = TIMELINE[s.step];
  if (!ev) return { label: "Demo finished", wait: "Demo finished — press Restart" };
  return { label: ev.label, wait: ev.wait?.(s) ?? null };
}

// ---------- context ----------
const KEY = "shared-collect-v1";
interface Ctx {
  s: AppState;
  update: (fn: (d: AppState) => void) => void;
  reset: () => void;
  toast: string | null;
  showToast: (t: string) => void;
  demo: boolean;
}
const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).has("demo"));
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as AppState) : null;
      setS(parsed?.v === 1 ? parsed : initialState());
    } catch {
      setS(initialState());
    }
  }, []);
  useEffect(() => {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
  }, [s]);
  const update = useCallback((fn: (d: AppState) => void) => {
    setS((prev) => {
      if (!prev) return prev;
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
  }, []);
  const showToast = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2600);
  }, []);
  const reset = useCallback(() => setS(initialState()), []);
  if (!s) return <div className="min-h-screen bg-background" />;
  return <C.Provider value={{ s, update, reset, toast, showToast, demo }}>{children}</C.Provider>;
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
