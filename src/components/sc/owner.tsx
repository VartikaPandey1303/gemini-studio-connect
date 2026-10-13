import { useEffect, useState } from "react";
import { AlertCircle, CalendarClock, ChevronDown, FileUp, MessageSquare, PartyPopper, Receipt, Bell, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  ACCOUNT,
  BILL_DATE,
  DUE_DATE,
  OWNER,
  USAGE_MONTH,
  addHistory,
  billStatus,
  countCosts,
  gapFor,
  ids,
  paidBy,
  personName,
  roles,
  shares,
  useStore,
  type AppState,
} from "@/lib/store";
import { explainLine, fmtDate, money, monthMetrics, type Counts } from "@/lib/rules";
import { write, type AiMeta } from "@/lib/ai";
import { reasonEn } from "@/lib/ai-local";
import { AiTag, Flow, Pill, Primary } from "./ui";
import { ColleaguePreview } from "./Colleague";
import { SplitCards } from "./Setup";

const INVITE_WORD = { waiting: "Waiting", accepted: "Accepted", question: "Has a question", declined: "Declined" } as const;

export interface HomeCard {
  id: string;
  icon: typeof Bell;
  title: string;
  line: string;
  button: string;
  view: AppState["view"];
  tone?: "ai";
}

export function homeCards(s: AppState): HomeCard[] {
  if (s.stage !== "live") return [];
  const out: HomeCard[] = [];
  if (s.today >= BILL_DATE && !s.billsSent)
    out.push(
      s.counts || !countCosts(s).length
        ? { id: "bills", icon: Receipt, title: `${USAGE_MONTH}'s bills are ready to send`, line: countCosts(s).length ? `${s.numbers.staffName || "Your staff"} sent the numbers on WhatsApp.` : "Check and send everyone's bill.", button: "Review bills", view: "bills" }
        : { id: "bills", icon: Receipt, title: `${USAGE_MONTH} is over — add ${USAGE_MONTH}'s numbers`, line: "Then check and send everyone's bill.", button: "Add numbers", view: "bills" },
    );
  for (const d of s.decisions.filter((x) => x.status === "open")) {
    const n = personName(s, d.personId);
    if (d.kind === "more-time") {
      const left = (s.bills?.[d.personId] ?? 0) - paidBy(s, d.personId);
      const g = gapFor(s, {}, { id: d.personId, parts: [{ amount: left, date: d.read?.date ?? "2026-10-20" }] });
      out.push({
        id: d.id,
        icon: CalendarClock,
        title: `${n} asked for more time`,
        line: g.gap > 0 ? `If you wait, you'll be ${money(g.gap)} short on ${fmtDate(g.date)}. The agent has a suggestion.` : "Waiting won't leave you short. The agent has a suggestion.",
        button: "Review",
        view: `decision:${d.id}`,
        tone: "ai",
      });
    } else if (d.kind === "nudge" && d.learned)
      out.push({
        id: d.id,
        icon: d.plan ? CalendarClock : Bell,
        title: d.plan ? `Plan for ${n} is ready in the ${d.tone ?? "warm"} tone` : `Reminder for ${n}, 3 days before the due date`,
        line: `Using what the agent learned in ${USAGE_MONTH}.`,
        button: "Review",
        view: `decision:${d.id}`,
        tone: "ai",
      });
    else if (d.kind === "nudge")
      out.push({ id: d.id, icon: Bell, title: `${n} may pay late`, line: "They paid after the due date before. A friendly reminder now could help.", button: "Review", view: `decision:${d.id}`, tone: "ai" });
    else if (d.kind === "counter")
      out.push({ id: d.id, icon: CalendarClock, title: `${n} suggested other dates`, line: "See what their dates mean for your payments.", button: "Review", view: `decision:${d.id}` });
    else out.push({ id: d.id, icon: MessageSquare, title: `${n} sent a message`, line: `“${d.text.slice(0, 70)}”`, button: "Reply", view: `decision:${d.id}`, tone: "ai" });
  }
  if (s.monthClosed && !s.summarySeen)
    out.push({ id: "sum", icon: PartyPopper, title: `${USAGE_MONTH} is closed`, line: "See how the month went and what the agent learned.", button: "See summary", view: "summary" });
  return out;
}

