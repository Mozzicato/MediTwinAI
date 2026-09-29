"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountSettings } from "@/components/account/AccountSettings";
import { Assistant, AssistantLauncher, type ActionHandler } from "@/components/assistant/Assistant";
import { History } from "@/components/account/History";
import { MyData } from "@/components/account/MyData";
import { GuidedTour, type TourStep } from "@/components/demo/GuidedTour";
import { Insight, type FlagState } from "@/components/insights/Insight";
import { TraceView } from "@/components/insights/TraceView";
import { VisitSummary } from "@/components/insights/VisitSummary";
import { WhatIf } from "@/components/insights/WhatIf";
import { SymptomCheck, type SymptomSelection } from "@/components/symptoms/SymptomCheck";
import { Timeline } from "@/components/timeline/Timeline";
import { Logo, Spinner, StatusDot } from "@/components/ui/primitives";
import { TechContext } from "@/components/ui/tech";
import { starterPrompts } from "@/domain/assistant";
import type { AnalysisResult, Measurement, OrganId, Persona, SimulationComparison, SimulationType, SymptomInput, TraceEntry, TwinView } from "@/domain/types";
import { api, ApiError, me, type AuthUser } from "@/lib/api";
import { useAssistant } from "@/lib/assistant-client";
import { SYSTEM_STATUS_TEXT, ms } from "@/lib/format";
import { ConceptDrawer } from "./Measurements";
import { Home } from "./Home";
import { Overview } from "./Overview";

type View = "home" | "ask" | "more" | "overview" | "timeline" | "symptoms" | "insight" | "whatif" | "summary" | "trace" | "mydata" | "history" | "account";

export type WorkspaceSource =
  | { kind: "sample"; persona: Persona; guided: boolean }
  | { kind: "personal"; user: AuthUser };

type FlagResult = { status: "created" | "exists" | "no_signal"; trace: TraceEntry[] };

/** The data operations a workspace needs, for a sample twin or for the signed-in person. */
function operationsFor(source: WorkspaceSource) {
  if (source.kind === "personal") {
    return {
      load: () => me.view(),
      analyze: (symptoms: SymptomInput[]) => me.analyze(symptoms),
      flag: (symptoms: SymptomInput[]): Promise<FlagResult> => me.flag(symptoms),
      // OntoMorph offers trajectory simulation on grant-connected twins only, so What-if is hidden for personal twins.
      simulate: (): Promise<SimulationComparison> => Promise.reject(new Error("What-if projections aren't available for personal twins yet.")),
    };
  }
  const id = source.persona.twinId;
  return {
    load: (fresh?: boolean) => api.twin(id, fresh),
    analyze: (symptoms: SymptomInput[]) => api.analyze(id, symptoms),
    flag: (symptoms: SymptomInput[]): Promise<FlagResult> => api.flag(id, symptoms),
    simulate: (type: SimulationType, months: number): Promise<SimulationComparison> => api.simulate(id, type, months),
  };
}

const TECH_KEY = "meditwin.technical-details";

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

