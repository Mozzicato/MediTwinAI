"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { OrganId, OrganTarget, SignalType } from "@/domain/types";

const BodyScene = dynamic(() => import("./BodyScene"), {
  ssr: false,
  loading: () => <div className="body-loading"><span className="spinner" /> Preparing anatomy view…</div>,
});

class WebGlBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="body-loading">3D view unavailable on this device. The anatomy list below still shows the mapped structures.</div>
      : this.props.children;
  }
}

export function BodyViewer({ organs, level, selectedOrgan, onSelectOrgan, caption = true, compact = false }: {
  organs: OrganTarget[];
  level: SignalType | null;
  selectedOrgan?: OrganId | null;
  onSelectOrgan?: (id: OrganId) => void;
  caption?: boolean;
  compact?: boolean;
}) {
  // Only HOLON-verified structures are highlighted (FR-014: never invent a mapping).
  const verified = organs.filter((o) => o.verified);
  const highlighted: Partial<Record<OrganId, { level: SignalType | "SELECTED"; label: string }>> = {};
  for (const organ of verified) highlighted[organ.organ] = { level: level ?? "INFORMATION", label: organ.label };
  if (selectedOrgan && highlighted[selectedOrgan]) highlighted[selectedOrgan] = { level: "SELECTED", label: highlighted[selectedOrgan]!.label };

  return <div className={compact ? "body-viewer compact" : "body-viewer"}>
    <div className="body-canvas">
      <WebGlBoundary>
        <BodyScene highlighted={highlighted} focusOrgans={selectedOrgan ? [selectedOrgan] : verified.map((o) => o.organ)} onSelectOrgan={onSelectOrgan} />
      </WebGlBoundary>
      <p className="body-hint" aria-hidden="true">Drag to rotate · scroll to zoom</p>
    </div>
    {caption && <p className="body-caption">
      Schematic 3D view rendered by MediTwin. Highlighted structures are FMA anatomy concepts verified live in HOLON.
      {organs.length > verified.length && ` ${organs.length - verified.length} mapping(s) could not be verified and are not shown.`}
    </p>}
  </div>;
}
