import "server-only";
import { SYMPTOM_BY_ID } from "@/domain/content";
import { ENTRY_TYPE_BY_ID, entryEventData, validateEntry, type EntryValues } from "@/domain/entry-catalog";
import type { DtpEvent } from "@/domain/normalize";
import type { AnalysisResult, CheckIn, ManualEntry, Persona, PersonalState, Profile, SymptomInput, TwinConnection, TwinView } from "@/domain/types";
import type { SessionUser } from "@/lib/local-auth";
import { HttpError } from "../http-error";
import { DtpError, createTwin, listOwnedEvents, updateTwin, writeOwnedEvent, type PlatformTwinProfile } from "../ontomorph/dtp";
import type { Trace } from "../trace";
import { analyzeView, buildView, writeSignal } from "../twin-service";
import * as store from "./store";

// Every person gets their own OntoMorph twin, created by MediTwin with its platform key when they
// finish onboarding. Results they add are written to that twin. MediTwin keeps an encrypted copy
// too, so nothing is lost if OntoMorph is temporarily unavailable; unsynced results are retried.

const CHECKIN_EVENT_WINDOW = 20;

function personaFor(profile: Profile): Persona {
  return { twinId: "personal", name: profile.firstName, age: new Date().getUTCFullYear() - profile.birthYear, sex: profile.sex, headline: "Your health twin" };
}

function twinProfile(profile: Profile): PlatformTwinProfile {
  const bmi = Math.round((profile.weightKg / (profile.heightCm / 100) ** 2) * 10) / 10;
  return { age: new Date().getUTCFullYear() - profile.birthYear, sex: profile.sex, heightCm: profile.heightCm, weightKg: profile.weightKg, bmi, skinTone: profile.skinTone, ancestry: "" };
}

/** Create the person's OntoMorph twin if it doesn't exist yet. Returns null if OntoMorph is unreachable. */
async function ensureTwin(trace: Trace, user: SessionUser, profile: Profile) {
  const existing = await store.getPlatformTwin(user.id);
  if (existing) return existing;
  try {
    const created = await createTwin(trace, profile.firstName, twinProfile(profile));
    await store.savePlatformTwin(user.id, created.id, created.createdAt ?? new Date().toISOString());
    return { twinId: created.id, createdAt: created.createdAt };
  } catch {
    return null;
  }
}

/** A person's own entries, shaped like twin events so they share the whole pipeline. */
function entryEvents(entries: ManualEntry[], onTwin: Set<string>): DtpEvent[] {
  return entries.filter((e) => !(e.twinEventId && onTwin.has(e.twinEventId))).flatMap((e) => {
    const type = ENTRY_TYPE_BY_ID.get(e.typeId);
    return type ? [{
      id: `entry-${e.id}`, twinId: "personal", eventType: type.eventType, occurredAt: e.occurredAt, title: type.label,
      description: e.note, data: entryEventData(type, e.values, e.unit), source: { plugin: "meditwin.entry" },
    }] : [];
  });
}

/** Past check-ins become symptom events (one per body system), so recurrences are recognised. */
function checkinEvents(checkins: CheckIn[]): DtpEvent[] {
  return checkins.slice(0, CHECKIN_EVENT_WINDOW).flatMap((c) => {
    const bySystem = new Map<string, SymptomInput[]>();
    for (const s of c.symptoms) {
      const system = SYMPTOM_BY_ID.get(s.id)?.systems[0];
      if (system) bySystem.set(system, [...(bySystem.get(system) ?? []), s]);
    }
    return [...bySystem].map(([system, symptoms]) => ({
      id: `checkin-${c.id}-${system}`, twinId: "personal", eventType: "symptom", occurredAt: c.createdAt,
      title: symptoms.map((s) => SYMPTOM_BY_ID.get(s.id)?.label ?? s.id).join(", "),
      data: { system, symptoms: symptoms.map((s) => s.id), severity: symptoms[0].severity, durationDays: symptoms[0].durationDays },
      source: { plugin: "meditwin.checkin" },
    }));
  });
}

function entryToTwinEvent(entry: ManualEntry) {
  const type = ENTRY_TYPE_BY_ID.get(entry.typeId)!;
  return { eventType: type.eventType, occurredAt: entry.occurredAt, title: type.label, description: entry.note, data: { ...entryEventData(type, entry.values, entry.unit), enteredVia: "meditwin" } };
}

const UNAVAILABLE = "OntoMorph isn't accepting health events for this twin right now. Your results are saved securely in MediTwin and will sync automatically.";

async function loadPersonal(trace: Trace, user: SessionUser): Promise<{ view: TwinView; twinId: string | null; twinReady: boolean }> {
  const profileRecord = await store.getProfile(user.id);
  if (!profileRecord) throw new HttpError(409, "Finish setting up your account first.", { needsOnboarding: true });
  const [twin, entries, checkins] = await Promise.all([ensureTwin(trace, user, profileRecord.profile), store.listEntries(user.id), store.listCheckins(user.id)]);

  let connection: TwinConnection = { connected: false, status: "error", message: "We couldn't reach OntoMorph to create your twin. We'll try again next time." };
  let twinEvents: DtpEvent[] = [];
  let twinReady = false;
  if (twin) {
    connection = { connected: true, twinId: twin.twinId, environment: "production", connectedAt: twin.createdAt, status: "ok" };
    try {
      twinEvents = await listOwnedEvents(trace, twin.twinId);
      twinReady = true;
      // Push results that were saved while OntoMorph was unavailable.
      for (const entry of entries.filter((e) => !e.twinEventId)) {
        try {
          const created = await writeOwnedEvent(trace, twin.twinId, entryToTwinEvent(entry));
          await store.markEntrySynced(user.id, entry.id, created.id);
          entry.twinEventId = created.id;
        } catch { break; }
      }
    } catch (error) {
      connection = { ...connection, status: "error", message: error instanceof DtpError && error.status >= 500 ? UNAVAILABLE : "We couldn't read your twin just now. Showing the results saved in MediTwin." };
    }
  }

  const raw = [...twinEvents, ...entryEvents(entries, new Set(twinEvents.map((e) => e.id))), ...checkinEvents(checkins)];
  const view = await buildView(trace, { persona: personaFor(profileRecord.profile), twinId: twin?.twinId ?? "personal", raw, canSimulate: false });
  const personal: PersonalState = { email: user.email, profile: profileRecord.profile, consent: profileRecord.consent, connection, entries, checkins };
  return { view: { ...view, personal }, twinId: twin?.twinId ?? null, twinReady };
}

