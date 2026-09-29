"use client";

import { useState } from "react";
import { AssistantMark } from "@/components/assistant/Assistant";
import { MeasurementStatus, StatusDot } from "@/components/ui/primitives";
import { SYMPTOMS, SYMPTOM_BY_ID } from "@/domain/content";
import { isOutOfRange, seriesFor } from "@/domain/series";
import type { Measurement, TwinView } from "@/domain/types";
import { SYSTEM_STATUS_TEXT, longDate, rangeText, shortDate } from "@/lib/format";

export type HomeDestination = "symptoms" | "overview" | "timeline" | "summary" | "mydata" | "history" | "ask";

const QUICK_SYMPTOMS = ["fatigue", "headache", "increased_thirst", "dizziness", "cough", "shortness_of_breath", "frequent_urination", "nausea"];

function timeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Home({ twin, personal, starters, onAsk, onGo, onOpenMeasurement, onSelectSystem, onQuickCheck }: {
  twin: TwinView;
  personal: boolean;
  starters: string[];
  onAsk: (text?: string) => void;
  onGo: (view: HomeDestination) => void;
  onOpenMeasurement: (m: Measurement) => void;
  onSelectSystem: (id: string) => void;
  onQuickCheck: (ids: string[]) => void;
}) {
  const [question, setQuestion] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const name = twin.persona.name;
  const series = seriesFor(twin.events);
  const flagged = series.filter((s) => isOutOfRange(s.latest));
  const attention = twin.systems.filter((s) => s.status === "URGENT" || s.status === "ATTENTION" || s.status === "INFORMATION");
  const recent = [...twin.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 4);
  const empty = twin.events.length === 0;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const summary = empty
    ? "Your twin is ready. Add a result or tell the assistant how you feel to get started."
    : flagged.length
      ? `${flagged.length} of your latest result${flagged.length === 1 ? " is" : "s are"} outside the reference range${attention.length ? `, in ${attention.map((s) => s.label.toLowerCase()).join(" and ")}` : ""}.`
      : `Your twin holds ${twin.events.length} health records across ${twin.systems.length} body system${twin.systems.length === 1 ? "" : "s"}.`;

  return <div className="home">
    <section className="home-hero">
      <div className="home-hero-text">
        <span className="eyebrow">{timeOfDay()}{personal ? `, ${name}` : ""}</span>
        <h2>{personal ? "How can I help with your health today?" : `Explore ${name}'s health twin`}</h2>
        <p>{summary}</p>
      </div>
      <form className="ask-box" onSubmit={(e) => { e.preventDefault(); onAsk(question); setQuestion(""); }}>
        <AssistantMark size={32} />
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1200}
          placeholder={personal ? "Ask anything, e.g. “What does my last result mean?”" : `Ask about ${name}'s results…`} aria-label="Ask the MediTwin assistant" />
        <button className="button button-primary" type="submit">Ask</button>
      </form>
      {starters.length > 0 && <div className="home-starters">
        {starters.slice(0, 3).map((s) => <button key={s} type="button" onClick={() => onAsk(s)}>{s}</button>)}
      </div>}
    </section>

    <div className="home-grid">
      <section className="card home-card">
        <div className="card-head"><div><span className="eyebrow">Worth a look</span><h3>{flagged.length ? "Results outside their range" : "Latest results"}</h3></div>
          {!empty && <button className="link-button" onClick={() => onGo("overview")}>All results →</button>}</div>
        {empty ? <div className="home-empty">
          <p className="muted">No results yet. Add one from a lab report or home device, and MediTwin checks it against its clinical reference range.</p>
          {personal && <button className="button button-primary button-small" onClick={() => onGo("mydata")}>Add a result</button>}
        </div>
          : <ul className="home-results">
            {(flagged.length ? flagged : series).slice(0, 4).map((s) => {
              const m = s.latest;
              const range = rangeText(m);
              return <li key={m.key}>
                <button className="home-result" onClick={() => onOpenMeasurement(m)}>
                  <span className="home-result-main"><b>{m.label}</b><small>{shortDate(m.occurredAt)}{range ? ` · ref ${range}` : ""}</small></span>
                  <span className="home-result-value">{m.value}<small> {m.unit}</small></span>
                  <MeasurementStatus status={m.status} />
                </button>
                <button className="chip-button" onClick={() => onAsk(`What does my ${m.label} of ${m.value} ${m.unit} mean?`)} aria-label={`Ask about ${m.label}`}>Ask ✦</button>
              </li>;
            })}
          </ul>}
      </section>

      <section className="card home-card">
        <div className="card-head"><div><span className="eyebrow">Quick check-in</span><h3>How are you feeling?</h3></div></div>
        <p className="muted small">Tap anything you&apos;ve noticed. MediTwin compares it with {personal ? "your" : `${name}'s`} twin.</p>
        <div className="quick-symptoms" role="group" aria-label="Symptoms">
          {QUICK_SYMPTOMS.map((id) => <button key={id} type="button" aria-pressed={picked.includes(id)} className={picked.includes(id) ? "on" : ""} onClick={() => toggle(id)}>
            {SYMPTOM_BY_ID.get(id)?.label}
          </button>)}
        </div>
        <div className="row-actions">
          <button className="button button-primary button-small" disabled={!picked.length} onClick={() => onQuickCheck(picked)}>
            {picked.length ? `Continue with ${picked.length}` : "Pick a symptom"}
          </button>
          <button className="link-button" onClick={() => onGo("symptoms")}>All {SYMPTOMS.length} symptoms</button>
        </div>
      </section>

      <section className="card home-card">
        <div className="card-head"><div><span className="eyebrow">Your body</span><h3>Body systems</h3></div></div>
        {twin.systems.length === 0 ? <p className="muted">Body systems appear here as results are added.</p>
          : <ul className="home-systems">
            {twin.systems.map((s) => <li key={s.id}><button onClick={() => onSelectSystem(s.id)}>
              <StatusDot status={s.status} /><b>{s.label}</b><small>{SYSTEM_STATUS_TEXT[s.status]}</small><span aria-hidden="true">›</span>
            </button></li>)}
          </ul>}
      </section>

      <section className="card home-card">
        <div className="card-head"><div><span className="eyebrow">Shortcuts</span><h3>Things you can do</h3></div></div>
        <div className="home-shortcuts">
          <button onClick={() => onAsk()}><b>Chat with the assistant</b><span>Questions, in English, Pidgin, Yoruba, Hausa or Igbo</span></button>
          {personal && <button onClick={() => onGo("mydata")}><b>Add a result</b><span>Blood pressure, HbA1c, cholesterol…</span></button>}
          <button onClick={() => onGo("summary")}><b>Visit summary</b><span>One page to print or show your clinician</span></button>
          <button onClick={() => onGo(personal ? "history" : "timeline")}><b>{personal ? "Check-in history" : "Health timeline"}</b><span>{personal ? "Every check-in you've done" : "Every record, month by month"}</span></button>
        </div>
      </section>

      {recent.length > 0 && <section className="card home-card home-wide">
        <div className="card-head"><div><span className="eyebrow">Recent activity</span><h3>Latest in the twin</h3></div>
          <button className="link-button" onClick={() => onGo("timeline")}>Timeline →</button></div>
        <ul className="home-recent">
          {recent.map((e) => <li key={e.id}><time>{longDate(e.occurredAt)}</time><b>{e.title}</b><span>{e.category}</span></li>)}
        </ul>
      </section>}
    </div>
  </div>;
}
