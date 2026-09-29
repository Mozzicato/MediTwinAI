"use client";

import { useSyncExternalStore } from "react";
import { LANGUAGE_BY_ID, type AssistantLanguage } from "@/domain/assistant";

// Read-aloud for the assistant, on the browser's own speech engine.
// - picks the best voice the device has for the language (natural/neural/online voices first);
// - rewrites units and ranges the way a person would say them ("4–5.6 %" → "4 to 5.6 percent");
// - speaks in short sentence chunks, which avoids Chrome cutting long utterances off after ~15 s;
// - only one message speaks at a time, and any component can see which one.

const LANGUAGE_TAGS: Record<AssistantLanguage, string[]> = {
  en: ["en-NG", "en-GB", "en-ZA", "en-KE", "en-IE", "en-AU", "en-US", "en"],
  pcm: ["en-NG", "en-GB", "en-ZA", "en-KE", "en-US", "en"],
  yo: ["yo-NG", "yo"],
  ha: ["ha-NG", "ha"],
  ig: ["ig-NG", "ig"],
};

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function voices(): SpeechSynthesisVoice[] {
  return speechSupported() ? window.speechSynthesis.getVoices() : [];
}

/** Voices load asynchronously in most browsers; wait briefly for them. */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const now = voices();
  if (now.length || !speechSupported()) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => { window.speechSynthesis.removeEventListener("voiceschanged", done); resolve(voices()); };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, 1200);
  });
}

function score(voice: SpeechSynthesisVoice, tags: string[]) {
  const lang = voice.lang.replace("_", "-").toLowerCase();
  const rank = tags.findIndex((t) => lang === t.toLowerCase() || (t.length === 2 && lang.startsWith(`${t.toLowerCase()}-`)));
  if (rank === -1) return -1;
  let s = 100 - rank * 10;
  if (/natural|neural|online|premium|enhanced|wavenet/i.test(voice.name)) s += 40;
  if (/google/i.test(voice.name)) s += 25;
  if (!voice.localService) s += 10;
  if (/compact|espeak|robot/i.test(voice.name)) s -= 30;
  return s;
}

export interface VoiceChoice {
  voice: SpeechSynthesisVoice | null;
  /** False when the device has no voice for the language and an English voice is used instead. */
  native: boolean;
}

export function pickVoice(language: AssistantLanguage, list = voices()): VoiceChoice {
  const best = (tags: string[]) => list.map((v) => [v, score(v, tags)] as const).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const own = best(LANGUAGE_TAGS[language]);
  if (own) return { voice: own, native: true };
  return { voice: best(LANGUAGE_TAGS.en), native: language === "en" || language === "pcm" };
}

/** Plain text a voice can read well: no markdown, and units said in words. */
export function speechText(text: string, language: AssistantLanguage): string {
  let out = text
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*(\d+)[.)]\s+/gm, "$1. ")
    .replace(/[“”"]/g, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ");
  if (language === "en" || language === "pcm") {
    out = out
      .replace(/(\d)\s*[–-]\s*(\d)/g, "$1 to $2")
      .replace(/\bHbA1c\b/gi, "H B A 1 C")
      .replace(/\bLDL\b/g, "L D L").replace(/\bHDL\b/g, "H D L").replace(/\bBMI\b/g, "B M I").replace(/\bTSH\b/g, "T S H").replace(/\bALT\b/g, "A L T")
      .replace(/(\d)\s*\/\s*(\d)/g, "$1 over $2")
      .replace(/\bmg\/dL\b/gi, "milligrams per decilitre")
      .replace(/\bmmol\/L\b/gi, "millimoles per litre")
      .replace(/\bµmol\/L\b|\bumol\/L\b/gi, "micromoles per litre")
      .replace(/\bmm\s?\[?Hg\]?\b/gi, "millimetres of mercury")
      .replace(/\bkg\/m2\b/gi, "kilograms per square metre")
      .replace(/\bbpm\b/gi, "beats per minute")
      .replace(/\bmIU\/L\b/gi, "milli-units per litre")
      .replace(/\bU\/L\b/g, "units per litre")
      .replace(/(\d)\s*%/g, "$1 percent")
      .replace(/(\d)\s*kg\b/g, "$1 kilograms")
      .replace(/(\d)\s*cm\b/g, "$1 centimetres")
      .replace(/\be\.g\./gi, "for example");
  }
  return out.trim();
}

/** Sentence-sized chunks, each short enough to be spoken reliably. */
export function chunksForSpeech(text: string, max = 180): string[] {
  // Split only where punctuation is followed by a space, so "7.1" stays in one piece.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= max) { chunks.push(sentence); continue; }
    let current = "";
    for (const part of sentence.split(/(?<=[,;:])\s+/)) {
      if ((current + " " + part).trim().length > max && current) { chunks.push(current.trim()); current = part; }
      else current = `${current} ${part}`;
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks;
}

// ---- One shared speaker ------------------------------------------------------------------------

let speakingId: string | null = null;
let run = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function stopSpeaking() {
  run += 1;
  if (speechSupported()) window.speechSynthesis.cancel();
  if (speakingId !== null) { speakingId = null; notify(); }
}

/**
 * iOS and some Android browsers only allow speech that starts from a tap. Calling this inside a
 * click handler unlocks later, automatic read-aloud.
 */
export function unlockSpeech() {
  if (!speechSupported()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export async function speak(id: string, text: string, language: AssistantLanguage) {
  if (!speechSupported()) return;
  stopSpeaking();
  const mine = ++run;
  speakingId = id;
  notify();
  const { voice } = pickVoice(language, await voicesReady());
  if (mine !== run) return;
  const chunks = chunksForSpeech(speechText(text, language));
  const lang = voice?.lang ?? LANGUAGE_BY_ID.get(language)?.speech ?? "en-NG";
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) u.voice = voice;
    u.lang = lang;
    u.rate = 0.97;
    u.pitch = 1;
    if (i === chunks.length - 1) u.onend = () => { if (mine === run) { speakingId = null; notify(); } };
    u.onerror = (e) => { if (mine === run && e.error !== "interrupted" && e.error !== "canceled") { speakingId = null; notify(); } };
    window.speechSynthesis.speak(u);
  });
  if (!chunks.length) { speakingId = null; notify(); }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The id of the message being read aloud, or null. */
export function useSpeakingId() {
  return useSyncExternalStore(subscribe, () => speakingId, () => null);
}
