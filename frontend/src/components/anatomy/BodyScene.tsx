"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { OrganId, SignalType } from "@/domain/types";

// A schematic 3D body rendered by MediTwin. Organ positions are approximate and for orientation
// only; which organs light up comes from the HOLON-verified FMA mapping, never from this file.

type Vec3 = [number, number, number];
type Shape =
  | { kind: "sphere"; position: Vec3; scale: Vec3; rotation?: Vec3 }
  | { kind: "capsule"; position: Vec3; radius: number; length: number; rotation?: Vec3; scale?: Vec3 }
  | { kind: "cylinder"; position: Vec3; radius: number; height: number; rotation?: Vec3 }
  | { kind: "arc"; position: Vec3; radius: number; tube: number; rotation?: Vec3 };

const BODY: Shape[] = [
  { kind: "sphere", position: [0, 1.63, 0], scale: [0.1, 0.12, 0.11] },
  { kind: "cylinder", position: [0, 1.5, 0], radius: 0.045, height: 0.1 },
  { kind: "capsule", position: [0, 1.17, 0], radius: 0.15, length: 0.36, scale: [1.2, 1, 0.72] },
  { kind: "sphere", position: [0, 0.9, 0], scale: [0.17, 0.12, 0.12] },
  ...([-1, 1] as const).flatMap((side): Shape[] => [
    { kind: "capsule", position: [side * 0.235, 1.21, 0], radius: 0.042, length: 0.26, rotation: [0, 0, side * 0.12] },
    { kind: "capsule", position: [side * 0.27, 0.92, 0.02], radius: 0.036, length: 0.24, rotation: [0, 0, side * 0.05] },
    { kind: "sphere", position: [side * 0.285, 0.74, 0.03], scale: [0.035, 0.05, 0.02] },
    { kind: "capsule", position: [side * 0.095, 0.6, 0], radius: 0.07, length: 0.34 },
    { kind: "capsule", position: [side * 0.1, 0.22, 0], radius: 0.052, length: 0.34 },
    { kind: "sphere", position: [side * 0.1, 0.03, 0.04], scale: [0.04, 0.03, 0.08] },
  ]),
];

// The body faces the camera (+z), so the patient's left side is +x.
const ORGANS: Record<OrganId, { shapes: Shape[]; anchor: Vec3 }> = {
  brain: { shapes: [{ kind: "sphere", position: [0, 1.66, 0], scale: [0.075, 0.065, 0.085] }], anchor: [0, 1.66, 0] },
  lungs: { shapes: [-1, 1].map((s): Shape => ({ kind: "sphere", position: [s * 0.085, 1.25, 0], scale: [0.07, 0.13, 0.07] })), anchor: [-0.085, 1.3, 0] },
  trachea: { shapes: [{ kind: "cylinder", position: [0, 1.42, 0.02], radius: 0.014, height: 0.15 }], anchor: [0, 1.44, 0.02] },
  heart: { shapes: [{ kind: "sphere", position: [0.035, 1.2, 0.05], scale: [0.05, 0.06, 0.045], rotation: [0, 0, -0.4] }], anchor: [0.035, 1.2, 0.05] },
  liver: { shapes: [{ kind: "sphere", position: [-0.07, 1.06, 0.03], scale: [0.1, 0.055, 0.06], rotation: [0, 0, 0.2] }], anchor: [-0.14, 1.1, 0.04] },
  stomach: { shapes: [{ kind: "sphere", position: [0.07, 1.05, 0.04], scale: [0.05, 0.04, 0.035] }], anchor: [0.07, 1.05, 0.04] },
  pancreas: { shapes: [{ kind: "capsule", position: [0.01, 0.99, 0.01], radius: 0.018, length: 0.12, rotation: [0, 0, Math.PI / 2 + 0.15] }], anchor: [-0.13, 0.97, 0.06] },
  kidneys: { shapes: [-1, 1].map((s): Shape => ({ kind: "sphere", position: [s * 0.075, 0.97, -0.06], scale: [0.028, 0.045, 0.025] })), anchor: [0.16, 0.93, 0] },
  bladder: { shapes: [{ kind: "sphere", position: [0, 0.82, 0.03], scale: [0.035, 0.03, 0.03] }], anchor: [0, 0.82, 0.03] },
  breast: { shapes: [-1, 1].map((s): Shape => ({ kind: "sphere", position: [s * 0.085, 1.2, 0.11], scale: [0.05, 0.05, 0.03] })), anchor: [0.085, 1.2, 0.12] },
  teeth: { shapes: [{ kind: "arc", position: [0, 1.57, 0.06], radius: 0.035, tube: 0.007, rotation: [Math.PI / 2, 0, 0] }], anchor: [0, 1.57, 0.09] },
};

