"use client";

import { useState } from "react";
import { ENTRY_TYPES, ENTRY_TYPE_BY_ID, validateEntry } from "@/domain/entry-catalog";
import type { PersonalState } from "@/domain/types";
import { me } from "@/lib/api";
import { longDate } from "@/lib/format";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TwinStatusCard({ personal }: { personal: PersonalState }) {
  const c = personal.connection;
  const synced = personal.entries.filter((e) => e.twinEventId).length;
  return <section className="card">
    <div className="card-head">
      <div><span className="eyebrow">OntoMorph digital twin</span><h3>{c.connected ? "Your twin is live on OntoMorph" : "Creating your twin"}</h3></div>
      <span className={`pill pill-${c.connected && c.status === "ok" ? "clear" : "attention"}`}>{c.connected ? (c.status === "ok" ? "Active" : "Syncing") : "Pending"}</span>
    </div>
    {c.message && <p className="notice-inline">{c.message}</p>}
    {c.connected && <dl className="facts">
      <div><dt>Twin ID</dt><dd><code>{c.twinId?.slice(0, 8)}…</code></dd></div>
      <div><dt>Created</dt><dd>{c.connectedAt ? longDate(c.connectedAt) : "–"}</dd></div>
      <div><dt>Results on your twin</dt><dd>{synced} of {personal.entries.length}</dd></div>
    </dl>}
  </section>;
}

function AddResult({ onAdded }: { onAdded: () => void }) {
  const [typeId, setTypeId] = useState(ENTRY_TYPES[0].id);
  const type = ENTRY_TYPE_BY_ID.get(typeId)!;
  const [values, setValues] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState(type.fields[0].units[0]);
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const pickType = (id: string) => {
    const next = ENTRY_TYPE_BY_ID.get(id)!;
    setTypeId(id); setValues({}); setUnit(next.fields[0].units[0]); setMessage(null);
  };
  const numeric = Object.fromEntries(type.fields.map((f) => [f.key, Number(values[f.key])]));
  const localError = type.fields.every((f) => values[f.key]) ? validateEntry(type, numeric, unit) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const result = await me.addEntry({ typeId, values: numeric, unit, occurredAt: new Date(`${date}T12:00:00`).toISOString(), note: note || undefined });
      setValues({}); setNote("");
      setMessage({ kind: "ok", text: result.message });
      onAdded();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save that result." });
    } finally { setBusy(false); }
  };

  return <section className="card">
    <div className="card-head"><div><span className="eyebrow">Add a result</span><h3>Record a measurement</h3></div></div>
    <form className="entry-form" onSubmit={submit}>
      <label>What did you measure?
        <select value={typeId} onChange={(e) => pickType(e.target.value)}>{ENTRY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <small>{type.help}</small>
      </label>
      <div className="entry-values">
        {type.fields.map((f) => <label key={f.key}>{f.label}
          <input type="number" step="any" inputMode="decimal" required value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        </label>)}
        <label>Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>{type.fields[0].units.map((u) => <option key={u}>{u}</option>)}</select>
        </label>
        <label>Date
          <input type="date" value={date} max={todayLocal()} required onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>Note (optional)
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Lab at City Clinic, fasting" />
      </label>
      {localError && <p className="error-text">{localError}</p>}
      {message && <p className={message.kind === "ok" ? "success-text" : "error-text"} role="status">{message.text}</p>}
      <div className="row-actions"><button className="button button-primary" disabled={busy || Boolean(localError)}>{busy ? "Saving…" : "Save result"}</button></div>
    </form>
  </section>;
}

function EntryList({ personal, onChanged }: { personal: PersonalState; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const remove = async (id: string) => {
    if (!window.confirm("Delete this result from MediTwin? A copy already saved on your OntoMorph twin stays there.")) return;
    setBusy(id);
    try { await me.deleteEntry(id); onChanged(); } finally { setBusy(null); }
  };
  return <section className="card">
    <div className="card-head"><div><span className="eyebrow">Your results</span><h3>{personal.entries.length ? `${personal.entries.length} result${personal.entries.length === 1 ? "" : "s"} added by you` : "No results added yet"}</h3></div></div>
    {personal.entries.length > 0 && <ul className="entry-list">
      {personal.entries.map((e) => {
        const type = ENTRY_TYPE_BY_ID.get(e.typeId);
        const shown = type?.fields.map((f) => e.values[f.key]).join("/") ?? "";
        return <li key={e.id}>
          <div><b>{type?.label ?? e.typeId}</b><span>{shown} {e.unit} · {longDate(e.occurredAt)}{e.note ? ` · ${e.note}` : ""}</span></div>
          {e.twinEventId && <span className="source source-twin-record">On your twin</span>}
          <button className="link-button" onClick={() => remove(e.id)} disabled={busy === e.id}>{busy === e.id ? "Deleting…" : "Delete"}</button>
        </li>;
      })}
    </ul>}
  </section>;
}

export function MyData({ personal, onChanged }: { personal: PersonalState; onChanged: () => void }) {
  return <div className="my-data">
    <TwinStatusCard personal={personal} />
    <div className="two-col">
      <AddResult onAdded={onChanged} />
      <EntryList personal={personal} onChanged={onChanged} />
    </div>
  </div>;
}
