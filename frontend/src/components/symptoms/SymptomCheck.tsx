"use client";

import { useState } from "react";
import { SYMPTOMS, SYMPTOM_BY_ID } from "@/domain/content";
import type { Severity, SymptomInput } from "@/domain/types";
import { Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";

const DURATIONS = [
  { days: 1, label: "Today" }, { days: 3, label: "A few days" }, { days: 7, label: "About a week" },
  { days: 14, label: "About 2 weeks" }, { days: 30, label: "A month or more" },
];
const SEVERITIES: Severity[] = ["mild", "moderate", "severe"];

export type SymptomSelection = Record<string, SymptomInput>;

export function SymptomCheck({ name, selection, onChange, onAnalyze, analyzing, error, tourHighlight }: {
  name: string;
  selection: SymptomSelection;
  onChange: (next: SymptomSelection) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  error: string | null;
  tourHighlight?: boolean;
}) {
  const [text, setText] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; quote: string }[] | null>(null);
  const [method, setMethod] = useState<string>("");

  const toggle = (id: string) => {
    const next = { ...selection };
    if (next[id]) delete next[id];
    else next[id] = { id, severity: "moderate", durationDays: 14 };
    onChange(next);
  };
  const update = (id: string, patch: Partial<SymptomInput>) => onChange({ ...selection, [id]: { ...selection[id], ...patch } });

  const interpret = async () => {
    setInterpreting(true);
    try {
      const result = await api.interpret(text);
      setSuggestions(result.matches);
      setMethod(result.note ?? (result.method === "MODEL_INFERRED" ? "Matched by AI, checked against your exact words" : "Keyword matching"));
    } catch (e) {
      setSuggestions([]);
      setMethod(e instanceof Error ? e.message : "Couldn't interpret the description");
    } finally {
      setInterpreting(false);
    }
  };
  const addSuggestion = (s: { id: string; quote: string }) =>
    onChange({ ...selection, [s.id]: { id: s.id, severity: selection[s.id]?.severity ?? "moderate", durationDays: selection[s.id]?.durationDays ?? 14, userWording: s.quote } });

  const selected = Object.values(selection);
  return <section className="card symptoms">
    <div className="card-head">
      <div><span className="eyebrow">Structured symptom check</span><h3>What is {name} experiencing?</h3></div>
    </div>
    <p className="muted">Pick from the list. MediTwin keeps your original wording and converts each symptom into SNOMED CT and HPO concepts through HOLON.</p>

    <div className={`symptom-grid${tourHighlight ? " tour-highlight" : ""}`} role="group" aria-label="Symptoms">
      {SYMPTOMS.map((s) => <label key={s.id} className={selection[s.id] ? "symptom-chip checked" : "symptom-chip"}>
        <input type="checkbox" checked={Boolean(selection[s.id])} onChange={() => toggle(s.id)} />
        <span className="check" aria-hidden="true" />{s.label}
      </label>)}
    </div>

    <details className="describe">
      <summary>Or describe it in your own words</summary>
      <div className="describe-body">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={400} rows={2}
          placeholder="e.g. I'm always thirsty and keep getting up at night to pee" />
        <button className="button button-small" onClick={interpret} disabled={interpreting || text.trim().length < 3}>
          {interpreting ? <Spinner label="Interpreting…" /> : "Find matching symptoms"}
        </button>
        {suggestions && <div className="suggestions">
          <small>{method}</small>
          {suggestions.length === 0 ? <p className="muted">No catalog symptom clearly matches. Try choosing from the list above.</p>
            : suggestions.map((s) => <button key={s.id} className="suggestion" onClick={() => addSuggestion(s)} disabled={Boolean(selection[s.id]?.userWording)}>
              + {SYMPTOM_BY_ID.get(s.id)?.label} <em>“{s.quote}”</em>
            </button>)}
        </div>}
      </div>
    </details>

    {selected.length > 0 && <div className="symptom-details">
      {selected.map((s) => <div key={s.id} className="symptom-detail">
        <b>{SYMPTOM_BY_ID.get(s.id)?.label}{s.userWording && <em> “{s.userWording}”</em>}</b>
        <div className="segmented" role="radiogroup" aria-label={`Severity of ${SYMPTOM_BY_ID.get(s.id)?.label}`}>
          {SEVERITIES.map((level) => <button key={level} role="radio" aria-checked={s.severity === level}
            className={s.severity === level ? "active" : ""} onClick={() => update(s.id, { severity: level })}>{level}</button>)}
        </div>
        <select value={s.durationDays} onChange={(e) => update(s.id, { durationDays: Number(e.target.value) })} aria-label="Duration">
          {DURATIONS.map((d) => <option key={d.days} value={d.days}>{d.label}</option>)}
        </select>
      </div>)}
    </div>}

    <div className="analyze-bar">
      <div>
        <b>{selected.length ? `${selected.length} symptom${selected.length === 1 ? "" : "s"} selected` : "Select at least one symptom"}</b>
        <p>MediTwin compares them with {name}&apos;s twin using deterministic rules. It doesn&apos;t diagnose.</p>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
      <button className="button button-primary" onClick={onAnalyze} disabled={analyzing || selected.length === 0}>
        {analyzing ? <Spinner label="Analysing…" /> : "Analyse health context"}
      </button>
    </div>
  </section>;
}
