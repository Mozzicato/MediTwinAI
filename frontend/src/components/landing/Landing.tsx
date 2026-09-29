"use client";

import { BodyViewer } from "@/components/anatomy/BodyViewer";
import { AssistantMark } from "@/components/assistant/Assistant";
import { Logo } from "@/components/ui/primitives";
import { LANGUAGES } from "@/domain/assistant";
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
  { title: "Ask your twin anything", body: "A health assistant that knows your results and answers in plain words, in English, Pidgin, Yoruba, Hausa or Igbo. Type or just speak." },
  { title: "All your health data in one place", body: "Connect your OntoMorph twin to bring in records from providers, Apple or Google Health and lab reports, or add results yourself." },
  { title: "Results you can understand", body: "Every value is checked against its clinical reference range, with trends over time and the anatomy involved." },
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
        <a href="#assistant">Assistant</a>
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

    <section className="showcase" id="assistant">
      <div className="showcase-copy">
        <span className="eyebrow">Meet your health assistant</span>
        <h2>Questions about your health, answered from your own twin.</h2>
        <p>Ask what a result means, whether things are improving, or what to bring up with your doctor. The assistant reads your twin, not the internet, and replies in the language you&apos;re most comfortable with.</p>
        <ul className="showcase-points">
          <li><b>Speak or type.</b> Voice input and read-aloud for every answer.</li>
          <li><b>Emergencies go straight to reviewed guidance.</b> The AI isn&apos;t used for them.</li>
          <li><b>Every sentence is safety-checked</b> before it appears. No diagnoses, no medicine changes.</li>
          <li><b>One tap to act.</b> It offers to start a check-in or save a reading you mention, and only does so when you confirm.</li>
        </ul>
        <div className="showcase-langs" aria-label="Languages">{LANGUAGES.map((l) => <span key={l.id}>{l.native}</span>)}</div>
      </div>
      <div className="showcase-phone" aria-hidden="true">
        <div className="showcase-head"><AssistantMark size={30} /><div><b>MediTwin Assistant</b><small>Knows your health twin</small></div></div>
        <div className="showcase-log">
          <p className="bubble bubble-user">My HbA1c was 7.1 last week. Is that getting better?</p>
          <div className="chat-row"><AssistantMark size={24} /><p className="bubble bubble-bot">Your HbA1c went from <b>8.2%</b> in May to <b>7.1%</b> in September, so it has come down. It&apos;s still above the reference range of 4.0–5.6%. That&apos;s worth talking through at your next visit.</p></div>
          <p className="bubble bubble-user">Abeg, I dey always thirsty too</p>
          <div className="chat-row"><AssistantMark size={24} /><p className="bubble bubble-bot">I hear you. How long you don dey feel am? Make we check am with your twin.</p></div>
          <div className="chat-action"><div><b>Check these against your twin?</b><span>Increased thirst</span></div><span className="button button-small button-primary">Start check-in</span></div>
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
        <li><b>Emergencies bypass the AI.</b> Red-flag symptoms, in a check-in or typed to the assistant, go straight to reviewed emergency guidance.</li>
        <li><b>Your data stays yours.</b> Health content is encrypted at rest, the AI never sees your name or email, and you can export or delete everything.</li>
      </ul>
    </section>

    <footer className="landing-foot">
      <span>MediTwin provides health information, not medical advice or diagnosis. In an emergency, call your local emergency number.</span>
      <span>Built on OntoMorph DTP + HOLON</span>
    </footer>
  </main>;
}
