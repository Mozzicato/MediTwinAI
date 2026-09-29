import type { Measurement, TimelineEvent } from "./types";

export interface MeasurementSeries {
  latest: Measurement;
  history: Measurement[];
}

export const isOutOfRange = (m: Measurement) => m.status === "ABOVE" || m.status === "BELOW";

/** Latest reading per measurement key for a set of events, newest first, out-of-range first. */
export function seriesFor(events: TimelineEvent[]): MeasurementSeries[] {
  const byKey = new Map<string, Measurement[]>();
  for (const e of events) for (const m of e.measurements) byKey.set(m.key, [...(byKey.get(m.key) ?? []), m]);
  const rank = (m: Measurement) => (isOutOfRange(m) ? 0 : m.status === "WITHIN" ? 1 : 2);
  return [...byKey.values()]
    .map((list) => { const history = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); return { latest: history.at(-1)!, history }; })
    .sort((a, b) => rank(a.latest) - rank(b.latest) || b.latest.occurredAt.localeCompare(a.latest.occurredAt));
}
