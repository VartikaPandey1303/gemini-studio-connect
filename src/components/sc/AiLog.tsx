import { useEffect, useState } from "react";
import { clearLogs, readLogs, readableOutput, summarize, type AiLogEntry } from "@/lib/ai-log";
import { AiTag } from "./ui";

export function AiLog() {
  const [logs, setLogs] = useState<AiLogEntry[]>([]);
  useEffect(() => setLogs(readLogs().slice(0, 50)), []);
  const sum = summarize(logs);
  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="title-serif">AI log</h1>
          <p className="mt-1 text-sm text-muted-foreground">The last 50 AI calls in this browser. Amounts always come from the rules; any AI text that changed one is rejected.</p>
        </div>
        <button className="btn-ghost" onClick={() => (clearLogs(), setLogs([]))}>
          Clear
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Calls", String(sum.count)],
          ["Answered by Gemini", `${sum.pctGemini}%`],
          ["Rejected by amount check", `${sum.pctRejected}%`],
          ["Average time", `${(sum.avgLatency / 1000).toFixed(1)}s`],
        ].map(([t, v]) => (
          <div key={t} className="card p-4">
            <div className="text-xs text-muted-foreground">{t}</div>
            <div className="num mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              {["Time", "Action", "Input", "Output", "Source", "Time taken", "Amount check"].map((h) => (
                <th key={h} className="p-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {logs.map((l, i) => (
              <tr key={i}>
                <td className="num p-3 whitespace-nowrap">{new Date(l.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                <td className="p-3">{l.action}</td>
                <td className="max-w-[220px] p-3 text-muted-foreground">{l.input.slice(0, 140)}</td>
                <td className="max-w-[260px] p-3"><div className="max-w-[260px] truncate" title={readableOutput(l)}>{readableOutput(l)}</div></td>
                <td className="p-3">
                  <AiTag source={l.source} note={l.reason} />
                </td>
                <td className="num p-3">{l.latencyMs} ms</td>
                <td className="p-3">{l.rejected ? <span className="text-bad">Rejected</span> : <span className="text-ok">Passed</span>}</td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No AI calls yet. Use the app, then come back.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
