"use client";

import { BodyViewer } from "@/components/anatomy/BodyViewer";
import { StatusDot, SystemStatusPill } from "@/components/ui/primitives";
import { useTech } from "@/components/ui/tech";
import type { Measurement, OrganId, SignalType, TwinView } from "@/domain/types";
import { MeasurementRow, seriesFor } from "./Measurements";

export function Overview({ twin, systemId, onSelectSystem, selectedOrgan, onSelectOrgan, onOpenMeasurement, onCheckSymptoms, tourTarget }: {
  twin: TwinView;
  systemId: string;
  onSelectSystem: (id: string) => void;
  selectedOrgan: OrganId | null;
  onSelectOrgan: (id: OrganId | null) => void;
  onOpenMeasurement: (m: Measurement) => void;
  onCheckSymptoms: () => void;
  tourTarget?: string | null;
}) {
  const system = twin.systems.find((s) => s.id === systemId) ?? twin.systems[0];
  const events = twin.events.filter((e) => e.system === system?.id);
  const series = seriesFor(events);
  const signal = twin.baselineSignals.find((s) => s.system === system?.id);
  const level: SignalType | null = system && ["URGENT", "ATTENTION", "INFORMATION"].includes(system.status) ? system.status as SignalType : null;
  const organ = system?.anatomy.find((o) => o.organ === selectedOrgan);
  const tech = useTech();
  const firstOut = series.find((s) => s.latest.status === "ABOVE" || s.latest.status === "BELOW");

  if (!system) return <div className="empty">This twin has no health events yet.</div>;

  return <div className="overview">
    <div className="system-tabs" role="tablist" aria-label="Body systems">
      {twin.systems.map((s) => <button key={s.id} role="tab" aria-selected={s.id === system.id}
        className={`system-tab${s.id === system.id ? " active" : ""}${tourTarget === `system:${s.id}` ? " tour-highlight" : ""}`}
        onClick={() => { onSelectSystem(s.id); onSelectOrgan(null); }}>
        <StatusDot status={s.status} />{s.label}<small>{s.eventCount}</small>
      </button>)}
    </div>

    <div className="overview-grid">
      <section className="card card-dark anatomy-card">
        <div className="card-head">
          <div><span className="eyebrow">Anatomy</span><h3>{system.label} system</h3></div>
          <SystemStatusPill status={system.status} />
        </div>
        <BodyViewer organs={system.anatomy} level={level} selectedOrgan={selectedOrgan} onSelectOrgan={(id) => onSelectOrgan(selectedOrgan === id ? null : id)} />
        {system.anatomy.length > 0
          ? <ul className="organ-list">
            {system.anatomy.map((o) => <li key={o.organ}>
              <button className={o.organ === selectedOrgan ? "active" : ""} onClick={() => onSelectOrgan(o.organ === selectedOrgan ? null : o.organ)}>
                <b>{o.label}</b><span>{tech ? `FMA ${o.fma} · ${o.verified ? `verified as “${o.holonName}”` : "not verified. Hidden"}` : o.rationale}</span>
              </button>
            </li>)}
          </ul>
          : <p className="muted-dark">{system.anatomyNote ?? "Anatomy visualization unavailable for this finding."}</p>}
        {organ && <p className="organ-why"><b>Why this area?</b> {organ.rationale}</p>}
      </section>

      <section className="card system-card">
        <div className="card-head">
          <div><span className="eyebrow">Health overview</span><h3>{system.label}</h3></div>
          <span className="muted small">{system.eventCount} events · {system.outOfRange} outside range</span>
        </div>

        {signal
          ? <div className={`signal-banner signal-${signal.type.toLowerCase()}`}>
            <StatusDot status={signal.type} />
            <div>
              <b>{signal.type === "ATTENTION" ? "1 attention signal" : "Results outside reference range"}</b>
              <p>{signal.type === "ATTENTION"
                ? `A measurement is outside its reference range, and your twin recently recorded a related symptom.`
                : `Some results are outside their reference ranges. No related symptoms are on record.`}</p>
            </div>
            <button className="button button-small" onClick={onCheckSymptoms}>Check symptoms</button>
          </div>
          : <div className="signal-banner signal-clear"><StatusDot status="CLEAR" /><div><b>No current attention signal</b><p>Nothing in this system is outside its reference range.</p></div></div>}

        {series.length > 0
          ? <div className="measurement-list">
            {series.map((s) => <MeasurementRow key={s.latest.key} series={s} onOpen={onOpenMeasurement}
              highlight={tourTarget === "measurement" && s === firstOut} />)}
          </div>
          : <p className="muted">No numeric measurements in this system. See the timeline for other records.</p>}
        <p className="fine">{tech ? "Reference ranges are retrieved live from HOLON for each LOINC code. Select a measurement to see how it was resolved." : "Tap a result to see its history and where its reference range comes from."}</p>
      </section>
    </div>

    <section className="card meds-card">
      <div className="card-head"><div><span className="eyebrow">Medicines on record</span><h3>Medication check</h3></div></div>
      {twin.medications.length === 0 ? <p className="muted">No medicines are recorded in this twin.</p> : <ul className="med-list">
        {twin.medications.map((m) => <li key={m.eventId}>
          <b>{m.label}</b>
          {tech && <span>{m.holonName ? <>RxNorm {m.rxnorm} → HOLON: “{m.holonName}”</> : m.rxnorm ? `RxNorm ${m.rxnorm}, not found in HOLON` : "No RxNorm code on record"}</span>}
          {m.labelCodeMismatch && <em>The recorded dose differs from the strength of the coded product. That can be normal (for example, two tablets), but it&apos;s worth confirming your medicine list with your pharmacist.</em>}
        </li>)}
      </ul>}
      <p className="fine">{twin.interactions.checked && tech ? `HOLON interaction screen across ${twin.interactions.drugCount} medicines: ` : ""}{twin.interactions.note}</p>
    </section>
  </div>;
}
