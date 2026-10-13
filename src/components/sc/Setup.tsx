import { useState } from "react";
import { X } from "lucide-react";
import { Lock, Plus, Trash2, Check as CheckIcon, AlertTriangle, MessageCircle, Eye, HelpCircle } from "lucide-react";
import { ACCOUNT, DEMO_PEOPLE, DEMO_TEXT, OWNER, countCosts, ids, newId, personName, roles, shortName, useStore, type AppState } from "@/lib/store";
import { draftSplit, type AiMeta } from "@/lib/ai";
import { computeShares, fractionWords, money, ordinal, type Cost, type Method } from "@/lib/rules";
import { AiTag, Flow, Primary } from "./ui";
import { ColleaguePreview } from "./Colleague";

export function costSentence(s: AppState, c: Cost) {
  let how = "split equally";
  if (c.method === "count") how = `split by ${c.measure || "…"} each person used`;
  if (c.method === "share") {
    const named = Object.entries(c.shares ?? {}).map(([id, f]) => `${personName(s, id)} pay${id === OWNER ? "" : "s"} ${fractionWords(f).toLowerCase()}`);
    how = named.length ? `${named.join(", ")}, the rest split equally` : "someone pays a fixed share";
  }
  if (c.method === "fixed") {
    const named = Object.entries(c.fixed ?? {}).map(([id, a]) => `${personName(s, id)} pay${id === OWNER ? "" : "s"} ${money(a)}`);
    how = named.length ? `${named.join(", ")}, the rest split equally` : "someone pays a fixed amount";
  }
  return { how, pay: c.payDay ? `You pay it on the ${ordinal(c.payDay)}` : null };
}

function Fill({ onClick }: { onClick: () => void }) {
  const { demo } = useStore();
  if (!demo) return null;
  return (
    <button className="chip border-dashed text-muted-foreground" onClick={onClick}>
      Fill example
    </button>
  );
}

export function Setup() {
  const { s } = useStore();
  if (s.stage === "welcome") return <Welcome />;
  if (s.stage === "people") return <PeopleStep />;
  if (s.stage === "describe") return <Describe />;
  if (s.stage === "check") return <Check />;
  if (s.stage === "numbers") return <Numbers />;
  return <Send />;
}

function go(update: ReturnType<typeof useStore>["update"], stage: AppState["stage"]) {
  update((d) => void (d.stage = stage));
}

function Welcome() {
  const { update, demo } = useStore();
  const [hide, setHide] = useState(false);
  return (
    <>
    {demo && !hide && (
      <div className="mx-auto mb-6 flex max-w-[660px] items-start gap-3 rounded-lg border border-primary/30 bg-accent p-4 text-sm text-accent-foreground">
        <span className="flex-1">
          Demo: Meera runs a diagnostic clinic and shares ₹1.2 lakh of monthly costs with colleagues. Use Fill example on each step, then press Next in the black bar to move through the month.
        </span>
        <button aria-label="Dismiss" onClick={() => setHide(true)}>
          <X className="h-4 w-4" />
        </button>
      </div>
    )}
    <Flow
      title="Share a monthly cost, without the follow-ups"
      sub="The agent splits it, bills everyone each month, and helps when someone is late."
      primary={<Primary label="Set up shared costs" onClick={() => go(update, "people")} />}
    >
      <div className="card flex items-center gap-3 p-4">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm">
          <span className="font-medium">
            {ACCOUNT.owner} · {ACCOUNT.business}
          </span>
          <span className="text-muted-foreground"> · from your Razorpay account</span>
        </div>
      </div>
      <div className="card divide-y">
        {["Add who you share the cost with", "Describe how you split it, in your own words", "You approve everything before it goes out"].map((t, i) => (
          <div key={t} className="flex items-center gap-4 p-4">
            <span className="num flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
            <span className="text-sm">{t}</span>
          </div>
        ))}
      </div>
    </Flow>
    </>
  );
}

