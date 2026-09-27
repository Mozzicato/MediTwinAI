"use client";

import type { TraceEntry } from "@/domain/types";
import { ms } from "@/lib/format";

const STAGES: { service: TraceEntry["service"][]; label: string; match?: RegExp }[] = [
  { service: ["DTP"], label: "Digital twin (OntoMorph DTP)" },
  { service: ["HOLON"], label: "Clinical concepts", match: /^concept (LOINC|RxNorm|ICD|SNOMED|HPO)/ },
  { service: ["HOLON"], label: "Reference ranges", match: /^reference range/ },
  { service: ["HOLON"], label: "Anatomy (FMA)", match: /^concept FMA/ },
  { service: ["HOLON"], label: "Phenotype & interactions", match: /^(phenotype|interaction)/ },
  { service: ["ENGINE"], label: "Signal engine & safety" },
  { service: ["AI", "CONTENT"], label: "Explanation" },
];

/** Makes the integration visible (PRD 39/40): every external call and engine step, with latency. */
export function TraceView({ entries, title }: { entries: TraceEntry[]; title: string }) {
  if (!entries.length) return <section className="card"><h3>Integration trace</h3><p className="muted">Load a twin or run an analysis to see each call.</p></section>;
  return <section className="card trace">
    <div className="card-head"><div><span className="eyebrow">Integration trace</span><h3>{title}</h3></div><span className="muted small">{entries.length} steps</span></div>
    <ol className="stage-strip">
      {STAGES.map((stage) => {
        const hits = entries.filter((e) => stage.service.includes(e.service) && (!stage.match || stage.match.test(e.operation)));
        const failed = hits.some((h) => h.status === "error");
        const slowest = hits.reduce((max, h) => Math.max(max, h.ms), 0);
        return <li key={stage.label} className={hits.length ? (failed ? "stage warn" : "stage done") : "stage idle"}>
          <b>{stage.label}</b>
          <span>{hits.length ? `${hits.length} call${hits.length === 1 ? "" : "s"}${slowest ? ` · up to ${ms(slowest)}` : ""}` : "not used"}</span>
        </li>;
      })}
    </ol>
    <table className="trace-table">
      <thead><tr><th>Service</th><th>Operation</th><th>Status</th><th>Time</th><th>Detail</th></tr></thead>
      <tbody>{entries.map((e, i) => <tr key={i} className={`trace-${e.status}`}>
        <td><span className={`svc svc-${e.service.toLowerCase()}`}>{e.service}</span></td>
        <td>{e.operation}</td><td>{e.status.replace("_", " ")}</td><td>{e.ms ? ms(e.ms) : "–"}</td><td>{e.detail ?? ""}</td>
      </tr>)}</tbody>
    </table>
    <p className="fine">Health values are never written to server logs, only operations, counts and timings.</p>
  </section>;
}
