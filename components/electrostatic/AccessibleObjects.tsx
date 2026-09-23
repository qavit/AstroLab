"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { SourceCharge, Vec2 } from "../../lib/science/electrostatics/types.ts";
import type { CameraTransform } from "./viewport.ts";
import { screenToWorld, worldToScreen } from "./viewport.ts";
import type { SelectedObject } from "./render.ts";
import styles from "./ElectrostaticFieldLab.module.css";

export type DraggableObject =
  | { readonly kind: "source"; readonly id: string }
  | { readonly kind: "probe" }
  | { readonly kind: "particle" };

export interface ParticleHandle {
  /** The editable initial position, not the runtime position. */
  readonly initial: Vec2;
  readonly q_C: number;
  readonly mass_kg: number;
}

interface AccessibleObjectsProps {
  readonly camera: CameraTransform;
  readonly sources: readonly SourceCharge[];
  readonly probe: Vec2;
  readonly selected: SelectedObject;
  readonly onSelect: (target: SelectedObject) => void;
  readonly onMove: (target: DraggableObject, point: Vec2) => void;
  /** A pointer gesture begins on an object (sources and the particle pause playback). */
  readonly onDragStart: (target: DraggableObject) => void;
  readonly particle: ParticleHandle;
  readonly showProbe: boolean;
  readonly showParticle: boolean;
}

function labelSource(source: SourceCharge): string {
  const sign = source.q_C > 0 ? "正" : "負";
  return `${sign}源電荷，${Math.abs(source.q_C / 1e-9).toPrecision(3)} nC，水平位置 ${source.x_m.toFixed(2)} m，垂直位置 ${source.y_m.toFixed(2)} m`;
}

const PROBE = { kind: "probe" } as const;
const PARTICLE = { kind: "particle" } as const;

function labelParticle(particle: ParticleHandle): string {
  const sign = particle.q_C > 0 ? "正" : "負";
  return `${sign}測試電荷初始位置，${Math.abs(particle.q_C * 1e9).toPrecision(3)} nC，${(particle.mass_kg * 1e9).toPrecision(3)} µg，水平位置 ${particle.initial.x.toFixed(2)} m，垂直位置 ${particle.initial.y.toFixed(2)} m；移動會重新開始運動`;
}

export default function AccessibleObjects({ camera, sources, probe, selected, onSelect, onMove, onDragStart, particle, showProbe, showParticle }: AccessibleObjectsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const probePoint = worldToScreen(probe, camera);
  const particlePoint = worldToScreen(particle.initial, camera);

  const pointerDown = (target: DraggableObject) => (event: PointerEvent<SVGGElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(target);
    onDragStart(target);
  };

  const pointerMove = (target: DraggableObject, event: PointerEvent<SVGGElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    onMove(target, screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, camera));
  };

  const keyMove = (target: DraggableObject, current: Vec2) => (event: KeyboardEvent<SVGGElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    let next: Vec2 | null = null;
    if (event.key === "ArrowLeft") next = { x: current.x - step, y: current.y };
    if (event.key === "ArrowRight") next = { x: current.x + step, y: current.y };
    if (event.key === "ArrowUp") next = { x: current.x, y: current.y + step };
    if (event.key === "ArrowDown") next = { x: current.x, y: current.y - step };
    if (next) {
      event.preventDefault();
      onSelect(target);
      onMove(target, next);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(target);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onSelect(null);
    }
  };

  return (
    <svg
      ref={svgRef}
      className={styles.objectOverlay}
      viewBox={`0 0 ${camera.width} ${camera.height}`}
      aria-label="可操作的源電荷、測量點與測試電荷"
      aria-describedby="electrostatic-keyboard-help"
    >
      {sources.map((source) => {
        const point = worldToScreen({ x: source.x_m, y: source.y_m }, camera);
        const target = { kind: "source", id: source.id } as const;
        const active = selected?.kind === "source" && selected.id === source.id;
        return (
          <g
            key={source.id}
            role="button"
            tabIndex={0}
            aria-label={labelSource(source)}
            aria-pressed={active}
            data-testid={`source-handle-${source.id}`}
            className={styles.objectHandle}
            transform={`translate(${point.x} ${point.y})`}
            onPointerDown={pointerDown(target)}
            onPointerMove={(event) => pointerMove(target, event)}
            onKeyDown={keyMove(target, { x: source.x_m, y: source.y_m })}
          >
            <circle className={styles.hitTarget} r="23" />
            <circle className={active ? styles.focusRingActive : styles.focusRing} r="18" />
          </g>
        );
      })}
      {showProbe ? (
        <g
          role="button"
          tabIndex={0}
          aria-label={`測量點，水平位置 ${probe.x.toFixed(2)} m，垂直位置 ${probe.y.toFixed(2)} m`}
          aria-pressed={selected?.kind === "probe"}
          data-testid="probe-handle"
          className={styles.objectHandle}
          transform={`translate(${probePoint.x} ${probePoint.y})`}
          onPointerDown={pointerDown(PROBE)}
          onPointerMove={(event) => pointerMove(PROBE, event)}
          onKeyDown={keyMove(PROBE, probe)}
        >
          <circle className={styles.hitTarget} r="23" />
          <rect className={selected?.kind === "probe" ? styles.focusRingActive : styles.focusRing} x="-17" y="-17" width="34" height="34" rx="7" />
        </g>
      ) : null}
      {showParticle ? (
        <g
          role="button"
          tabIndex={0}
          aria-label={labelParticle(particle)}
          aria-pressed={selected?.kind === "particle"}
          data-testid="particle-handle"
          className={styles.objectHandle}
          transform={`translate(${particlePoint.x} ${particlePoint.y})`}
          onPointerDown={pointerDown(PARTICLE)}
          onPointerMove={(event) => pointerMove(PARTICLE, event)}
          onKeyDown={keyMove(PARTICLE, particle.initial)}
        >
          <circle className={styles.hitTarget} r="23" />
          <circle className={selected?.kind === "particle" ? styles.focusRingActive : styles.focusRing} r="15" strokeDasharray="4 3" />
        </g>
      ) : null}
    </svg>
  );
}
