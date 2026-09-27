"use client";

import { useState } from "react";
import { MeasurementStatus } from "@/components/ui/primitives";
import type { Measurement, TwinView } from "@/domain/types";
import { longDate, monthLabel, shortDate } from "@/lib/format";

export function Timeline({ twin, onOpenMeasurement, onRefresh, refreshing }: {
  twin: TwinView; onOpenMeasurement: (m: Measurement) => void; onRefresh: () => void; refreshing: boolean;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [showCodes, setShowCodes] = useState(false);
  const events = twin.events.filter((e) => filter === "all" || e.system === filter);
  const groups = new Map<string, typeof events>();
  for (const e of events) groups.set(monthLabel(e.occurredAt), [...(groups.get(monthLabel(e.occurredAt)) ?? []), e]);

  return <section className="card timeline">
    <div className="card-head">
      <div><span className="eyebrow">Health timeline</span><h3>{twin.events.length} events from your digital twin</h3></div>
      <div className="timeline-tools">
        <label className="toggle"><input type="checkbox" checked={showCodes} onChange={(e) => setShowCodes(e.target.checked)} /> Show clinical codes</label>
        <button className="button button-small" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh from twin"}</button>
      </div>
    </div>
    <div className="filter-chips" role="group" aria-label="Filter by body system">
      <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>All</button>
      {twin.systems.map((s) => <button key={s.id} className={filter === s.id ? "chip active" : "chip"} onClick={() => setFilter(s.id)}>{s.label}</button>)}
    </div>
    {[...groups].map(([month, list]) => <div key={month} className="timeline-month">
      <h4>{month}</h4>
      {list.map((e) => <article key={e.id} className={`timeline-event${e.attention ? " attention" : ""}${e.meditwinFlag ? " flagged" : ""}`}>
        <time dateTime={e.occurredAt} title={longDate(e.occurredAt)}>{shortDate(e.occurredAt)}</time>
        <div className="timeline-body">
          <span className="timeline-category">{e.category}{e.meditwinFlag && <b> · Written by MediTwin</b>}</span>
          <h5>{e.title}</h5>
          <p>{e.summary}</p>
          {e.measurements.some((m) => m.status !== "NO_REFERENCE") && <div className="timeline-measurements">
            {e.measurements.map((m) => <button key={m.key} className="mini-measure" onClick={() => onOpenMeasurement(m)}>
              {m.label} <b>{m.value} {m.unit}</b> <MeasurementStatus status={m.status} />
            </button>)}
          </div>}
          {showCodes && e.concepts.length > 0 && <ul className="codes">
            {e.concepts.map((c) => <li key={c.vocabulary + c.code}>
              <code>{c.vocabulary} {c.code}</code> {c.resolved ? <span>→ {c.name}</span> : <span className="muted">not resolved in HOLON</span>}
            </li>)}
          </ul>}
        </div>
        <span className="timeline-source" title={`Source plugin: ${e.sourcePlugin}`}>OntoMorph DTP</span>
      </article>)}
    </div>)}
  </section>;
}
