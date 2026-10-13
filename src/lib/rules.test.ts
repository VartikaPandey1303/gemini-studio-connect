import { describe, expect, it } from "vitest";
import { amountsMatch, computeShares, keyDate, monthMetrics, outflows, planSizing, type Cost, type Inflow } from "./rules";
import { finalizeDraft, localDraftSplit, localReadMessage } from "./ai-local";

const ids = ["me", "bhatt", "arjun", "dhruv"];
const costs: Cost[] = [
  { id: "emi", name: "Echo machine EMI", amount: 40000, payDay: 5, method: "count", measure: "scans" },
  { id: "rooms", name: "Consultation rooms", amount: 45000, payDay: 5, method: "count", measure: "sessions" },
  { id: "sal", name: "Technician salary", amount: 25000, payDay: 7, method: "equal" },
  { id: "util", name: "Utilities", amount: 10000, payDay: 20, method: "share", shares: { dhruv: 1 / 3 } },
];
const counts = {
  scans: { me: 48, bhatt: 46, arjun: 38, dhruv: 22 },
  sessions: { me: 14, bhatt: 14, arjun: 12, dhruv: 6 },
};
const r = computeShares(costs, ids, counts);
const outs = outflows(costs, "2026-10");

describe("reference split", () => {
  it("totals per person", () => {
    expect(r.totals).toEqual({ me: 34636, bhatt: 34116, arjun: 30082, dhruv: 21166 });
    expect(r.total).toBe(120000);
  });
  it("utilities with Dhruv one-third", () => {
    expect(r.byCost.util).toEqual({ me: 2222, bhatt: 2222, arjun: 2223, dhruv: 3333 });
  });
  it("EMI by scans", () => {
    expect(r.byCost.emi).toEqual({ me: 12468, bhatt: 11948, arjun: 9870, dhruv: 5714 });
  });
});

describe("cash gap", () => {
  const ins = (countDhruv: boolean): Inflow[] => [
    { personId: "me", amount: 34636, date: "2026-09-01" },
    { personId: "bhatt", amount: 34116, date: "2026-09-30" },
    { personId: "dhruv", amount: 21166, date: countDhruv ? "2026-09-30" : null },
    { personId: "arjun", amount: 30082, date: "2026-10-20" },
  ];
  it("short ₹20,082 on 7 Oct", () => {
    expect(keyDate(outs, ins(true))).toEqual({ date: "2026-10-07", need: 110000, inflow: 89918, gap: 20082 });
  });
  it("short ₹41,248 if Dhruv is not counted", () => {
    expect(keyDate(outs, ins(false)).gap).toBe(41248);
  });
  it("plan ₹20,082 by 30 Sept + ₹10,000 by 20 Oct", () => {
    expect(planSizing(20082, 30082, "2026-09-30", "2026-10-20")).toEqual([
      { amount: 20082, date: "2026-09-30" },
      { amount: 10000, date: "2026-10-20" },
    ]);
  });
});

describe("month metrics", () => {
  it("74 / 63 / 100 / 40", () => {
    const m = monthMetrics({
      ownerId: "me",
      dueDate: "2026-09-30",
      total: 120000,
      colleagueTotal: 85364,
      payments: [
        { id: "1", personId: "me", amount: 34636, date: "2026-09-01" },
        { id: "2", personId: "bhatt", amount: 34116, date: "2026-09-28" },
        { id: "3", personId: "arjun", amount: 20082, date: "2026-09-29", plan: true },
        { id: "4", personId: "arjun", amount: 10000, date: "2026-10-18", plan: true },
        { id: "5", personId: "dhruv", amount: 21166, date: "2026-10-18" },
      ],
    });
    expect([m.pctInByDue, m.pctColByDue, m.pctCollected, m.pctWithoutPlan]).toEqual([74, 63, 100, 40]);
  });
});

describe("AI guardrail", () => {
  it("rejects a message with an altered amount", () => {
    expect(amountsMatch("Pay ₹20,000 by 30 Sept and ₹10,000 later", [20082, 10000])).toBe(false);
  });
  it("accepts the exact amounts", () => {
    expect(amountsMatch("Pay ₹20,082 by 30 Sept and ₹10,000 by 20 Oct", [20082, 10000])).toBe(true);
  });
});

describe("local split drafting", () => {
  const people = [
    { id: "bhatt", name: "Dr Bhatt" },
    { id: "arjun", name: "Dr Arjun" },
    { id: "dhruv", name: "Dr Dhruv" },
  ];
  it("drafts the reference description", () => {
    const d = finalizeDraft(
      localDraftSplit(
        "Echo machine EMI of ₹40,000 split by scans, paid on the 5th. Consultation rooms ₹45,000 split by sessions, paid on the 5th. Technician salary ₹25,000 equally, paid on the 7th. Utilities ₹10,000, Dhruv pays one-third, paid on the 20th.",
      ),
      people,
    );
    expect(d.questions).toHaveLength(0);
    expect(d.costs.map((c) => [c.name, c.amount, c.payDay, c.method, c.measure ?? null])).toEqual([
      ["Echo machine EMI", 40000, 5, "count", "scans"],
      ["Consultation rooms", 45000, 5, "count", "sessions"],
      ["Technician salary", 25000, 7, "equal", null],
      ["Utilities", 10000, 20, "share", null],
    ]);
    expect(d.costs[3].shares).toEqual({ dhruv: 1 / 3 });
  });
  it("renal care: dialysis sessions + unknown name becomes a question", () => {
    const d = finalizeDraft(localDraftSplit("Machine EMI ₹60k split by dialysis sessions. Rao pays 50% of rent ₹30,000"), people);
    expect(d.costs[0]).toMatchObject({ name: "Machine EMI", amount: 60000, method: "count", measure: "dialysis sessions" });
    expect(d.costs[1]).toMatchObject({ name: "Rent", amount: 30000, method: "share" });
    expect(d.questions[0].rawName).toBe("Rao");
  });
  it("reads a request for more time", () => {
    const m = localReadMessage("Meera ji, is month thoda tight hai. 20 tak kar dunga, pakka.", "2026-09-25");
    expect(m.intent).toBe("more-time");
    expect(m.date).toBe("2026-10-20");
  });
});