export const ORGAN_IDS = Object.keys(ORGANS) as OrganId[];
const ORGAN_NAMES: Record<OrganId, string> = {
  brain: "Brain", lungs: "Lungs", trachea: "Trachea", heart: "Heart", liver: "Liver", stomach: "Stomach",
  pancreas: "Pancreas", kidneys: "Kidneys", bladder: "Bladder", breast: "Breast", teeth: "Teeth",
};

const LEVEL_COLOR: Record<SignalType | "SELECTED" | "NONE", string> = {
  URGENT: "#ff5a4e", ATTENTION: "#f5a524", INFORMATION: "#4fd1c5", SELECTED: "#7dd3fc", NONE: "#4fd1c5",
};

const hologramVertex = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-world.xyz);
    gl_Position = projectionMatrix * world;
  }`;
const hologramFragment = `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
    gl_FragColor = vec4(uColor, rim * uStrength + 0.035);
  }`;

function Geometry({ shape }: { shape: Shape }) {
  switch (shape.kind) {
    case "sphere": return <sphereGeometry args={[1, 32, 24]} />;
    case "capsule": return <capsuleGeometry args={[shape.radius, shape.length, 8, 24]} />;
    case "cylinder": return <cylinderGeometry args={[shape.radius, shape.radius, shape.height, 24]} />;
    case "arc": return <torusGeometry args={[shape.radius, shape.tube, 8, 32, Math.PI]} />;
  }
}

function shapeScale(shape: Shape): Vec3 | undefined {
  return shape.kind === "sphere" ? shape.scale : shape.kind === "capsule" ? shape.scale : undefined;
}

function HologramBody() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: hologramVertex, fragmentShader: hologramFragment, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color("#5fd4c4") }, uStrength: { value: 0.75 } },
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  return <group>{BODY.map((shape, i) => (
    <mesh key={i} position={shape.position} rotation={shape.rotation} scale={shapeScale(shape)} material={material}>
      <Geometry shape={shape} />
    </mesh>
  ))}</group>;
}

function Organ({ id, level, onSelect, onHover }: {
  id: OrganId; level: SignalType | "SELECTED" | null; onSelect?: (id: OrganId) => void; onHover: (id: OrganId | null) => void;
}) {
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const lit = level !== null;
  const color = LEVEL_COLOR[level ?? "NONE"];
  useFrame(({ clock }) => {
    const pulse = lit ? 0.55 + Math.sin(clock.elapsedTime * 3) * 0.35 : 0;
    for (const m of materials.current) if (m) m.emissiveIntensity = pulse;
  });
  const organ = ORGANS[id];
  const handleClick = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect?.(id); };
  return <group>
    {organ.shapes.map((shape, i) => (
      <mesh key={i} position={shape.position} rotation={shape.rotation} scale={shapeScale(shape)} onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); onHover(id); }} onPointerOut={() => onHover(null)}>
        <Geometry shape={shape} />
        <meshStandardMaterial ref={(m) => { if (m) materials.current[i] = m; }} color={lit ? color : "#9fb8b4"} emissive={color}
          emissiveIntensity={0} transparent opacity={lit ? 0.95 : 0.28} roughness={0.35} metalness={0.05} depthWrite={lit} />
      </mesh>
    ))}
  </group>;
}

function CameraRig({ focus, controls }: { focus: Vec3 | null; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const progress = useRef(1);
  const target = useRef(new THREE.Vector3(0, 1.0, 0));
  const distance = useRef(2.9);
  useEffect(() => {
    target.current.set(...(focus ?? [0, 1.0, 0]));
    distance.current = focus ? 1.75 : 2.9;
    progress.current = 0;
  }, [focus]);
  useFrame(({ camera }, delta) => {
    const c = controls.current;
    if (!c || progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta * 1.4);
    c.target.lerp(target.current, 0.08);
    const offset = camera.position.clone().sub(c.target);
    offset.setLength(THREE.MathUtils.lerp(offset.length(), distance.current, 0.08));
    camera.position.copy(c.target).add(offset);
    c.update();
  });
  return null;
}

type LabelRefs = React.RefObject<Partial<Record<OrganId, HTMLSpanElement | null>>>;

/** Projects organ anchors to screen space and moves ordinary DOM labels, avoiding extra React roots. */
function LabelProjector({ labels }: { labels: LabelRefs }) {
  const { camera, size } = useThree();
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const id of ORGAN_IDS) {
      const el = labels.current?.[id];
      if (!el) continue;
      point.set(...ORGANS[id].anchor).project(camera);
      el.style.setProperty("transform", `translate(-50%, -50%) translate(${((point.x + 1) / 2) * size.width}px, ${((1 - point.y) / 2) * size.height}px)`);
    }
  });
  return null;
}

export interface BodySceneProps {
  highlighted: Partial<Record<OrganId, { level: SignalType | "SELECTED"; label: string }>>;
  focusOrgans: OrganId[];
  onSelectOrgan?: (id: OrganId) => void;
}

export default function BodyScene({ highlighted, focusOrgans, onSelectOrgan }: BodySceneProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [hovered, setHovered] = useState<OrganId | null>(null);
  // This component only renders on the client (next/dynamic with ssr: false).
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const focusKey = focusOrgans.join(",");
  const focus = useMemo<Vec3 | null>(() => {
    const ids = focusKey ? (focusKey.split(",") as OrganId[]) : [];
    if (!ids.length) return null;
    const sum = ids.reduce((acc, id) => acc.map((v, i) => v + ORGANS[id].anchor[i]) as Vec3, [0, 0, 0] as Vec3);
    return sum.map((v) => v / ids.length) as Vec3;
  }, [focusKey]);

  const labels = useRef<Partial<Record<OrganId, HTMLSpanElement | null>>>({});
  return <div className="body-scene">
  <Canvas camera={{ position: [0, 1.05, 2.9], fov: 35 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
    style={{ cursor: hovered ? "pointer" : "grab" }}>
    <ambientLight intensity={0.55} />
    <directionalLight position={[2, 3, 3]} intensity={1.1} />
    <directionalLight position={[-2, 1, -2]} intensity={0.4} color="#7dd3fc" />
    <HologramBody />
    {ORGAN_IDS.map((id) => (
      <Organ key={id} id={id} level={highlighted[id]?.level ?? (hovered === id ? "SELECTED" : null)}
        onSelect={onSelectOrgan} onHover={setHovered} />
    ))}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <ringGeometry args={[0.28, 0.3, 64]} />
      <meshBasicMaterial color="#5fd4c4" transparent opacity={0.35} />
    </mesh>
    <OrbitControls ref={controls} enablePan={false} minDistance={1.3} maxDistance={3.6} target={[0, 1.0, 0]}
      minPolarAngle={Math.PI * 0.2} maxPolarAngle={Math.PI * 0.75} autoRotate={!reducedMotion && !focus} autoRotateSpeed={0.6} />
    <CameraRig focus={focus} controls={controls} />
    <LabelProjector labels={labels} />
  </Canvas>
  <div className="organ-labels" aria-hidden="true">
    {ORGAN_IDS.map((id) => {
      const level = highlighted[id]?.level ?? (hovered === id ? "SELECTED" : null);
      return <span key={id} ref={(el) => { labels.current[id] = el; }}
        className={`organ-label organ-label-${(level ?? "none").toLowerCase()}${level ? "" : " hidden"}`}>{highlighted[id]?.label ?? ORGAN_NAMES[id]}</span>;
    })}
  </div>
  </div>;
}
