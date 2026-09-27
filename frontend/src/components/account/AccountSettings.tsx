"use client";

import { useState } from "react";
import type { PersonalState, Profile } from "@/domain/types";
import { me } from "@/lib/api";
import { longDate } from "@/lib/format";
import { ProfileFields } from "./Onboarding";

export function AccountSettings({ personal, onChanged, onDeleted }: { personal: PersonalState; onChanged: () => void; onDeleted: () => void }) {
  const [profile, setProfile] = useState<Partial<Profile>>(personal.profile ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setSaved("");
    try { await me.saveProfile(profile as Profile); setSaved("Saved."); onChanged(); }
    catch (e) { setSaved(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    setDeleting(true); setDeleteError("");
    try { await me.deleteAccount(confirm); onDeleted(); }
    catch (e) { setDeleteError(e instanceof Error ? e.message : "Couldn't delete the account."); setDeleting(false); }
  };

  return <div className="account">
    <section className="card">
      <div className="card-head"><div><span className="eyebrow">Profile</span><h3>{personal.email}</h3></div></div>
      <form onSubmit={save} className="auth-form">
        <ProfileFields value={profile} onChange={setProfile} />
        <div className="row-actions"><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>{saved && <span className="success-text">{saved}</span>}</div>
      </form>
    </section>

    <section className="card">
      <span className="eyebrow">Privacy</span>
      <h3>Your data, your control</h3>
      <ul className="privacy-facts">
        <li>You agreed to consent version <b>{personal.consent?.version}</b> on {personal.consent ? longDate(personal.consent.at) : "–"}.</li>
        <li>Results, notes, check-ins and your OntoMorph grant are encrypted before storage (AES-256-GCM).</li>
        <li>Explanations are written from anonymised evidence. Your name and email are never sent to the AI provider.</li>
      </ul>
      <div className="row-actions">
        <a className="button" href={me.exportUrl} download>Download all my data (JSON)</a>
      </div>
    </section>

    <section className="card danger-zone">
      <span className="eyebrow">Delete account</span>
      <h3>Permanently delete everything</h3>
      <p className="muted">This removes your account, profile, results, check-ins, twin connection and activity log from MediTwin. It can&apos;t be undone. Data already on your OntoMorph twin stays there.</p>
      <label className="auth-form">Type your email to confirm
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={personal.email} autoComplete="off" />
      </label>
      {deleteError && <p className="error-text" role="alert">{deleteError}</p>}
      <div className="row-actions">
        <button className="button button-danger" onClick={remove} disabled={deleting || confirm.trim().toLowerCase() !== personal.email}>{deleting ? "Deleting…" : "Delete my account"}</button>
      </div>
    </section>
  </div>;
}
