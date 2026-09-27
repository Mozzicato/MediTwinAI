"use client";

import type { Persona } from "@/domain/types";
import { Logo, Spinner } from "@/components/ui/primitives";

export function TwinPicker({ twins, error, onPick, onBack, onRetry }: {
  twins: Persona[] | null; error: string | null; onPick: (persona: Persona, guided: boolean) => void; onBack: () => void; onRetry: () => void;
}) {
  const featured = twins?.find((t) => t.featured);
  const others = twins?.filter((t) => !t.featured) ?? [];
  return <main className="picker">
    <header className="landing-top"><button className="link-button" onClick={onBack}><Logo /></button><span className="chip chip-demo"><i /> OntoMorph sandbox · synthetic twins</span></header>
    <section className="picker-body">
      <span className="eyebrow">Choose a demo twin</span>
      <h1>Every twin here is a live OntoMorph sandbox record.</h1>
      <p className="muted">Names, ages and sex are demo labels added by MediTwin. The health events come from the OntoMorph Digital Twin Platform.</p>
      {error && <div className="notice notice-error" role="alert"><b>We couldn&apos;t connect to the digital twin service.</b><span>{error}</span><button className="button" onClick={onRetry}>Try again</button></div>}
      {!twins && !error && <div className="picker-loading"><Spinner label="Connecting to OntoMorph sandbox…" /></div>}
      {featured && <article className="twin-feature">
        <div className="twin-avatar lg">{featured.name[0]}</div>
        <div>
          <span className="eyebrow">Recommended · 3-minute guided demo</span>
          <h2>{featured.name}, {featured.age}</h2>
          <p>{featured.headline}. Walk through the full loop: twin → HOLON → signal → anatomy → explanation → care guidance.</p>
          <div className="twin-feature-actions">
            <button className="button button-primary" onClick={() => onPick(featured, true)}>Start guided demo <span aria-hidden="true">→</span></button>
            <button className="button" onClick={() => onPick(featured, false)}>Explore on my own</button>
          </div>
        </div>
      </article>}
      {others.length > 0 && <div className="twin-grid">
        {others.map((twin) => <button key={twin.twinId} className="twin-card" onClick={() => onPick(twin, false)}>
          <div className="twin-avatar">{twin.name[0]}</div>
          <div><b>{twin.name}, {twin.age}</b><span>{twin.headline}</span></div>
          <span aria-hidden="true">→</span>
        </button>)}
      </div>}
    </section>
  </main>;
}
