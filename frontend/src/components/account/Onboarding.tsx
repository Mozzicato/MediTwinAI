"use client";

import { useState } from "react";
import { Logo } from "@/components/ui/primitives";
import type { Profile, ProfileSex } from "@/domain/types";

export function ProfileFields({ value, onChange }: { value: Partial<Profile>; onChange: (next: Partial<Profile>) => void }) {
  const year = new Date().getFullYear();
  return <div className="form-grid">
    <label>First name
      <input value={value.firstName ?? ""} onChange={(e) => onChange({ ...value, firstName: e.target.value })} maxLength={60} required autoComplete="given-name" />
    </label>
    <label>Year of birth
      <input type="number" inputMode="numeric" min={year - 120} max={year - 13} value={value.birthYear ?? ""} required
        onChange={(e) => onChange({ ...value, birthYear: e.target.value ? Number(e.target.value) : undefined })} />
      <small>Used to pick age-appropriate reference ranges.</small>
    </label>
    <label>Sex
      <select value={value.sex ?? ""} required onChange={(e) => onChange({ ...value, sex: e.target.value as ProfileSex })}>
        <option value="" disabled>Choose…</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
        <option value="unspecified">Prefer not to say</option>
      </select>
      <small>Some reference ranges differ by sex. “Prefer not to say” uses ranges that apply to everyone.</small>
    </label>
  </div>;
}

/** First run: informed consent, then the minimum profile MediTwin needs. */
export function Onboarding({ email, onSave, onSignOut }: { email: string; onSave: (profile: Profile) => Promise<void>; onSignOut: () => void }) {
  const [step, setStep] = useState<"consent" | "profile">("consent");
  const [agreed, setAgreed] = useState(false);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile.firstName || !profile.birthYear || !profile.sex) return;
    setBusy(true); setError("");
    try { await onSave(profile as Profile); }
    catch (e) { setError(e instanceof Error ? e.message : "We couldn't save that. Please try again."); }
    finally { setBusy(false); }
  };

  return <main className="center-shell">
    <section className="panel panel-wide">
      <button className="link-button panel-back" onClick={onSignOut}>Sign out</button>
      <Logo />
      <ol className="steps" aria-label="Setup progress"><li className="on">Your consent</li><li className={step === "profile" ? "on" : ""}>About you</li></ol>
      {step === "consent" ? <>
        <span className="eyebrow">Before you start · {email}</span>
        <h1>How MediTwin handles your health information</h1>
        <ul className="consent-list">
          <li><b>MediTwin explains; it doesn&apos;t diagnose.</b> It shows how your results and symptoms relate to each other and to reference ranges, and suggests when to talk to a healthcare professional. It is not a medical device and doesn&apos;t replace your clinician.</li>
          <li><b>In an emergency, don&apos;t use MediTwin.</b> Call your local emergency number.</li>
          <li><b>What we store.</b> Your email, the profile below, results you add, your symptom check-ins and, if you connect one, your OntoMorph grant token. Health content is encrypted before it is saved.</li>
          <li><b>Who processes it.</b> Clinical codes are looked up in OntoMorph HOLON. If you connect your twin, MediTwin reads it with the permission you grant. To write explanations, MediTwin sends the relevant evidence, without your name or email, to an AI provider (Groq or Anthropic).</li>
          <li><b>You stay in control.</b> Download everything or delete your account at any time from Account &amp; privacy. You can revoke MediTwin&apos;s access to your twin in OntoMorph whenever you like.</li>
        </ul>
        <label className="consent-check"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          I understand MediTwin doesn&apos;t diagnose, and I agree to it processing my health information as described.</label>
        <button className="button button-primary" disabled={!agreed} onClick={() => setStep("profile")}>Continue</button>
      </> : <form onSubmit={submit} className="auth-form">
        <span className="eyebrow">About you</span>
        <h1>Just the essentials</h1>
        <p className="muted">That&apos;s all MediTwin asks for. No ID numbers or medical records.</p>
        <ProfileFields value={profile} onChange={setProfile} />
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="row-actions">
          <button type="button" className="button" onClick={() => setStep("consent")}>Back</button>
          <button className="button button-primary" disabled={busy || !profile.firstName || !profile.birthYear || !profile.sex}>{busy ? "Saving…" : "Create my health twin"}</button>
        </div>
      </form>}
    </section>
  </main>;
}
