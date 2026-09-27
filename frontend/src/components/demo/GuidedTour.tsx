"use client";

export interface TourStep {
  title: string;
  body: string;
  run: () => void | Promise<void>;
}

export function GuidedTour({ steps, index, busy, onGo, onExit, dockLeft = false }: {
  steps: TourStep[]; index: number; busy: boolean; onGo: (index: number) => void; onExit: () => void; dockLeft?: boolean;
}) {
  const step = steps[index];
  const last = index === steps.length - 1;
  return <aside className={dockLeft ? "tour tour-left" : "tour"} role="dialog" aria-label="Guided demo">
    <div className="tour-progress" aria-hidden="true">{steps.map((_, i) => <i key={i} className={i <= index ? "on" : ""} />)}</div>
    <span className="eyebrow">Guided demo · step {index + 1} of {steps.length}</span>
    <h4>{step.title}</h4>
    <p>{step.body}</p>
    <div className="tour-actions">
      <button className="link-button" onClick={onExit}>{last ? "Close" : "Exit demo"}</button>
      <div>
        {index > 0 && <button className="button button-small" onClick={() => onGo(index - 1)} disabled={busy}>Back</button>}
        {!last && <button className="button button-small button-primary" onClick={() => onGo(index + 1)} disabled={busy}>{busy ? "Working…" : "Next →"}</button>}
      </div>
    </div>
  </aside>;
}
