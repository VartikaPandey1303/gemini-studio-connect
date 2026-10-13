import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Question, ReadResult, Reason, Tone } from "./ai-local";
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
  reason?: Reason | undefined;
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
  learned?: boolean;
  amount?: number;
  due?: string;
  plan?: Part[];
  reason?: Reason | undefined;
  tone?: Tone;
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
  label: (s: AppState) => string;
  wait?: (s: AppState) => string | null;
  skip?: (s: AppState) => boolean;
  run: (s: AppState) => void;
}

/** Demo roles come from the order colleagues were added: 1 pays on time, 2 asks for time, 3 is likely late. */
export function roles(s: AppState): { onTime: string | null; asker: string | null; late: string | null } {
  const p = s.people.map((x) => x.id);
  if (p.length === 0) return { onTime: null, asker: null, late: null };
  if (p.length === 1) return { onTime: null, asker: p[0], late: p[0] };
  return { onTime: p[0], asker: p[1], late: p[2] ?? p[1] };
}
export const ownerFirst = () => ACCOUNT.owner.replace(/^Dr\.?\s*/, "");
export const askerMessage = () => `${ownerFirst()} ji, is month thoda tight hai. 20 tak kar dunga, pakka.`;
export const paidLateBefore = (s: AppState, id: string) =>
  !!s.people.find((p) => p.id === id)?.lateBefore || (s.people.length >= 3 && roles(s).late === id);
const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
export const joinNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Why the first part of a plan matters: the costs the owner pays on the key date. */
export function keyReason(s: AppState, date: string): Reason | undefined {
  const names = outflows(s.costs, OUT_MONTH)
    .filter((o) => o.date === date)
    .map((o) => lcFirst(o.label));
  return names.length ? { names: joinNames(names), date } : undefined;
}

export function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
export const NEXT_DUE = addMonths(DUE_DATE, 2);

/** Believable whole-number counts: owner highest, likely-late person lowest. */
export function demoCounts(s: AppState): Counts {
  const all = ids(s);
  const late = roles(s).late;
  const c: Counts = {};
  countCosts(s).forEach((cost, i) => {
    const m = cost.measure!;
    const known = DEMO_COUNTS[m];
    if (known && all.every((id) => known[id] !== undefined)) return void (c[m] = { ...known });
    const base = [48, 14, 30][i] ?? 30;
    const row: Record<string, number> = { [OWNER]: base };
    s.people
      .filter((p) => p.id !== late)
      .forEach((p, k) => (row[p.id] = Math.max(1, Math.round(base * (0.95 - 0.13 * k)))));
    if (late) row[late] = Math.max(1, Math.round(base * 0.4));
    c[m] = row;
  });
  return c;
}

const open = (s: AppState, kind: DecisionKind, pid: string | null) =>
  !!pid && s.decisions.some((d) => d.kind === kind && d.personId === pid && d.status === "open");
const nm = (s: AppState, id: string | null) => (id ? personName(s, id) : "");

