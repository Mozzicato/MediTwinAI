"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// "About MediTwin": a short walkthrough of every feature. It opens by itself once for new members
// (right after they create their twin) and stays one tap away for everyone else.

export type AboutDestination = "home" | "ask" | "symptoms" | "overview" | "timeline" | "mydata" | "summary" | "account";

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  icon: ReactNode;
  tone: string;
  go?: { view: AboutDestination; label: string };
}

const icon = (d: string) => <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d={d} fill="currentColor" /></svg>;

function slidesFor(personal: boolean, name: string | null): Slide[] {
  return [
    {
      id: "welcome", eyebrow: "Welcome", tone: "teal",
      title: personal ? `Welcome to MediTwin${name ? `, ${name}` : ""}` : "Welcome to MediTwin",
      body: personal
        ? "You now have a personal health twin: a living digital copy of your health information on the OntoMorph platform. MediTwin helps you understand it."
        : "This is a sample health twin with synthetic data, so you can try everything without sharing your own.",
      points: ["See your results against clinical reference ranges", "Ask questions in plain language", "Know when it's worth talking to a healthcare professional"],
      icon: icon("M12 3c-2.2 0-3.5 1.6-3.5 3.4 0 1.5.9 2.6 1.9 3.2-.9.5-3.9 1.8-3.9 5.4v5h2.2v-4.3h6.6V20h2.2v-5c0-3.6-3-4.9-3.9-5.4 1-.6 1.9-1.7 1.9-3.2C15.5 4.6 14.2 3 12 3Z"),
    },
    {
      id: "home", eyebrow: "Home", tone: "blue", title: "Your health at a glance",
      body: "Home is where you start each time. It shows what needs a look and what you can do next.",
      points: ["Results outside their range, with an Ask button on each", "A quick check-in: tap how you're feeling", "Your body systems and recent activity"],
      icon: icon("M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"),
      go: { view: "home", label: "Go to Home" },
    },
    {
      id: "ask", eyebrow: "Ask MediTwin", tone: "gold", title: "An assistant that knows your twin",
      body: "Ask anything about your results or how you feel. It answers from your own twin, not the internet.",
      points: ["English, Pidgin, Yoruba, Hausa or Igbo", "Tap the mic to speak, and ▶ Listen to hear answers. Voice mode does both hands-free", "It can start a check-in or save a reading you mention, when you confirm", "Available on every screen from the Ask MediTwin button"],
      icon: icon("M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9zM18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"),
      go: { view: "ask", label: "Try the assistant" },
    },
    {
      id: "checkin", eyebrow: "Check-in", tone: "teal", title: "Check how you feel",
      body: "Pick symptoms, or describe them in your own words. MediTwin compares them with your twin using reviewed rules and explains what it found.",
      points: ["Shows which body system and anatomy are involved", "Tells you what to do next, from reviewed care guidance", "Emergency warning signs go straight to emergency guidance"],
      icon: icon("M9 3h6v2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3zm0 9 2 2 4-4-1.4-1.4L11 11.2l-.6-.6z"),
      go: { view: "symptoms", label: "Start a check-in" },
    },
    {
      id: "results", eyebrow: "Body & results", tone: "blue", title: "Understand every result",
      body: "Each result is checked against its clinical reference range, with trends over time and a 3D body showing the organs involved.",
      points: ["Tap any result to see its history and where its range comes from", "Switch between body systems", "The Timeline lists every record, month by month"],
      icon: icon("M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z"),
      go: { view: "overview", label: "See my results" },
    },
    personal ? {
      id: "add", eyebrow: "My results", tone: "gold", title: "Add results yourself",
      body: "Got a lab report or a home blood pressure reading? Add it in seconds. It's saved to your twin and checked straight away.",
      points: ["HbA1c, glucose, blood pressure, cholesterol and more", "Or just tell the assistant: “my BP was 140/90 this morning”", "Your check-ins are kept in Check-in history"],
      icon: icon("M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"),
      go: { view: "mydata", label: "Add a result" },
    } : {
      id: "timeline", eyebrow: "Timeline", tone: "gold", title: "The whole story",
      body: "Every record in the twin, from lab results to care notes, in date order.",
      points: ["Filter by body system", "Tap a result to see how it was resolved", "Records written back by MediTwin are marked"],
      icon: icon("M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 4v4.4l3 1.8-.8 1.3L11 13V8z"),
      go: { view: "timeline", label: "Open the timeline" },
    },
    {
      id: "summary", eyebrow: "Visit summary", tone: "teal", title: "Ready for your appointment",
      body: "One page with your results, symptoms and questions to ask, ready to print or show on your phone.",
      points: ["Built from your twin and your latest check-in", "Questions to ask your clinician", "Print or save as PDF"],
      icon: icon("M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm6 1.5V9h4.5zM8 12h8v1.6H8zm0 3.5h8v1.6H8z"),
      go: { view: "summary", label: "Open visit summary" },
    },
    {
      id: "safety", eyebrow: "Safe & private", tone: "blue", title: "Built to be safe",
      body: "MediTwin explains; it never diagnoses or tells you to change a medicine. In an emergency, call your local emergency number.",
      points: personal
        ? ["Your health data is encrypted; the AI never sees your name or email", "Download or delete everything in Account & privacy", "Curious how it works? Turn on “Show technical details”"]
        : ["Every AI sentence is checked by a safety layer before you see it", "Emergencies bypass the AI entirely", "Curious how it works? Turn on “Show technical details”"],
      icon: icon("M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5zm-1.2 13.6L7.5 12.3l1.4-1.4 1.9 1.9 4.3-4.3 1.4 1.4z"),
      go: personal ? { view: "account", label: "Account & privacy" } : undefined,
    },
  ];
}

