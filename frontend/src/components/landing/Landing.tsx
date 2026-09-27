"use client";

import { BodyViewer } from "@/components/anatomy/BodyViewer";
import { Logo } from "@/components/ui/primitives";
import type { AuthUser, Readiness } from "@/lib/api";

const PIPELINE = [
  { step: "Your data", detail: "Your OntoMorph twin, results you add, and how you feel", tag: "DTP" },
  { step: "Clinical context", detail: "Concepts and reference ranges from HOLON", tag: "HOLON" },
  { step: "Health signal", detail: "Deterministic, named rules. No AI guessing", tag: "Rules" },
  { step: "Anatomy", detail: "FMA-verified structures in 3D", tag: "HOLON" },
  { step: "Explanation", detail: "Plain language, every claim cited", tag: "AI" },
  { step: "Next step", detail: "Reviewed care guidance and a visit summary", tag: "Reviewed" },
];

const FEATURES = [
  { title: "All your health data in one place", body: "Connect your OntoMorph twin to bring in records from providers, Apple or Google Health and lab reports, or add results yourself." },
  { title: "Results you can understand", body: "Every value is checked against its clinical reference range, with trends over time and the anatomy involved." },
  { title: "Symptom check-ins that remember", body: "MediTwin notices when symptoms come back and connects them to your results, without guessing a diagnosis." },
  { title: "Ready for your appointment", body: "A one-page summary with your results, symptoms and questions to ask, ready to print or share." },
];

export function Landing({ user, accountsEnabled, readiness, onSignUp, onSignIn, onOpenMine, onSample, onSignOut }: {
  user: AuthUser | null; accountsEnabled: boolean; readiness: Readiness | null;
  onSignUp: () => void; onSignIn: () => void; onOpenMine: () => void; onSample: () => void; onSignOut: () => void;
}) {
  const live = readiness?.integrations;
  return <main className="landing">
    <header className="landing-top">
      <Logo />
      <nav className="landing-nav">
        <a href="#how">How it works</a>
        <a href="#safety">Safety</a>
        {user
          ? <><button className="link-button" onClick={onOpenMine}>My health twin</button><button className="link-button muted-link" onClick={onSignOut}>Sign out</button></>
          : accountsEnabled && <button className="link-button" onClick={onSignIn}>Sign in</button>}
      </nav>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">Your personal health twin</span>
        <h1>Understand your health.<br /><em>See your body differently.</em></h1>
        <p className="hero-lead">
          MediTwin turns your health records, lab results and symptoms into one clear picture. It shows
          what&apos;s changed, how it relates to your body, and when it&apos;s worth talking to a
          healthcare professional.
        </p>
        <div className="hero-actions">
          {user
            ? <button className="button button-primary button-lg" onClick={onOpenMine}>Open my health twin <span aria-hidden="true">→</span></button>
            : accountsEnabled
              ? <button className="button button-primary button-lg" onClick={onSignUp}>Create your health twin <span aria-hidden="true">→</span></button>
              : null}
          <button className={accountsEnabled || user ? "button button-lg" : "button button-primary button-lg"} onClick={onSample}>Try a sample twin</button>
        </div>
        <p className="hero-note">Free. Your data is encrypted and you can delete it at any time. MediTwin does not diagnose.</p>
        <ul className="live-badges" aria-label="Connected services">
          <li className={live?.dtp ? "on" : ""}><i /> OntoMorph DTP {live?.dtp ? "connected" : "not configured"}</li>
          <li className={live?.holon ? "on" : ""}><i /> HOLON {live?.holon ? "connected" : "not configured"}</li>
          <li className={live?.ai ? "on" : ""}><i /> {live?.ai ? `AI: ${live.ai}` : "AI: reviewed templates"}</li>
        </ul>
      </div>
      <div className="hero-visual">
        <BodyViewer organs={[]} level={null} caption={false} />
        <div className="hero-visual-card">
          <span>Sample twin · David, 28</span>
          <b>HbA1c 8.2% → 7.1%</b>
          <small>Still above the HOLON reference of 4.0–5.6%</small>
        </div>
      </div>
    </section>

    <section className="features">
      {FEATURES.map((f) => <article key={f.title}><b>{f.title}</b><p>{f.body}</p></article>)}
    </section>

    <section className="how" id="how">
      <div className="section-head">
        <span className="eyebrow">Evidence before explanation</span>
        <h2>Data → clinical context → health signal → explanation → next step</h2>
        <p>Not “symptoms → AI diagnosis”. Each stage is visible in the app, down to the individual API call.</p>
      </div>
      <ol className="pipeline">
        {PIPELINE.map((p, i) => <li key={p.step}>
          <span className="pipeline-index">{String(i + 1).padStart(2, "0")}</span>
          <b>{p.step}</b>
          <p>{p.detail}</p>
          <span className="pipeline-tag">{p.tag}</span>
        </li>)}
      </ol>
    </section>

    <section className="safety" id="safety">
      <div>
        <span className="eyebrow">Built to be safe</span>
        <h2>An AI that explains, and never diagnoses.</h2>
      </div>
      <ul>
        <li><b>Rules decide, AI explains.</b> Signals come from named, tested rules. The model only rewrites evidence into plain language.</li>
        <li><b>Every sentence cites evidence.</b> Paragraphs that don&apos;t reference a real evidence item are removed before you see them.</li>
        <li><b>A safety layer checks every word.</b> No diagnoses, no medication instructions, no false reassurance. If anything fails, a reviewed template is shown instead.</li>
        <li><b>Emergencies bypass the AI.</b> Red-flag symptoms go straight to reviewed emergency guidance.</li>
        <li><b>Your data stays yours.</b> Health content is encrypted at rest, the AI never sees your name or email, and you can export or delete everything.</li>
      </ul>
    </section>

    <footer className="landing-foot">
      <span>MediTwin provides health information, not medical advice or diagnosis. In an emergency, call your local emergency number.</span>
      <span>Built on OntoMorph DTP + HOLON</span>
    </footer>
  </main>;
}
