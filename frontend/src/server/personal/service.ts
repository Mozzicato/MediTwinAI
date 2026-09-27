import "server-only";
import { SYMPTOM_BY_ID } from "@/domain/content";
import { ENTRY_TYPE_BY_ID, entryEventData, validateEntry, type EntryValues } from "@/domain/entry-catalog";
import type { DtpEvent } from "@/domain/normalize";
import type {
  AnalysisResult, CheckIn, ManualEntry, Persona, PersonalState, Profile, SimulationType, SymptomInput, TwinConnection, TwinView,
} from "@/domain/types";
import type { SessionUser } from "@/lib/local-auth";
import { HttpError } from "../http-error";
import { DtpError, decodeGrant, hostForToken, listEvents, writeEvent, type TwinAccess } from "../ontomorph/dtp";
import type { Trace } from "../trace";
import { analyzeView, buildView, flagWithAccess, simulateWithAccess } from "../twin-service";
import * as store from "./store";

const CHECKIN_EVENT_WINDOW = 20;

function personaFor(profile: Profile): Persona {
  return {
    twinId: "personal", name: profile.firstName, age: new Date().getUTCFullYear() - profile.birthYear,
    sex: profile.sex, headline: "Your health twin",
  };
}

/** A person's own entries, shaped like twin events so they share the whole pipeline. */
function entryEvents(entries: ManualEntry[], twinEventIds: Set<string>): DtpEvent[] {
  return entries
    .filter((e) => !(e.twinEventId && twinEventIds.has(e.twinEventId)))
    .flatMap((e) => {
      const type = ENTRY_TYPE_BY_ID.get(e.typeId);
      if (!type) return [];
      return [{
        id: `entry-${e.id}`, twinId: "personal", eventType: type.eventType, occurredAt: e.occurredAt, title: type.label,
        description: e.note, data: entryEventData(type, e.values, e.unit), source: { plugin: "meditwin.entry" },
      }];
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

interface Loaded { view: TwinView; access: TwinAccess | null }

async function loadPersonal(trace: Trace, user: SessionUser): Promise<Loaded> {
  const [profileRecord, stored, entries, checkins] = await Promise.all([
    store.getProfile(user.id), store.getConnection(user.id), store.listEntries(user.id), store.listCheckins(user.id),
  ]);
  if (!profileRecord) throw new HttpError(409, "Finish setting up your account first.", { needsOnboarding: true });

  let connection: TwinConnection = { connected: false };
  let access: TwinAccess | null = null;
  let twinEvents: DtpEvent[] = [];
  if (stored) {
    const claims = decodeGrant(stored.grantToken);
    const environment = stored.host.includes("sandbox") ? "sandbox" : "production";
    connection = { connected: true, twinId: stored.twinId, environment, systems: claims.systems, eventTypes: claims.eventTypes, expiresAt: stored.expiresAt, connectedAt: stored.connectedAt, status: "ok" };
    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      connection = { ...connection, status: "expired", message: "Your OntoMorph grant has expired. Issue a new one to keep your twin in sync." };
    } else {
      try {
        access = { grantToken: stored.grantToken, twinId: stored.twinId, host: stored.host };
        twinEvents = await listEvents(trace, access);
      } catch (error) {
        access = null;
        const rejected = error instanceof DtpError && (error.status === 401 || error.status === 403);
        connection = { ...connection, status: rejected ? "expired" : "error", message: rejected ? "OntoMorph no longer accepts this grant. It may have been revoked." : "We couldn't reach your digital twin just now. Showing the results stored in MediTwin." };
      }
    }
  }

  const raw = [
    ...twinEvents,
    ...entryEvents(entries, new Set(twinEvents.map((e) => e.id))),
    ...checkinEvents(checkins),
  ];
  const view = await buildView(trace, {
    persona: personaFor(profileRecord.profile), twinId: stored?.twinId ?? "personal", raw,
    grantToken: access ? stored!.grantToken : undefined, canSimulate: Boolean(access),
  });
  const personal: PersonalState = { email: user.email, profile: profileRecord.profile, consent: profileRecord.consent, connection, entries, checkins };
  return { view: { ...view, personal }, access };
}

export async function personalView(trace: Trace, user: SessionUser): Promise<TwinView> {
  return (await loadPersonal(trace, user)).view;
}

export async function getOnboarding(user: SessionUser) {
  const record = await store.getProfile(user.id);
  return { email: user.email, profile: record?.profile ?? null, consent: record?.consent ?? null, consentVersion: store.CONSENT_VERSION };
}

export async function saveProfile(user: SessionUser, profile: Profile) {
  const year = new Date().getUTCFullYear();
  if (profile.birthYear < year - 120 || profile.birthYear > year - 13) throw new HttpError(400, "MediTwin is for people aged 13 and over. Check your year of birth.");
  await store.saveProfile(user.id, { ...profile, firstName: profile.firstName.trim() });
}

// ---- OntoMorph twin connection -------------------------------------------------------------------

export async function connectTwin(trace: Trace, user: SessionUser, grantToken: string) {
  let claims;
  try { claims = decodeGrant(grantToken); } catch { throw new HttpError(400, "That doesn't look like an OntoMorph grant token. Copy the whole token from your OntoMorph account."); }
  if (new Date(claims.expiresAt).getTime() < Date.now()) throw new HttpError(400, "That grant token has already expired. Issue a new one in OntoMorph.");
  const { host, environment } = hostForToken(grantToken);
  let events: DtpEvent[];
  try {
    events = await listEvents(trace, { grantToken, twinId: claims.twinId, host });
  } catch (error) {
    if (error instanceof DtpError && (error.status === 401 || error.status === 403)) throw new HttpError(400, "OntoMorph didn't accept this grant token. It may be expired, revoked or issued to another app.");
    throw error;
  }
  await store.saveConnection(user.id, { grantToken, twinId: claims.twinId, host, expiresAt: claims.expiresAt });
  return { twinId: claims.twinId, environment, eventCount: events.length, systems: claims.systems, eventTypes: claims.eventTypes, expiresAt: claims.expiresAt };
}

export async function disconnectTwin(user: SessionUser) {
  await store.deleteConnection(user.id);
}

// ---- Entries -----------------------------------------------------------------------------------------

export async function addEntry(trace: Trace, user: SessionUser, input: { typeId: string; values: EntryValues; unit: string; occurredAt: string; note?: string; syncToTwin: boolean }) {
  const type = ENTRY_TYPE_BY_ID.get(input.typeId);
  if (!type) throw new HttpError(400, "Unknown measurement type.");
  const problem = validateEntry(type, input.values, input.unit);
  if (problem) throw new HttpError(400, problem);
  const occurred = new Date(input.occurredAt);
  if (Number.isNaN(occurred.getTime()) || occurred.getTime() > Date.now() + 86_400_000 || occurred.getUTCFullYear() < 1900) throw new HttpError(400, "Choose a valid date that isn't in the future.");

  let twinEventId: string | null = null;
  let sync: { status: "synced" | "skipped" | "failed"; message?: string } = { status: "skipped" };
  if (input.syncToTwin) {
    const stored = await store.getConnection(user.id);
    const claims = stored ? decodeGrant(stored.grantToken) : null;
    if (!stored || !claims) sync = { status: "skipped", message: "No OntoMorph twin is connected, so the result was saved in MediTwin only." };
    else if (claims.eventTypes && !claims.eventTypes.includes(type.eventType)) sync = { status: "skipped", message: `Your grant doesn't allow MediTwin to write ${type.eventType.replace("_", " ")}s, so it was saved in MediTwin only.` };
    else {
      try {
        const created = await writeEvent(trace, { grantToken: stored.grantToken, twinId: stored.twinId, host: stored.host }, {
          eventType: type.eventType, occurredAt: occurred.toISOString(), title: type.label,
          data: { ...entryEventData(type, input.values, input.unit), enteredVia: "meditwin" },
        });
        twinEventId = created.id;
        sync = { status: "synced" };
      } catch (error) {
        sync = { status: "failed", message: error instanceof DtpError ? `OntoMorph didn't accept the write (${error.code}). The result was saved in MediTwin.` : "The result was saved in MediTwin, but not on your twin." };
      }
    }
  }
  const entry = await store.addEntry(user.id, { typeId: type.id, values: input.values, unit: input.unit, note: input.note?.trim() || undefined, occurredAt: occurred.toISOString(), twinEventId });
  return { entry, sync };
}

export async function deleteEntry(user: SessionUser, id: string) {
  if (!(await store.deleteEntry(user.id, id))) throw new HttpError(404, "That result wasn't found.");
}

// ---- Analysis, simulation, write-back -----------------------------------------------------------------

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

async function requireTwin(trace: Trace, user: SessionUser) {
  const loaded = await loadPersonal(trace, user);
  if (!loaded.access) throw new HttpError(409, "Connect your OntoMorph twin to use this feature.");
  return loaded as { view: TwinView; access: TwinAccess };
}

export async function simulatePersonal(trace: Trace, user: SessionUser, type: SimulationType, months: number) {
  const { view, access } = await requireTwin(trace, user);
  return simulateWithAccess(trace, view, access, type, months);
}

export async function flagPersonal(trace: Trace, user: SessionUser, symptoms: SymptomInput[]) {
  const { view, access } = await requireTwin(trace, user);
  const result = await flagWithAccess(trace, view, access, symptoms);
  if (result.status === "created") await store.audit(user.id, "twin.flag_written");
  return result;
}

export const exportData = (user: SessionUser) => store.exportAll(user.id, user.email);
export const deleteAccount = (user: SessionUser) => store.deleteAccount(user.id);