export function AboutPlatform({ personal, name, onClose, onGo }: {
  personal: boolean;
  name: string | null;
  onClose: () => void;
  onGo: (view: AboutDestination) => void;
}) {
  const slides = slidesFor(personal, name);
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const slide = slides[index];
  const last = index === slides.length - 1;

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, slides.length]);

  return <div className="about-backdrop" onClick={onClose}>
    <div className="about" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
      <button className="about-close" onClick={onClose} aria-label="Close">×</button>
      <nav className="about-steps" aria-label="Topics">
        {slides.map((s, i) => <button key={s.id} className={i === index ? "on" : ""} aria-current={i === index ? "step" : undefined} onClick={() => setIndex(i)}>{s.eyebrow}</button>)}
      </nav>
      <div className="about-body" key={slide.id}>
        <span className={`about-icon about-${slide.tone}`}>{slide.icon}</span>
        <span className="eyebrow">{slide.eyebrow} · {index + 1} of {slides.length}</span>
        <h2 id="about-title">{slide.title}</h2>
        <p>{slide.body}</p>
        <ul>{slide.points.map((p) => <li key={p}>{p}</li>)}</ul>
        {slide.go && <button className="link-button about-go" onClick={() => { onGo(slide.go!.view); onClose(); }}>{slide.go.label} →</button>}
      </div>
      <footer className="about-foot">
        <div className="about-dots" aria-hidden="true">{slides.map((s, i) => <i key={s.id} className={i === index ? "on" : ""} />)}</div>
        <div className="row-actions">
          {index > 0 && <button className="button" onClick={() => setIndex(index - 1)}>Back</button>}
          {last
            ? <button className="button button-primary" onClick={onClose}>Get started</button>
            : <button className="button button-primary" onClick={() => setIndex(index + 1)}>Next</button>}
        </div>
      </footer>
      <p className="about-hint">You can open this again any time from <b>About MediTwin</b>.</p>
    </div>
  </div>;
}

/** The always-available entry point. */
export function AboutButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return <button className={`about-button${compact ? " compact" : ""}`} onClick={onClick} aria-label="About MediTwin: see all features">
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z" fill="currentColor" /></svg>
    <span>About MediTwin</span>
  </button>;
}
