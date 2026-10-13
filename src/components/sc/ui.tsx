import { Sparkles, ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { Source } from "@/lib/ai";
import { useStore } from "@/lib/store";

export function AiTag({ source, note }: { source?: Source; note?: string }) {
  const { demo } = useStore();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 text-[11px] font-semibold text-ai" title={demo && source === "built-in" ? note : undefined}>
      <Sparkles className="h-3 w-3" /> AI{source === "built-in" ? " · built-in rules" : source === "gemini" ? " · Gemini" : ""}
    </span>
  );
}

const PILL: Record<string, string> = {
  Waiting: "bg-muted text-muted-foreground",
  Accepted: "bg-ok-soft text-ok",
  Paid: "bg-ok-soft text-ok",
  "On a plan": "bg-accent text-accent-foreground",
  "Plan offered": "bg-accent text-accent-foreground",
  "Has a question": "bg-warn-soft text-warn",
  "Part-paid": "bg-warn-soft text-warn",
  Unpaid: "bg-muted text-muted-foreground",
  Late: "bg-bad-soft text-bad",
  Declined: "bg-bad-soft text-bad",
};
export function Pill({ children }: { children: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[children] ?? "bg-muted"}`}>{children}</span>;
}

export function Flow({
  title,
  sub,
  onBack,
  children,
  primary,
  step,
}: {
  title: string;
  sub?: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
  primary?: ReactNode;
  step?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[660px] fade-up">
      {step && <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{step}</div>}
      <h1 className="title-serif">{title}</h1>
      {sub && <p className="mt-2 text-muted-foreground">{sub}</p>}
      <div className="mt-6 space-y-4">{children}</div>
      {(onBack || primary) && (
        <div className="mt-8 flex flex-col-reverse items-stretch gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          {onBack ? (
            <button className="btn-ghost" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col items-stretch gap-1 sm:items-end">{primary}</div>
        </div>
      )}
    </div>
  );
}

/** Primary button that always says why it's disabled. */
export function Primary({ label, why, onClick, busy }: { label: string; why?: string | null; onClick: () => void; busy?: boolean }) {
  return (
    <>
      <button className="btn-primary" disabled={!!why || busy} onClick={onClick}>
        {busy ? "Working…" : label}
      </button>
      {why && <span className="text-xs text-warn sm:text-right">{why}</span>}
    </>
  );
}

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-demo px-5 py-2.5 text-sm text-demo-foreground shadow-lift fade-up">
      {toast}
    </div>
  );
}
