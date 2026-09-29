"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { LANGUAGES, LANGUAGE_BY_ID, greeting, type AssistantAction, type AssistantLanguage } from "@/domain/assistant";
import type { AssistantChat, ChatItem } from "@/lib/assistant-client";

// ---- Minimal markdown: paragraphs, bullet/numbered lists, **bold**. Rendered as React nodes. ----

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>);
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={blocks.length}>{list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</Tag>);
    list = null;
  };
  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)![1]);
    } else if (line.trim()) {
      flush();
      blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
    } else {
      flush();
    }
  }
  flush();
  return <>{blocks}</>;
}

// ---- Voice: speech-to-text and read-aloud, where the browser supports them ----------------------

interface RecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function useVoiceInput(language: AssistantLanguage, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<RecognitionLike | null>(null);
  useEffect(() => { const t = setTimeout(() => setSupported(Boolean(recognitionCtor())), 0); return () => clearTimeout(t); }, []);
  useEffect(() => () => ref.current?.stop(), []);

  const toggle = () => {
    if (listening) { ref.current?.stop(); return; }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = LANGUAGE_BY_ID.get(language)?.speech ?? "en-NG";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => { const said = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ").trim(); if (said) onText(said); };
    rec.onerror = (e) => setError(e.error === "not-allowed" ? "Allow microphone access to speak your message." : e.error === "language-not-supported" ? "Voice input isn't available in this language on your browser yet." : e.error === "no-speech" ? "I didn't hear anything. Try again." : null);
    rec.onend = () => { setListening(false); ref.current = null; };
    ref.current = rec;
    setError(null);
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  return { listening, supported, error, toggle };
}

function ListenButton({ text, language }: { text: string; language: AssistantLanguage }) {
  const [speaking, setSpeaking] = useState(false);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const toggle = () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(text.replace(/\*\*/g, "").replace(/^\s*[-*•]\s+/gm, ""));
    utterance.lang = LANGUAGE_BY_ID.get(language)?.speech ?? "en-NG";
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };
  return <button type="button" className="chat-meta-button" onClick={toggle} aria-pressed={speaking}>{speaking ? "■ Stop" : "▶ Listen"}</button>;
}

// ---- Pieces ------------------------------------------------------------------------------------

export function AssistantMark({ size = 34 }: { size?: number }) {
  return <span className="assistant-mark" style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}><path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5z" fill="currentColor" /><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" fill="currentColor" opacity=".7" /></svg>
  </span>;
}

export type ActionHandler = (action: AssistantAction) => Promise<string | void> | string | void;

function ActionCard({ action, onAction }: { action: AssistantAction; onAction: ActionHandler }) {
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; message?: string }>({ status: "idle" });
  const run = async () => {
    setState({ status: "busy" });
    try { const message = await onAction(action); setState({ status: "done", message: message ?? undefined }); }
    catch (e) { setState({ status: "error", message: e instanceof Error ? e.message : "That didn't work. Please try again." }); }
  };
  const done = state.status === "done" && action.kind === "log_result";
  if (action.kind === "symptom_check") return <div className="chat-action">
    <div><b>Check these against your twin?</b><span>{action.symptoms.map((s) => s.label).join(", ")}</span></div>
    <button type="button" className="button button-small button-primary" onClick={run}>Start check-in</button>
  </div>;
  if (action.kind === "log_result") return <div className="chat-action">
    <div><b>Save this reading to your twin?</b><span>{action.label}: {action.display}, today</span>
      {state.message && <small className={state.status === "error" ? "error-text" : "success-text"}>{state.message}</small>}</div>
    <button type="button" className="button button-small button-primary" onClick={run} disabled={state.status === "busy" || done}>{state.status === "busy" ? "Saving…" : done ? "Saved ✓" : "Save"}</button>
  </div>;
  return <div className="chat-action chat-action-link">
    <button type="button" className="button button-small" onClick={run}>{action.label} →</button>
  </div>;
}