export function Home() {
  const { s, update } = useStore();
  const cards = homeCards(s);
  return (
    <div className="space-y-8 fade-up">
      <div>
        <h1 className="title-serif">What needs you now</h1>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className={`card flex flex-col p-5 ${c.tone === "ai" ? "border-ai/25" : ""}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${c.tone === "ai" ? "bg-ai-soft text-ai" : "bg-accent text-accent-foreground"}`}>
                  <c.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{c.title}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{c.line}</div>
                </div>
              </div>
              <button className="btn-primary mt-4 self-start" onClick={() => update((d) => void (d.view = c.view))}>
                {c.button} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!cards.length && (
            <div className="card flex items-center gap-3 p-5 text-sm text-muted-foreground md:col-span-2">
              <CheckCircle2 className="h-5 w-5 text-ok" />
              {s.billsSent ? "Nothing needs you right now. The agent will bring anything new here." : `Nothing needs you right now. ${USAGE_MONTH}'s bills go out on ${fmtDate(BILL_DATE)}.`}
            </div>
          )}
        </div>
      </div>
      {s.billsSent && <BillsTable />}
    </div>
  );
}

function BillsTable() {
  const { s } = useStore();
  const next = (id: string) => {
    const st = billStatus(s, id);
    if (st === "Paid") return "—";
    const p = s.plans[id];
    if (p) {
      let paid = paidBy(s, id);
      for (const part of p.parts) {
        if (paid >= part.amount) paid -= part.amount;
        else return `${money(part.amount - paid)} by ${fmtDate(part.date)}`;
      }
    }
    return `${money((s.bills?.[id] ?? 0) - paidBy(s, id))} by ${fmtDate(DUE_DATE)}`;
  };
  return (
    <div>
      <h3 className="mb-3 font-semibold">{USAGE_MONTH}'s bills</h3>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="p-4 font-medium">Person</th>
              <th className="p-4 font-medium">Bill</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Next</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {s.people.map((p) => (
              <tr key={p.id}>
                <td className="p-4">{p.name}</td>
                <td className="num p-4">{money(s.bills?.[p.id] ?? 0)}</td>
                <td className="p-4">
                  <Pill>{billStatus(s, p.id)}</Pill>
                </td>
                <td className="num p-4 text-muted-foreground">{next(p.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Replies() {
  const { s, update, showToast } = useStore();
  const accepted = s.people.filter((p) => s.invites[p.id]?.status === "accepted").length;
  const all = accepted === s.people.length;
  return (
    <Flow title={`${accepted} of ${s.people.length} accepted the split`} sub="Bills wait until everyone has accepted.">
      {s.people.map((p) => (
        <ReplyRow key={p.id} pid={p.id} />
      ))}
      {all ? (
        <div className="rounded-lg bg-ok-soft p-5">
          <div className="font-medium text-ok">Everyone has accepted. First bills go out on {fmtDate(BILL_DATE)}.</div>
          <button
            className="btn-ok mt-3"
            onClick={() => {
              update((d) => {
                d.stage = "live";
                d.view = "home";
              });
              showToast("Shared costs agent is live");
            }}
          >
            Go to Home
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You'll see each reply here as it comes in.</p>
      )}
    </Flow>
  );
}

function ReplyRow({ pid }: { pid: string }) {
  const { s, update, showToast } = useStore();
  const inv = s.invites[pid];
  const [draft, setDraft] = useState<{ text: string } & AiMeta>();
  const [answer, setAnswer] = useState("");
  const [confirm, setConfirm] = useState(false);
  const n = personName(s, pid);
  useEffect(() => {
    if (inv?.status !== "question" || !inv.question || draft) return;
    const measures = countCosts(s).map((c) => c.measure);
    const facts = `${measures.length ? `Costs split by ${measures.join(" and ")} follow how many each person actually did that month, so whoever uses the machine and rooms more pays more of those. ` : ""}Equal costs are the same for everyone. The split: ${s.costs.map((c) => c.name).join(", ")}.`;
    write("answer", s.tone ?? "warm", { ownerName: ACCOUNT.owner, name: n.replace(/^Dr\.?\s*/, ""), question: inv.question, facts }).then((r) => {
      setDraft(r);
      setAnswer(r.text);
    });
  }, [inv?.status, inv?.question]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!inv) return null;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{n}</span>
        <Pill>{INVITE_WORD[inv.status]}</Pill>
      </div>
      {inv.status === "question" && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm">“{inv.question}”</div>
          <div className="ai-card space-y-2 p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              Suggested answer <AiTag source={draft?.source} note={draft?.note} />
            </div>
            {draft ? (
              <textarea className="field min-h-[90px]" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            ) : (
              <div className="h-[90px] animate-pulse rounded-md bg-card" />
            )}
          </div>
          <Primary
            label="Send answer"
            why={!answer.trim() ? "Write an answer first" : null}
            onClick={() => {
              update((d) => {
                d.invites[pid] = { ...d.invites[pid], status: "waiting", answer: answer.trim() };
                addHistory(d, pid, "Got an answer from you");
              });
              showToast(`Answer sent to ${n}`);
            }}
          />
        </div>
      )}
      {inv.status === "declined" && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm">“{inv.reason}”</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => update((d) => void (d.stage = "check"))}>
              Change the split
            </button>
            {!confirm ? (
              <button className="btn-secondary" onClick={() => setConfirm(true)}>
                Remove {n}
              </button>
            ) : (
              <button
                className="btn btn-secondary border-bad text-bad"
                onClick={() =>
                  update((d) => {
                    d.people = d.people.filter((p) => p.id !== pid);
                    delete d.invites[pid];
                    for (const p of d.people) d.invites[p.id] = { status: "waiting" };
                    d.costs.forEach((c) => {
                      delete c.shares?.[pid];
                      delete c.fixed?.[pid];
                    });
                  })
                }
              >
                Confirm — everyone else accepts again
              </button>
            )}
            <button className="btn-ghost" onClick={() => showToast("OK — bills wait until you sort it out")}>
              I'll talk to them
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseCsv(text: string, s: AppState): { counts: Counts; ignored: string[] } | string {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(",").map((c) => c.trim()));
  if (rows.length < 2) return "The sheet looks empty.";
  const h = rows[0].map((x) => x.toLowerCase());
  const pi = h.findIndex((x) => /person|doctor|name|who/.test(x));
  const mi = h.findIndex((x) => /what|counted|measure|type|item/.test(x));
  const ci = h.findIndex((x) => /count|qty|number|total/.test(x));
  if (pi < 0 || mi < 0 || ci < 0) return "Needs columns for person, what was counted, and count.";
  const counts: Counts = {};
  for (const r of rows.slice(1)) {
    const who = r[pi]?.toLowerCase().replace(/^dr\.?\s*/, "");
    const pid = ids(s).find((id) => personName(s, id).toLowerCase().replace(/^dr\.?\s*/, "") === who || (id === OWNER && /meera|me/.test(who)));
    const m = r[mi]?.toLowerCase();
    if (!pid || !m) continue;
    (counts[m] ??= {})[pid] = (counts[m][pid] ?? 0) + Number(r[ci] || 0);
  }
  return { counts, ignored: rows[0].filter((_, i) => ![pi, mi, ci].includes(i)) };
}

export function Bills() {
  const { s, update, showToast } = useStore();
  const [step, setStep] = useState<"numbers" | "review">(s.counts || !countCosts(s).length ? "review" : "numbers");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const measures = countCosts(s).map((c) => c.measure ?? "");
  const counts = s.counts ?? {};
  const missing = measures.some((m) => ids(s).some((id) => counts[m]?.[id] === undefined));
  if (step === "numbers" || !measures.every((m) => counts[m]))
    return (
      <Flow
        title={`Add ${USAGE_MONTH}'s numbers`}
        sub="How many each person did this month."
        onBack={() => update((d) => void (d.view = "home"))}
        primary={<Primary label="Next" why={missing ? "Fill in every number" : null} onClick={() => setStep("review")} />}
      >
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Person</th>
                {measures.map((m) => (
                  <th key={m} className="p-3 font-medium capitalize">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {ids(s).map((id) => (
                <tr key={id}>
                  <td className="p-3">{personName(s, id)}</td>
                  {measures.map((m) => (
                    <td key={m} className="p-2">
                      <input
                        className="field num w-24"
                        inputMode="numeric"
                        value={counts[m]?.[id] ?? ""}
                        onChange={(e) =>
                          update((d) => {
                            d.counts ??= {};
                            (d.counts[m] ??= {})[id] = Number(e.target.value.replace(/\D/g, "")) || 0;
                            d.countsFrom = "owner";
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="btn-secondary cursor-pointer">
          <FileUp className="h-4 w-4" /> Upload a sheet instead
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = parseCsv(await f.text(), s);
              if (typeof r === "string") return setNote(r);
              update((d) => {
                d.counts = { ...(d.counts ?? {}), ...r.counts };
                d.countsFrom = "owner";
              });
              setNote(r.ignored.length ? `Read the sheet. Ignored other columns (${r.ignored.join(", ")}) — we don't keep them.` : "Read the sheet.");
            }}
          />
        </label>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </Flow>
    );
  const sh = shares(s);
  const notAccepted = s.people.filter((p) => s.invites[p.id]?.status !== "accepted");
  const why = notAccepted.length
    ? `${notAccepted.map((p) => p.name).join(", ")} hasn't accepted the split yet`
    : !s.channels.invoices
      ? "Razorpay Invoices is off in Settings"
      : null;
  return (
    <Flow
      title={`Send ${s.people.length} bills`}
      sub={s.countsFrom === "staff" ? `${s.numbers.staffName} sent ${USAGE_MONTH}'s numbers on WhatsApp. Due ${fmtDate(DUE_DATE)}.` : `Due ${fmtDate(DUE_DATE)}. Each bill has UPI and a personal bank account.`}
      onBack={() => (measures.length ? setStep("numbers") : update((d) => void (d.view = "home")))}
      primary={
        <Primary
          label={`Send ${s.people.length} bills`}
          why={why}
          onClick={() => {
            update((d) => {
              d.bills = sh.totals;
              d.billsSent = d.today;
              d.payments.push({ id: "own", personId: OWNER, amount: sh.totals[OWNER], date: d.today });
              d.people.forEach((p) => addHistory(d, p.id, `${USAGE_MONTH} bill sent: ${money(sh.totals[p.id])}`));
              d.view = "home";
            });
            showToast(`${s.people.length} bills sent via Razorpay Invoices`);
          }}
        />
      }
    >
      <div className="card divide-y">
        {ids(s).map((id) => (
          <div key={id}>
            <button className="flex w-full items-center justify-between p-4 text-left" onClick={() => setOpen(open === id ? null : id)}>
              <span>
                {personName(s, id)}
                {id === OWNER && <span className="ml-2 text-xs text-muted-foreground">not billed to you</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="num font-medium">{money(sh.totals[id])}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </span>
            </button>
            {open === id && (
              <div className="space-y-1 px-4 pb-4 text-xs">
                {s.costs.map((c) => (
                  <div key={c.id} className="flex flex-col justify-between gap-1 rounded bg-muted p-2 sm:flex-row">
                    <span>{c.name}</span>
                    <span className="num text-muted-foreground">{explainLine(c, id, ids(s), s.counts, sh.byCost[c.id][id])}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="flex justify-between p-4 font-medium">
          <span>Total</span>
          <span className="num">{money(sh.total)}</span>
        </div>
      </div>
      {notAccepted.length > 0 && (
        <button className="btn-secondary" onClick={() => showToast("Reminder sent on WhatsApp")}>
          <AlertCircle className="h-4 w-4" /> Remind them
        </button>
      )}
    </Flow>
  );
}

export function People() {
  const { s, update } = useStore();
  return (
    <div className="fade-up">
      <h1 className="title-serif">People</h1>
      <div className="card mt-5 divide-y">
        {s.people.map((p) => (
          <button key={p.id} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50" onClick={() => update((d) => void (d.view = `person:${p.id}`))}>
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="num text-xs text-muted-foreground">{p.phone}</div>
            </div>
            <div className="flex items-center gap-3">
              {s.bills && <span className="num text-sm">{money(s.bills[p.id])}</span>}
              <Pill>{s.bills ? billStatus(s, p.id) : INVITE_WORD[s.invites[p.id]?.status ?? "waiting"]}</Pill>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PersonDetail({ pid }: { pid: string }) {
  const { s, update } = useStore();
  const [preview, setPreview] = useState(false);
  return (
    <Flow title={personName(s, pid)} onBack={() => update((d) => void (d.view = "people"))}>
      <button className="btn-secondary" onClick={() => setPreview(true)}>
        See their page
      </button>
      <div className="card p-5">
        <div className="mb-3 font-medium">History</div>
        <ul className="space-y-2 text-sm">
          {(s.history[pid] ?? []).map((h, i) => (
            <li key={i} className="flex gap-4">
              <span className="num w-16 shrink-0 text-muted-foreground">{fmtDate(h.date)}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </div>
      {preview && <ColleaguePreview pid={pid} onClose={() => setPreview(false)} />}
    </Flow>
  );
}

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-primary" : "bg-input"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export function Settings() {
  const { s, update, showToast } = useStore();
  return (
    <div className="mx-auto max-w-[660px] space-y-6 fade-up">
      <h1 className="title-serif">Settings</h1>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">The split</h3>
          <button
            className="btn-ghost text-primary"
            onClick={() => {
              update((d) => {
                d.stage = "check";
                d.people.forEach((p) => (d.invites[p.id] = { status: "waiting" }));
              });
              showToast("After you change it, everyone accepts again");
            }}
          >
            Change
          </button>
        </div>
        <SplitCards />
      </section>
      <section className="card divide-y">
        <div className="p-4 text-sm">
          <div className="font-medium">Monthly numbers</div>
          <div className="text-muted-foreground">
            {s.numbers.kind === "staff" ? `${s.numbers.staffName} sends them on WhatsApp on the 1st` : s.numbers.kind === "upload" ? "You upload a sheet" : "You type them in"}
          </div>
        </div>
      </section>
      <section className="card divide-y">
        <div className="p-4 font-semibold">What the agent can do</div>
        <Toggle label="Send reminders" sub="Friendly nudges before the due date — you approve each one" on={s.permissions.remind} onChange={(v) => update((d) => void (d.permissions.remind = v))} />
        <Toggle label="Suggest payment plans" sub="When someone asks for time — you approve each one" on={s.permissions.plan} onChange={(v) => update((d) => void (d.permissions.plan = v))} />
      </section>
      <section className="card divide-y">
        <div className="p-4 font-semibold">Connections</div>
        <Toggle label="WhatsApp" sub="Messages go out from your business number" on={s.channels.whatsapp} onChange={(v) => update((d) => void (d.channels.whatsapp = v))} />
        <Toggle label="Razorpay Invoices" sub="Bills with UPI and a personal bank account each" on={s.channels.invoices} onChange={(v) => update((d) => void (d.channels.invoices = v))} />
      </section>
      <section className="card p-4 text-sm">
        <div className="font-semibold">Account</div>
        <div className="mt-1 text-muted-foreground">
          {ACCOUNT.owner} · {ACCOUNT.business} · from your Razorpay account
        </div>
      </section>
    </div>
  );
}

export function Summary() {
  const { s, update } = useStore();
  const total = Object.values(s.bills ?? {}).reduce((a, b) => a + b, 0);
  const colTotal = total - (s.bills?.[OWNER] ?? 0);
  const m = monthMetrics({ payments: s.payments, ownerId: OWNER, dueDate: DUE_DATE, total, colleagueTotal: colTotal });
  const planIn = s.payments.filter((p) => p.plan && p.date <= DUE_DATE).reduce((a, p) => a + p.amount, 0);
  return (
    <Flow
      title={`${USAGE_MONTH} is closed`}
      onBack={() => update((d) => void (d.view = "home"))}
      primary={<Primary label="Done" onClick={() => update((d) => ((d.summarySeen = true), void (d.view = "home")))} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["In by the due date", m.pctInByDue, `${money(m.inByDue)} of ${money(total)}`],
          ["From colleagues by the due date", m.pctColByDue, `${money(m.colByDue)} of ${money(colTotal)}`],
          ["Collected now", m.pctCollected, "Everything is in"],
        ].map(([t, v, sub]) => (
          <div key={t as string} className="card p-5">
            <div className="text-xs text-muted-foreground">{t}</div>
            <div className="num mt-1 text-3xl font-semibold">{v}%</div>
            <div className="num mt-1 text-xs text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>
      {planIn > 0 && (
        <div className="card p-5">
          <div className="font-medium">What the agent changed</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Without the plan, colleagues by the due date would have been <span className="num text-foreground">{m.pctWithoutPlan}%</span> ({money(m.colNoPlan)} of {money(colTotal)}). The plan brought{" "}
            <span className="num text-foreground">{money(planIn)}</span> in before the due date — {s.plans[roles(s).asker ?? ""]?.reason ? `exactly the shortfall before ${reasonEn(s.plans[roles(s).asker ?? ""]!.reason!).replace(/^my/, "your")}.` : "covering the shortfall before your own payments."}
          </p>
        </div>
      )}
      <div className="ai-card p-5">
        <div className="flex items-center gap-2 font-medium">
          What the agent learned <AiTag />
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {s.learned.map((l) => (
            <li key={l.text} className="flex items-center justify-between gap-3">
              <span>{l.text}</span>
              <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{l.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Flow>
  );
}
