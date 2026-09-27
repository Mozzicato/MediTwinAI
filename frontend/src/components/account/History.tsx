"use client";

import { StatusDot } from "@/components/ui/primitives";
import { SYMPTOM_BY_ID } from "@/domain/content";
import type { CheckIn } from "@/domain/types";
import { longDate } from "@/lib/format";

export function History({ checkins, onNewCheckin }: { checkins: CheckIn[]; onNewCheckin: () => void }) {
  return <section className="card">
    <div className="card-head">
      <div><span className="eyebrow">Symptom history</span><h3>{checkins.length ? `${checkins.length} check-in${checkins.length === 1 ? "" : "s"}` : "No check-ins yet"}</h3></div>
      <button className="button button-small button-primary" onClick={onNewCheckin}>New check-in</button>
    </div>
    <p className="muted">Each time you check your symptoms, MediTwin saves them here. Recent check-ins are taken into account next time, so recurring symptoms are recognised.</p>
    {checkins.length > 0 && <ol className="history-list">
      {checkins.map((c) => <li key={c.id}>
        <time>{longDate(c.createdAt)}</time>
        <div>
          <b>{c.symptoms.map((s) => SYMPTOM_BY_ID.get(s.id)?.label ?? s.id).join(", ")}</b>
          <span>{c.symptoms.map((s) => `${s.severity}`).join(", ")}</span>
          <p>{c.headline}</p>
        </div>
        {c.signal ? <span className={`pill pill-${c.signal.type.toLowerCase()}`}><StatusDot status={c.signal.type} />{c.signal.type.toLowerCase()} · {c.signal.systemLabel}</span>
          : <span className="pill pill-muted">No signal</span>}
      </li>)}
    </ol>}
  </section>;
}
