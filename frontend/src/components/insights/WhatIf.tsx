"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/primitives";
import type { SimulationComparison, SimulationType } from "@/domain/types";
import { api } from "@/lib/api";
import { ms } from "@/lib/format";

const LABELS: Record<SimulationType, { title: string; metric: string }> = {
  hba1c_trajectory: { title: "HbA1c trajectory", metric: "HbA1c" },
  ldl_trajectory: { title: "LDL cholesterol trajectory", metric: "LDL" },
};
const SCENARIO_TEXT: Record<string, string> = { no_change: "If nothing changes", lifestyle: "With lifestyle changes" };

function outputRows(outputs: Record<string, unknown>, unit: string) {
  const rows: [string, string][] = [];
  const n = (k: string) => (typeof outputs[k] === "number" ? (outputs[k] as number) : null);
  if (n("final_hba1c") !== null) rows.push(["Projected value", `${n("final_hba1c")} ${unit}`]);
  if (n("change") !== null) rows.push(["Change", `${n("change")! > 0 ? "+" : ""}${n("change")} ${unit}`]);
  if (typeof outputs.target_achieved === "boolean") rows.push(["Reaches the model's target", outputs.target_achieved ? "Yes" : "No"]);
  if (n("months_to_target") !== null) rows.push(["Months to target", String(n("months_to_target"))]);
  if (n("peak_value") !== null) rows.push(["Projected peak", `${n("peak_value")} ${unit}`]);
  if (n("peak_month") !== null) rows.push(["Peak month", String(n("peak_month"))]);
  for (const [k, v] of Object.entries(outputs)) if (!rows.length && (typeof v === "number" || typeof v === "boolean")) rows.push([k.replace(/_/g, " "), String(v)]);
  return rows;
}

export function WhatIf({ twinId, types, onTrace }: { twinId: string; types: SimulationType[]; onTrace: (entries: SimulationComparison["trace"]) => void }) {
  const [type, setType] = useState<SimulationType>(types[0]);
  const [months, setMonths] = useState(6);
  const [result, setResult] = useState<SimulationComparison | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true); setError(null);
    try { const next = await api.simulate(twinId, type, months); setResult(next); onTrace(next.trace); }
    catch (e) { setError(e instanceof Error ? e.message : "The simulation could not be run."); }
    finally { setRunning(false); }
  };
  const unit = result?.baseline?.unit ?? "";
  const simCalls = result?.trace.filter((t) => t.operation.startsWith("simulate")) ?? [];

  if (!types.length) return <section className="card"><h3>What-if projections</h3><p className="muted">This twin has no HbA1c or LDL results, so OntoMorph&apos;s trajectory models have no baseline to start from.</p></section>;

  return <section className="card whatif">
    <div className="card-head"><div><span className="eyebrow">OntoMorph DTP simulation</span><h3>What might happen next?</h3></div></div>
    <p className="muted">Runs OntoMorph&apos;s trajectory model on this twin&apos;s own recent results. MediTwin only offers scenarios that don&apos;t involve changing medicines: those decisions belong with a clinician.</p>
    <div className="whatif-controls">
      <div className="segmented">{types.map((t) => <button key={t} className={t === type ? "active" : ""} onClick={() => { setType(t); setResult(null); }}>{LABELS[t].title}</button>)}</div>
      <label>Over <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[3, 6, 12].map((m) => <option key={m} value={m}>{m} months</option>)}</select></label>
      <button className="button button-primary" onClick={run} disabled={running}>{running ? <Spinner label="Running on the twin…" /> : "Run projection"}</button>
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {result && <>
      {result.baseline && <p className="whatif-baseline">Starting point from the twin: latest {result.baseline.label} <b>{result.baseline.value} {result.baseline.unit}</b></p>}
      <div className="scenario-grid">
        {result.runs.map((r) => <article key={r.intervention} className={`scenario scenario-${r.intervention}`}>
          <h4>{SCENARIO_TEXT[r.intervention] ?? r.intervention}</h4>
          <dl>{outputRows(r.outputs, unit).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </article>)}
      </div>
      {type === "ldl_trajectory" && <p className="fine">OntoMorph&apos;s LDL model only compares medicine changes, so MediTwin shows the current-course projection alone.</p>}
      <p className="disclaimer">{result.runs[0]?.disclaimer} These are model projections, not predictions for you, and not advice to change anything.</p>
      <p className="fine">{simCalls.length} simulation run(s) on OntoMorph DTP · {simCalls.map((c) => ms(c.ms)).join(", ")}</p>
    </>}
  </section>;
}