export function Workspace({ source, user, onExit, onSignOut, onAccountDeleted }: {
  source: WorkspaceSource; user: AuthUser | null; onExit: () => void; onSignOut: () => void; onAccountDeleted: () => void;
}) {
  const personalMode = source.kind === "personal";
  const guided = source.kind === "sample" && source.guided;
  const ops = useMemo(() => operationsFor(source), [source]);
  const [view, setView] = useState<View>("home");
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [tech, setTech] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { try { setTech(window.localStorage.getItem(TECH_KEY) === "1"); } catch { /* storage unavailable */ } }, 0);
    return () => clearTimeout(timer);
  }, []);
  const toggleTech = () => setTech((on) => {
    try { window.localStorage.setItem(TECH_KEY, on ? "0" : "1"); } catch { /* storage unavailable */ }
    return !on;
  });

  // ---- Assistant ------------------------------------------------------------------------------
  const endpoint = source.kind === "personal" ? "/api/me/assistant" : `/api/twins/${source.persona.twinId}/assistant`;
  const focus = useMemo(() => analysis?.symptoms.map(({ id, severity, durationDays, userWording }) => ({ id, severity, durationDays, userWording })) ?? null, [analysis]);
  const chat = useAssistant(endpoint, focus);
  const starters = useMemo(() => starterPrompts(twin), [twin]);

  // Fetches the twin; callers set loading flags first so no state changes synchronously in an effect.
  const load = useCallback(async (fresh = false) => {
    try {
      const view = await ops.load(fresh);
      setTwin(view);
      setSystemId((current) => (view.systems.some((s) => s.id === current) ? current : view.systems[0]?.id ?? ""));
      setTrace({ title: personalMode ? "Loading your health twin" : `Loading ${view.persona.name}'s twin`, entries: view.trace });
      return view;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We couldn't connect to your digital twin. Please try again.");
      if (e instanceof ApiError && e.trace.length) setTrace({ title: "Failed twin load", entries: e.trace });
      return null;
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [ops, personalMode]);

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

  const go = (next: View) => { setView(next); setPanelOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  /** Open the assistant (as a panel unless its page is showing), optionally asking something. */
  const ask = (text?: string) => {
    if (view !== "ask") setPanelOpen(true);
    if (text?.trim()) void chat.send(text);
  };
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanelOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const analyze = useCallback(async (chosen: SymptomSelection) => {
    setAnalyzing(true); setAnalysisError(null); setFlag({ status: "idle" });
    try {
      const result = await ops.analyze(Object.values(chosen));
      setAnalysis(result);
      setTrace({ title: "Symptom analysis", entries: result.trace });
      setView("insight");
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (personalMode) void load(true); // picks up the new check-in in history
      return result;
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "The analysis couldn't be completed.");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, [ops, personalMode, load]);

  const saveFlag = async () => {
    setFlag({ status: "saving" });
    try {
      const result = await ops.flag(Object.values(selection));
      setTrace({ title: "Write-back to twin", entries: result.trace });
      if (result.status === "no_signal") setFlag({ status: "error", message: "There's no signal to save." });
      else {
        setFlag({ status: result.status, message: result.status === "created" ? "Saved. The note now appears in the twin's timeline." : "A MediTwin note for this system was already saved today, so no duplicate was written." });
        setRefreshing(true);
        void load(true);
      }
    } catch (e) {
      setFlag({ status: "error", message: e instanceof Error ? e.message : "Couldn't write to the twin." });
    }
  };

  const drawerHistory = useMemo(() => drawer && twin
    ? twin.events.flatMap((e) => e.measurements).filter((m) => m.key === drawer.key).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    : [], [drawer, twin]);

  // ---- Guided demo (PRD §43), narrated from the live twin data --------------------------------------
  const chatStarted = chat.items.length > 0;
  const send = chat.send;
  const tourSteps = useMemo<TourStep[]>(() => {
    if (!twin) return [];
    const main = twin.systems[0];
    const out = twin.events.flatMap((e) => e.measurements)
      .filter((m) => m.status === "ABOVE" || m.status === "BELOW").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const key = out.find((m) => m.key === "hba1c") ?? out[0];
    const range = key?.reference ? `${key.reference.low}–${key.reference.high} ${key.reference.unit}` : "";
    return [
      { title: `Meet ${twin.persona.name}`, body: `${twin.persona.name} is a synthetic patient whose OntoMorph digital twin is connected to MediTwin. The ${twin.events.length} events you see were just retrieved live from the DTP sandbox.`,
        run: () => { setTech(true); go("overview"); setTourTarget(null); } },
      { title: `${main?.label ?? "Metabolic"} system`, body: key ? `${main?.label} shows ${SYSTEM_STATUS_TEXT[main.status].toLowerCase()}. ${key.label} is ${key.value} ${key.unit}, above the reference range HOLON returned (${range}). The related anatomy lights up on the twin.` : "The body systems in this twin, with their current status.",
        run: () => { go("overview"); if (main) setSystemId(main.id); setOrgan(null); setTourTarget(main ? `system:${main.id}` : null); } },
      { title: "Clinical information from HOLON", body: "Selecting a measurement shows how the raw record was resolved: the LOINC code, the HOLON concept, the reference range and its publisher. The codes stay behind the scenes.",
        run: () => { go("overview"); setTourTarget("measurement"); if (key) setDrawer(key); } },
      { title: "Structured symptom check", body: "Symptoms are picked from a reviewed list (or typed in plain words and matched to it), so the rules get exact concepts. We'll add increased thirst, frequent urination and fatigue, which become SNOMED CT and HPO concepts through HOLON.",
        run: () => { setDrawer(null); setSelection(DEMO_SYMPTOMS); go("symptoms"); setTourTarget("symptoms"); } },
      { title: "Twin data + new symptoms → signal", body: "MediTwin combines the existing twin data with the new symptoms using named, tested rules. The AI doesn't decide anything here.",
        run: async () => { setDrawer(null); setSelection(DEMO_SYMPTOMS); setTourTarget("signal"); await analyze(DEMO_SYMPTOMS); } },
      { title: "Explore affected anatomy", body: "The signal maps to body structures through FMA concepts verified in HOLON. Select an organ to see why it's relevant.",
        run: () => { setView("insight"); setTourTarget(null); document.getElementById("insight-anatomy")?.scrollIntoView({ behavior: "smooth", block: "center" }); } },
      { title: "Explanation and next step", body: "Every sentence cites its evidence and passes a safety check. The care guidance comes from reviewed content, not the model. This isn't a diagnosis: MediTwin helps you understand your information and when to speak to a healthcare professional.",
        run: () => { setPanelOpen(false); setView("insight"); setTourTarget("explanation"); document.getElementById("explanation")?.scrollIntoView({ behavior: "smooth", block: "start" }); } },
      { title: "Ask the twin anything", body: "The assistant answers follow-up questions in English, Pidgin, Yoruba, Hausa or Igbo, grounded in this twin. Emergencies bypass the AI, every sentence is safety-checked before it appears, and actions like starting a check-in only happen when you tap them.",
        run: () => { setTourTarget(null); setPanelOpen(true); if (!chatStarted) void send("What should I ask my doctor at my next visit?"); } },
    ];
  }, [twin, analyze, chatStarted, send]);

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

  const persona = twin?.persona ?? (source.kind === "sample" ? source.persona : null);
  const name = persona?.name ?? "Your";
  const personal = twin?.personal;

  const onAction: ActionHandler = async (action) => {
    if (action.kind === "symptom_check") {
      const next: SymptomSelection = { ...selection };
      for (const s of action.symptoms) next[s.id] = { id: s.id, severity: next[s.id]?.severity ?? "moderate", durationDays: next[s.id]?.durationDays ?? 7, userWording: s.quote };
      setSelection(next);
      go("symptoms");
      return;
    }
    if (action.kind === "log_result") {
      if (!personalMode) throw new Error("Sample twins can't be changed.");
      const result = await me.addEntry({ typeId: action.typeId, values: action.values, unit: action.unit, occurredAt: new Date().toISOString() });
      refresh();
      return result.message;
    }
    go(action.view);
  };

  const quickCheck = (ids: string[]) => {
    const next: SymptomSelection = {};
    for (const id of ids) next[id] = selection[id] ?? { id, severity: "moderate", durationDays: 7 };
    setSelection(next);
    go("symptoms");
  };

  type NavItem = { id: View; label: string; hint?: string };
  const primary: NavItem[] = [
    { id: "home", label: "Home" },
    { id: "ask", label: "Ask MediTwin", hint: "AI" },
    { id: "symptoms", label: "Check-in" },
    { id: "overview", label: "Body & results" },
    { id: "timeline", label: "Timeline" },
  ];
  const records: NavItem[] = [
    ...(analysis ? [{ id: "insight" as View, label: "Latest check-in result" }] : []),
    ...(personalMode ? [{ id: "mydata" as View, label: "My results" }, { id: "history" as View, label: "Check-in history" }] : []),
    { id: "summary", label: "Visit summary" },
    ...(twin?.simulations.length ? [{ id: "whatif" as View, label: "What-if projection" }] : []),
  ];
  const settings: NavItem[] = [
    ...(personalMode ? [{ id: "account" as View, label: "Account & privacy" }] : []),
    ...(tech ? [{ id: "trace" as View, label: "Integration trace" }] : []),
  ];
  const all = [...primary, ...records, ...settings];
  const title = view === "more" ? "More" : view === "insight" ? "Your health context" : all.find((n) => n.id === view)?.label ?? "";
  const navButton = (n: NavItem) => <button key={n.id} className={view === n.id ? "active" : ""} onClick={() => go(n.id)}>
    {n.label}{n.hint && <span className="nav-hint">{n.hint}</span>}
  </button>;
  const techSwitch = <label className="switch">
    <input type="checkbox" checked={tech} onChange={toggleTech} />
    <span className="switch-track" aria-hidden="true" />
    <span>Show technical details<small>Clinical codes, rules and API calls</small></span>
  </label>;
  const bottom: { id: View; label: string; icon: string }[] = [
    { id: "home", label: "Home", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
    { id: "ask", label: "Ask", icon: "M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9zM18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" },
    { id: "symptoms", label: "Check-in", icon: "M9 3h6v2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3zm0 9 2 2 4-4-1.4-1.4L11 11.2l-.6-.6z" },
    { id: "overview", label: "Results", icon: "M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z" },
    { id: "more", label: "More", icon: "M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" },
  ];
  const moreActive = view === "more" || records.concat(settings).some((n) => n.id === view);
  const chatProps = { chat, name: persona?.name ?? null, starters, onAction, sample: !personalMode };

  return <TechContext.Provider value={tech}>
    <div className="app">
      <header className="topbar">
        <button className="link-button" onClick={onExit} aria-label="Back to start"><Logo /></button>
        {personalMode
          ? <span className="chip chip-private"><i /> Private · encrypted</span>
          : <span className="chip chip-demo"><i /> Sample twin · synthetic data</span>}
        <span className="topbar-note">Not a diagnosis</span>
        <div className="topbar-right">
          {!personalMode && tourIndex === null && twin && <button className="button button-small" onClick={() => void goTour(0)}>Guided demo</button>}
          {user && <button className="link-button small topbar-user" onClick={onSignOut} title="Sign out">{user.email} · Sign out</button>}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          {persona && <div className="patient">
            <div className="twin-avatar">{persona.name[0]}</div>
            <div><b>{persona.name}</b><span>{persona.age} years · {persona.sex}</span></div>
          </div>}
          <span className="synthetic-tag">{personalMode
            ? <><StatusDot status={personal?.connection.connected && personal.connection.status === "ok" ? "CLEAR" : "ATTENTION"} /> {personal?.connection.connected ? (personal.connection.status === "ok" ? "Twin live on OntoMorph" : "Twin syncing") : "Creating your twin…"}</>
            : "Synthetic sample patient · OntoMorph sandbox"}</span>
          <nav className="side-nav" aria-label="Workspace">
            {primary.map(navButton)}
            <span className="side-label">Your records</span>
            {records.map(navButton)}
            {settings.length > 0 && <span className="side-label">Settings</span>}
            {settings.map(navButton)}
          </nav>
          {twin && twin.systems.length > 0 && <div className="side-systems">
            <span className="eyebrow">Body systems</span>
            {twin.systems.map((s) => <button key={s.id} className={s.id === systemId && view === "overview" ? "active" : ""} onClick={() => { setSystemId(s.id); setOrgan(null); go("overview"); }}>
              <StatusDot status={s.status} /><span>{s.label}</span><small>{SYSTEM_STATUS_TEXT[s.status]}</small>
            </button>)}
          </div>}
          <div className="side-foot">
            {techSwitch}
            {twin && <p className="side-fresh">Updated {new Date(twin.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{tech && twin.grant.expiresAt ? ` · grant valid until ${new Date(twin.grant.expiresAt).toLocaleDateString("en-GB")}` : ""}</p>}
          </div>
        </aside>

        <main className={`main main-${view}`}>
          {(view !== "home" || loading || loadError) && <div className="main-head">
            <div><span className="eyebrow">{personalMode ? "Your health twin" : `${name}'s health twin`}</span>{view !== "home" && <h1>{title}</h1>}</div>
            <div className="load-line" role="status">
              {loading ? <Spinner label={LOADING_STAGES[stage]} />
                : loadError ? <span className="error-text">{loadError} <button className="link-button" onClick={retry}>Try again</button></span>
                : tech && trace.entries.length ? <span className="ok-line"><StatusDot status="CLEAR" /> {summarizeTrace(trace.entries)} <button className="link-button" onClick={() => go("trace")}>View trace</button></span>
                : twin ? <span className="ok-line"><StatusDot status="CLEAR" /> Up to date <button className="link-button" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button></span> : null}
            </div>
          </div>}

          {loading && <ol className="loading-stages">{LOADING_STAGES.map((s, i) => <li key={s} className={i < stage ? "done" : i === stage ? "active" : ""}>{s}</li>)}</ol>}
          {!loading && !twin && loadError && <div className="notice notice-error"><b>We couldn&apos;t load your health information.</b><span>MediTwin won&apos;t show substitute data. Please try again in a moment.</span><button className="button" onClick={retry}>Try again</button></div>}

          {twin && <>
            {view === "home" && <Home twin={twin} personal={personalMode} starters={starters} onAsk={ask} onGo={go}
              onOpenMeasurement={setDrawer} onSelectSystem={(id) => { setSystemId(id); setOrgan(null); go("overview"); }} onQuickCheck={quickCheck} />}
            {view === "ask" && <Assistant {...chatProps} variant="page" />}
            {view === "more" && <div className="more-list">
              {[...primary, ...records, ...settings].filter((n) => !bottom.some((b) => b.id === n.id)).map((n) =>
                <button key={n.id} className="more-item" onClick={() => go(n.id)}>{n.label}<span aria-hidden="true">›</span></button>)}
              <div className="card more-settings">{techSwitch}</div>
              {user && <button className="button" onClick={onSignOut}>Sign out</button>}
            </div>}
            {view === "overview" && twin.events.length === 0 && <section className="card welcome">
              <span className="eyebrow">Nothing here yet</span>
              <h2>Your results will appear here</h2>
              <p className="muted">Add a result from a lab report or home device, and MediTwin checks it against its clinical reference range.</p>
              <div className="row-actions">{personalMode && <button className="button button-primary" onClick={() => go("mydata")}>Add a result</button>}
                <button className="button" onClick={() => ask()}>Ask the assistant</button></div>
            </section>}
            {view === "overview" && twin.events.length > 0 && <Overview twin={twin} systemId={systemId} onSelectSystem={setSystemId} selectedOrgan={organ} onSelectOrgan={setOrgan}
              onOpenMeasurement={setDrawer} onCheckSymptoms={() => go("symptoms")} tourTarget={tourTarget} />}
            {view === "timeline" && <Timeline twin={twin} onOpenMeasurement={setDrawer} onRefresh={refresh} refreshing={refreshing} />}
            {view === "symptoms" && <SymptomCheck name={personalMode ? "you" : name} selection={selection} onChange={setSelection} onAnalyze={() => void analyze(selection)}
              analyzing={analyzing} error={analysisError} tourHighlight={tourTarget === "symptoms"} />}
            {view === "insight" && analysis && <Insight result={analysis} name={personalMode ? "your" : `${name}'s`} canFlag={!personalMode || personal?.connection.status === "ok"} onEditSymptoms={() => go("symptoms")} onSummary={() => go("summary")}
              onWhatIf={() => go("whatif")} canSimulate={twin.simulations.length > 0} onFlag={() => void saveFlag()} flag={flag} tourTarget={tourTarget}
              onAsk={() => ask(analysis.primary ? "Can you explain my check-in result in simple words, and what I could do next?" : "Nothing linked my symptoms to my results. What else could I keep an eye on?")} />}
            {view === "whatif" && <WhatIf run={ops.simulate} types={twin.simulations} onTrace={(entries) => setTrace({ title: "What-if simulation", entries })} />}
            {view === "summary" && <VisitSummary twin={twin} analysis={analysis} />}
            {view === "trace" && <TraceView entries={trace.entries} title={trace.title} />}
            {view === "mydata" && personal && <MyData personal={personal} onChanged={refresh} />}
            {view === "history" && personal && <History checkins={personal.checkins} onNewCheckin={() => go("symptoms")} />}
            {view === "account" && personal && <AccountSettings personal={personal} onChanged={refresh} onDeleted={onAccountDeleted} />}
          </>}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {bottom.map((b) => <button key={b.id} className={(b.id === "more" ? moreActive : view === b.id) ? "active" : ""} onClick={() => go(b.id)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={b.icon} fill="currentColor" /></svg>{b.label}
        </button>)}
      </nav>

      {twin && view !== "ask" && !panelOpen && tourIndex === null && <AssistantLauncher onOpen={() => ask()} />}
      {panelOpen && view !== "ask" && <div className="chat-panel-backdrop" onClick={() => setPanelOpen(false)}>
        <div className="chat-panel-frame" onClick={(e) => e.stopPropagation()}>
          <Assistant {...chatProps} variant="panel" onClose={() => setPanelOpen(false)} onExpand={() => go("ask")} />
        </div>
      </div>}

      {drawer && <ConceptDrawer m={drawer} history={drawerHistory} onClose={() => setDrawer(null)} />}
      {tourIndex !== null && tourSteps.length > 0 && <GuidedTour steps={tourSteps} index={tourIndex} busy={tourBusy || analyzing} dockLeft={drawer !== null || panelOpen}
        onGo={(i) => void goTour(i)} onExit={() => { setTourIndex(null); setTourTarget(null); }} />}
    </div>
  </TechContext.Provider>;
}
