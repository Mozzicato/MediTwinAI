"use client";

import { useState } from "react";
import { Logo } from "@/components/ui/primitives";
import type { Profile, ProfileSex, SkinTone } from "@/domain/types";

const SKIN_TONES: { value: SkinTone; label: string }[] = [
  { value: "I", label: "Type I: very fair, always burns" },
  { value: "II", label: "Type II: fair, usually burns" },
  { value: "III", label: "Type III: medium, sometimes burns" },
  { value: "IV", label: "Type IV: olive, rarely burns" },
  { value: "V", label: "Type V: brown, very rarely burns" },
  { value: "VI", label: "Type VI: dark brown to black, never burns" },
];

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
        <option value="intersex">Intersex</option>
      </select>
      <small>Some reference ranges differ by sex.</small>
    </label>
    <div className="form-pair">
      <label>Height (cm)
        <input type="number" inputMode="numeric" min={50} max={250} value={value.heightCm ?? ""} required
          onChange={(e) => onChange({ ...value, heightCm: e.target.value ? Number(e.target.value) : undefined })} />
      </label>
      <label>Weight (kg)
        <input type="number" inputMode="decimal" step="0.1" min={20} max={350} value={value.weightKg ?? ""} required
          onChange={(e) => onChange({ ...value, weightKg: e.target.value ? Number(e.target.value) : undefined })} />
      </label>
    </div>
    <label>Skin type
      <select value={value.skinTone ?? ""} required onChange={(e) => onChange({ ...value, skinTone: e.target.value as SkinTone })}>
        <option value="" disabled>Choose…</option>
        {SKIN_TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <small>OntoMorph uses this to personalise how your twin looks.</small>
    </label>
  </div>;
}

export function complete(p: Partial<Profile>): p is Profile {
  return Boolean(p.firstName && p.birthYear && p.sex && p.heightCm && p.weightKg && p.skinTone);
}

/** First run: informed consent, then the profile OntoMorph needs to create the person's twin. */
export function Onboarding({ email, onSave, onSignOut }: { email: string; onSave: (profile: Profile) => Promise<void>; onSignOut: () => void }) {
  const [step, setStep] = useState<"consent" | "profile">("consent");
  const [agreed, setAgreed] = useState(false);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete(profile)) return;
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
          <li><b>Your digital twin.</b> MediTwin creates a personal digital twin for you on the OntoMorph platform, and the results you add are stored on it.</li>
          <li><b>What we store.</b> Your email, the profile below, the results you add and your symptom check-ins. MediTwin keeps an encrypted copy so nothing is lost if OntoMorph is briefly unavailable.</li>
          <li><b>Who processes it.</b> Your twin lives on OntoMorph, and clinical codes are looked up in OntoMorph HOLON. To write explanations and answer your questions in the assistant, MediTwin sends the relevant parts of your record, without your name or email, to an AI provider (Groq or Anthropic). Conversations aren&apos;t stored.</li>
          <li><b>You stay in control.</b> Download everything or delete your MediTwin account at any time from Account &amp; privacy.</li>
        </ul>
        <label className="consent-check"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          I understand MediTwin doesn&apos;t diagnose, and I agree to it processing my health information as described.</label>
        <button className="button button-primary" disabled={!agreed} onClick={() => setStep("profile")}>Continue</button>
      </> : <form onSubmit={submit} className="auth-form">
        <span className="eyebrow">About you</span>
        <h1>Just the essentials</h1>
        <p className="muted">OntoMorph uses these to create your digital twin. No ID numbers or medical records needed.</p>
        <ProfileFields value={profile} onChange={setProfile} />
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="row-actions">
          <button type="button" className="button" onClick={() => setStep("consent")}>Back</button>
          <button className="button button-primary" disabled={busy || !complete(profile)}>{busy ? "Saving…" : "Create my health twin"}</button>
        </div>
      </form>}
    </section>
  </main>;
}
