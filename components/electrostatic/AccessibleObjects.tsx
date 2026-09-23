"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import type { SourceCharge, Vec2 } from "../../lib/science/electrostatics/types.ts";
import type { CameraTransform } from "./viewport.ts";
import { screenToWorld, worldToScreen } from "./viewport.ts";
import type { SelectedObject } from "./render.ts";
import { formatCharge, sourceDisplayName } from "./labels.ts";
import type { ToolMode } from "./tools.ts";
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

/** What the hover/focus tooltip shows, in screen pixels within the overlay. */
export interface HoverInfo {
  readonly point: Vec2;
  readonly title: string;
  readonly detail: string;
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
  readonly tool: ToolMode;
  /** Add mode: a canvas point was chosen for a new source. */
  readonly onPlace: (point: Vec2) => void;
  /** Delete mode: an object was clicked; the lab decides whether it may be deleted. */
  readonly onDelete: (target: DraggableObject) => void;
  readonly onExitTool: () => void;
  readonly onHover: (info: HoverInfo | null) => void;
}

function labelSource(sources: readonly SourceCharge[], source: SourceCharge): string {
  return `${sourceDisplayName(sources, source.id)}，${formatCharge(source.q_C)}，水平位置 ${source.x_m.toFixed(2)} m，垂直位置 ${source.y_m.toFixed(2)} m；可選取或拖曳`;
}

const PROBE = { kind: "probe" } as const;
const PARTICLE = { kind: "particle" } as const;

const PROBE_HINT = "可拖曳，或選取後用方向鍵移動";

/** Pure: takes the resolved element rather than the ref, so it is callable only from handlers. */
function worldAt(svg: SVGSVGElement | null, clientX: number, clientY: number, camera: CameraTransform): Vec2 | null {
  const rect = svg?.getBoundingClientRect();
  if (!rect) return null;
  return screenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, camera);
}

function labelParticle(particle: ParticleHandle): string {
  const sign = particle.q_C > 0 ? "正" : "負";
  return `${sign}測試電荷初始位置，${Math.abs(particle.q_C * 1e9).toPrecision(3)} nC，${(particle.mass_kg * 1e9).toPrecision(3)} µg，水平位置 ${particle.initial.x.toFixed(2)} m，垂直位置 ${particle.initial.y.toFixed(2)} m；移動會重新開始運動`;
}

