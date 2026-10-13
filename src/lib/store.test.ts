import { describe, expect, it } from "vitest";
import { demoCounts, initialState, roles } from "./store";

const withPeople = (names: string[]) => {
  const s = initialState();
  s.people = names.map((n, i) => ({ id: `p${i}`, name: n, phone: "" }));
  s.costs = [{ id: "c", name: "Echo EMI", amount: 40000, payDay: 5, method: "count", measure: "scans" }];
  return s;
};

describe("demo roles", () => {
  it("3 colleagues: 1 on time, 2 asks for time, 3 likely late", () => {
    expect(roles(withPeople(["A", "B", "C"]))).toEqual({ onTime: "p0", asker: "p1", late: "p2" });
  });
  it("2 colleagues: colleague 2 both asks and pays late", () => {
    expect(roles(withPeople(["Vartika", "Sukhpal"]))).toEqual({ onTime: "p0", asker: "p1", late: "p1" });
  });
  it("generated counts: owner highest, likely-late lowest", () => {
    const c = demoCounts(withPeople(["Vartika", "Sukhpal"])).scans;
    expect(c.me).toBeGreaterThan(c.p0);
    expect(c.p1).toBeLessThan(c.p0);
  });
});
