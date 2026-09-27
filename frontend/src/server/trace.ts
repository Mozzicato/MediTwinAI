import "server-only";
import type { TraceEntry } from "@/domain/types";

/**
 * Collects one entry per external call or engine step (PRD 40). Entries are returned to the UI so
 * the integration is visible during a demo, and logged as structured JSON without health values.
 */
export class Trace {
  readonly entries: TraceEntry[] = [];

  constructor(private readonly requestLabel: string) {}

  record(entry: TraceEntry) {
    this.entries.push(entry);
    console.info(JSON.stringify({ at: new Date().toISOString(), request: this.requestLabel, ...entry }));
  }

  /** Time an async step and record it. `classify` maps the result to a status and an optional detail. */
  async step<T>(
    service: TraceEntry["service"],
    operation: string,
    run: () => Promise<T>,
    classify?: (result: T) => Pick<TraceEntry, "status" | "detail">,
  ): Promise<T> {
    const started = performance.now();
    try {
      const result = await run();
      const { status, detail } = classify?.(result) ?? { status: "ok" as const };
      this.record({ service, operation, status, ms: Math.round(performance.now() - started), detail });
      return result;
    } catch (error) {
      this.record({ service, operation, status: "error", ms: Math.round(performance.now() - started), detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}