export default function AccessibleObjects(props: AccessibleObjectsProps) {
  const { camera, sources, probe, selected, onSelect, onMove, onDragStart, particle, showProbe, showParticle } = props;
  const { tool, onPlace, onDelete, onExitTool, onHover } = props;
  const probePoint = worldToScreen(probe, camera);
  const particlePoint = worldToScreen(particle.initial, camera);

  /**
   * One entry point for every pointer-down on the Canvas, so the active tool decides the
   * meaning in exactly one place: place a source, delete one, or select/begin a drag.
   * `target` is null for the backdrop.
   */
  const pointerDown = (target: DraggableObject | null) => (event: PointerEvent<SVGElement>) => {
    event.preventDefault();
    if (tool === "add-source") {
      const point = worldAt(event.currentTarget.ownerSVGElement, event.clientX, event.clientY, camera);
      if (point) onPlace(point);
      return;
    }
    if (tool === "delete-source") {
      if (target) onDelete(target);
      else onExitTool();
      return;
    }
    if (!target) {
      onSelect(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(target);
    onDragStart(target);
  };

  const pointerMove = (target: DraggableObject, event: PointerEvent<SVGGElement>) => {
    if (tool !== "select") return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = worldAt(event.currentTarget.ownerSVGElement, event.clientX, event.clientY, camera);
    if (point) onMove(target, point);
  };

  const keyMove = (target: DraggableObject, current: Vec2) => (event: KeyboardEvent<SVGGElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    let next: Vec2 | null = null;
    if (event.key === "ArrowLeft") next = { x: current.x - step, y: current.y };
    if (event.key === "ArrowRight") next = { x: current.x + step, y: current.y };
    if (event.key === "ArrowUp") next = { x: current.x, y: current.y + step };
    if (event.key === "ArrowDown") next = { x: current.x, y: current.y - step };
    if (next) {
      /* Keeps the arrow key from scrolling the page while a Canvas object owns focus. */
      event.preventDefault();
      onSelect(target);
      onMove(target, next);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (tool === "delete-source") onDelete(target);
      else onSelect(target);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (tool === "select") onSelect(null);
      else onExitTool();
    }
  };

  const hoverSource = (source: SourceCharge): HoverInfo => ({
    point: worldToScreen({ x: source.x_m, y: source.y_m }, camera),
    title: sourceDisplayName(sources, source.id),
    detail: formatCharge(source.q_C),
  });

  return (
    <svg
      className={styles.objectOverlay}
      viewBox={`0 0 ${camera.width} ${camera.height}`}
      aria-label="可操作的源電荷、測量點與測試電荷"
      aria-describedby="electrostatic-keyboard-help"
      data-tool={tool}
    >
      {/* Backdrop: clicking empty canvas clears the selection (or places, in add mode). It is
          first in document order so every object handle keeps priority over it. */}
      <rect
        className={styles.canvasBackdrop}
        x="0"
        y="0"
        width={camera.width}
        height={camera.height}
        data-testid="canvas-backdrop"
        onPointerDown={pointerDown(null)}
      />
      {sources.map((source) => {
        const point = worldToScreen({ x: source.x_m, y: source.y_m }, camera);
        const target = { kind: "source", id: source.id } as const;
        const active = selected?.kind === "source" && selected.id === source.id;
        return (
          <g
            key={source.id}
            role="button"
            tabIndex={0}
            aria-label={labelSource(sources, source)}
            aria-pressed={active}
            data-canvas-object="true"
            data-testid={`source-handle-${source.id}`}
            className={styles.objectHandle}
            transform={`translate(${point.x} ${point.y})`}
            onPointerDown={pointerDown(target)}
            onPointerMove={(event) => pointerMove(target, event)}
            onKeyDown={keyMove(target, { x: source.x_m, y: source.y_m })}
            onPointerEnter={() => onHover(hoverSource(source))}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(hoverSource(source))}
            onBlur={() => onHover(null)}
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
          aria-label={`測量點，水平位置 ${probe.x.toFixed(2)} m，垂直位置 ${probe.y.toFixed(2)} m；${PROBE_HINT}`}
          aria-pressed={selected?.kind === "probe"}
          data-canvas-object="true"
          data-testid="probe-handle"
          className={styles.objectHandle}
          transform={`translate(${probePoint.x} ${probePoint.y})`}
          onPointerDown={pointerDown(PROBE)}
          onPointerMove={(event) => pointerMove(PROBE, event)}
          onKeyDown={keyMove(PROBE, probe)}
          onPointerEnter={() => onHover({ point: probePoint, title: "測量點", detail: PROBE_HINT })}
          onPointerLeave={() => onHover(null)}
          onFocus={() => onHover({ point: probePoint, title: "測量點", detail: PROBE_HINT })}
          onBlur={() => onHover(null)}
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
          data-canvas-object="true"
          data-testid="particle-handle"
          className={styles.objectHandle}
          transform={`translate(${particlePoint.x} ${particlePoint.y})`}
          onPointerDown={pointerDown(PARTICLE)}
          onPointerMove={(event) => pointerMove(PARTICLE, event)}
          onKeyDown={keyMove(PARTICLE, particle.initial)}
          onPointerEnter={() => onHover({ point: particlePoint, title: "測試電荷起點", detail: PROBE_HINT })}
          onPointerLeave={() => onHover(null)}
          onFocus={() => onHover({ point: particlePoint, title: "測試電荷起點", detail: PROBE_HINT })}
          onBlur={() => onHover(null)}
        >
          <circle className={styles.hitTarget} r="23" />
          <circle className={selected?.kind === "particle" ? styles.focusRingActive : styles.focusRing} r="15" strokeDasharray="4 3" />
        </g>
      ) : null}
    </svg>
  );
}
