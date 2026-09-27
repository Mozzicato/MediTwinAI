"use client";

import { useCallback, useEffect, useState } from "react";
import { Landing } from "@/components/landing/Landing";
import { TwinPicker } from "@/components/twin/TwinPicker";
import { Workspace } from "@/components/twin/Workspace";
import { Logo } from "@/components/ui/primitives";
import type { Persona } from "@/domain/types";
import { api, type AuthUser, type Readiness } from "@/lib/api";

type Screen = { name: "landing" } | { name: "picker" } | { name: "auth"; mode: "signin" | "signup" } | { name: "workspace"; persona: Persona; guided: boolean };

function AuthPanel({ mode, onMode, onDone, onBack }: { mode: "signin" | "signup"; onMode: (m: "signin" | "signup") => void; onDone: (u: AuthUser) => void; onBack: () => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (form: FormData) => {
    setBusy(true); setMessage("");
    try { onDone((await api.auth(mode, String(form.get("email") ?? ""), String(form.get("password") ?? ""))).user); }
    catch (e) { setMessage(e instanceof Error ? e.message : "We couldn't complete that request."); }
    finally { setBusy(false); }
  };
  return <main className="center-shell">
    <section className="panel">
      <button className="link-button panel-back" onClick={onBack}>← Back</button>
      <Logo />
      <span className="eyebrow">Optional demo account</span>
      <h1>{mode === "signup" ? "Create an account" : "Welcome back"}</h1>
      <p className="muted">You don&apos;t need an account to explore the demo. Accounts here are for the demo only and never hold real health information.</p>
      <form action={submit} className="auth-form">
        <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} placeholder="At least 8 characters" /></label>
        {message && <p className="error-text" role="alert">{message}</p>}
        <button className="button button-primary" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
      </form>
      <p className="small">{mode === "signup" ? "Already have an account?" : "New here?"} <button className="link-button" onClick={() => onMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Sign in" : "Create an account"}</button></p>
    </section>
  </main>;
}

function ClinicalGate({ readiness }: { readiness: Readiness | null }) {
  return <main className="center-shell">
    <section className="panel">
      <Logo />
      {readiness === null ? <>
        <span className="eyebrow">Secure environment check</span>
        <h1>Preparing your health workspace</h1>
        <p className="muted">MediTwin is checking this environment before it shows any health information.</p>
      </> : <>
        <span className="eyebrow">Clinical environment</span>
        <h1>Clinical access is not activated</h1>
        <p className="muted">This environment is configured for real health data. MediTwin won&apos;t load synthetic records or accept clinical information until the required security, identity and integration services are verified.</p>
        <ul className="checklist">
          <li>Identity and consent enforcement</li><li>Encrypted clinical-data storage</li>
          <li>Verified OntoMorph and HOLON production integrations</li><li>Clinically reviewed content set</li><li>Audit logging and monitoring</li>
        </ul>
      </>}
    </section>
  </main>;
}

export function MediTwinApp() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "landing" });
  const [twins, setTwins] = useState<Persona[] | null>(null);
  const [twinsError, setTwinsError] = useState<string | null>(null);

  useEffect(() => {
    api.readiness().then((r) => {
      setReadiness(r);
      if (r.mode === "demo") api.me().then(setUser).catch(() => setUser(null));
    }).catch(() => setReadiness({ mode: "clinical", ready: false, missing: [] }));
  }, []);

  const loadTwins = useCallback(async () => {
    setTwinsError(null);
    try { setTwins((await api.twins()).twins); }
    catch (e) { setTwinsError(e instanceof Error ? e.message : "Please try again."); }
  }, []);

  const signOut = async () => { await api.signOut(); setUser(null); };
  const openPicker = () => { setScreen({ name: "picker" }); if (!twins) void loadTwins(); };

  if (!readiness || readiness.mode === "clinical") return <ClinicalGate readiness={readiness} />;
  if (screen.name === "auth") return <AuthPanel mode={screen.mode} onMode={(mode) => setScreen({ name: "auth", mode })} onBack={() => setScreen({ name: "landing" })}
    onDone={(u) => { setUser(u); setScreen({ name: "landing" }); }} />;
  if (screen.name === "picker") return <TwinPicker twins={twins} error={twinsError} onBack={() => setScreen({ name: "landing" })} onRetry={() => void loadTwins()}
    onPick={(persona, guided) => setScreen({ name: "workspace", persona, guided })} />;
  if (screen.name === "workspace") return <Workspace key={screen.persona.twinId} persona={screen.persona} guided={screen.guided} user={user}
    onExit={() => setScreen({ name: "picker" })} onSignOut={() => void signOut()} />;
  return <Landing onExplore={openPicker} onSignIn={() => setScreen({ name: "auth", mode: "signin" })} onSignOut={() => void signOut()} user={user} readiness={readiness} />;
}
