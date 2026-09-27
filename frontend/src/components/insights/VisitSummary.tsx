"use client";

import { DISCLAIMER } from "@/domain/content";
import type { AnalysisResult, TwinView } from "@/domain/types";
import { longDate, rangeText } from "@/lib/format";
import { seriesFor } from "@/components/twin/Measurements";

const DURATION_TEXT = (days: number) => (days >= 30 ? "a month or more" : days >= 14 ? "about 2 weeks" : days >= 7 ? "about a week" : days > 1 ? "a few days" : "since today");

/** A one-page summary a person can bring to an appointment (PRD roadmap, Phase 5 preview). */
export function VisitSummary({ twin, analysis }: { twin: TwinView; analysis: AnalysisResult | null }) {
  const outOfRange = seriesFor(twin.events).filter((s) => s.latest.status === "ABOVE" || s.latest.status === "BELOW");
  const questions = analysis?.explanation.questions.map((q) => q.text) ?? [];
  const today = new Date().toISOString();
  return <section className="card summary">
    <div className="card-head no-print">
      <div><span className="eyebrow">Prepare for your appointment</span><h3>Visit summary</h3></div>
      <button className="button button-primary" onClick={() => window.print()}>Print or save as PDF</button>
    </div>
    <article className="print-area">
      <header className="summary-head">
        <div><h2>Health summary for {twin.persona.name}</h2><p>{twin.persona.age} years · {twin.persona.sex} · prepared {longDate(today)}</p></div>
        <p className="summary-tag">Synthetic demo patient · prepared with MediTwin</p>
      </header>

      {analysis && analysis.symptoms.length > 0 && <section>
        <h4>What I&apos;ve been experiencing</h4>
        <ul>{analysis.symptoms.map((s) => <li key={s.id}><b>{s.label}</b>: {s.severity}, {DURATION_TEXT(s.durationDays)}{s.userWording ? `. In my words: “${s.userWording}”` : ""}</li>)}</ul>
      </section>}

      {analysis?.primary && <section>
        <h4>What MediTwin flagged</h4>
        <p><b>{analysis.primary.title}</b> ({analysis.primary.type.toLowerCase()}). {analysis.primary.rule}</p>
      </section>}

      <section>
        <h4>Results outside their reference range</h4>
        {outOfRange.length === 0 ? <p>None on record.</p> : <table>
          <thead><tr><th>Measurement</th><th>Latest</th><th>Reference (HOLON)</th><th>Date</th><th>Earlier</th></tr></thead>
          <tbody>{outOfRange.map(({ latest, history }) => <tr key={latest.key}>
            <td>{latest.label}</td><td>{latest.value} {latest.unit}</td><td>{rangeText(latest)}</td><td>{longDate(latest.occurredAt)}</td>
            <td>{history.length > 1 ? history.slice(0, -1).map((h) => `${h.value} (${longDate(h.occurredAt)})`).join(", ") : "–"}</td>
          </tr>)}</tbody>
        </table>}
      </section>

      <section>
        <h4>Medicines on record</h4>
        {twin.medications.length ? <ul>{twin.medications.map((m) => <li key={m.eventId}>{m.label}{m.labelCodeMismatch ? " (please confirm the dose: the coded product strength differs)" : ""}</li>)}</ul> : <p>None on record.</p>}
      </section>

      {twin.recordedConditions.length > 0 && <section>
        <h4>Conditions already on record</h4>
        <ul>{twin.recordedConditions.map((c) => <li key={c}>{c}</li>)}</ul>
      </section>}

      {questions.length > 0 && <section>
        <h4>Questions I&apos;d like to ask</h4>
        <ol>{questions.map((q) => <li key={q}>{q}</li>)}</ol>
      </section>}

      <footer>{DISCLAIMER} Sources: OntoMorph digital twin (synthetic sandbox), HOLON clinical reference ranges.</footer>
    </article>
  </section>;
}
