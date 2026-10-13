import { describe, expect, it } from "vitest";
import { finalizeDraft, localDraftSplit, messyDemoText } from "./ai-local";

describe("exact messy demo fallback", () => {
  const people = [{ id: "a", name: "Vartika" }, { id: "b", name: "Sukhpal" }];
  const draft = () => finalizeDraft(localDraftSplit(messyDemoText(people), people), people);
  it.each([
    [0, "Machine EMI", 40000, 5, "count", "scans"],
    [1, "Rent", 45000, 5, "count", "sessions"],
    [2, "Salary", 25000, 7, "equal", undefined],
    [3, "Bijli paani", 10000, 20, "fixed", undefined],
  ])("cost %s preserves the specified amount, method and payment day", (i, name, amount, payDay, method, measure) => {
    expect(draft().costs[Number(i)]).toMatchObject({ name, amount, payDay, method });
    expect(draft().costs[Number(i)]?.measure).toBe(measure);
  });
  it("assigns exactly ₹2,000 to the last colleague, with no unresolved names", () => {
    const custom = [...people, { id: "last", name: "Dr Priya Sharma" }];
    const result = finalizeDraft(localDraftSplit(messyDemoText(custom), custom), custom);
    expect(result.costs).toHaveLength(4);
    expect(result.costs[3]?.fixed).toEqual({ last: 2000 });
    expect(result.questions).toEqual([]);
  });
  it("keeps the normal parser for edited text", () => {
    const result = localDraftSplit("Rent ₹12,000 equally, paid on the 1st.", people);
    expect(result.costs).toHaveLength(1);
    expect(result.costs[0]).toMatchObject({ amount: 12000, payDay: 1, method: "equal" });
  });
});