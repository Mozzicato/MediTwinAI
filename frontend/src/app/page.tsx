"use client";

import { useEffect, useState } from "react";

const symptoms = ["Fatigue", "Increased thirst", "Frequent urination", "Headache", "Chest pain", "Shortness of breath", "Dizziness", "Nausea"];
type Patient = { name: string; age: number; sex: string };
type TimelineEvent = { date: string; name: string; value: string; detail: string; attention: boolean; source: string };
type Explanation = { text: string; evidence: { label: string }[] };
type AnatomyContext = { available: boolean; message: string };
type HealthSignal = { type: "ATTENTION" | "INFORMATION" | "URGENT"; severity: string; system: string; evidence: string[] };
type ClinicalReadiness = { mode: "demo" | "clinical"; ready: boolean; missing: string[] };

const fallbackPatient: Patient = { name: "David", age: 28, sex: "male" };
const fallbackEvents: TimelineEvent[] = [
  { date: "SEP 18", name: "Fasting glucose", value: "6.1 mmol/L", detail: "Above reference", attention: true, source: "Offline demo" },
  { date: "SEP 12", name: "Resting heart rate", value: "82 bpm", detail: "Recorded measurement", attention: false, source: "Offline demo" },
  { date: "SEP 01", name: "Medication event", value: "Example medication", detail: "Recorded in demo twin", attention: false, source: "Offline demo" },
];