function PeopleStep() {
  const { s, update } = useStore();
  const named = s.people.filter((p) => p.name.trim());
  return (
    <Flow
      step="Step 1 of 4"
      title="Who shares the cost with you?"
      sub="We'll message each person on WhatsApp."
      onBack={() => go(update, "welcome")}
      primary={
        <Primary
          label="Next"
          why={named.length ? null : "Add at least one person"}
          onClick={() =>
            update((d) => {
              d.people = d.people.filter((p) => p.name.trim());
              d.stage = "describe";
            })
          }
        />
      }
    >
      <div className="flex justify-end">
        <Fill onClick={() => update((d) => void (d.people = structuredClone(DEMO_PEOPLE)))} />
      </div>
      <div className="card divide-y">
        <div className="flex items-center gap-3 p-4 text-sm">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{ACCOUNT.owner}</span>
          <span className="text-muted-foreground">(you)</span>
        </div>
        {s.people.map((p, i) => (
          <div key={p.id} className="flex flex-col gap-2 p-4 sm:flex-row">
            <input
              className="field"
              placeholder="Name"
              value={p.name}
              onChange={(e) => update((d) => void (d.people[i].name = e.target.value))}
            />
            <div className="flex gap-2">
              <input
                className="field num sm:w-48"
                placeholder="WhatsApp number"
                value={p.phone}
                onChange={(e) => update((d) => void (d.people[i].phone = e.target.value))}
              />
              <button className="btn-ghost px-2" aria-label="Remove" onClick={() => update((d) => void d.people.splice(i, 1))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <button className="flex w-full items-center gap-2 p-4 text-sm font-medium text-primary" onClick={() => update((d) => void d.people.push({ id: newId("p"), name: "", phone: "" }))}>
          <Plus className="h-4 w-4" /> Add person
        </button>
      </div>
    </Flow>
  );
}

const messyText = (s: AppState) => {
  const r = roles(s);
  const who = r.late ? shortName(s, r.late) : "Sukhpal";
  return `machine ki EMI 40k, scans ke hisaab se divide, 5 tareekh ko jaati hai. rent 45000 sessions wise. salary 25k sabka barabar, 7th ko. bijli paani 10k, ${who} 2000 fixed dega baaki barabar, 20 ko`;
};

function Describe() {
  const { s, update, demo } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <Flow
      step="Step 2 of 4"
      title="How do you split it today?"
      sub="Write it like you'd explain it to a friend. Mention when you pay each one if you can."
      onBack={() => go(update, "people")}
      primary={
        <Primary
          label={busy ? "Drafting…" : "Draft my split"}
          busy={busy}
          why={s.description.trim().length < 10 ? "Describe at least one cost" : null}
          onClick={async () => {
            setBusy(true);
            const t0 = Date.now();
            const r = await draftSplit(s.description, s.people);
            await new Promise((ok) => setTimeout(ok, Math.max(0, 800 - (Date.now() - t0))));
            update((d) => {
              d.costs = r.costs;
              d.questions = r.questions;
              (d as AppState & { draftMeta?: AiMeta }).draftMeta = r.meta;
              d.stage = "check";
            });
            setBusy(false);
          }}
        />
      }
    >
      <div className="flex justify-end">
        <div className="flex gap-2">
          <Fill onClick={() => update((d) => void (d.description = DEMO_TEXT))} />
          {demo && (
            <button className="chip border-dashed border-ai/40 text-ai" onClick={() => update((d) => void (d.description = messyText(d)))}>
              Try a messy one
            </button>
          )}
        </div>
      </div>
      <textarea
        className="field min-h-[180px] text-base leading-relaxed"
        placeholder="e.g. Shop rent of ₹30,000 split equally, paid on the 1st. Oven EMI ₹12,000 split by orders each of us made."
        value={s.description}
        onChange={(e) => update((d) => void (d.description = e.target.value))}
      />
    </Flow>
  );
}

const METHODS: { id: Method; label: string }[] = [
  { id: "equal", label: "Equally" },
  { id: "count", label: "By something you count" },
  { id: "share", label: "Someone pays a fixed share" },
  { id: "fixed", label: "Someone pays a fixed amount" },
];

function parseShare(v: string): number | null {
  const t = v.trim();
  const f = t.match(/^(\d+)\/(\d+)$/);
  if (f && Number(f[2])) return Number(f[1]) / Number(f[2]);
  const p = t.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (p) return Number(p[1]) / 100;
  return null;
}

function CostEditor({ c, onDone }: { c: Cost; onDone: () => void }) {
  const { s, update } = useStore();
  const set = (fn: (x: Cost) => void) =>
    update((d) => {
      const x = d.costs.find((k) => k.id === c.id)!;
      fn(x);
      x.assumed = false;
    });
  const [raw, setRaw] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(c.shares ?? {}).map(([k, v]) => [k, fractionWords(v) === `${Math.round(v * 1000) / 10}%` ? `${Math.round(v * 1000) / 10}%` : Math.abs(v - 1 / 3) < 1e-6 ? "1/3" : `${Math.round(v * 100)}%`])),
  );
  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground sm:col-span-1">
          Name
          <input className="field mt-1" value={c.name} onChange={(e) => set((x) => void (x.name = e.target.value))} />
        </label>
        <label className="text-xs text-muted-foreground">
          Amount (₹)
          <input className="field num mt-1" inputMode="numeric" value={c.amount || ""} onChange={(e) => set((x) => void (x.amount = Number(e.target.value.replace(/\D/g, "")) || 0))} />
        </label>
        <label className="text-xs text-muted-foreground">
          You pay it on
          <select className="field mt-1" value={c.payDay ?? ""} onChange={(e) => set((x) => void (x.payDay = e.target.value ? Number(e.target.value) : null))}>
            <option value="">Not sure</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {ordinal(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {METHODS.map((m) => (
          <button key={m.id} className={`chip ${c.method === m.id ? "chip-on" : ""}`} onClick={() => set((x) => void (x.method = m.id))}>
            {m.label}
          </button>
        ))}
      </div>
      {c.method === "count" && (
        <label className="block text-xs text-muted-foreground">
          What do you count?
          <input className="field mt-1" placeholder="e.g. scans, orders, sessions" value={c.measure ?? ""} onChange={(e) => set((x) => void (x.measure = e.target.value.toLowerCase()))} />
        </label>
      )}
      {(c.method === "share" || c.method === "fixed") && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{c.method === "share" ? "Share (like 1/3 or 40%) — leave blank for an equal part of the rest" : "Fixed ₹ — leave blank for an equal part of the rest"}</div>
          {ids(s).map((id) => (
            <div key={id} className="flex items-center gap-3">
              <span className="w-28 text-sm">{personName(s, id)}</span>
              {c.method === "share" ? (
                <input
                  className="field num w-32"
                  value={raw[id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRaw((r) => ({ ...r, [id]: v }));
                    const f = parseShare(v);
                    set((x) => {
                      x.shares ??= {};
                      if (f === null) delete x.shares[id];
                      else x.shares[id] = f;
                    });
                  }}
                />
              ) : (
                <input
                  className="field num w-32"
                  value={c.fixed?.[id] ?? ""}
                  onChange={(e) =>
                    set((x) => {
                      x.fixed ??= {};
                      const n = Number(e.target.value.replace(/\D/g, ""));
                      if (!n) delete x.fixed[id];
                      else x.fixed[id] = n;
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between">
        <button className="btn-ghost text-bad" onClick={() => update((d) => void (d.costs = d.costs.filter((k) => k.id !== c.id)))}>
          Remove this cost
        </button>
        <button className="btn-secondary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

export function splitProblems(s: AppState): string | null {
  if (!s.costs.length) return "Add at least one cost";
  if (s.questions.length) return "Answer the open question first";
  for (const c of s.costs) {
    if (!c.amount) return `Add an amount for ${c.name}`;
    if (c.method === "count" && !c.measure?.trim()) return `Say what's counted for ${c.name}`;
    if (c.method === "share" && !Object.keys(c.shares ?? {}).length) return `Say who pays a share of ${c.name}`;
    if (c.method === "fixed" && !Object.keys(c.fixed ?? {}).length) return `Say who pays a fixed amount of ${c.name}`;
  }
  return null;
}

export function SplitCards({ editable }: { editable?: boolean }) {
  const { s } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      {s.costs.map((c) => {
        const t = costSentence(s, c);
        return (
          <div key={c.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">
                  {c.name} — <span className="num">{c.amount ? money(c.amount) : "no amount yet"}</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t.how}
                  {t.pay && ` · ${t.pay}`}
                </div>
              </div>
              {editable && editing !== c.id && (
                <button className="btn-ghost shrink-0 px-2 py-1 text-primary" onClick={() => setEditing(c.id)}>
                  Change
                </button>
              )}
            </div>
            {editable && !c.payDay && editing !== c.id && (
              <div className="mt-3 flex items-center gap-2 text-xs text-warn">
                <AlertTriangle className="h-3.5 w-3.5" /> When do you pay this? It helps the agent plan around late payments.
              </div>
            )}
            {editable && c.assumed && editing !== c.id && (
              <div className="mt-2 flex items-center gap-2 text-xs text-warn">
                <AlertTriangle className="h-3.5 w-3.5" /> I assumed equally — change it if that's wrong.
              </div>
            )}
            {editing === c.id && <CostEditor c={c} onDone={() => setEditing(null)} />}
          </div>
        );
      })}
    </>
  );
}

function Check() {
  const { s, update } = useStore();
  const meta = (s as AppState & { draftMeta?: AiMeta }).draftMeta;
  const problem = splitProblems(s);
  const fixedCosts = s.costs.filter((c) => c.method !== "count");
  const fixedShares = computeShares(fixedCosts, ids(s), null);
  const usage = countCosts(s);
  return (
    <Flow
      step="Step 3 of 4"
      title="Check your split"
      sub={
        <span className="inline-flex flex-wrap items-center gap-2">
          Drafted from your words <AiTag source={meta?.source} note={meta?.note} />
        </span>
      }
      onBack={() => go(update, "describe")}
      primary={<Primary label="Looks right" why={problem} onClick={() => go(update, usage.length ? "numbers" : "send")} />}
    >
      {s.questions.map((q) => (
        <div key={q.id} className="rounded-lg border border-warn/30 bg-warn-soft p-4">
          <div className="flex items-center gap-2 font-medium text-warn">
            <HelpCircle className="h-4 w-4" /> {q.text}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ids(s).map((id) => (
              <button
                key={id}
                className="chip bg-card"
                onClick={() =>
                  update((d) => {
                    const c = d.costs.find((k) => k.id === q.costId)!;
                    if (q.kind === "share") (c.shares ??= {})[id] = q.value;
                    else (c.fixed ??= {})[id] = q.value;
                    d.questions = d.questions.filter((x) => x.id !== q.id);
                  })
                }
              >
                {id === OWNER ? `${ACCOUNT.owner} (me)` : personName(s, id)}
              </button>
            ))}
            <button
              className="chip bg-card"
              onClick={() =>
                update((d) => {
                  const c = d.costs.find((k) => k.id === q.costId)!;
                  if (!Object.keys(c.shares ?? {}).length && !Object.keys(c.fixed ?? {}).length) c.method = "equal";
                  d.questions = d.questions.filter((x) => x.id !== q.id);
                })
              }
            >
              Nobody — split it equally
            </button>
          </div>
        </div>
      ))}
      <SplitCards editable />
      <button
        className="flex items-center gap-2 text-sm font-medium text-primary"
        onClick={() => update((d) => void d.costs.push({ id: newId("c"), name: "New cost", amount: 0, payDay: null, method: "equal" }))}
      >
        <Plus className="h-4 w-4" /> Add a cost
      </button>
      {!problem && (
        <div className="card p-5">
          <div className="mb-3 font-medium">What each person pays a month</div>
          <div className="divide-y text-sm">
            {ids(s).map((id) => (
              <div key={id} className="flex justify-between py-2">
                <span>{personName(s, id)}</span>
                <span className="num">{fixedCosts.length ? money(fixedShares.totals[id]) : "—"}</span>
              </div>
            ))}
          </div>
          {usage.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Plus everyone's share of {usage.map((c) => `${money(c.amount)} by ${c.measure}`).join(" and ")}, worked out each month.
            </p>
          )}
        </div>
      )}
    </Flow>
  );
}

function Numbers() {
  const { s, update } = useStore();
  const n = s.numbers;
  const why = !n.kind ? "Pick one" : n.kind === "staff" && !n.staffName.trim() ? "Add who sends them" : null;
  const opts = [
    { id: "staff" as const, t: "Someone on my staff sends them", d: "We'll message them on WhatsApp on the 1st" },
    { id: "manual" as const, t: "I'll type them in", d: "We'll remind you on the 1st" },
    { id: "upload" as const, t: "I'll upload a sheet", d: "Any CSV with person, what was counted and count" },
  ];
  return (
    <Flow
      title="How will you give us the monthly numbers?"
      sub={`For ${countCosts(s).map((c) => c.measure).join(" and ")}, each month.`}
      onBack={() => go(update, "check")}
      primary={<Primary label="Next" why={why} onClick={() => go(update, "send")} />}
    >
      <div className="flex justify-end">
        <Fill onClick={() => update((d) => void (d.numbers = { kind: "staff", staffName: "Sunita (front desk)", staffPhone: "98200 44444" }))} />
      </div>
      {opts.map((o) => (
        <button key={o.id} className={`card block w-full p-4 text-left transition ${n.kind === o.id ? "border-primary ring-2 ring-primary/20" : ""}`} onClick={() => update((d) => void (d.numbers.kind = o.id))}>
          <div className="font-medium">{o.t}</div>
          <div className="text-sm text-muted-foreground">{o.d}</div>
        </button>
      ))}
      {n.kind === "staff" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="field" placeholder="Their name" value={n.staffName} onChange={(e) => update((d) => void (d.numbers.staffName = e.target.value))} />
          <input className="field num" placeholder="WhatsApp number" value={n.staffPhone} onChange={(e) => update((d) => void (d.numbers.staffPhone = e.target.value))} />
        </div>
      )}
    </Flow>
  );
}

export const inviteText = (name: string) =>
  `Hi ${name.replace(/^Dr\.?\s*/, "")}, I've set up how ${ACCOUNT.business}' monthly costs are split. Please check your part and accept here: rzp.io/sc/${name.split(" ").pop()?.toLowerCase()} — Meera`;

function Send() {
  const { s, update, showToast } = useStore();
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <Flow
      step="Step 4 of 4"
      title={`Send it to ${s.people.length} ${s.people.length === 1 ? "person" : "people"}`}
      sub="Each person sees only their own part. First bills go out on 1 Sept, after you approve them."
      onBack={() => go(update, countCosts(s).length ? "numbers" : "check")}
      primary={
        <Primary
          label={`Send to ${s.people.length} ${s.people.length === 1 ? "person" : "people"}`}
          why={!s.channels.whatsapp ? "WhatsApp is off in Settings" : null}
          onClick={() => {
            update((d) => {
              d.people.forEach((p) => {
                d.invites[p.id] = { status: "waiting" };
                (d.history[p.id] ??= []).push({ date: d.today, text: "Split sent on WhatsApp" });
              });
              d.stage = "replies";
            });
            showToast("Sent on WhatsApp");
          }}
        />
      }
    >
      {s.people.map((p) => (
        <div key={p.id} className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="h-4 w-4 text-ok" /> {p.name} <span className="num text-xs text-muted-foreground">{p.phone}</span>
          </div>
          <div className="rounded-md bg-ok-soft p-3 text-sm">{inviteText(p.name)}</div>
          <button className="mt-2 inline-flex items-center gap-1 text-sm text-primary" onClick={() => setPreview(p.id)}>
            <Eye className="h-3.5 w-3.5" /> See what {p.name} will see
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckIcon className="h-3.5 w-3.5 text-ok" /> Nothing is billed until everyone accepts.
      </div>
      {preview && <ColleaguePreview pid={preview} onClose={() => setPreview(null)} />}
    </Flow>
  );
}