export function timeline(s: AppState): Ev[] {
  const r = roles(s);
  const evs: Ev[] = [
    {
      date: "2026-08-28",
      label: () => "Colleagues reply to the split",
      wait: (x) => (!x.people.length ? "Add at least one colleague in setup" : x.stage !== "replies" && x.stage !== "live" ? "Waiting for you to send the split" : null),
      run: (x) => {
        const other = r.late && r.late !== r.asker ? r.late : r.onTime;
        const measure = countCosts(x)[0]?.measure;
        for (const p of x.people) {
          if (x.invites[p.id]?.status !== "waiting") continue;
          if (p.id === r.asker && other) {
            x.invites[p.id] = { status: "question", question: `Why is my ${measure ? `${measure.replace(/s$/, "")} ` : ""}share higher than ${shortName(x, other)}'s?` };
            addHistory(x, p.id, "Asked a question about the split");
          } else {
            x.invites[p.id] = { status: "accepted" };
            addHistory(x, p.id, "Accepted the split");
          }
        }
      },
    },
    {
      date: "2026-08-28",
      label: (x) => `${nm(x, r.asker)} accepts after your answer`,
      skip: () => !r.asker || !(r.late !== r.asker ? r.late : r.onTime),
      wait: (x) => (r.asker && x.invites[r.asker]?.status === "question" ? `Waiting for you to answer ${nm(x, r.asker)}` : null),
      run: (x) => {
        if (r.asker && x.invites[r.asker]?.status !== "accepted") {
          x.invites[r.asker] = { ...x.invites[r.asker], status: "accepted" };
          addHistory(x, r.asker, "Accepted the split");
        }
      },
    },
    {
      date: BILL_DATE,
      label: (x) => (x.numbers.kind === "staff" ? `${x.numbers.staffName.replace(/\s*\(.*\)$/, "") || "Your staff"} sends ${USAGE_MONTH}'s numbers` : `${USAGE_MONTH}'s bills are ready`),
      wait: (x) => {
        const stuck = x.people.find((p) => x.invites[p.id]?.status === "question" || x.invites[p.id]?.status === "declined");
        if (stuck) return `Waiting for you to reply to ${stuck.name}`;
        return x.stage !== "live" ? "Waiting for you to open Home" : null;
      },
      run: (x) => {
        // Colleagues still just "waiting" (e.g. after the split was re-sent) accept now, so the demo never stalls.
        for (const p of x.people)
          if (x.invites[p.id]?.status !== "accepted") {
            x.invites[p.id] = { ...x.invites[p.id], status: "accepted" };
            addHistory(x, p.id, "Accepted the split");
          }
        if (x.numbers.kind === "staff" && countCosts(x).length) {
          x.counts = demoCounts(x);
          x.countsFrom = "staff";
        }
      },
    },
    {
      date: "2026-09-23",
      label: () => "Razorpay sends invoice reminders",
      wait: (x) => (!x.billsSent ? "Waiting for you to send the bills" : null),
      run: (x) => x.people.forEach((p) => paidBy(x, p.id) < (x.bills?.[p.id] ?? 0) && addHistory(x, p.id, "Razorpay sent a reminder")),
    },
    {
      date: "2026-09-25",
      label: (x) => `${nm(x, r.asker)} replies on WhatsApp`,
      skip: () => !r.asker,
      run: (x) => {
        if (!r.asker || paidBy(x, r.asker) >= (x.bills?.[r.asker] ?? 0)) return;
        const msg = askerMessage();
        x.decisions.push({ id: newId("d"), kind: "more-time", personId: r.asker, text: msg, created: x.today, status: "open" });
        addHistory(x, r.asker, `Said: “${msg}”`);
      },
    },
    {
      date: "2026-09-26",
      label: (x) => `${nm(x, r.asker)} accepts the plan`,
      skip: () => !r.asker,
      wait: (x) => (open(x, "more-time", r.asker) ? `Waiting for you to reply to ${nm(x, r.asker)}` : null),
      run: (x) => {
        if (r.asker && x.plans[r.asker]?.status === "offered") {
          x.plans[r.asker].status = "accepted";
          addHistory(x, r.asker, "Accepted the plan");
        }
      },
    },
    {
      date: "2026-09-27",
      label: (x) => `Agent flags ${nm(x, r.late)} as likely late`,
      skip: () => !r.late || r.late === r.asker,
      run: (x) => {
        if (r.late && x.permissions.remind && paidBy(x, r.late) < (x.bills?.[r.late] ?? 0))
          x.decisions.push({ id: newId("d"), kind: "nudge", personId: r.late, text: "", created: x.today, status: "open" });
      },
    },
    {
      date: "2026-09-28",
      label: (x) => `${nm(x, r.onTime)} pays`,
      skip: () => !r.onTime,
      wait: (x) => (open(x, "nudge", r.late) ? `Waiting for you on ${nm(x, r.late)}'s reminder` : null),
      run: (x) => {
        if (r.onTime) pay(x, r.onTime, x.bills?.[r.onTime] ?? 0);
        for (const p of x.people) if (p.id !== r.asker && p.id !== r.late) pay(x, p.id, x.bills?.[p.id] ?? 0);
      },
    },
    {
      date: "2026-09-29",
      label: (x) => `${nm(x, r.asker)} pays the first part`,
      skip: (x) => !r.asker || (!x.plans[r.asker] && r.asker === r.late),
      wait: (x) => (r.asker && x.plans[r.asker]?.status === "offered" ? `Waiting for ${nm(x, r.asker)} to accept the plan` : null),
      run: (x) => {
        if (r.asker) pay(x, r.asker, x.plans[r.asker] ? x.plans[r.asker].parts[0].amount : x.bills?.[r.asker] ?? 0);
      },
    },
    { date: DUE_DATE, label: () => "Due date", run: () => {} },
    {
      date: "2026-10-18",
      label: (x) => `${joinNames([...new Set([r.asker, r.late].filter(Boolean) as string[])].map((id) => nm(x, id)))} pay${r.asker === r.late ? "s" : ""}`,
      skip: () => !r.asker,
      run: (x) => {
        for (const id of new Set([r.asker, r.late])) if (id) pay(x, id, x.bills?.[id] ?? 0);
      },
    },
  ];
  const byDate = new Map<string, string[]>();
  for (const o of outflows(s.costs, OUT_MONTH)) byDate.set(o.date, [...(byDate.get(o.date) ?? []), lcFirst(o.label)]);
  for (const [date, names] of byDate)
    evs.push({ date, label: () => `You pay ${joinNames(names)}`, run: (x) => void x.outflowsPaid.push(date) });
  evs.sort((a, b) => a.date.localeCompare(b.date));
  evs.push(
    {
      date: "2026-10-31",
      label: () => `${USAGE_MONTH} closes`,
      run: (x) => {
        x.monthClosed = true;
        x.learned = [
          ...(x.tone && r.asker ? [{ text: `${nm(x, r.asker)} gets a ${x.tone} tone`, label: "you told it" as const }] : []),
          ...(r.late
            ? [
                { text: `${nm(x, r.late)} pays after the due date`, label: "seen once" as const },
                { text: `Nudge ${nm(x, r.late)} 3 days before the due date`, label: "a guess" as const },
              ]
            : []),
        ];
      },
    },
    {
      date: "2026-11-01",
      label: () => "September begins",
      wait: (x) => (!x.summarySeen ? "Open the month summary first" : null),
      run: (x) => {
        if (r.late && x.permissions.remind)
          x.decisions.push({ id: newId("d"), kind: "nudge", personId: r.late, text: "", created: x.today, status: "open", learned: true, amount: x.bills?.[r.late] ?? 0, due: NEXT_DUE });
        const plan = r.asker ? x.plans[r.asker] : undefined;
        if (r.asker && plan && x.permissions.plan)
          x.decisions.push({
            id: newId("d"),
            kind: "nudge",
            personId: r.asker,
            text: "",
            created: x.today,
            status: "open",
            learned: true,
            plan: plan.parts.map((p) => ({ amount: p.amount, date: addMonths(p.date, 2) })),
            reason: plan.reason ? { ...plan.reason, date: addMonths(plan.reason.date, 2) } : undefined,
            tone: x.tone ?? "warm",
          });
      },
    },
  );
  return evs;
}

function nextIndex(s: AppState) {
  const tl = timeline(s);
  let i = s.step;
  while (tl[i]?.skip?.(s)) i++;
  return { tl, i };
}

export function nextInfo(s: AppState): { label: string; wait: string | null } {
  const { tl, i } = nextIndex(s);
  const ev = tl[i];
  if (!ev) return { label: "Demo finished", wait: "Demo finished — press Restart" };
  return { label: ev.label(s), wait: ev.wait?.(s) ?? null };
}

/** Runs the next timeline event. Returns its toast text. */
export function advance(d: AppState): string | null {
  const { tl, i } = nextIndex(d);
  const ev = tl[i];
  if (!ev) return null;
  const label = ev.label(d);
  if (ev.date > d.today) d.today = ev.date;
  ev.run(d);
  d.step = i + 1;
  return `${label}`;
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
  evalView: boolean;
}
const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [evalView, setEval] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setDemo(q.has("demo"));
    setEval(q.has("demo") && q.has("eval"));
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
  return <C.Provider value={{ s, update, reset, toast, showToast, demo, evalView }}>{children}</C.Provider>;
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