export default function Home() {
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(["Fatigue", "Increased thirst", "Frequent urination"]);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [hasEnteredDemo, setHasEnteredDemo] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("The deterministic signal engine does not diagnose.");
  const [activeView, setActiveView] = useState<"overview" | "timeline" | "symptoms">("overview");
  const [patient, setPatient] = useState<Patient>(fallbackPatient);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(fallbackEvents);
  const [dataStatus, setDataStatus] = useState("Loading synthetic demo...");
  const [loadingStage, setLoadingStage] = useState("Connecting to digital twin...");
  const [isLoading, setIsLoading] = useState(true);
  const [explanation, setExplanation] = useState<Explanation>({
    text: "Your fasting glucose result is above the reference range associated with this measurement. Results can vary for several reasons and do not establish a diagnosis.",
    evidence: [{ label: "Fasting glucose result" }, { label: "Clinical reference information" }, { label: "Reported symptoms in this session" }],
  });
  const [anatomyContext, setAnatomyContext] = useState<AnatomyContext>({
    available: false,
    message: "Checking anatomy visualization availability...",
  });
  const [healthSignal, setHealthSignal] = useState<HealthSignal>({
    type: "ATTENTION",
    severity: "MODERATE",
    system: "Metabolic",
    evidence: ["fasting_glucose_above_reference", "fatigue", "polydipsia", "polyuria"],
  });
  const [clinicalReadiness, setClinicalReadiness] = useState<ClinicalReadiness | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  const loadDemoTwin = async () => {
    setIsLoading(true);
    setLoadingStage("Connecting to digital twin...");
    setDataStatus("Loading synthetic demo...");
      try {
        setLoadingStage("Loading health information...");
        const [patientResponse, eventsResponse, explanationResponse, anatomyResponse, signalResponse] = await Promise.all([
          fetch(`${apiBase}/api/demo/patient`),
          fetch(`${apiBase}/api/twin/events`),
          fetch(`${apiBase}/api/explanations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_id: "event-glucose-2026-09-18", symptom_names: selectedSymptoms }),
          }),
          fetch(`${apiBase}/api/anatomy/metabolic`),
          fetch(`${apiBase}/api/signals`),
        ]);
        if (!patientResponse.ok || !eventsResponse.ok || !explanationResponse.ok || !anatomyResponse.ok || !signalResponse.ok) throw new Error("Demo API request failed");
        setLoadingStage("Resolving clinical information...");
        const loadedPatient = await patientResponse.json();
        const loadedEvents = await eventsResponse.json();
        const loadedExplanation = await explanationResponse.json();
        const loadedAnatomy = await anatomyResponse.json();
        const loadedSignals = await signalResponse.json();
        setPatient(loadedPatient);
        setExplanation(loadedExplanation);
        setAnatomyContext(loadedAnatomy);
        setHealthSignal(loadedSignals[0]);
        setTimelineEvents(loadedEvents.map((event: { timestamp: string; name: string; value: string | number; unit?: string; source: string }) => ({
          date: new Date(event.timestamp).toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase(),
          name: event.name,
          value: event.unit ? `${event.value} ${event.unit}` : String(event.value),
          detail: event.name === "Fasting glucose" ? "Above reference" : "Recorded measurement",
          attention: event.name === "Fasting glucose",
          source: event.source === "SYNTHETIC_DEMO" ? "Synthetic demo" : event.source,
        })));
        setDataStatus("Synthetic demo loaded");
        setLoadingStage("Health view ready.");
      } catch {
        setDataStatus("Offline synthetic preview");
        setLoadingStage("We couldn't connect to the demo twin. Showing the built-in synthetic preview.");
        setAnatomyContext({ available: false, message: "Anatomy visualization unavailable while the demo API is offline." });
      } finally {
        setIsLoading(false);
      }
    };

  useEffect(() => {
    const checkClinicalReadiness = async () => {
      try {
        const response = await fetch(`${apiBase}/api/clinical-readiness`);
        const readiness = await response.json() as ClinicalReadiness;
        setClinicalReadiness(readiness);
        if (readiness.mode === "demo") void loadDemoTwin();
      } catch {
        setDataStatus("Service configuration unavailable");
        setLoadingStage("We couldn't verify whether this environment is safe to load health data.");
        setIsLoading(false);
      }
    };
    void checkClinicalReadiness();
  }, [apiBase]);
  const toggleSymptom = (symptom: string) => {
    setSelectedSymptoms((current) => current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom]);
    setAnalysisReady(false);
  };
  const supportingSymptoms = selectedSymptoms.filter((symptom) => ["Fatigue", "Increased thirst", "Frequent urination"].includes(symptom));
  const analyzeHealthContext = async () => {
    try {
      const [signalResponse, explanationResponse] = await Promise.all([
        fetch(`${apiBase}/api/signals/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: selectedSymptoms, duration: "2 weeks", severity: "moderate" }),
        }),
        fetch(`${apiBase}/api/explanations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: "event-glucose-2026-09-18", symptom_names: selectedSymptoms }),
        }),
      ]);
      if (!signalResponse.ok || !explanationResponse.ok) throw new Error("Health context analysis failed");
      const signal = await signalResponse.json();
      const refreshedExplanation = await explanationResponse.json();
      setHealthSignal(signal);
      setExplanation(refreshedExplanation);
      setAnalysisMessage(`Signal: ${signal.type.toLowerCase()}, supported by ${signal.evidence.length} evidence item${signal.evidence.length === 1 ? "" : "s"}.`);
    } catch {
      setAnalysisMessage("API unavailable. The existing synthetic-demo explanation remains visible; start the FastAPI service to refresh this context.");
    }
    setAnalysisReady(true);
  };

  if (clinicalReadiness === null) return <main className="activation-shell">
    <section className="activation-panel"><a className="brand" href="#top"><span className="brand-mark">M</span><span>MediTwin</span></a><span className="eyebrow">SECURE ENVIRONMENT CHECK</span><h1>Preparing your health workspace.</h1><p>MediTwin is verifying the environment before it displays any health information.</p></section>
  </main>;

  if (clinicalReadiness.mode === "clinical") return <main className="activation-shell">
    <section className="activation-panel"><a className="brand" href="#top"><span className="brand-mark">M</span><span>MediTwin</span></a><span className="eyebrow">CLINICAL ENVIRONMENT</span><h1>Clinical access is not activated.</h1><p>This environment is configured for real health data. MediTwin will not load synthetic records or accept clinical information until the required security, identity, and integration services are verified.</p><div className="activation-list"><b>Required before access</b><ul><li>Identity and consent enforcement</li><li>Encrypted clinical-data storage</li><li>Verified OntoMorph and HOLON integrations</li><li>Audit logging and operational monitoring</li></ul></div><p className="activation-note">Configure the server-only production variables and complete clinical governance approval before enabling patient access.</p></section>
  </main>;

  if (!hasEnteredDemo) return <main className="landing-shell">
    <header className="landing-topbar"><a className="brand" href="#top"><span className="brand-mark">M</span><span>MediTwin</span></a><span className="landing-demo">Synthetic demo</span></header>
    <section className="landing-hero" id="top"><div className="landing-copy"><span className="eyebrow">HEALTH CONTEXT, NOT DIAGNOSIS</span><h1>Understand your health.<br />See your body differently.</h1><p>MediTwin organizes health information, symptoms, and clinical context into a personal digital representation designed to make patterns easier to understand.</p><button className="explore-button" onClick={() => setHasEnteredDemo(true)}>Explore David&apos;s demo twin <span aria-hidden="true">&#8594;</span></button><small>Synthetic health data only. MediTwin does not provide medical diagnoses.</small></div><div className="landing-visual" aria-hidden="true"><div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="visual-core"><span>DAVID</span><b>Demo twin</b><i>Metabolic attention</i></div><div className="visual-caption">Health data<br />Clinical context<br />Appropriate next step</div></div></section>
  </main>;

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#overview"><span className="brand-mark">M</span><span>MediTwin</span></a><div className="demo-chip"><span className="demo-dot" /> Demo environment</div><p className="synthetic-notice">Synthetic health data only. Not a diagnosis.</p></header>
    <section className="workspace">
      <aside className="sidebar" aria-label="Digital twin navigation">
        <div className="patient-card"><span className="eyebrow">DIGITAL TWIN</span><div className="avatar">{patient.name.charAt(0)}</div><h1>{patient.name}</h1><p>{patient.age} years old <span aria-hidden="true">&#183;</span> {patient.sex}</p><span className="synthetic-label">Synthetic demo patient</span></div>
        <nav className="side-nav"><button className={activeView === "overview" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("overview")}>Overview</button><button className={activeView === "timeline" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("timeline")}>Health timeline</button><button className={activeView === "symptoms" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("symptoms")}>Symptom check</button></nav>
        <div className="systems"><span className="eyebrow">HEALTH SYSTEMS</span><div className="system-row selected"><span><i className={healthSignal.type === "ATTENTION" ? "status-mark attention" : "status-mark clear"} />Metabolic</span><b>{healthSignal.type === "ATTENTION" ? "1" : "0"}</b></div><div className="system-row"><span><i className="status-mark clear" />Cardiovascular</span><small>Clear</small></div><div className="system-row"><span><i className="status-mark muted" />Respiratory</span><small>No data</small></div></div>
      </aside>
      <section className="content" id="overview">
        <div className="page-heading"><div><span className="eyebrow">{patient.name.toUpperCase()}&apos;S HEALTH CONTEXT</span><h2>{activeView === "timeline" ? "Health timeline" : activeView === "symptoms" ? "Symptom check" : "Health overview"}</h2></div><span className="connection"><i className="status-mark clear" /> {dataStatus}</span></div>
        <div className="load-status" role="status"><span className={isLoading ? "loading-pulse" : "loading-pulse settled"} /> <span>{loadingStage}</span>{!isLoading && dataStatus === "Offline synthetic preview" && <button onClick={() => void loadDemoTwin()}>Try again</button>}</div>
        {activeView === "overview" && <div className="overview-grid">
          <section className="signal-card"><div className="card-header"><div><span className="eyebrow">HEALTH SIGNAL</span><h3>{healthSignal.system} {healthSignal.type === "ATTENTION" ? "attention" : "information"}</h3></div><span className={healthSignal.type === "ATTENTION" ? "attention-pill" : "information-pill"}>{healthSignal.type === "ATTENTION" ? "Attention" : "Information"}</span></div><p className="lead">{healthSignal.type === "ATTENTION" ? "A measurement in David's twin is above its associated reference range and has relevant symptom context." : "The current structured symptom context does not create an attention signal."}</p><div className="measurement"><div><span>Fasting glucose</span><strong>6.1 <small>mmol/L</small></strong></div><div className="reference"><span>Reference from clinical context</span><b>3.9 - 5.5 mmol/L</b><em>Above reference</em></div></div><div className="source-line"><span>Evidence source</span><b>Demo twin event</b><b>Clinical reference</b><b>{healthSignal.evidence.length} signal evidence</b></div></section>
          <section className="anatomy-card"><span className="eyebrow">ANATOMY CONTEXT</span><h3>Metabolic system</h3><div className="anatomy-state"><div className="anatomy-ring"><span>{anatomyContext.available ? "3D" : "--"}</span></div><div><b>{anatomyContext.available ? "Visualization available" : "Visualization unavailable"}</b><p>{anatomyContext.message}</p></div></div><button className="secondary-button" onClick={() => setActiveView("symptoms")}>Add symptom context</button></section>
          <section className="explanation-card"><span className="eyebrow">PLAIN-LANGUAGE CONTEXT</span><h3>What this may mean</h3><p>{explanation.text}</p><details><summary>Why am I seeing this?</summary><ul>{explanation.evidence.map((item) => <li key={item.label}>{item.label}</li>)}</ul></details></section>
          <section className="guidance-card"><span className="eyebrow">NEXT STEP</span><h3>Consider a professional conversation</h3><p>This demo identifies a health signal for attention. It does not provide medical advice or a diagnosis.</p><button className="text-button" onClick={() => setActiveView("symptoms")}>Review symptom context <span aria-hidden="true">&#8594;</span></button></section>
        </div>}
        {activeView === "timeline" && <section className="timeline-panel"><p className="lead">Events normalized from the synthetic demo twin. Clinical codes remain in the service layer.</p>{timelineEvents.map((event) => <article className="timeline-event" key={event.name}><time>{event.date}</time><div><h3>{event.name}</h3><strong>{event.value}</strong><p className={event.attention ? "attention-text" : ""}>{event.detail}</p></div><span className="event-source">{event.source}</span></article>)}</section>}
        {activeView === "symptoms" && <section className="symptoms-panel"><div className="symptoms-intro"><div><span className="eyebrow">STRUCTURED INPUT</span><h3>What is David experiencing?</h3><p>Select symptoms to add to this demo session. The original wording is preserved before normalization.</p></div><div className="field-group"><label htmlFor="duration">Duration</label><select id="duration" defaultValue="2 weeks"><option>2 weeks</option><option>Several days</option><option>More than 2 weeks</option></select></div></div><div className="symptom-options">{symptoms.map((symptom) => <label className={selectedSymptoms.includes(symptom) ? "symptom-option checked" : "symptom-option"} key={symptom}><input type="checkbox" checked={selectedSymptoms.includes(symptom)} onChange={() => toggleSymptom(symptom)} />{symptom}</label>)}</div><fieldset className="severity"><legend>Severity</legend><label><input type="radio" name="severity" /> Mild</label><label><input type="radio" name="severity" defaultChecked /> Moderate</label><label><input type="radio" name="severity" /> Severe</label></fieldset><div className="analysis-action"><div>{analysisReady ? <><span className="analysis-status">Context updated</span><p>{analysisMessage}</p></> : <><b>Ready to compare against David&apos;s demo twin</b><p>The deterministic signal engine does not diagnose.</p></>}</div><button className="primary-button" onClick={analyzeHealthContext}>Analyze health context</button></div></section>}
      </section>
    </section>
  </main>;
}
