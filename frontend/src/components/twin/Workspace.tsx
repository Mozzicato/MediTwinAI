"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GuidedTour, type TourStep } from "@/components/demo/GuidedTour";
import { Insight, type FlagState } from "@/components/insights/Insight";
import { TraceView } from "@/components/insights/TraceView";
import { VisitSummary } from "@/components/insights/VisitSummary";
import { WhatIf } from "@/components/insights/WhatIf";
import { SymptomCheck, type SymptomSelection } from "@/components/symptoms/SymptomCheck";
import { Timeline } from "@/components/timeline/Timeline";
import { Logo, Spinner, StatusDot } from "@/components/ui/primitives";
import type { AnalysisResult, Measurement, OrganId, Persona, TraceEntry, TwinView } from "@/domain/types";
import { api, ApiError, type AuthUser } from "@/lib/api";
import { SYSTEM_STATUS_TEXT, ms } from "@/lib/format";
import { ConceptDrawer } from "./Measurements";
import { Overview } from "./Overview";

type View = "overview" | "timeline" | "symptoms" | "insight" | "whatif" | "summary" | "trace";

const LOADING_STAGES = ["Connecting to digital twin…", "Loading health information…", "Resolving clinical information…", "Preparing your health view…"];
const DEMO_SYMPTOMS: SymptomSelection = {
  increased_thirst: { id: "increased_thirst", severity: "moderate", durationDays: 14 },
  frequent_urination: { id: "frequent_urination", severity: "moderate", durationDays: 14 },
  fatigue: { id: "fatigue", severity: "mild", durationDays: 14 },
};

function summarizeTrace(trace: TraceEntry[]) {
  const count = (service: TraceEntry["service"]) => {
    const all = trace.filter((t) => t.service === service);
    const cached = all.filter((t) => t.status === "cached").length;
    return { live: all.length - cached, cached };
  };
  const dtp = count("DTP");
  const holon = count("HOLON");
  const part = (label: string, c: { live: number; cached: number }) => `${label} ${c.live} live${c.cached ? ` + ${c.cached} cached` : ""}`;
  const slowest = trace.reduce((max, t) => Math.max(max, t.ms), 0);
  return `${part("OntoMorph DTP", dtp)} · ${part("HOLON", holon)} · slowest ${ms(slowest)}`;
}

