"use client";

import { useState } from "react";
import { BodyViewer } from "@/components/anatomy/BodyViewer";
import { SourceBadge, Spinner, StatusDot } from "@/components/ui/primitives";
import type { AnalysisResult, CareGuidance, OrganId } from "@/domain/types";

export type FlagState = { status: "idle" | "saving" | "created" | "exists" | "error"; message?: string };

function Guidance({ guidance }: { guidance: CareGuidance }) {
  return <section className={`card guidance guidance-${guidance.level.toLowerCase()}`} id="guidance">
    <span className="eyebrow">What you can do</span>
    <h3>{guidance.title}</h3>
    <ol>{guidance.steps.map((s) => <li key={s}>{s}</li>)}</ol>
    {guidance.seekUrgentCareIf.length > 0 && <div className="urgent-list">
      <b>Seek urgent medical help if you notice:</b>
      <ul>{guidance.seekUrgentCareIf.map((s) => <li key={s}>{s}</li>)}</ul>
    </div>}
    <p className="fine">Guidance from MediTwin&apos;s reviewed content set ({guidance.contentId}). It isn&apos;t written by AI.</p>
  </section>;
}

export function Insight({ result, name, canFlag, onEditSymptoms, onSummary, onWhatIf, canSimulate, onFlag, flag, tourTarget }: {
  result: AnalysisResult; name: string; canFlag: boolean; onEditSymptoms: () => void; onSummary: () => void; onWhatIf: () => void; canSimulate: boolean;
  onFlag: () => void; flag: FlagState; tourTarget?: string | null;
}) {
  const [selectedOrgan, setSelectedOrgan] = useState<OrganId | null>(null);
  const { primary, explanation, guidance } = result;
  const evidence = primary?.evidence ?? [];
  const cite = (id: string) => evidence.findIndex((e) => e.id === id) + 1;
  const organ = result.anatomy.find((o) => o.organ === selectedOrgan);
  const urgent = primary?.type === "URGENT";
  const supporting = evidence.filter((e) => e.kind !== "RECORDED_CONDITION" && e.kind !== "ADDITIONAL_RESULTS");

  return <div className="insight">
    <header className={`insight-hero insight-${(primary?.type ?? "none").toLowerCase()}`}>
      <span className="eyebrow">Your health context</span>
      <h2>{urgent ? "Please get medical help now." : primary?.type === "ATTENTION" ? "We found an attention signal." : primary ? "We found something to mention." : "No health signal from what you shared."}</h2>
      {primary && <p>{primary.systemLabel} system · {supporting.length} evidence item{supporting.length === 1 ? "" : "s"} · rule {primary.ruleId}</p>}
      <div className="insight-actions">
        <button className="button button-ghost" onClick={onEditSymptoms}>Change symptoms</button>
        {!urgent && <button className="button button-ghost" onClick={onSummary}>Prepare visit summary</button>}
        {!urgent && canSimulate && <button className="button button-ghost" onClick={onWhatIf}>What-if projection</button>}
      </div>
    </header>

    {urgent && <Guidance guidance={guidance} />}

    <div className="insight-grid">
      <section className="card card-dark anatomy-card" id="insight-anatomy">
        <div className="card-head"><div><span className="eyebrow">Affected anatomy</span><h3>{primary ? `${primary.systemLabel} system` : "Anatomy"}</h3></div></div>
        {result.anatomy.length
          ? <>
            <BodyViewer organs={result.anatomy} level={primary?.type ?? null} selectedOrgan={selectedOrgan} onSelectOrgan={(id) => setSelectedOrgan(selectedOrgan === id ? null : id)} />
            <div className="organ-pills">{result.anatomy.map((o) => <button key={o.organ} className={o.organ === selectedOrgan ? "active" : ""} onClick={() => setSelectedOrgan(o.organ === selectedOrgan ? null : o.organ)}>{o.label}</button>)}</div>
            <p className="organ-why"><b>Why this area?</b> {organ ? organ.rationale : `Your health information is associated with the ${primary?.systemLabel.toLowerCase()} system. Select a structure to learn how it's involved.`}</p>
          </>
          : <p className="muted-dark">Anatomy visualization unavailable for this finding.</p>}
      </section>

      <div className="insight-side">
        {primary && <section className={`card signal-card signal-${primary.type.toLowerCase()}${tourTarget === "signal" ? " tour-highlight" : ""}`}>
          <div className="card-head">
            <div><span className="eyebrow">Health signal</span><h3>{primary.title}</h3></div>
            <span className={`pill pill-${primary.type.toLowerCase()}`}><StatusDot status={primary.type} />{primary.type.toLowerCase()} · {primary.severity.toLowerCase()}</span>
          </div>
          <ul className="evidence-bullets">
            {supporting.slice(0, 5).map((e) => <li key={e.id}>{e.label}</li>)}
          </ul>
          <p className="fine">Rule {primary.ruleId}: {primary.rule}</p>
          {result.phenotype && <p className="fine">HOLON phenotype similarity with “{result.phenotype.matchedWith}”: {result.phenotype.score.toFixed(2)}</p>}
        </section>}

        <section className={`card explanation${tourTarget === "explanation" ? " tour-highlight" : ""}`} id="explanation">
          <div className="card-head">
            <div><span className="eyebrow">Plain-language explanation</span><h3>{explanation.headline}</h3></div>
          </div>
          {explanation.paragraphs.map((p, i) => <p key={i} className="explanation-p">
            {p.text}{p.evidenceIds.map((id) => cite(id)).filter((n) => n > 0).map((n) => <a key={n} href={`#ev-${n}`} className="cite">{n}</a>)}
          </p>)}
          <div className={`generator generator-${explanation.source === "MODEL_INFERRED" ? "ai" : "template"}`}>
            <b>{explanation.source === "MODEL_INFERRED" ? "Written by AI from the evidence below" : "Reviewed template"}</b>
            <span>{explanation.generator} · {explanation.safety.checks.length} safety rules passed{explanation.safety.fallbackReason ? ` · ${explanation.safety.fallbackReason}` : ""}</span>
          </div>
          <p className="disclaimer">{explanation.disclaimer}</p>
          {evidence.length > 0 && <details className="why" open>
            <summary>Why am I seeing this?</summary>
            <ol className="evidence-list">
              {evidence.map((e, i) => <li key={e.id} id={`ev-${i + 1}`}>
                <span className="ev-index">{i + 1}</span>
                <div><b>{e.label}</b><p>{e.detail}</p></div>
                <SourceBadge source={e.source} />
              </li>)}
            </ol>
          </details>}
        </section>
      </div>
    </div>

    {!urgent && <Guidance guidance={guidance} />}

    {!urgent && explanation.questions.length > 0 && <section className="card questions">
      <span className="eyebrow">Questions to ask your clinician</span>
      <ul>{explanation.questions.map((q) => <li key={q.text}>{q.text}</li>)}</ul>
    </section>}

    {primary && !urgent && canFlag && <section className="card writeback">
      <div>
        <span className="eyebrow">Share with the digital twin</span>
        <h3>Save this signal to {name} twin</h3>
        <p className="muted">Writes a clinical note back to the OntoMorph twin (twin.flag), so the signal becomes part of the record other tools and clinicians can see. MediTwin recomputes the signal on the server before writing.</p>
        {flag.message && <p className={flag.status === "error" ? "error-text" : "success-text"} role="status">{flag.message}</p>}
      </div>
      <button className="button" onClick={onFlag} disabled={flag.status === "saving" || flag.status === "created" || flag.status === "exists"}>
        {flag.status === "saving" ? <Spinner label="Saving…" /> : flag.status === "created" || flag.status === "exists" ? "Saved to twin ✓" : "Save to twin"}
      </button>
    </section>}

    {result.signals.length > 1 && <section className="card other-signals">
      <span className="eyebrow">Other signals</span>
      <ul>{result.signals.slice(1).map((s) => <li key={s.id}><StatusDot status={s.type} /><b>{s.title}</b><span>{s.evidence.length} evidence item{s.evidence.length === 1 ? "" : "s"} · {s.ruleId}</span></li>)}</ul>
    </section>}
  </div>;
}