export async function personalView(trace: Trace, user: SessionUser): Promise<TwinView> {
  return (await loadPersonal(trace, user)).view;
}

export async function getOnboarding(user: SessionUser) {
  const record = await store.getProfile(user.id);
  return { email: user.email, profile: record?.profile ?? null, consent: record?.consent ?? null, consentVersion: store.CONSENT_VERSION };
}

/** Save the profile, then create (or update) the person's OntoMorph twin from it. */
export async function saveProfile(trace: Trace, user: SessionUser, profile: Profile) {
  const year = new Date().getUTCFullYear();
  if (profile.birthYear < year - 120 || profile.birthYear > year - 13) throw new HttpError(400, "MediTwin is for people aged 13 and over. Check your year of birth.");
  if (profile.heightCm < 50 || profile.heightCm > 250) throw new HttpError(400, "Enter your height in centimetres (for example 172).");
  if (profile.weightKg < 20 || profile.weightKg > 350) throw new HttpError(400, "Enter your weight in kilograms (for example 70).");
  const clean = { ...profile, firstName: profile.firstName.trim() };
  const existing = await store.getPlatformTwin(user.id);
  await store.saveProfile(user.id, clean);
  if (existing) {
    try { await updateTwin(trace, existing.twinId, clean.firstName, twinProfile(clean)); } catch { /* the profile is saved; the twin catches up next time */ }
  } else {
    await ensureTwin(trace, user, clean);
  }
}

// ---- Entries -----------------------------------------------------------------------------------------

export async function addEntry(trace: Trace, user: SessionUser, input: { typeId: string; values: EntryValues; unit: string; occurredAt: string; note?: string }) {
  const type = ENTRY_TYPE_BY_ID.get(input.typeId);
  if (!type) throw new HttpError(400, "Unknown measurement type.");
  const problem = validateEntry(type, input.values, input.unit);
  if (problem) throw new HttpError(400, problem);
  const occurred = new Date(input.occurredAt);
  if (Number.isNaN(occurred.getTime()) || occurred.getTime() > Date.now() + 86_400_000 || occurred.getUTCFullYear() < 1900) throw new HttpError(400, "Choose a valid date that isn't in the future.");

  const entry = await store.addEntry(user.id, { typeId: type.id, values: input.values, unit: input.unit, note: input.note?.trim() || undefined, occurredAt: occurred.toISOString() });
  const twin = await store.getPlatformTwin(user.id);
  if (!twin) return { entry, synced: false, message: "Saved. It will sync to your OntoMorph twin once it's created." };
  try {
    const created = await writeOwnedEvent(trace, twin.twinId, entryToTwinEvent(entry));
    await store.markEntrySynced(user.id, entry.id, created.id);
    return { entry: { ...entry, twinEventId: created.id }, synced: true, message: "Saved to your OntoMorph twin." };
  } catch {
    return { entry, synced: false, message: "Saved in MediTwin. It will sync to your OntoMorph twin automatically when OntoMorph is available." };
  }
}

export async function deleteEntry(user: SessionUser, id: string) {
  if (!(await store.deleteEntry(user.id, id))) throw new HttpError(404, "That result wasn't found.");
}

// ---- Analysis and write-back --------------------------------------------------------------------------

export async function analyzePersonal(trace: Trace, user: SessionUser, symptoms: SymptomInput[]): Promise<AnalysisResult> {
  const { view } = await loadPersonal(trace, user);
  const result = await analyzeView(trace, view, symptoms);
  if (symptoms.length) {
    await store.addCheckin(user.id, {
      symptoms,
      signal: result.primary ? { type: result.primary.type, systemLabel: result.primary.systemLabel, ruleId: result.primary.ruleId, title: result.primary.title } : null,
      headline: result.explanation.headline,
    });
  }
  return result;
}

export async function flagPersonal(trace: Trace, user: SessionUser, symptoms: SymptomInput[]) {
  const { view, twinId, twinReady } = await loadPersonal(trace, user);
  if (!twinId || !twinReady) throw new HttpError(503, UNAVAILABLE.replace("Your results are saved securely in MediTwin and will sync automatically.", "Please try again later."));
  const result = await writeSignal(trace, view, (system, flag) =>
    writeOwnedEvent(trace, twinId, { eventType: "clinical_note", occurredAt: new Date().toISOString(), title: flag.title, description: flag.description, data: { ...flag.data, system } }), symptoms);
  if (result.status === "created") await store.audit(user.id, "twin.flag_written");
  return result;
}

export const exportData = (user: SessionUser) => store.exportAll(user.id, user.email);
export const deleteAccount = (user: SessionUser) => store.deleteAccount(user.id);
