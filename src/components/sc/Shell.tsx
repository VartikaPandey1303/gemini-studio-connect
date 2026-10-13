import { useState, type ReactNode } from "react";
import {
  Bot,
  ChevronRight,
  CreditCard,
  FileText,
  Home,
  Landmark,
  Link2,
  Menu,
  Users,
  Wallet,
  Sparkles,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import { ACCOUNT, OWNER, advance, nextInfo, useStore, type View } from "@/lib/store";
import { fmtDate } from "@/lib/rules";
import { homeCards } from "./owner";

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <path d="M9.5 2 6 14h5l-2 8L19 8h-6l2-6z" className="fill-primary" />
      </svg>
      <span className="text-lg font-bold tracking-tight">Razorpay</span>
    </div>
  );
}

const NAV = [
  { icon: Home, label: "Home" },
  { icon: CreditCard, label: "Transactions" },
  { icon: Link2, label: "Payment Links" },
  { icon: FileText, label: "Invoices" },
  { icon: Landmark, label: "Smart Collect" },
  { icon: Wallet, label: "Settlements" },
  { icon: Users, label: "Customers" },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="flex h-full w-60 flex-col bg-nav text-nav-foreground">
      <div className="flex h-14 items-center justify-between px-5">
        <Logo />
        {onClose && (
          <button onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2 text-sm">
        {NAV.map((n) => (
          <div key={n.label} className="flex items-center gap-3 rounded-md px-3 py-2 text-nav-muted">
            <n.icon className="h-4 w-4" /> {n.label}
          </div>
        ))}
        <div className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-nav-muted">Agent Studio</div>
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-nav-muted">
          <Bot className="h-4 w-4" /> All agents
        </div>
        <div className="flex items-center gap-3 rounded-md bg-nav-active px-3 py-2 font-medium">
          <Sparkles className="h-4 w-4 text-primary" /> Shared Collect
        </div>
      </nav>
      <div className="border-t border-nav-active px-5 py-4 text-xs text-nav-muted">
        <div className="font-medium text-nav-foreground">{ACCOUNT.business}</div>
        {ACCOUNT.owner}
      </div>
    </aside>
  );
}

function DemoBar() {
  const { s, update, reset, showToast, evalView } = useStore();
  const info = nextInfo(s);
  const roles = [{ id: OWNER, label: "Meera's app" }, ...s.people.map((p) => ({ id: p.id, label: `${p.name}'s phone` }))];
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center gap-2 bg-demo px-3 py-2 text-xs text-demo-foreground">
      <span className="rounded bg-primary px-1.5 py-0.5 font-bold">DEMO</span>
      <span className="num">{fmtDate(s.today)} 2026</span>
      <select
        className="rounded bg-nav-active px-2 py-1 text-demo-foreground"
        value={s.role}
        onChange={(e) => update((d) => void (d.role = e.target.value))}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <button
        className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 font-medium"
        onClick={() => {
          if (info.wait) return showToast(info.wait);
          let msg: string | null = null;
          update((d) => {
            msg = advance(d);
            if (msg) msg = `${fmtDate(d.today)} · ${msg}`;
          });
          window.setTimeout(() => msg && showToast(msg), 0);
        }}
      >
        <SkipForward className="h-3 w-3" /> Next
      </button>
      <span className="min-w-0 flex-1 truncate opacity-70">{info.wait ?? `Next: ${info.label}`}</span>
      <a className="opacity-80 underline-offset-2 hover:underline hover:opacity-100" href={evalView ? "?demo" : "?demo&eval"}>
        {evalView ? "Back to app" : "AI log"}
      </a>
      <button className="inline-flex items-center gap-1 opacity-80 hover:opacity-100" onClick={reset}>
        <RotateCcw className="h-3 w-3" /> Restart
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { s, update, demo } = useStore();
  const [menu, setMenu] = useState(false);
  const live = s.stage === "live";
  const badge = homeCards(s).filter((c) => c.id !== "sum").length;
  const tab = (v: View, label: string, b?: number) => {
    const active = s.view === v || (v === "home" && !["people", "settings"].includes(s.view) && !s.view.startsWith("person:"));
    const activePeople = v === "people" && s.view.startsWith("person:");
    return (
      <button
        onClick={() => update((d) => void (d.view = v))}
        className={`relative -mb-px border-b-2 px-1 pb-3 text-sm font-medium transition ${
          active || activePeople ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {!!b && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{b}</span>}
      </button>
    );
  };
  return (
    <div className="min-h-screen">
      {demo && <DemoBar />}
      <div className="flex">
        <div className="sticky top-0 hidden h-screen lg:block">
          <Sidebar />
        </div>
        {menu && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <Sidebar onClose={() => setMenu(false)} />
            <div className="flex-1 bg-demo/40" onClick={() => setMenu(false)} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <header className="flex h-14 items-center gap-3 border-b bg-card px-4 sm:px-8">
            <button className="lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Agent Studio</span>
              <ChevronRight className="hidden h-3.5 w-3.5 sm:inline" />
              <span className="font-medium text-foreground">Shared Collect</span>
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="hidden sm:inline text-muted-foreground">{ACCOUNT.business}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">MD</span>
            </div>
          </header>
          <div className="border-b bg-card px-4 pt-5 sm:px-8">
            <div className="mx-auto flex max-w-[1040px] items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Shared Collect · shared costs agent</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${live ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                    {live ? "● Live" : "Setting up"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">AI reads and proposes. Rules compute every rupee. You approve.</p>
              </div>
            </div>
            <div className="mx-auto mt-4 flex max-w-[1040px] gap-6">
              {live ? (
                <>
                  {tab("home", "Home", badge)}
                  {tab("people", "People")}
                  {tab("settings", "Settings")}
                </>
              ) : (
                <div className="pb-3 text-sm font-medium">Setup</div>
              )}
            </div>
          </div>
          <main className="px-4 py-8 sm:px-8">
            <div className="mx-auto max-w-[1040px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  const { demo } = useStore();
  return (
    <div className="min-h-screen bg-nav">
      {demo && <DemoBar />}
      <div className="flex justify-center px-3 py-6 sm:py-10">
        <div className="w-full max-w-[440px] overflow-hidden rounded-[28px] border-4 border-nav-active bg-background shadow-lift">{children}</div>
      </div>
    </div>
  );
}
