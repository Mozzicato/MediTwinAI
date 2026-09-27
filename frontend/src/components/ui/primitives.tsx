import type { Measurement, SignalType, SourceType, SystemStatus } from "@/domain/types";
import { SOURCE_TEXT, STATUS_TEXT, SYSTEM_STATUS_TEXT } from "@/lib/format";

export function StatusDot({ status }: { status: SystemStatus | SignalType }) {
  return <i className={`status-dot status-${status.toLowerCase()}`} aria-hidden="true" />;
}

export function SystemStatusPill({ status }: { status: SystemStatus }) {
  return <span className={`pill pill-${status.toLowerCase()}`}><StatusDot status={status} />{SYSTEM_STATUS_TEXT[status]}</span>;
}

export function MeasurementStatus({ status }: { status: Measurement["status"] }) {
  const tone = status === "ABOVE" || status === "BELOW" ? "attention" : status === "WITHIN" ? "clear" : "muted";
  return <span className={`pill pill-${tone}`}>{STATUS_TEXT[status]}</span>;
}

export function SourceBadge({ source }: { source: SourceType }) {
  return <span className={`source source-${source.toLowerCase().replace(/_/g, "-")}`}>{SOURCE_TEXT[source]}</span>;
}

/** Where the value sits relative to its HOLON reference range. */
export function RangeBar({ m }: { m: Measurement }) {
  const r = m.reference;
  const value = m.compared?.value ?? m.value;
  if (!r || (r.low === null && r.high === null) || m.status === "UNIT_MISMATCH") return null;
  const low = r.low ?? 0;
  const high = r.high ?? low * 2;
  const min = Math.min(low, value) - (high - low) * 0.35;
  const max = Math.max(high, value) + (high - low) * 0.35;
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const out = m.status === "ABOVE" || m.status === "BELOW";
  return <div className="range-bar" role="img" aria-label={`${value} ${r.unit}, reference ${low} to ${high} ${r.unit}`}>
    <div className="range-track" />
    <div className="range-band" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
    <div className={out ? "range-marker out" : "range-marker"} style={{ left: pct(value) }} />
  </div>;
}

/** Tiny trend line for repeated measurements (oldest → newest). */
export function Sparkline({ values, out }: { values: number[]; out?: boolean }) {
  if (values.length < 2) return null;
  const w = 64, h = 22, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)]);
  return <svg className={out ? "sparkline out" : "sparkline"} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
    <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r="2.4" />
  </svg>;
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner-wrap"><span className="spinner" aria-hidden="true" />{label}</span>;
}

export function Logo() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3c-2.2 0-3.5 1.6-3.5 3.4 0 1.5.9 2.6 1.9 3.2-.9.5-3.9 1.8-3.9 5.4v5h2.2v-4.3h6.6V20.0h2.2v-5c0-3.6-3-4.9-3.9-5.4 1-.6 1.9-1.7 1.9-3.2C15.5 4.6 14.2 3 12 3Z" fill="currentColor" /><path d="M4 13h3l1.5-3 2 6 1.5-3h8" stroke="#f5a524" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span><span>MediTwin</span></span>;
}
