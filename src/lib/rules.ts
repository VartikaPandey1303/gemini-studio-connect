// Pure rules engine for Shared Collect. No UI code. Every rupee comes from here.

export type Method = "equal" | "count" | "share" | "fixed";

export interface Cost {
  id: string;
  name: string;
  amount: number;
  payDay: number | null;
  method: Method;
  measure?: string;
  shares?: Record<string, number>; // personId -> fraction
  fixed?: Record<string, number>; // personId -> rupees
  assumed?: boolean;
}

export type Counts = Record<string, Record<string, number>>; // measure -> personId -> count

const EPS = 1e-7;

/** Largest-remainder allocation. Ties go to the lowest running total, then by order. */
export function allocate(
  amount: number,
  weights: Record<string, number>,
  running: Record<string, number>,
  order: string[],
): Record<string, number> {
  const ids = order.filter((id) => weights[id] !== undefined);
  const out: Record<string, number> = {};
  const sum = ids.reduce((a, id) => a + weights[id], 0);
  if (sum <= 0 || ids.length === 0) {
    ids.forEach((id) => (out[id] = 0));
    return out;
  }
  const raw = ids.map((id) => ({ id, v: (amount * weights[id]) / sum }));
  let given = 0;
  raw.forEach((r) => {
    out[r.id] = Math.floor(r.v + EPS);
    given += out[r.id];
  });
  const left = Math.round(amount - given);
  const frac = (v: number) => v - Math.floor(v + EPS);
  const sorted = [...raw].sort((a, b) => {
    const d = frac(b.v) - frac(a.v);
    if (Math.abs(d) > 1e-6) return d;
    const ra = running[a.id] ?? 0;
    const rb = running[b.id] ?? 0;
    if (ra !== rb) return ra - rb;
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  for (let i = 0; i < left; i++) out[sorted[i % sorted.length].id]++;
  return out;
}

export interface SharesResult {
  byCost: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  total: number;
}

export function computeShares(costs: Cost[], ids: string[], counts: Counts | null): SharesResult {
  const running: Record<string, number> = Object.fromEntries(ids.map((i) => [i, 0]));
  const byCost: Record<string, Record<string, number>> = {};
  for (const c of costs) {
    let line: Record<string, number> = {};
    if (c.method === "equal") {
      line = allocate(c.amount, Object.fromEntries(ids.map((i) => [i, 1])), running, ids);
    } else if (c.method === "count") {
      const m = (c.measure && counts?.[c.measure]) || {};
      line = allocate(c.amount, Object.fromEntries(ids.map((i) => [i, m[i] ?? 0])), running, ids);
    } else {
      const named = c.method === "share" ? c.shares ?? {} : c.fixed ?? {};
      let used = 0;
      for (const id of ids) {
        if (named[id] === undefined) continue;
        line[id] = c.method === "share" ? Math.floor(c.amount * named[id] + EPS) : Math.round(named[id]);
        used += line[id];
      }
      const others = ids.filter((i) => named[i] === undefined);
      const rest = allocate(
        Math.max(0, c.amount - used),
        Object.fromEntries(others.map((i) => [i, 1])),
        running,
        ids,
      );
      line = { ...line, ...rest };
    }
    byCost[c.id] = line;
    for (const id of ids) running[id] += line[id] ?? 0;
  }
  const total = ids.reduce((a, i) => a + running[i], 0);
  return { byCost, totals: running, total };
}

/** Plain-words maths for one person on one cost line. */
export function explainLine(c: Cost, id: string, ids: string[], counts: Counts | null, result: number): string {
  if (c.method === "count") {
    const m = (c.measure && counts?.[c.measure]) || {};
    const tot = ids.reduce((a, i) => a + (m[i] ?? 0), 0);
    const mine = m[id] ?? 0;
    const exact = tot ? (mine / tot) * c.amount : 0;
    return `${mine} of ${tot} ${c.measure} × ${money(c.amount)} = ${exact.toLocaleString("en-IN", { maximumFractionDigits: 2 })} → ${money(result)}`;
  }
  if (c.method === "equal") return `${money(c.amount)} ÷ ${ids.length} people → ${money(result)}`;
  if (c.method === "share" && c.shares?.[id] !== undefined)
    return `${fractionWords(c.shares[id])} of ${money(c.amount)} → ${money(result)}`;
  if (c.method === "fixed" && c.fixed?.[id] !== undefined) return `Fixed amount → ${money(result)}`;
  return `Equal part of what's left of ${money(c.amount)} → ${money(result)}`;
}

export function fractionWords(f: number): string {
  const known: [number, string][] = [
    [1 / 3, "One-third"],
    [2 / 3, "Two-thirds"],
    [1 / 4, "A quarter"],
    [1 / 2, "Half"],
    [3 / 4, "Three-quarters"],
  ];
  for (const [v, w] of known) if (Math.abs(v - f) < 1e-6) return w;
  return `${Math.round(f * 1000) / 10}%`;
}

// ---------- Cash flow ----------

export interface Flow {
  date: string; // ISO yyyy-mm-dd
  amount: number;
  label: string;
}
export interface Inflow {
  personId: string;
  amount: number;
  date: string | null; // null = not counted
}

export function outflows(costs: Cost[], month: string): Flow[] {
  return costs
    .filter((c) => c.payDay)
    .map((c) => ({ date: `${month}-${String(c.payDay).padStart(2, "0")}`, amount: c.amount, label: c.name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function cashGap(outs: Flow[], ins: Inflow[], byDate: string) {
  const need = outs.filter((o) => o.date <= byDate).reduce((a, o) => a + o.amount, 0);
  const inflow = ins.filter((i) => i.date && i.date <= byDate).reduce((a, i) => a + i.amount, 0);
  return { date: byDate, need, inflow, gap: Math.max(0, need - inflow) };
}

export function keyDate(outs: Flow[], ins: Inflow[]) {
  const dates = [...new Set(outs.map((o) => o.date))].sort();
  let best = cashGap(outs, ins, dates[0] ?? "9999-12-31");
  for (const d of dates) {
    const g = cashGap(outs, ins, d);
    if (g.need - g.inflow > best.need - best.inflow) best = g;
  }
  return best;
}

export interface Part {
  amount: number;
  date: string;
}

export function planSizing(gap: number, stillDue: number, dueDate: string, namedDate: string): Part[] {
  const p1 = Math.min(gap, stillDue);
  const parts: Part[] = [];
  if (p1 > 0) parts.push({ amount: p1, date: dueDate });
  if (stillDue - p1 > 0) parts.push({ amount: stillDue - p1, date: namedDate });
  return parts;
}

export interface Payment {
  id: string;
  personId: string;
  amount: number;
  date: string;
  plan?: boolean;
}

export function monthMetrics(opts: {
  payments: Payment[];
  ownerId: string;
  dueDate: string;
  total: number;
  colleagueTotal: number;
}) {
  const { payments, ownerId, dueDate, total, colleagueTotal } = opts;
  const byDue = payments.filter((p) => p.date <= dueDate);
  const inByDue = byDue.reduce((a, p) => a + p.amount, 0);
  const colByDue = byDue.filter((p) => p.personId !== ownerId).reduce((a, p) => a + p.amount, 0);
  const colNoPlan = byDue.filter((p) => p.personId !== ownerId && !p.plan).reduce((a, p) => a + p.amount, 0);
  const all = payments.reduce((a, p) => a + p.amount, 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  return {
    inByDue,
    colByDue,
    colNoPlan,
    pctInByDue: pct(inByDue, total),
    pctColByDue: pct(colByDue, colleagueTotal),
    pctCollected: pct(all, total),
    pctWithoutPlan: pct(colNoPlan, colleagueTotal),
  };
}

// ---------- AI guardrail ----------

/** Rejects an AI message if any ₹ figure differs from the rule-engine amounts, or a required one is missing. */
export function amountsMatch(text: string, required: number[]): boolean {
  const found = [...text.matchAll(/(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d+)?)/gi)].map((m) => Number(m[1].replace(/,/g, "")));
  const allowed = new Set(required);
  if (found.some((f) => !allowed.has(f))) return false;
  return required.every((r) => found.includes(r));
}

// ---------- Formatting ----------

export function money(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}
