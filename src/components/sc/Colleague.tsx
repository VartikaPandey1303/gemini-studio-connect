import { useState } from "react";
import { ShieldCheck, Copy, X, ChevronDown, CheckCircle2 } from "lucide-react";
import {
  ACCOUNT,
  DUE_DATE,
  billStatus,
  ids,
  newId,
  paidBy,
  pay,
  personName,
  shares,
  shortName,
  useStore,
  addHistory,
  type AppState,
} from "@/lib/store";
import { computeShares, explainLine, fmtDate, money } from "@/lib/rules";
import { readMessage } from "@/lib/ai";
import { Pill } from "./ui";
import { costSentence } from "./Setup";

export function ColleaguePreview({ pid, onClose }: { pid: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-demo/60 p-3 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between text-sm text-demo-foreground">
          <span>Preview — read only</span>
          <button onClick={onClose} aria-label="Close preview">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-hidden rounded-[28px] border-4 border-nav-active bg-background">
          <ColleaguePage pid={pid} readOnly />
        </div>
      </div>
    </div>
  );
}

function nextDue(s: AppState, pid: string) {
  const left = (s.bills?.[pid] ?? 0) - paidBy(s, pid);
  const plan = s.plans[pid];
  if (plan?.status === "accepted") {
    let paidSoFar = paidBy(s, pid);
    for (const p of plan.parts) {
      if (paidSoFar >= p.amount) {
        paidSoFar -= p.amount;
        continue;
      }
      return { amount: Math.min(left, p.amount - paidSoFar), date: p.date };
    }
  }
  return { amount: left, date: s.promised[pid] ?? DUE_DATE };
}