function Bubble({ item, language, onAction }: { item: ChatItem; language: AssistantLanguage; onAction: ActionHandler }) {
  if (item.role === "user") return <div className="chat-row chat-row-user"><div className="bubble bubble-user">{item.text}</div></div>;
  const typing = item.status === "streaming" && !item.text && !item.urgent;
  return <div className="chat-row">
    <AssistantMark size={28} />
    <div className="chat-stack">
      {item.urgent && <div className="chat-urgent" role="alert">
        <b>{item.urgent.guidance.title}</b>
        <p>What you describe can be a sign of an emergency.</p>
        <ol>{item.urgent.guidance.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <small>Reviewed MediTwin emergency guidance. The AI isn&apos;t used for messages like this.</small>
      </div>}
      {(item.text || typing) && <div className={`bubble bubble-bot${item.status === "error" ? " bubble-error" : ""}${item.blocked ? " bubble-blocked" : ""}`}>
        {typing ? <span className="typing" aria-label="MediTwin is typing"><i /><i /><i /></span> : <RichText text={item.text} />}
        {item.status === "streaming" && item.text && <span className="caret" aria-hidden="true" />}
      </div>}
      {item.actions && item.actions.length > 0 && <div className="chat-actions">{item.actions.map((a, i) => <ActionCard key={i} action={a} onAction={onAction} />)}</div>}
      {item.status === "done" && item.text && !item.urgent && <div className="chat-meta">
        <span>{item.source === "MODEL_INFERRED" ? `AI answer · safety-checked${item.removed ? ` · ${item.removed} sentence removed` : ""}` : "From MediTwin"}</span>
        <ListenButton text={item.text} language={language} />
      </div>}
    </div>
  </div>;
}

// ---- Chat --------------------------------------------------------------------------------------

export function Assistant({ chat, name, starters, onAction, variant, onClose, onExpand, sample }: {
  chat: AssistantChat;
  name: string | null;
  starters: string[];
  onAction: ActionHandler;
  variant: "page" | "panel";
  onClose?: () => void;
  onExpand?: () => void;
  sample: boolean;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceInput(chat.language, (said) => setDraft((d) => (d ? `${d} ${said}` : said)));
  const last = chat.items.at(-1);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.items.length, last?.text, last?.actions, last?.urgent, last?.status]);
  useEffect(() => { if (variant === "panel") inputRef.current?.focus(); }, [variant]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  const submit = (text = draft) => {
    if (!text.trim() || chat.busy) return;
    void chat.send(text);
    setDraft("");
  };
  const lang = LANGUAGE_BY_ID.get(chat.language);

  return <section className={`chat chat-${variant}`} aria-label="MediTwin assistant">
    <header className="chat-head">
      <AssistantMark />
      <div className="chat-id">
        <b>MediTwin Assistant</b>
        <small><i className="online" /> {sample ? "Knows this sample twin" : "Knows your health twin"} · doesn&apos;t diagnose</small>
      </div>
      <div className="chat-tools">
        <label className="lang-select" title="Reply language">
          <span className="sr-only">Reply language</span>
          <select value={chat.language} onChange={(e) => chat.setLanguage(e.target.value as AssistantLanguage)}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.native}{l.beta ? " (beta)" : ""}</option>)}
          </select>
        </label>
        {chat.items.length > 0 && <button type="button" className="icon-button" onClick={chat.reset} title="New conversation" aria-label="New conversation">↺</button>}
        {onExpand && <button type="button" className="icon-button" onClick={onExpand} title="Open full screen" aria-label="Open full screen">⤢</button>}
        {onClose && <button type="button" className="icon-button" onClick={onClose} title="Close" aria-label="Close assistant">×</button>}
      </div>
    </header>

    <div className="chat-log" ref={logRef} aria-live="polite">
      <div className="chat-row">
        <AssistantMark size={28} />
        <div className="chat-stack"><div className="bubble bubble-bot"><p>{greeting(chat.language, name)}</p></div>
          {lang?.beta && <small className="chat-note">Replies in {lang.label} are in beta. Safety checks are strongest in English, so double-check anything important with a clinician.</small>}
        </div>
      </div>
      {chat.items.length === 0 && starters.length > 0 && <div className="starters" aria-label="Suggested questions">
        {starters.map((s) => <button key={s} type="button" onClick={() => submit(s)}>{s}</button>)}
      </div>}
      {chat.items.map((item) => <Bubble key={item.id} item={item} language={chat.language} onAction={onAction} />)}
    </div>

    <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea ref={inputRef} rows={1} value={draft} maxLength={1200} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={voice.listening ? "Listening…" : "Ask about your health…"} aria-label="Message" />
      {voice.supported && <button type="button" className={`icon-button mic${voice.listening ? " on" : ""}`} onClick={voice.toggle}
        aria-pressed={voice.listening} title={voice.listening ? "Stop listening" : "Speak your message"} aria-label={voice.listening ? "Stop listening" : "Speak your message"}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" fill="currentColor" /></svg>
      </button>}
      {chat.busy
        ? <button type="button" className="send-button" onClick={chat.stop} aria-label="Stop answer">■</button>
        : <button type="submit" className="send-button" disabled={!draft.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="currentColor" /></svg>
        </button>}
    </form>
    {voice.error && <p className="chat-voice-error" role="status">{voice.error}</p>}
    <p className="chat-foot">Not a diagnosis. In an emergency, call your local emergency number.</p>
  </section>;
}

/** Floating button that opens the assistant from anywhere in the workspace. */
export function AssistantLauncher({ onOpen, raised }: { onOpen: () => void; raised?: boolean }) {
  return <button type="button" className={`assistant-launcher${raised ? " raised" : ""}`} onClick={onOpen} aria-label="Ask MediTwin assistant">
    <AssistantMark size={30} /><span>Ask MediTwin</span>
  </button>;
}
