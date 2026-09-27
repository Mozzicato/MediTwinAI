"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Onboarding } from "@/components/account/Onboarding";
import { Landing } from "@/components/landing/Landing";
import { TwinPicker } from "@/components/twin/TwinPicker";
import { Workspace, type WorkspaceSource } from "@/components/twin/Workspace";
import { Logo, Spinner } from "@/components/ui/primitives";
import type { Persona, Profile } from "@/domain/types";
import { api, me, type AuthUser, type Readiness } from "@/lib/api";

type Screen =
  | { name: "loading" }
  | { name: "landing" }
  | { name: "auth"; mode: "signin" | "signup" }
  | { name: "onboarding" }
  | { name: "picker" }
  | { name: "sample"; persona: Persona; guided: boolean }
  | { name: "mine" };

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
      <span className="eyebrow">{mode === "signup" ? "Free account" : "Welcome back"}</span>
      <h1>{mode === "signup" ? "Create your health twin" : "Sign in to MediTwin"}</h1>
      <p className="muted">{mode === "signup" ? "Your results and check-ins are private to you and encrypted before they're stored." : "Pick up where you left off."}</p>
      <form action={submit} className="auth-form">
        <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} placeholder="At least 8 characters" /></label>
        {message && <p className="error-text" role="alert">{message}</p>}
        <button className="button button-primary" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
      </form>
      <p className="small">{mode === "signup" ? "Already have an account?" : "New to MediTwin?"} <button className="link-button" onClick={() => onMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Sign in" : "Create an account"}</button></p>
    </section>
  </main>;
}

function ClinicalGate({ readiness }: { readiness: Readiness | null }) {
  return <main className="center-shell">
    <section className="panel">
      <Logo />
      {readiness === null ? <>
        <span className="eyebrow">Secure environment check</span>
        <h1>Preparing MediTwin</h1>
        <p className="muted"><Spinner label="Checking this environment before showing any health information…" /></p>
      </> : <>
        <span className="eyebrow">Clinical environment</span>
        <h1>Clinical access is not activated</h1>
        <p className="muted">This deployment is configured for clinical use. It stays closed until identity, storage, integrations and a clinically approved content set are verified.</p>
      </>}
    </section>
  </main>;
}

export function MediTwinApp() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accountsEnabled, setAccountsEnabled] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [twins, setTwins] = useState<Persona[] | null>(null);
  const [twinsError, setTwinsError] = useState<string | null>(null);

  /** Signed-in people go to their own twin, via onboarding the first time. */
  const routeSignedIn = useCallback(async () => {
    try {
      const status = await me.onboarding();
      setScreen(status.profile ? { name: "mine" } : { name: "onboarding" });
    } catch {
      setScreen({ name: "landing" });
    }
  }, []);

  useEffect(() => {
    api.readiness().then(async (r) => {
      setReadiness(r);
      if (r.mode !== "demo") return;
      const session = await api.session().catch(() => ({ user: null, accountsEnabled: false }));
      setAccountsEnabled(session.accountsEnabled);
      setUser(session.user);
      if (session.user) await routeSignedIn(); else setScreen({ name: "landing" });
    }).catch(() => setReadiness({ mode: "clinical", ready: false, missing: [] }));
  }, [routeSignedIn]);

  const loadTwins = useCallback(async () => {
    setTwinsError(null);
    try { setTwins((await api.twins()).twins); }
    catch (e) { setTwinsError(e instanceof Error ? e.message : "Please try again."); }
  }, []);

  const signOut = async () => { await api.signOut(); setUser(null); setScreen({ name: "landing" }); };
  const openPicker = () => { setScreen({ name: "picker" }); if (!twins) void loadTwins(); };
  const saveProfile = async (profile: Profile) => { await me.saveProfile(profile); setScreen({ name: "mine" }); };

  const personalSource = useMemo<WorkspaceSource | null>(() => (user ? { kind: "personal", user } : null), [user]);
  const sampleSource = useMemo<WorkspaceSource | null>(
    () => (screen.name === "sample" ? { kind: "sample", persona: screen.persona, guided: screen.guided } : null),
    [screen],
  );

  if (!readiness || readiness.mode === "clinical") return <ClinicalGate readiness={readiness} />;
  if (screen.name === "loading") return <ClinicalGate readiness={null} />;
  if (screen.name === "auth") return <AuthPanel mode={screen.mode} onMode={(mode) => setScreen({ name: "auth", mode })} onBack={() => setScreen({ name: "landing" })}
    onDone={(u) => { setUser(u); void routeSignedIn(); }} />;
  if (screen.name === "onboarding" && user) return <Onboarding email={user.email} onSave={saveProfile} onSignOut={() => void signOut()} />;
  if (screen.name === "picker") return <TwinPicker twins={twins} error={twinsError} onBack={() => setScreen(user ? { name: "mine" } : { name: "landing" })} onRetry={() => void loadTwins()}
    onPick={(persona, guided) => setScreen({ name: "sample", persona, guided })} />;
  if (screen.name === "sample" && sampleSource) return <Workspace key={`sample-${screen.persona.twinId}`} source={sampleSource} user={user}
    onExit={() => setScreen({ name: "picker" })} onSignOut={() => void signOut()} onAccountDeleted={() => void signOut()} />;
  if (screen.name === "mine" && personalSource) return <Workspace key="mine" source={personalSource} user={user}
    onExit={() => setScreen({ name: "landing" })} onSignOut={() => void signOut()}
    onAccountDeleted={() => { setUser(null); setScreen({ name: "landing" }); }} />;
  return <Landing user={user} accountsEnabled={accountsEnabled} readiness={readiness}
    onSignUp={() => setScreen({ name: "auth", mode: "signup" })} onSignIn={() => setScreen({ name: "auth", mode: "signin" })}
    onOpenMine={() => void routeSignedIn()} onSample={openPicker} onSignOut={() => void signOut()} />;
}
