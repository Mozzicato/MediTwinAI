"use client";

import { BodyViewer } from "@/components/anatomy/BodyViewer";
import { Logo } from "@/components/ui/primitives";
import type { AuthUser, Readiness } from "@/lib/api";

const PIPELINE = [
  { step: "Digital twin", detail: "Health events from the OntoMorph DTP", tag: "DTP" },
  { step: "Clinical context", detail: "Concepts and reference ranges from HOLON", tag: "HOLON" },
  { step: "Health signal", detail: "Deterministic, named rules. No AI guessing", tag: "Rules" },
  { step: "Anatomy", detail: "FMA-verified structures in 3D", tag: "HOLON" },
  { step: "Explanation", detail: "Plain language, every claim cited", tag: "AI" },
  { step: "Next step", detail: "Reviewed care guidance", tag: "Reviewed" },
];

export function Landing({ onExplore, onSignIn, onSignOut, user, readiness }: {
  onExplore: () => void; onSignIn: () => void; onSignOut: () => void; user: AuthUser | null; readiness: Readiness | null;
}) {
  const live = readiness?.integrations;
  return <main className="landing">
    <header className="landing-top">
      <Logo />
      <nav className="landing-nav">
        <a href="#how">How it works</a>
        <a href="#safety">Safety</a>
        {user
          ? <button className="link-button" onClick={onSignOut}>{user.email} · Sign out</button>
          : <button className="link-button" onClick={onSignIn}>Sign in</button>}
      </nav>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">Personal health context · Synthetic demo</span>
        <h1>Understand your health.<br /><em>See your body differently.</em></h1>
        <p className="hero-lead">
          MediTwin builds a living picture of your health from your digital twin, then connects your
          measurements and symptoms to clinical knowledge, the relevant anatomy, and a clear next step.
        </p>
        <div className="hero-actions">
          <button className="button button-primary button-lg" onClick={onExplore}>Explore Demo Twin <span aria-hidden="true">→</span></button>
          <span className="hero-note">No sign-up. Synthetic sandbox data only.</span>
        </div>
        <p className="hero-disclaimer">MediTwin does not provide medical diagnoses.</p>
        <ul className="live-badges" aria-label="Connected services">
          <li className={live?.dtp ? "on" : ""}><i /> OntoMorph DTP {live?.dtp ? "connected" : "not configured"}</li>
          <li className={live?.holon ? "on" : ""}><i /> HOLON {live?.holon ? "connected" : "not configured"}</li>
          <li className={live?.ai ? "on" : ""}><i /> {live?.ai ? `AI: ${live.ai}` : "AI: reviewed templates"}</li>
        </ul>
      </div>
      <div className="hero-visual">
        <BodyViewer organs={[]} level={null} caption={false} />
        <div className="hero-visual-card">
          <span>David · 28</span>
          <b>HbA1c 8.2% → 7.1%</b>
          <small>Still above the HOLON reference of 4.0–5.6%</small>
        </div>
      </div>
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
      </ul>
    </section>

    <footer className="landing-foot">
      <span>Demo environment: synthetic health data only. Not a medical device. Not a diagnosis.</span>
      <span>Built on OntoMorph DTP + HOLON</span>
    </footer>
  </main>;
}