export function Workspace({ persona, guided, user, onExit, onSignOut }: {
  persona: Persona; guided: boolean; user: AuthUser | null; onExit: () => void; onSignOut: () => void;
}) {
  const [view, setView] = useState<View>("overview");
  const [twin, setTwin] = useState<TwinView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(0);
  const [systemId, setSystemId] = useState<string>("");
  const [organ, setOrgan] = useState<OrganId | null>(null);
  const [drawer, setDrawer] = useState<Measurement | null>(null);
  const [selection, setSelection] = useState<SymptomSelection>({});
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [flag, setFlag] = useState<FlagState>({ status: "idle" });
  const [trace, setTrace] = useState<{ title: string; entries: TraceEntry[] }>({ title: "", entries: [] });
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [tourBusy, setTourBusy] = useState(false);
  const [tourTarget, setTourTarget] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetches the twin; callers set loading flags first so no state changes synchronously in an effect.
  const load = useCallback(async (fresh = false) => {
    try {
      const view = await api.twin(persona.twinId, fresh);
      setTwin(view);
      setSystemId((current) => current || view.systems[0]?.id || "");
      setTrace({ title: `Loading ${persona.name}'s twin`, entries: view.trace });
      return view;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We couldn't connect to your digital twin. Please try again.");
      if (e instanceof ApiError && e.trace.length) setTrace({ title: "Failed twin load", entries: e.trace });
      return null;
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [persona]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const retry = () => { setLoading(true); setStage(0); setLoadError(null); void load(); };
  const refresh = () => { setRefreshing(true); void load(true); };
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, LOADING_STAGES.length - 1)), 650);
    return () => clearInterval(timer);
  }, [loading]);

  const go = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const analyze = useCallback(async (chosen: SymptomSelection) => {
    setAnalyzing(true); setAnalysisError(null); setFlag({ status: "idle" });
    try {
      const result = await api.analyze(persona.twinId, Object.values(chosen));
      setAnalysis(result);
      setTrace({ title: "Symptom analysis", entries: result.trace });
      setView("insight");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return result;
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "The analysis couldn't be completed.");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, [persona.twinId]);

  const saveFlag = async () => {
    setFlag({ status: "saving" });
    try {
      const result = await api.flag(persona.twinId, Object.values(selection));
      setTrace({ title: "Write-back to twin", entries: result.trace });
      if (result.status === "no_signal") setFlag({ status: "error", message: "There's no signal to save." });
      else {
        setFlag({ status: result.status, message: result.status === "created" ? "Saved. The note now appears in the twin's timeline." : "A MediTwin note for this system was already saved today, so no duplicate was written." });
        refresh();
      }
    } catch (e) {
      setFlag({ status: "error", message: e instanceof Error ? e.message : "Couldn't write to the twin." });
    }
  };

  const drawerHistory = useMemo(() => drawer && twin
    ? twin.events.flatMap((e) => e.measurements).filter((m) => m.key === drawer.key).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    : [], [drawer, twin]);

  // ---- Guided demo (PRD §43), narrated from the live twin data --------------------------------------
  const tourSteps = useMemo<TourStep[]>(() => {
    if (!twin) return [];
    const main = twin.systems[0];
    const out = twin.events.flatMap((e) => e.measurements)
      .filter((m) => m.status === "ABOVE" || m.status === "BELOW").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const key = out.find((m) => m.key === "hba1c") ?? out[0];
    const range = key?.reference ? `${key.reference.low}–${key.reference.high} ${key.reference.unit}` : "";
    return [
      { title: `Meet ${twin.persona.name}`, body: `${twin.persona.name} is a synthetic patient whose OntoMorph digital twin is connected to MediTwin. The ${twin.events.length} events you see were just retrieved live from the DTP sandbox.`,
        run: () => { go("overview"); setTourTarget(null); } },
      { title: `${main?.label ?? "Metabolic"} system`, body: key ? `${main?.label} shows ${SYSTEM_STATUS_TEXT[main.status].toLowerCase()}. ${key.label} is ${key.value} ${key.unit}, above the reference range HOLON returned (${range}). The related anatomy lights up on the twin.` : "The body systems in this twin, with their current status.",
        run: () => { go("overview"); if (main) setSystemId(main.id); setOrgan(null); setTourTarget(main ? `system:${main.id}` : null); } },
      { title: "Clinical information from HOLON", body: "Selecting a measurement shows how the raw record was resolved: the LOINC code, the HOLON concept, the reference range and its publisher. The codes stay behind the scenes.",
        run: () => { go("overview"); setTourTarget("measurement"); if (key) setDrawer(key); } },
      { title: "Structured symptom check", body: "No empty chat box. The person picks symptoms from a structured list. We'll add increased thirst, frequent urination and fatigue, which become SNOMED CT and HPO concepts through HOLON.",
        run: () => { setDrawer(null); setSelection(DEMO_SYMPTOMS); go("symptoms"); setTourTarget("symptoms"); } },
      { title: "Twin data + new symptoms → signal", body: "MediTwin combines the existing twin data with the new symptoms using named, tested rules. The AI doesn't decide anything here.",
        run: async () => { setDrawer(null); setSelection(DEMO_SYMPTOMS); setTourTarget("signal"); await analyze(DEMO_SYMPTOMS); } },
      { title: "Explore affected anatomy", body: "The signal maps to body structures through FMA concepts verified in HOLON. Select an organ to see why it's relevant.",
        run: () => { setView("insight"); setTourTarget(null); document.getElementById("insight-anatomy")?.scrollIntoView({ behavior: "smooth", block: "center" }); } },
      { title: "Explanation and next step", body: "Every sentence cites its evidence and passes a safety check. The care guidance comes from reviewed content, not the model. This isn't a diagnosis: MediTwin helps you understand your information and when to speak to a healthcare professional.",
        run: () => { setView("insight"); setTourTarget("explanation"); document.getElementById("explanation")?.scrollIntoView({ behavior: "smooth", block: "start" }); } },
    ];
  }, [twin, analyze]);

  const goTour = async (index: number) => {
    setTourIndex(index);
    setTourBusy(true);
    try { await tourSteps[index]?.run(); } finally { setTourBusy(false); }
  };
  const tourStarted = useRef(false);
  useEffect(() => {
    if (guided && twin && !tourStarted.current && tourSteps.length) { tourStarted.current = true; void goTour(0); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided, twin, tourSteps.length]);

  const nav: { id: View; label: string; disabled?: boolean }[] = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Health timeline" },
    { id: "symptoms", label: "Symptom check" },
    { id: "insight", label: "Health context", disabled: !analysis },
    { id: "whatif", label: "What-if", disabled: !twin?.simulations.length },
    { id: "summary", label: "Visit summary" },
    { id: "trace", label: "Integration trace" },
  ];

  return <div className="app">
    <header className="topbar">
      <button className="link-button" onClick={onExit} aria-label="Back to start"><Logo /></button>
      <span className="chip chip-demo"><i /> Demo environment · synthetic data</span>
      <span className="topbar-note">Not a diagnosis</span>
      <div className="topbar-right">
        {tourIndex === null && twin && <button className="button button-small" onClick={() => void goTour(0)}>Guided demo</button>}
        {user && <button className="link-button small" onClick={onSignOut} title="Sign out">{user.email} · Sign out</button>}
      </div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="patient">
          <div className="twin-avatar">{persona.name[0]}</div>
          <div><b>{persona.name}</b><span>{persona.age} years · {persona.sex}</span></div>
        </div>
        <span className="synthetic-tag">Synthetic demo patient · OntoMorph sandbox twin</span>
        <nav className="side-nav" aria-label="Workspace">
          {nav.map((n) => <button key={n.id} className={view === n.id ? "active" : ""} disabled={n.disabled} onClick={() => go(n.id)}>{n.label}</button>)}
        </nav>
        {twin && <div className="side-systems">
          <span className="eyebrow">Health systems</span>
          {twin.systems.map((s) => <button key={s.id} className={s.id === systemId && view === "overview" ? "active" : ""} onClick={() => { setSystemId(s.id); setOrgan(null); go("overview"); }}>
            <StatusDot status={s.status} /><span>{s.label}</span><small>{SYSTEM_STATUS_TEXT[s.status]}</small>
          </button>)}
        </div>}
        {twin && <p className="side-fresh">Twin data retrieved {new Date(twin.fetchedAt).toLocaleTimeString()} · grant valid until {new Date(twin.grant.expiresAt).toLocaleDateString("en-GB")}</p>}
      </aside>

      <main className="main">
        <div className="main-head">
          <div><span className="eyebrow">{persona.name}&apos;s health context</span><h1>{nav.find((n) => n.id === view)?.label}</h1></div>
          <div className="load-line" role="status">
            {loading ? <Spinner label={LOADING_STAGES[stage]} />
              : loadError ? <span className="error-text">{loadError} <button className="link-button" onClick={retry}>Try again</button></span>
              : trace.entries.length ? <span className="ok-line"><StatusDot status="CLEAR" /> {summarizeTrace(trace.entries)} <button className="link-button" onClick={() => go("trace")}>View trace</button></span> : null}
          </div>
        </div>

        {loading && <ol className="loading-stages">{LOADING_STAGES.map((s, i) => <li key={s} className={i < stage ? "done" : i === stage ? "active" : ""}>{s}</li>)}</ol>}
        {!loading && !twin && loadError && <div className="notice notice-error"><b>We couldn&apos;t connect to your digital twin.</b><span>MediTwin won&apos;t show substitute data. Please try again in a moment.</span><button className="button" onClick={retry}>Try again</button></div>}

        {twin && <>
          {view === "overview" && <Overview twin={twin} systemId={systemId} onSelectSystem={setSystemId} selectedOrgan={organ} onSelectOrgan={setOrgan}
            onOpenMeasurement={setDrawer} onCheckSymptoms={() => go("symptoms")} tourTarget={tourTarget} />}
          {view === "timeline" && <Timeline twin={twin} onOpenMeasurement={setDrawer} onRefresh={refresh} refreshing={refreshing} />}
          {view === "symptoms" && <SymptomCheck name={persona.name} selection={selection} onChange={setSelection} onAnalyze={() => void analyze(selection)}
            analyzing={analyzing} error={analysisError} tourHighlight={tourTarget === "symptoms"} />}
          {view === "insight" && analysis && <Insight result={analysis} name={persona.name} onEditSymptoms={() => go("symptoms")} onSummary={() => go("summary")}
            onWhatIf={() => go("whatif")} canSimulate={twin.simulations.length > 0} onFlag={() => void saveFlag()} flag={flag} tourTarget={tourTarget} />}
          {view === "whatif" && <WhatIf twinId={persona.twinId} types={twin.simulations} onTrace={(entries) => setTrace({ title: "What-if simulation", entries })} />}
          {view === "summary" && <VisitSummary twin={twin} analysis={analysis} />}
          {view === "trace" && <TraceView entries={trace.entries} title={trace.title} />}
        </>}
      </main>
    </div>

    {drawer && <ConceptDrawer m={drawer} history={drawerHistory} onClose={() => setDrawer(null)} />}
    {tourIndex !== null && tourSteps.length > 0 && <GuidedTour steps={tourSteps} index={tourIndex} busy={tourBusy || analyzing} dockLeft={drawer !== null}
      onGo={(i) => void goTour(i)} onExit={() => { setTourIndex(null); setTourTarget(null); }} />}
  </div>;
}
