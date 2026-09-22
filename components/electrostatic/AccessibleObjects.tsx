"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { SourceCharge, Vec2 } from "../../lib/science/electrostatics/types.ts";
import type { CameraTransform } from "./viewport.ts";
import { screenToWorld, worldToScreen } from "./viewport.ts";
import type { SelectedObject } from "./render.ts";
import styles from "./ElectrostaticFieldLab.module.css";

export type DraggableObject = { readonly kind: "source"; readonly id: string } | { readonly kind: "probe" };

interface AccessibleObjectsProps {
  readonly camera: CameraTransform;
  readonly sources: readonly SourceCharge[];
  readonly probe: Vec2;
  readonly selected: SelectedObject;
  readonly onSelect: (target: SelectedObject) => void;
  readonly onMove: (target: DraggableObject, point: Vec2) => void;
}

function labelSource(source: SourceCharge): string {
  const sign = source.q_C > 0 ? "正" : "負";
  return `來源電荷 ${source.id}，${sign} ${Math.abs(source.q_C / 1e-9).toPrecision(3)} nC，x ${source.x_m.toFixed(2)} m，y ${source.y_m.toFixed(2)} m`;
}

export default function AccessibleObjects({ camera, sources, probe, selected, onSelect, onMove }: AccessibleObjectsProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const pointerDown = (target: DraggableObject) => (event: PointerEvent<SVGGElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(target);
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
      aria-label="可操作的來源電荷與電場探針"
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
            <circle className={styles.hitTarget} r="22" />
            <circle className={active ? styles.focusRingActive : styles.focusRing} r="18" />
          </g>
        );
      })}
      {(() => {
        const point = worldToScreen(probe, camera);
        const target = { kind: "probe" } as const;
        const active = selected?.kind === "probe";
        return (
          <g
            role="button"
            tabIndex={0}
            aria-label={`電場探針，x ${probe.x.toFixed(2)} m，y ${probe.y.toFixed(2)} m`}
            aria-pressed={active}
            data-testid="probe-handle"
            className={styles.objectHandle}
            transform={`translate(${point.x} ${point.y})`}
            onPointerDown={pointerDown(target)}
            onPointerMove={(event) => pointerMove(target, event)}
            onKeyDown={keyMove(target, probe)}
          >
            <circle className={styles.hitTarget} r="22" />
            <rect className={active ? styles.focusRingActive : styles.focusRing} x="-17" y="-17" width="34" height="34" rx="7" />
          </g>
        );
      })()}
    </svg>
  );
}
