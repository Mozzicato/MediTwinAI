"use client";

import { useEffect } from "react";
import type { Measurement, TimelineEvent } from "@/domain/types";
import { MeasurementStatus, RangeBar, Sparkline } from "@/components/ui/primitives";
import { longDate, rangeText, shortDate } from "@/lib/format";

export interface MeasurementSeries {
  latest: Measurement;
  history: Measurement[];
}

/** Latest reading per measurement key for a set of events, newest first, out-of-range first. */
export function seriesFor(events: TimelineEvent[]): MeasurementSeries[] {
  const byKey = new Map<string, Measurement[]>();
  for (const e of events) for (const m of e.measurements) byKey.set(m.key, [...(byKey.get(m.key) ?? []), m]);
  const rank = (m: Measurement) => (m.status === "ABOVE" || m.status === "BELOW" ? 0 : m.status === "WITHIN" ? 1 : 2);
  return [...byKey.values()]
    .map((list) => { const history = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); return { latest: history.at(-1)!, history }; })
    .sort((a, b) => rank(a.latest) - rank(b.latest) || b.latest.occurredAt.localeCompare(a.latest.occurredAt));
}

export function MeasurementRow({ series, onOpen, highlight }: { series: MeasurementSeries; onOpen: (m: Measurement) => void; highlight?: boolean }) {
  const m = series.latest;
  const out = m.status === "ABOVE" || m.status === "BELOW";
  const range = rangeText(m);
  return <button className={`measurement-row${out ? " out" : ""}${highlight ? " tour-highlight" : ""}`} onClick={() => onOpen(m)} data-key={m.key}>
    <div className="measurement-main">
      <span className="measurement-label">{m.label}</span>
      <span className="measurement-value">{m.value}<small> {m.unit}</small></span>
      <Sparkline values={series.history.map((h) => h.value)} out={out} />
    </div>
    <RangeBar m={m} />
    <div className="measurement-meta">
      <MeasurementStatus status={m.status} />
      <span>{range ? `Ref ${range}` : m.status === "NO_REFERENCE" ? "HOLON has no reference range" : ""}</span>
      <span>{shortDate(m.occurredAt)}</span>
    </div>
  </button>;
}

/** FR-006: raw code → HOLON concept → human-readable representation, with provenance. */
export function ConceptDrawer({ m, history, onClose }: { m: Measurement; history: Measurement[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const range = rangeText(m);
  return <div className="drawer-backdrop" onClick={onClose}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${m.label} clinical information`} onClick={(e) => e.stopPropagation()}>
      <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
      <span className="eyebrow">Clinical information · resolved through HOLON</span>
      <h3>{m.label}</h3>
      <div className="drawer-value"><b>{m.value}</b> {m.unit} <MeasurementStatus status={m.status} /></div>
      <RangeBar m={m} />

      <ol className="resolution">
        <li><span>Twin record</span><b>{m.label} = {m.value} {m.unit}</b><small>OntoMorph DTP event · {longDate(m.occurredAt)}</small></li>
        <li><span>Clinical code</span><b>{m.loinc ? `LOINC ${m.loinc}` : "No standard code on record"}</b><small>{m.loinc ? "Kept internally; you don't need to know it" : "MediTwin can't look this measurement up"}</small></li>
        <li><span>HOLON concept</span>{m.concept?.resolved
          ? <><b>{m.concept.name}</b><small>HOLON concept {m.concept.holonId}</small></>
          : <><b>Clinical information unavailable for this measurement.</b><small>HOLON couldn&apos;t resolve this code</small></>}</li>
        <li><span>Reference range</span>{m.reference
          ? <><b>{range}</b><small>{m.reference.source} · HOLON LOINC {m.reference.loinc}{m.reference.label ? ` · “${m.reference.label}”` : ""}</small></>
          : <><b>No reference range in HOLON</b><small>MediTwin doesn&apos;t substitute a hard-coded range</small></>}</li>
        {m.compared && <li><span>Unit conversion</span><b>{m.value} {m.unit} = {m.compared.value} {m.compared.unit}</b><small>Approved conversion for this LOINC code</small></li>}
        {m.recordedRange && <li><span>Lab-printed range</span><b>{m.recordedRange} {m.unit}</b><small>As written on the original record, shown for comparison</small></li>}
      </ol>

      {history.length > 1 && <div className="drawer-history">
        <span className="eyebrow">History in your twin</span>
        <ul>{[...history].reverse().map((h) => <li key={h.eventId + h.key}><span>{longDate(h.occurredAt)}</span><b>{h.value} {h.unit}</b><MeasurementStatus status={h.status} /></li>)}</ul>
      </div>}
      <p className="drawer-note">A value outside a reference range is not a diagnosis. Ranges describe a typical population and can differ between laboratories.</p>
    </aside>
  </div>;
}
