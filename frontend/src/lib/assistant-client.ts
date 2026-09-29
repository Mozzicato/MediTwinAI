"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantAction, AssistantEvent, AssistantLanguage } from "@/domain/assistant";
import type { CareGuidance, SymptomInput } from "@/domain/types";

// Browser side of the assistant: sends the conversation, reads the NDJSON event stream and keeps
// the chat in memory only. Nothing is written to browser storage except the chosen language.

export interface ChatItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "done" | "error";
  urgent?: { guidance: CareGuidance; ruleId: string };
  actions?: AssistantAction[];
  generator?: string;
  source?: "MODEL_INFERRED" | "SYSTEM_GENERATED";
  removed?: number;
  blocked?: boolean;
}

const LANGUAGE_KEY = "meditwin.assistant.language";
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

function storedLanguage(): AssistantLanguage {
  try {
    const value = window.localStorage.getItem(LANGUAGE_KEY);
    if (value === "en" || value === "pcm" || value === "yo" || value === "ha" || value === "ig") return value;
  } catch { /* storage unavailable */ }
  return "en";
}

function apply(item: ChatItem, event: AssistantEvent): ChatItem {
  switch (event.type) {
    case "text": return { ...item, text: item.text + event.delta };
    case "urgent": return { ...item, urgent: { guidance: event.guidance, ruleId: event.ruleId } };
    case "blocked": return { ...item, text: event.text, blocked: true };
    case "actions": return { ...item, actions: event.actions };
    case "done": return { ...item, status: "done", generator: event.generator, source: event.source, removed: event.removed };
    case "error": return { ...item, status: "error", text: item.text || event.message };
  }
}

export function useAssistant(endpoint: string, focus: SymptomInput[] | null) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [language, setLanguageState] = useState<AssistantLanguage>("en");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    const timer = setTimeout(() => setLanguageState(storedLanguage()), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  const setLanguage = useCallback((next: AssistantLanguage) => {
    setLanguageState(next);
    try { window.localStorage.setItem(LANGUAGE_KEY, next); } catch { /* storage unavailable */ }
  }, []);

  const update = (id: string, change: (item: ChatItem) => ChatItem) =>
    setItems((all) => all.map((item) => (item.id === id ? change(item) : item)));

  const send = useCallback(async (raw: string) => {
    const text = raw.trim().slice(0, 1200);
    if (!text || abortRef.current) return;
    const user: ChatItem = { id: nextId(), role: "user", text, status: "done" };
    const bot: ChatItem = { id: nextId(), role: "assistant", text: "", status: "streaming" };
    const history = [...itemsRef.current, user]
      .filter((m) => m.text.trim() && !m.urgent && m.status !== "error")
      .map((m) => ({ role: m.role, content: m.text }));
    setItems((all) => [...all, user, bot]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ messages: history, language, focus: focus?.length ? { symptoms: focus } : undefined }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        update(bot.id, (item) => ({ ...item, status: "error", text: payload?.detail ?? "I couldn't answer just now. Please try again." }));
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += value;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const event = JSON.parse(line) as AssistantEvent; update(bot.id, (item) => apply(item, event)); } catch { /* ignore a malformed line */ }
        }
      }
      update(bot.id, (item) => (item.status === "streaming" ? { ...item, status: "done" } : item));
    } catch {
      update(bot.id, (item) => controller.signal.aborted
        ? { ...item, status: "done", text: item.text || "Stopped." }
        : { ...item, status: "error", text: item.text || "We couldn't reach MediTwin. Check your connection and try again." });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [endpoint, focus, language]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => { abortRef.current?.abort(); setItems([]); }, []);

  return { items, language, setLanguage, busy, send, stop, reset };
}

export type AssistantChat = ReturnType<typeof useAssistant>;
