import { useEffect, useMemo, useState } from "react";
import { Quote } from "lucide-react";
import { ACCOUNT, DUE_DATE, OUT_MONTH, addHistory, expectedInflows, gapFor, paidBy, personName, useStore, type Decision as D } from "@/lib/store";
import { readMessage, write, type AiMeta } from "@/lib/ai";
import { amountsMatch, fmtDate, money, outflows, planSizing, type Part } from "@/lib/rules";
import { PLAN_ENDING, type Tone } from "@/lib/ai-local";
import { AiTag, Flow, Primary } from "./ui";

export function Decision({ id }: { id: string }) {
  const { s } = useStore();
  const d = s.decisions.find((x) => x.id === id);
  if (!d || d.status !== "open") return <Gone />;
  if (d.kind === "more-time") return <MoreTime d={d} />;
  if (d.kind === "nudge") return <Nudge d={d} />;
  if (d.kind === "counter") return <Counter d={d} />;
  return <MessageReply d={d} />;
}

function Gone() {
  const { update } = useStore();
  return <Flow title="All done here" sub="This one is already handled." primary={<Primary label="Back to Home" onClick={() => update((x) => void (x.view = "home"))} />} />;
}

const short = (n: string) => n.replace(/^Dr\.?\s*/, "");

function useRead(d: D) {
  const { s, update } = useStore();
  useEffect(() => {
    if (d.read || !d.text) return;
    readMessage(d.text, s.today).then((r) =>
      update((x) => {
        const t = x.decisions.find((k) => k.id === d.id);
        if (t) t.read = r;
      }),
    );
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return d.read;
}

function WhatTheySaid({ d }: { d: D }) {
  const { s } = useStore();
  const read = useRead(d);
  const words: Record<string, string> = { "more-time": "asking for more time", question: "a question", dispute: "saying something is wrong", paid: "saying they've paid", other: "a general message" };
  return (
    <div className="ai-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">What {personName(s, d.personId)} said</div>
        <AiTag source={read?.source} note={read?.note} />
      </div>
      <div className="mt-2 flex gap-2 text-lg">
        <Quote className="mt-1 h-4 w-4 shrink-0 text-ai" /> {d.text}
      </div>
      {read ? (
        <div className="mt-3 text-sm">
          <span className="font-medium">Read as: {words[read.intent]}</span>
          {read.date && <span className="num"> · by {fmtDate(read.date)}</span>}
          <div className="text-muted-foreground">{read.why}</div>
        </div>
      ) : (
        <div className="mt-3 h-10 animate-pulse rounded bg-card" />
      )}
    </div>
  );
}

function done(update: ReturnType<typeof useStore>["update"], id: string) {
  update((x) => {
    const t = x.decisions.find((k) => k.id === id);
    if (t) t.status = "done";
    x.view = "home";
  });
}

function MoreTime({ d }: { d: D }) {
  const { s, update, showToast } = useStore();
  const pid = d.personId;
  const name = personName(s, pid);
  const read = d.read;
  const left = (s.bills?.[pid] ?? 0) - paidBy(s, pid);
  const others = s.people.filter((p) => p.id !== pid && paidBy(s, p.id) < (s.bills?.[p.id] ?? 0));
  const [countOn, setCountOn] = useState<Record<string, boolean>>({});
  const [named, setNamed] = useState<string | null>(null);
  const namedDate = named ?? read?.date ?? "2026-10-20";
  const wait = useMemo(() => gapFor(s, countOn, { id: pid, parts: [{ amount: left, date: namedDate }] }), [s, countOn, pid, left, namedDate]);
  const auto = useMemo(() => planSizing(wait.gap, left, DUE_DATE, namedDate), [wait.gap, left, namedDate]);
  const [p1Edit, setP1Edit] = useState<number | null>(null);
  const p1 = p1Edit ?? auto[0]?.amount ?? 0;
  const parts: Part[] = auto.length === 1 && p1Edit === null ? auto : [{ amount: p1, date: DUE_DATE }, ...(left - p1 > 0 ? [{ amount: left - p1, date: namedDate }] : [])].filter((p) => p.amount > 0);
  const amounts = parts.map((p) => p.amount);
  const key = parts.map((p) => `${p.amount}@${p.date}`).join("|");

  const [drafts, setDrafts] = useState<Partial<Record<Tone, { text: string } & AiMeta>>>({});
  const [tone, setTone] = useState<Tone | null>(s.tone);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const firstTime = !s.tone;

  useEffect(() => {
    if (!read || !s.permissions.plan) return;
    let live = true;
    setDrafts({});
    const tones: Tone[] = firstTime ? ["warm", "direct", "formal"] : [tone ?? "warm"];
    tones.forEach((t) =>
      write("plan", t, { ownerName: ACCOUNT.owner, name: short(name), parts }).then((r) => {
        if (!live) return;
        setDrafts((x) => ({ ...x, [t]: r }));
        if (!firstTime) setText(r.text);
      }),
    );
    return () => {
      live = false;
    };
  }, [key, !!read, tone]); // eslint-disable-line react-hooks/exhaustive-deps

  const outs = outflows(s.costs, OUT_MONTH).filter((o) => o.date <= wait.date);
  const ins = expectedInflows(s, countOn, { id: pid, parts: [{ amount: left, date: namedDate }] });
  const inBy = ins.filter((i) => i.date && i.date <= wait.date);
  const sum = parts.reduce((a, p) => a + p.amount, 0);

  const send = (msg: string, t: Tone) => {
    update((x) => {
      x.plans[pid] = { parts, status: "offered", message: msg };
      x.tone = t;
      addHistory(x, pid, `You offered a plan: ${parts.map((p) => `${money(p.amount)} by ${fmtDate(p.date)}`).join(", ")}`);
      const k = x.decisions.find((k) => k.id === d.id);
      if (k) k.status = "done";
      x.view = "home";
    });
    showToast(`Sent to ${name} on WhatsApp`);
  };
  const msgWhy = (m: string) => (!amountsMatch(m, amounts) ? `The message must show ${amounts.map(money).join(" and ")} exactly` : null);

  return (
    <Flow title={`${name} asked for more time`} onBack={() => update((x) => void (x.view = "home"))}>
      <WhatTheySaid d={d} />

      <div className="card p-5">
        <div className="font-medium">What it means for you</div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">You pay, up to {fmtDate(wait.date)}</div>
            <ul className="mt-2 space-y-1 text-sm">
              {outs.map((o) => (
                <li key={o.label} className="flex justify-between gap-2">
                  <span>
                    {o.label} <span className="num text-xs text-muted-foreground">{fmtDate(o.date)}</span>
                  </span>
                  <span className="num">{money(o.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t pt-1 font-medium">
                <span>Total</span>
                <span className="num">{money(wait.need)}</span>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Coming in by then</div>
            <ul className="mt-2 space-y-1 text-sm">
              {inBy.map((i, k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{i.personId === "me" ? "Your share" : personName(s, i.personId)}</span>
                  <span className="num">{money(i.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2 text-muted-foreground">
                <span>{name}</span>
                <span>too late ({fmtDate(namedDate)})</span>
              </li>
              <li className="flex justify-between border-t pt-1 font-medium">
                <span>Total</span>
                <span className="num">{money(wait.inflow)}</span>
              </li>
            </ul>
          </div>
        </div>
        {others.map((p) => (
          <label key={p.id} className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={countOn[p.id] !== false}
              onChange={(e) => {
                setP1Edit(null);
                setCountOn((c) => ({ ...c, [p.id]: e.target.checked }));
              }}
            />
            Count on {p.name} paying by {fmtDate(DUE_DATE)}
            {p.lateBefore && <span className="text-muted-foreground">(paid late before)</span>}
          </label>
        ))}
        <div className={`mt-5 rounded-lg p-4 ${wait.gap ? "bg-bad-soft" : "bg-ok-soft"}`}>
          <div className={`text-xs ${wait.gap ? "text-bad" : "text-ok"}`}>If you wait — short on {fmtDate(wait.date)}</div>
          <div className={`num text-4xl font-semibold ${wait.gap ? "text-bad" : "text-ok"}`}>{money(wait.gap)}</div>
        </div>
      </div>

      {s.permissions.plan ? (
        <div className="ai-card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            Suggested reply <AiTag source={(tone && drafts[tone]?.source) || drafts.warm?.source} note={(tone && drafts[tone]?.note) || drafts.warm?.note} />
            <span className="text-xs font-normal text-muted-foreground">amounts from your rule</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="card p-3 text-xs text-muted-foreground">
              First part, by {fmtDate(DUE_DATE)}
              <input
                className="field num mt-1 text-base text-foreground"
                inputMode="numeric"
                value={p1}
                onChange={(e) => setP1Edit(Math.min(left, Number(e.target.value.replace(/\D/g, "")) || 0))}
              />
            </label>
            <label className="card p-3 text-xs text-muted-foreground">
              The rest, by the date they named
              <div className="mt-1 flex gap-2">
                <span className="num flex-1 py-2 text-base text-foreground">{money(left - p1)}</span>
                <input type="date" className="field num w-auto" value={namedDate} onChange={(e) => setNamed(e.target.value)} />
              </div>
            </label>
          </div>
          {sum !== left && <div className="text-xs text-warn">Parts must add up to {money(left)}</div>}

          {firstTime ? (
            <>
              <div className="text-sm text-muted-foreground">Pick a tone. The agent will remember it.</div>
              <div className="grid gap-3 md:grid-cols-3">
                {(["warm", "direct", "formal"] as Tone[]).map((t) => {
                  const dr = drafts[t];
                  return (
                    <div key={t} className="card flex flex-col p-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ai">{t}</div>
                      {dr ? <p className="flex-1 text-sm">{dr.text}</p> : <div className="h-24 flex-1 animate-pulse rounded bg-muted" />}
                      {dr?.note && <p className="mt-2 text-[11px] text-muted-foreground">{dr.note}</p>}
                      <button className="btn-primary mt-3" disabled={!dr || !!msgWhy(dr.text) || sum !== left} onClick={() => dr && send(dr.text, t)}>
                        Send this one
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                Tone:
                {(["warm", "direct", "formal"] as Tone[]).map((t) => (
                  <button key={t} className={`chip ${tone === t ? "chip-on" : ""}`} onClick={() => setTone(t)}>
                    {t}
                  </button>
                ))}
              </div>
              {drafts[tone ?? "warm"] ? (
                <textarea className="field min-h-[110px]" value={text} onChange={(e) => setText(e.target.value)} />
              ) : (
                <div className="h-[110px] animate-pulse rounded-md bg-card" />
              )}
              {drafts[tone ?? "warm"]?.note && <p className="text-[11px] text-muted-foreground">{drafts[tone ?? "warm"]?.note}</p>}
              <div className="flex flex-col items-end gap-1">
                <Primary
                  label={`Send to ${name}`}
                  why={sum !== left ? `Parts must add up to ${money(left)}` : !text.endsWith(PLAN_ENDING) ? `End with “${PLAN_ENDING}”` : msgWhy(text)}
                  onClick={() => send(text, tone ?? "warm")}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card p-4 text-sm text-muted-foreground">Payment plans are off in Settings, so the agent can only ask for the full amount.</div>
      )}

      <button
        className="btn-ghost self-start"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await write("due", s.tone ?? "warm", { ownerName: ACCOUNT.owner, name: short(name), amount: left, due: DUE_DATE });
          update((x) => addHistory(x, pid, `You asked for ${money(left)} by ${fmtDate(DUE_DATE)}: “${r.text}”`));
          done(update, d.id);
          showToast(`Sent to ${name} on WhatsApp`);
        }}
      >
        {busy ? "Sending…" : `Ask for the full ${money(left)} by ${fmtDate(DUE_DATE)} instead`}
      </button>
    </Flow>
  );
}

function Nudge({ d }: { d: D }) {
  const { s, update, showToast } = useStore();
  const name = personName(s, d.personId);
  const amount = (s.bills?.[d.personId] ?? 0) - paidBy(s, d.personId);
  const [draft, setDraft] = useState<{ text: string } & AiMeta>();
  const [text, setText] = useState("");
  useEffect(() => {
    write("nudge", s.tone ?? "warm", { ownerName: ACCOUNT.owner, name: short(name), amount, due: DUE_DATE }).then((r) => {
      setDraft(r);
      setText(r.text);
    });
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Flow
      title={`${name} may pay late`}
      sub={`They paid after the due date before. ${money(amount)} is due on ${fmtDate(DUE_DATE)}, 3 days from now.`}
      onBack={() => update((x) => void (x.view = "home"))}
      primary={
        <Primary
          label={`Send reminder to ${name}`}
          why={!draft ? "Drafting…" : !amountsMatch(text, [amount]) ? `The message must show ${money(amount)} exactly` : null}
          onClick={() => {
            update((x) => addHistory(x, d.personId, `Reminder from you: “${text}”`));
            done(update, d.id);
            showToast(`Reminder sent to ${name}`);
          }}
        />
      }
    >
      <div className="ai-card space-y-2 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          Suggested reminder <AiTag source={draft?.source} note={draft?.note} />
        </div>
        {draft ? <textarea className="field min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} /> : <div className="h-[90px] animate-pulse rounded bg-card" />}
      </div>
      <button className="btn-ghost" onClick={() => done(update, d.id)}>
        Don't send
      </button>
    </Flow>
  );
}

function MessageReply({ d }: { d: D }) {
  const { s, update, showToast } = useStore();
  const name = personName(s, d.personId);
  const read = useRead(d);
  const [draft, setDraft] = useState<{ text: string } & AiMeta>();
  const [text, setText] = useState("");
  useEffect(() => {
    if (!read) return;
    const bill = s.bills?.[d.personId];
    const facts = `Their bill follows the split they accepted: ${s.costs.map((c) => c.name).join(", ")}. Each line's maths is on their page — tap a line to see it. ${bill ? "The owner can check the numbers again if something looks off." : ""}`;
    write("answer", s.tone ?? "warm", { ownerName: ACCOUNT.owner, name: short(name), question: d.text, facts }).then((r) => {
      setDraft(r);
      setText(r.text);
    });
  }, [!!read]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Flow
      title={`${name} sent a message`}
      onBack={() => update((x) => void (x.view = "home"))}
      primary={
        <Primary
          label={`Send to ${name}`}
          why={!text.trim() ? "Write a reply first" : /₹/.test(text) ? "Replies here can't change amounts — remove the ₹ figure" : null}
          onClick={() => {
            update((x) => addHistory(x, d.personId, `You replied: “${text}”`));
            done(update, d.id);
            showToast(`Sent to ${name}`);
          }}
        />
      }
    >
      <WhatTheySaid d={d} />
      <div className="ai-card space-y-2 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          Suggested reply <AiTag source={draft?.source} note={draft?.note} />
        </div>
        {draft ? <textarea className="field min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} /> : <div className="h-[90px] animate-pulse rounded bg-card" />}
      </div>
    </Flow>
  );
}

function Counter({ d }: { d: D }) {
  const { s, update, showToast } = useStore();
  const name = personName(s, d.personId);
  const theirs = d.counter ?? [];
  const mine = s.plans[d.personId]?.parts ?? [];
  const gTheirs = gapFor(s, {}, { id: d.personId, parts: theirs });
  const gMine = gapFor(s, {}, { id: d.personId, parts: mine });
  const row = (label: string, parts: Part[], g: typeof gTheirs) => (
    <div className="card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {parts.map((p, i) => (
        <div key={i} className="num flex justify-between text-sm">
          <span>{money(p.amount)}</span>
          <span>{fmtDate(p.date)}</span>
        </div>
      ))}
      <div className={`num mt-2 text-sm font-medium ${g.gap ? "text-bad" : "text-ok"}`}>{g.gap ? `Short ${money(g.gap)} on ${fmtDate(g.date)}` : "You're covered"}</div>
    </div>
  );
  return (
    <Flow
      title={`${name} suggested other dates`}
      onBack={() => update((x) => void (x.view = "home"))}
      primary={
        <Primary
          label="Accept their dates"
          onClick={() => {
            update((x) => {
              x.plans[d.personId] = { ...x.plans[d.personId], parts: theirs, status: "accepted" };
              addHistory(x, d.personId, "You accepted their dates");
            });
            done(update, d.id);
            showToast(`Told ${name} their dates are fine`);
          }}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {row("Their dates", theirs, gTheirs)}
        {row("Your plan", mine, gMine)}
      </div>
      <button
        className="btn-ghost self-start"
        onClick={() => {
          update((x) => addHistory(x, d.personId, "You asked to keep the original plan"));
          done(update, d.id);
          showToast(`Asked ${name} to keep your plan`);
        }}
      >
        Keep my plan
      </button>
    </Flow>
  );
}