export function ColleaguePage({ pid, readOnly }: { pid: string; readOnly?: boolean }) {
  const { s, update, showToast } = useStore();
  const me = s.people.find((p) => p.id === pid);
  const [mode, setMode] = useState<"none" | "ask" | "decline" | "counter" | "bank">("none");
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [tell, setTell] = useState("");
  const [sending, setSending] = useState(false);
  const plan = s.plans[pid];
  const [counter, setCounter] = useState(() => plan?.parts.map((p) => ({ ...p })) ?? []);
  if (!me) return <div className="p-6 text-sm">This page isn't available.</div>;
  const inv = s.invites[pid];
  const guard = (fn: () => void) => () => (readOnly ? showToast("Preview — they can tap this on their own phone.") : fn());
  const billed = !!s.billsSent && !!s.bills;
  const sh = billed ? shares(s) : computeShares(s.costs.filter((c) => c.method !== "count"), ids(s), null);
  const owner = ACCOUNT.owner.replace(/^Dr\.?\s*/, "");
  const status = billed ? billStatus(s, pid) : null;
  const due = billed ? nextDue(s, pid) : null;

  return (
    <div className="text-sm">
      <div className="bg-nav px-5 pb-5 pt-6 text-nav-foreground">
        <div className="text-xs text-nav-muted">Razorpay · {ACCOUNT.business}</div>
        <div className="mt-1 text-lg font-semibold">Hi {me.name}</div>
        {!billed && <p className="mt-1 text-nav-muted">{owner} has shared how {ACCOUNT.business}' monthly costs are split.</p>}
      </div>
      <div className="space-y-4 p-5">
        {!billed && (
          <div className="flex gap-3 rounded-lg bg-ok-soft p-3 text-xs text-ok">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <div>Bills come in {ACCOUNT.business}' name. No auto-debit. You can ask before accepting. Nobody else sees your status.</div>
          </div>
        )}

        {billed && due && (
          <div className="card p-5 text-center">
            {status === "Paid" ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-ok" />
                <div className="mt-2 text-lg font-semibold">All paid for {"August"}</div>
                <div className="num text-muted-foreground">{money(s.bills![pid])}</div>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">August share {status && <Pill>{status}</Pill>}</div>
                <div className="num mt-1 text-3xl font-semibold">{money(due.amount)}</div>
                <div className="text-muted-foreground">due by {fmtDate(due.date)}</div>
                {plan?.status !== "offered" && (
                  <>
                    <button className="btn-primary mt-4 w-full" onClick={guard(() => update((d) => pay(d, pid, due.amount)))}>
                      Pay {money(due.amount)} with UPI
                    </button>
                    <button className="mt-2 text-xs text-primary" onClick={() => setMode(mode === "bank" ? "none" : "bank")}>
                      Pay by bank transfer instead
                    </button>
                    {mode === "bank" && (
                      <div className="mt-3 space-y-2 rounded-md bg-muted p-3 text-left text-xs">
                        {[
                          ["Account", `2223330${pid.length}${pid.charCodeAt(0)}04512`],
                          ["IFSC", "RATN0VAAPIS"],
                          ["Name", ACCOUNT.business],
                        ].map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="num flex items-center gap-2">
                              {v}
                              <button aria-label={`Copy ${k}`} onClick={() => navigator.clipboard?.writeText(v).then(() => showToast("Copied"))}>
                                <Copy className="h-3 w-3" />
                              </button>
                            </span>
                          </div>
                        ))}
                        <div className="text-muted-foreground">This account is just for you — payments match automatically.</div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {plan?.status === "offered" && (
          <div className="card space-y-3 p-4">
            <div className="text-xs font-medium text-muted-foreground">Message from {owner}</div>
            <p>{plan.message}</p>
            <div className="divide-y rounded-md border">
              {plan.parts.map((p, i) => (
                <div key={i} className="flex justify-between p-2.5">
                  <span className="num">{money(p.amount)}</span>
                  <span className="num text-muted-foreground">by {fmtDate(p.date)}</span>
                </div>
              ))}
            </div>
            {mode !== "counter" ? (
              <div className="flex gap-2">
                <button
                  className="btn-primary flex-1"
                  onClick={guard(() =>
                    update((d) => {
                      d.plans[pid].status = "accepted";
                      addHistory(d, pid, "Accepted the plan");
                    }),
                  )}
                >
                  Accept the plan
                </button>
                <button className="btn-secondary" onClick={guard(() => setMode("counter"))}>
                  Suggest other dates
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {counter.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="field num" value={p.amount} onChange={(e) => setCounter((c) => c.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
                    <input type="date" className="field num" value={p.date} onChange={(e) => setCounter((c) => c.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                  </div>
                ))}
                {(() => {
                  const sum = counter.reduce((a, p) => a + p.amount, 0);
                  const need = plan.parts.reduce((a, p) => a + p.amount, 0);
                  const why = sum !== need ? `Parts must add up to ${money(need)}` : null;
                  return (
                    <>
                      <button
                        className="btn-primary w-full"
                        disabled={!!why}
                        onClick={() => {
                          update((d) => {
                            d.decisions.push({ id: newId("d"), kind: "counter", personId: pid, text: "", counter, created: d.today, status: "open" });
                            addHistory(d, pid, "Suggested other dates");
                          });
                          setMode("none");
                          showToast(`Sent to ${owner}`);
                        }}
                      >
                        Send to {owner}
                      </button>
                      {why && <div className="text-xs text-warn">{why}</div>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        <div className="card divide-y">
          <div className="p-4 font-medium">Your part, line by line</div>
          {s.costs.map((c) => {
            const amt = sh.byCost[c.id]?.[pid];
            const isUsage = c.method === "count" && !billed;
            return (
              <button key={c.id} className="block w-full p-4 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div>{c.name}</div>
                    <div className="text-xs text-muted-foreground">{costSentence(s, c).how}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="num">{isUsage ? "monthly" : money(amt ?? 0)}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                {open === c.id && (
                  <div className="num mt-2 rounded bg-muted p-2 text-xs">
                    {isUsage ? `your ${c.measure} ÷ everyone's ${c.measure} × ${money(c.amount)}` : explainLine(c, pid, ids(s), s.counts, amt ?? 0)}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {!billed && inv && (
          <div className="space-y-3">
            {inv.status === "accepted" && <div className="rounded-lg bg-ok-soft p-3 text-ok">You've accepted. Your first bill comes on 1 Sept.</div>}
            {inv.status === "declined" && <div className="rounded-lg bg-bad-soft p-3 text-bad">You declined. {owner} will get in touch.</div>}
            {inv.question && (
              <div className="card p-3">
                <div className="text-xs text-muted-foreground">You asked</div>
                <div>{inv.question}</div>
                {inv.answer ? (
                  <>
                    <div className="mt-2 text-xs text-muted-foreground">{owner} replied</div>
                    <div>{inv.answer}</div>
                  </>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">{owner} will reply here.</div>
                )}
              </div>
            )}
            {inv.status !== "accepted" && mode === "none" && (
              <>
                <button
                  className="btn-primary w-full"
                  onClick={guard(() =>
                    update((d) => {
                      d.invites[pid].status = "accepted";
                      addHistory(d, pid, "Accepted the split");
                    }),
                  )}
                >
                  Accept
                </button>
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={guard(() => setMode("ask"))}>
                    Ask a question
                  </button>
                  <button className="btn-ghost flex-1" onClick={guard(() => setMode("decline"))}>
                    Decline
                  </button>
                </div>
              </>
            )}
            {(mode === "ask" || mode === "decline") && (
              <div className="space-y-2">
                <textarea className="field min-h-[80px]" placeholder={mode === "ask" ? "Your question" : "Why? (optional but helps)"} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    className="btn-primary flex-1"
                    disabled={mode === "ask" && !text.trim()}
                    onClick={() => {
                      update((d) => {
                        d.invites[pid] =
                          mode === "ask" ? { status: "question", question: text.trim() } : { status: "declined", reason: text.trim() || "No reason given" };
                        addHistory(d, pid, mode === "ask" ? "Asked a question about the split" : "Declined the split");
                      });
                      setMode("none");
                      setText("");
                    }}
                  >
                    {mode === "ask" ? "Send question" : "Decline"}
                  </button>
                  <button className="btn-ghost" onClick={() => setMode("none")}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {billed && (
          <div className="card space-y-2 p-4">
            <div className="font-medium">Something not right? Tell {owner}</div>
            <textarea className="field min-h-[70px]" placeholder="e.g. Can I pay on the 20th?" value={tell} onChange={(e) => setTell(e.target.value)} />
            <button
              className="btn-secondary w-full"
              disabled={!tell.trim() || sending}
              onClick={guard(async () => {
                setSending(true);
                const r = await readMessage(tell, s.today);
                update((d) => {
                  d.decisions.push({
                    id: newId("d"),
                    kind: r.intent === "more-time" ? "more-time" : "message",
                    personId: pid,
                    text: tell.trim(),
                    read: r,
                    created: d.today,
                    status: "open",
                  });
                  addHistory(d, pid, `Said: “${tell.trim()}”`);
                });
                setTell("");
                setSending(false);
                showToast(`Sent to ${owner}`);
              })}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        )}

        {(s.history[pid]?.length ?? 0) > 0 && (
          <div className="card p-4">
            <div className="mb-2 font-medium">Your history</div>
            <ul className="space-y-1.5 text-xs">
              {s.history[pid].map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num w-14 shrink-0 text-muted-foreground">{fmtDate(h.date)}</span>
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="pb-2 text-center text-xs text-muted-foreground">Only you and {ACCOUNT.business} see this page.</p>
      </div>
    </div>
  );
}

export { personName, shortName };
