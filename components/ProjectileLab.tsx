"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Compass,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import TheoryNotes from "@/components/projectile/TheoryNotes";
import type { TrajectorySample, Vec2 } from "@/lib/science/projectile";
import { DRAG_PRESETS, GRAVITY_PRESETS } from "@/lib/science/projectile";
import {
  PROJECTILE_PRESETS,
  SCENARIO_DEFAULTS,
  SPEED_RANGE,
  deriveCursor,
  deriveProjectileModel,
  initialProjectileState,
  type CursorReadout,
  type ProjectileReadout,
  type ProjectileState,
} from "@/models/projectile";

type Pad = { left: number; right: number; top: number; bottom: number };

/**
 * The chart's own geometry, chosen by available width rather than scaled to it.
 *
 * An SVG scaled from a 1140-unit viewBox into a 366-pixel phone shrinks every tick label to a
 * third of its size along with the drawing, which is exactly the illegibility a larger type scale
 * was meant to fix. So a narrow screen gets a shorter, squarer frame with its own type sizes
 * instead of the wide one photographically reduced.
 */
type Geometry = {
  w: number;
  h: number;
  pad: Pad;
  tick: number;
  title: number;
  note: number;
  tip: { w: number; row: number; font: number };
};

/**
 * The chart's viewBox is set to the host element's pixel size, so one viewBox unit is one CSS
 * pixel and the font sizes below are literal pixels at every width. Scaling a fixed viewBox
 * instead would shrink every tick label along with the drawing — on a phone, to a third of its
 * size. Measuring also means the plot re-lays-out when the side panel opens, rather than being
 * covered by it.
 */
function chartGeometry(width: number, height: number): Geometry {
  const w = Math.max(320, width || 1140);
  const h = Math.max(220, height || 560);
  /* Below the stylesheet's own breakpoint the card's label and legend sit in normal flow above
   * and below the chart, so the padding no longer has to clear them. */
  const compact = w < 660;
  return {
    w,
    h,
    pad: compact ? { left: 50, right: 18, top: 24, bottom: 50 } : { left: 70, right: 30, top: 58, bottom: 74 },
    tick: compact ? 11 : 13,
    title: compact ? 12 : 14,
    note: compact ? 11 : 13,
    tip: { w: compact ? 152 : 172, row: compact ? 16 : 18, font: compact ? 11 : 12 },
  };
}

/** Tracks an element's rendered size, so the chart can be drawn at exactly the size it occupies. */
function useElementSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const MINI_W = 372;
const MINI_H = 232;
const MINI_PAD = { left: 60, right: 18, top: 20, bottom: 44 };

/** One transport step, in seconds. Fixed rather than a fraction of the flight so the button
 * means the same thing whether the throw lasts half a second or six. */
const STEP_SECONDS = 0.05;

/*
 * Five colours, each standing for a kind of thing rather than for an individual line:
 * this flight, a flight drawn for comparison, a bound that is not a flight, the velocity
 * family, and the acceleration family. Within a family the resultant is solid and its
 * components are the same colour dashed, so a component is never mistaken for a new quantity.
 */
const PATH = "#5ed8c3";
const COMPARE = "#f2c66d";
const BOUND = "#7d90b4";
const VELOCITY = "#eaf4f8";
const ACCEL = "#ef8f6a";
const GRID = "#22485f";
const AXIS = "#3d6482";
const STAIR = "#6f9cba";
const LABEL = "#9fc2d3";

/** Round-number ticks (1/2/5 × 10ⁿ) spanning the domain. */
function niceTicks(min: number, max: number, targetCount = 5) {
  if (!(max > min)) return [min];
  const rough = (max - min) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(Number(v.toFixed(decimals)));
  return ticks.length > 0 ? ticks : [min, max];
}

/* Coarse enough that most parameter changes resolve to the same axis limit and move nothing,
 * fine enough that the flight still fills the frame. A pure 1/2/5 ladder would send a 59 m throw
 * to a 100 m axis and leave the picture 40% empty. */
const SNAP_STEPS = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10];

/** Rounds an extent up to the next step on that ladder. */
function snapUp(value: number) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const residual = value / magnitude;
  return (SNAP_STEPS.find((step) => residual <= step + 1e-9) ?? 10) * magnitude;
}

type Domain = { xMin: number; xMax: number; yMin: number; yMax: number };

/**
 * How much emptiness an axis may be padded with to make the two axes share one scale. A trajectory
 * drawn on stretched axes is no longer the shape the projectile actually flew, so equal scale is
 * never given up — but past this factor the *frame* yields instead of the domain, because an axis
 * running to 130 m for a 61 m flight misreports the flight rather than framing it.
 */
const MAX_AXIS_PADDING = 1.4;

type Fitted = { domain: Domain; plotW: number; plotH: number };

/** Reconciles the data's proportions with the frame's, at equal scale on both axes. */
function fitEqualAspect(domain: Domain, availW: number, availH: number, growY: "up" | "down"): Fitted {
  const xRange = Math.max(1e-6, domain.xMax - domain.xMin);
  const yRange = Math.max(1e-6, domain.yMax - domain.yMin);
  const frameAspect = availW / availH;
  const dataAspect = xRange / yRange;

  if (dataAspect < frameAspect) {
    const growth = frameAspect / dataAspect;
    if (growth <= MAX_AXIS_PADDING) {
      return { domain: { ...domain, xMax: domain.xMin + yRange * frameAspect }, plotW: availW, plotH: availH };
    }
    const grown = xRange * MAX_AXIS_PADDING;
    return { domain: { ...domain, xMax: domain.xMin + grown }, plotW: availH * (grown / yRange), plotH: availH };
  }

  const growth = dataAspect / frameAspect;
  const grow = (range: number): Domain =>
    growY === "up" ? { ...domain, yMax: domain.yMin + range } : { ...domain, yMin: domain.yMax - range };
  if (growth <= MAX_AXIS_PADDING) {
    return { domain: grow(xRange / frameAspect), plotW: availW, plotH: availH };
  }
  const grown = yRange * MAX_AXIS_PADDING;
  return { domain: grow(grown), plotW: availW, plotH: availW * (grown / xRange) };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpDomain = (a: Domain, b: Domain, t: number): Domain => ({
  xMin: lerp(a.xMin, b.xMin, t),
  xMax: lerp(a.xMax, b.xMax, t),
  yMin: lerp(a.yMin, b.yMin, t),
  yMax: lerp(a.yMax, b.yMax, t),
});

/** Whether the drawn frame no longer suits the data: either the flight has grown out of it, or it
 * has shrunk far enough inside it that the picture has become mostly empty. */
function needsRescale(shown: Domain, target: Domain) {
  const grew =
    target.xMax > shown.xMax * 1.001 || target.yMax > shown.yMax * 1.001 || target.yMin < shown.yMin * 1.001 - 1e-9;
  const shrank =
    target.xMax < shown.xMax * 0.55 ||
    (target.yMax - target.yMin) < (shown.yMax - shown.yMin) * 0.55;
  return grew || shrank;
}

/**
 * Holds the axes still through small parameter changes, and slides them when they really must
 * move. Rescaling on every keystroke made a preset look like it had only changed the axis labels,
 * hiding the fact that the whole trajectory had changed with them; a frame that mostly stays put,
 * and visibly glides when it doesn't, keeps the curve as the thing that moved.
 */
function useSettledDomain(target: Domain): Domain {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!needsRescale(shownRef.current, target)) return;
    const from = shownRef.current;
    const start = performance.now();
    const tick = () => {
      const progress = Math.min(1, (performance.now() - start) / 320);
      const eased = progress * progress * (3 - 2 * progress);
      const next = lerpDomain(from, target, eased);
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return shown;
}

type Frame = {
  domain: Domain;
  px: (x: number) => number;
  py: (y: number) => number;
  plot: { left: number; right: number; top: number; bottom: number };
};

function frameFromRect(domain: Domain, plot: Frame["plot"]): Frame {
  const w = plot.right - plot.left;
  const h = plot.bottom - plot.top;
  return {
    domain,
    plot,
    px: (x) => plot.left + ((x - domain.xMin) / (domain.xMax - domain.xMin || 1)) * w,
    py: (y) => plot.bottom - ((y - domain.yMin) / (domain.yMax - domain.yMin || 1)) * h,
  };
}

/** Places a plot rectangle of the given size, centred inside the padded area. */
function centredFrame(domain: Domain, width: number, height: number, pad: Pad, plotW: number, plotH: number): Frame {
  const left = pad.left + (width - pad.left - pad.right - plotW) / 2;
  const top = pad.top + (height - pad.top - pad.bottom - plotH) / 2;
  return frameFromRect(domain, { left, right: left + plotW, top, bottom: top + plotH });
}

const pathFrom = (points: readonly Vec2[], frame: Frame) =>
  points.map((p, index) => `${index === 0 ? "M" : "L"}${frame.px(p.x).toFixed(2)} ${frame.py(p.y).toFixed(2)}`).join(" ");

const samplePath = (samples: readonly TrajectorySample[], frame: Frame) =>
  pathFrom(samples.map((sample) => sample.point), frame);

/**
 * Where a comparison path is on the shared clock; it parks at its landing point once it is down
 * rather than disappearing.
 *
 * Interpolates between the two bracketing samples instead of snapping to the earlier one. Paths
 * are sampled at different resolutions, so snapping left each comparison marker up to one sample
 * interval behind the truth — visible as a comparison ball trailing the main one even along a
 * trajectory the two share exactly.
 */
function sampleAt(samples: readonly TrajectorySample[], t: number): TrajectorySample | null {
  if (samples.length === 0) return null;
  const last = samples[samples.length - 1];
  if (t >= last.t) return last;
  if (t <= samples[0].t) return samples[0];
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].t <= t) low = mid;
    else high = mid;
  }
  const before = samples[low];
  const after = samples[high];
  const span = after.t - before.t;
  const fraction = span > 1e-12 ? (t - before.t) / span : 0;
  return {
    t,
    point: { x: lerp(before.point.x, after.point.x, fraction), y: lerp(before.point.y, after.point.y, fraction) },
    velocity: { x: lerp(before.velocity.x, after.velocity.x, fraction), y: lerp(before.velocity.y, after.velocity.y, fraction) },
  };
}

/** A straight arrow with a solid head, in screen coordinates. */
function Arrow({ x1, y1, x2, y2, color, width = 2, dash }: {
  x1: number; y1: number; x2: number; y2: number; color: string; width?: number; dash?: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 5) return null;
  const head = Math.min(10, length * 0.4);
  const ux = dx / length;
  const uy = dy / length;
  const baseX = x2 - ux * head;
  const baseY = y2 - uy * head;
  return (
    <g>
      <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={color} strokeWidth={width} strokeDasharray={dash} />
      <polygon
        points={`${x2},${y2} ${baseX - uy * head * 0.4},${baseY + ux * head * 0.4} ${baseX + uy * head * 0.4},${baseY - ux * head * 0.4}`}
        fill={color}
      />
    </g>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Main view: the trajectory itself
 * ------------------------------------------------------------------------------------------ */

type Probe = { t: number; point: Vec2; velocity: Vec2; speed: number; angle: number };

function TrajectoryView({ state, model, cursor, geometry, onScrubTo }: {
  state: ProjectileState;
  model: ProjectileReadout;
  cursor: CursorReadout;
  geometry: Geometry;
  onScrubTo: (t: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const isStairs = state.scenario === "staircase";
  const { stairs } = state;

  /* The complementary comparison can arc well above the main flight — a steep launch angle
   * paired against a shallow one — so its own extent has to be counted, not just the main
   * trajectory's, or the comparison the layer exists to show gets clipped off the top. */
  const complementaryMaxY = model.complementary
    ? Math.max(...model.complementary.samples.map((sample) => sample.point.y))
    : 0;

  /* Axis limits are snapped to round extents before anything else sees them, so a nudge to the
   * launch speed usually resolves to the very same frame and the axes do not twitch. */
  const target = useMemo<Domain>(() => {
    if (isStairs) {
      const steps = (model.landing?.step ?? stairs.count) + 1.5;
      return {
        xMin: 0,
        xMax: snapUp(Math.max(stairs.width * steps, stairs.width * 3)),
        yMin: -snapUp(stairs.rise * steps),
        yMax: snapUp(Math.max(model.apex.point.y, stairs.rise)),
      };
    }
    return {
      xMin: 0,
      xMax: snapUp(Math.max(
        model.groundRange,
        model.maxRange && model.envelope.length > 0 ? model.maxRange : 0,
        model.dragLanding?.point.x ?? 0,
        model.complementary?.range ?? 0,
        1,
      )),
      yMin: 0,
      yMax: snapUp(Math.max(model.apex.point.y, model.envelope[0]?.y ?? 0, state.height, complementaryMaxY, 1)),
    };
  }, [isStairs, stairs.count, stairs.rise, stairs.width, model.landing?.step, model.apex.point.y, model.groundRange, model.maxRange, model.envelope, model.dragLanding?.point.x, model.complementary?.range, complementaryMaxY, state.height]);

  const settled = useSettledDomain(target);
  const fitted = fitEqualAspect(
    settled,
    geometry.w - geometry.pad.left - geometry.pad.right,
    geometry.h - geometry.pad.top - geometry.pad.bottom,
    isStairs ? "down" : "up",
  );
  const domain = fitted.domain;
  const frame = centredFrame(domain, geometry.w, geometry.h, geometry.pad, fitted.plotW, fitted.plotH);
  const { plot } = frame;

  /* Follows the axis inboard when the plot is centred, but never off the left edge. */
  const yTitleX = Math.max(14, plot.left - 46);

  const xTicks = niceTicks(domain.xMin, domain.xMax, 9);
  const yTicks = niceTicks(domain.yMin, domain.yMax, 5);

  /* One scale for the velocity family and one for the acceleration family, so arrows stay
   * comparable to themselves as the parameters change. */
  const span = domain.xMax - domain.xMin;
  const velocityScale = state.speed > 0 ? (0.15 * span) / state.speed : 0;
  const accelScale = state.gravity > 0 ? (0.1 * span) / state.gravity : 0;

  const cx = frame.px(cursor.point.x);
  const cy = frame.py(cursor.point.y);
  const tipOf = (dx: number, dy: number, scale: number) => ({
    x: frame.px(cursor.point.x + dx * scale),
    y: frame.py(cursor.point.y + dy * scale),
  });

  const speed = cursor.acceleration.speed;
  const unit = speed > 1e-6 ? { x: cursor.velocity.x / speed, y: cursor.velocity.y / speed } : { x: 1, y: 0 };
  const sign = cursor.velocity.x >= 0 ? 1 : -1;
  const normalDir = { x: (sign * cursor.velocity.y) / (speed || 1), y: (-sign * cursor.velocity.x) / (speed || 1) };

  const tipV = tipOf(cursor.velocity.x, cursor.velocity.y, velocityScale);
  const tipVx = tipOf(cursor.velocity.x, 0, velocityScale);
  const tipVy = tipOf(0, cursor.velocity.y, velocityScale);
  const tipG = tipOf(0, -state.gravity, accelScale);
  const tipAt = tipOf(unit.x * cursor.acceleration.tangential, unit.y * cursor.acceleration.tangential, accelScale);
  const tipAn = tipOf(normalDir.x * cursor.acceleration.normal, normalDir.y * cursor.acceleration.normal, accelScale);

  const radius = cursor.acceleration.radiusOfCurvature;
  const showCircle = state.showAcceleration && Number.isFinite(radius) && radius < span * 2.2 && model.duration > 0;
  const centre = { x: cursor.point.x + normalDir.x * radius, y: cursor.point.y + normalDir.y * radius };

  const companion = model.complementary ? sampleAt(model.complementary.samples, cursor.clockTime) : null;
  const dragMarker = model.dragSamples.length > 0 ? sampleAt(model.dragSamples, cursor.clockTime) : null;

  const stairPoints: Vec2[] = [];
  for (let step = 0; step <= stairs.count; step += 1) {
    stairPoints.push({ x: step * stairs.width, y: -step * stairs.rise });
    stairPoints.push({ x: step * stairs.width, y: -(step + 1) * stairs.rise });
  }

  /* Hovering reads the flight out without disturbing it; a click moves the time cursor there.
   * Nearest-in-screen-space rather than nearest-in-x, so a steep or vertical launch still probes. */
  const localPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const origin = svg.createSVGPoint();
    origin.x = event.clientX;
    origin.y = event.clientY;
    return origin.matrixTransform(matrix.inverse());
  };

  const nearestSample = (event: ReactPointerEvent<SVGSVGElement>) => {
    const local = localPoint(event);
    if (!local || model.trajectory.length === 0) return null;
    let best = model.trajectory[0];
    let bestDistance = Infinity;
    for (const sample of model.trajectory) {
      const distance = (frame.px(sample.point.x) - local.x) ** 2 + (frame.py(sample.point.y) - local.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = sample;
      }
    }
    return bestDistance <= 90 ** 2 ? best : null;
  };

  const handleMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const sample = nearestSample(event);
    if (!sample) {
      setProbe(null);
      return;
    }
    const magnitude = Math.hypot(sample.velocity.x, sample.velocity.y);
    setProbe({
      t: sample.t,
      point: sample.point,
      velocity: sample.velocity,
      speed: magnitude,
      angle: (Math.atan2(sample.velocity.y, sample.velocity.x) * 180) / Math.PI,
    });
  };

  const tooltipRows = probe
    ? [
        ["t", `${probe.t.toFixed(2)} s`],
        ["x", `${probe.point.x.toFixed(2)} m`],
        ["y", `${probe.point.y.toFixed(2)} m`],
        ["v", `${probe.speed.toFixed(2)} m/s`],
        ["vₓ", `${probe.velocity.x.toFixed(2)} m/s`],
        ["v_y", `${probe.velocity.y.toFixed(2)} m/s`],
        ["路徑傾角", `${probe.angle.toFixed(1)}°`],
      ]
    : [];
  const tipW = geometry.tip.w;
  const tipH = tooltipRows.length * geometry.tip.row + geometry.tip.row - 3;
  const probeX = probe ? frame.px(probe.point.x) : 0;
  const probeY = probe ? frame.py(probe.point.y) : 0;
  const tipX = probeX + tipW + 20 > plot.right ? probeX - tipW - 14 : probeX + 14;
  const tipY = Math.min(Math.max(plot.top, probeY - tipH / 2), plot.bottom - tipH);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${geometry.w} ${geometry.h}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="拋體運動軌跡圖"
      style={{ cursor: probe ? "crosshair" : "default" }}
      onPointerMove={handleMove}
      onPointerLeave={() => setProbe(null)}
      onClick={() => probe && onScrubTo(probe.t)}
    >
      <defs>
        {/* The osculating circle and the envelope fan can both run far outside the framed
            region; clipping keeps them from being read as part of the flight. */}
        <clipPath id="projectile-plot-clip">
          <rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} />
        </clipPath>
      </defs>

      {xTicks.map((tick) => (
        <line key={`gx${tick}`} x1={frame.px(tick)} y1={plot.top} x2={frame.px(tick)} y2={plot.bottom} stroke={GRID} strokeWidth={1} />
      ))}
      {yTicks.map((tick) => (
        <line key={`gy${tick}`} x1={plot.left} y1={frame.py(tick)} x2={plot.right} y2={frame.py(tick)} stroke={GRID} strokeWidth={1} />
      ))}

      {isStairs ? (
        <g clipPath="url(#projectile-plot-clip)">
          <path d={pathFrom(stairPoints, frame)} fill="none" stroke={STAIR} strokeWidth={2.2} />
        </g>
      ) : (
        <line x1={plot.left} y1={frame.py(0)} x2={plot.right} y2={frame.py(0)} stroke={AXIS} strokeWidth={2} />
      )}
      <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} stroke={AXIS} strokeWidth={1.4} />

      {xTicks.map((tick) => (
        <text key={`tx${tick}`} x={frame.px(tick)} y={plot.bottom + geometry.tick + 7} textAnchor="middle" fill={LABEL} fontSize={geometry.tick}>{tick}</text>
      ))}
      {yTicks.map((tick) => (
        <text key={`ty${tick}`} x={plot.left - 9} y={frame.py(tick) + 5} textAnchor="end" fill={LABEL} fontSize={geometry.tick}>{tick}</text>
      ))}
      <text x={plot.right} y={plot.bottom + geometry.tick + 7 + geometry.title + 10} textAnchor="end" fill={LABEL} fontSize={geometry.title}>水平距離 x (m)</text>
      <text
        x={yTitleX}
        y={(plot.top + plot.bottom) / 2}
        textAnchor="middle"
        fill={LABEL}
        fontSize={geometry.title}
        transform={`rotate(-90 ${yTitleX} ${(plot.top + plot.bottom) / 2})`}
      >高度 y (m)</text>

      <g clipPath="url(#projectile-plot-clip)">
        {model.envelope.length > 0 && (
          <>
            {model.envelopeFan.map((fan) => (
              <path key={fan.angle} d={samplePath(fan.samples, frame)} fill="none" stroke={BOUND} strokeWidth={1.1} opacity={0.5} />
            ))}
            <path d={pathFrom(model.envelope, frame)} fill="none" stroke={BOUND} strokeWidth={2.2} strokeDasharray="7 4" />
            <text x={frame.px(model.envelope[0]?.x ?? 0) + 10} y={frame.py(model.envelope[0]?.y ?? 0) + 16} fill={BOUND} fontSize={geometry.note}>
              安全拋物線（此速度的可及邊界）
            </text>
          </>
        )}

        {model.complementary && (
          <>
            <path d={samplePath(model.complementary.samples, frame)} fill="none" stroke={COMPARE} strokeWidth={2.2} />
            <circle cx={frame.px(model.complementary.range)} cy={frame.py(0)} r={5} fill="none" stroke={COMPARE} strokeWidth={2} />
          </>
        )}

        {model.dragSamples.length > 0 && (
          <>
            <path d={samplePath(model.dragSamples, frame)} fill="none" stroke={COMPARE} strokeWidth={2.2} strokeDasharray="3 4" />
            <circle cx={frame.px(model.dragLanding?.point.x ?? 0)} cy={frame.py(0)} r={4.5} fill="none" stroke={COMPARE} strokeWidth={2} />
          </>
        )}

        {model.duration > 0 && (
          <path d={samplePath(model.trajectory, frame)} fill="none" stroke={PATH} strokeWidth={3} strokeLinecap="round" />
        )}

        {!isStairs && model.apex.t > 0 && (
          <>
            <line x1={frame.px(model.apex.point.x)} y1={frame.py(model.apex.point.y)} x2={frame.px(model.apex.point.x)} y2={frame.py(0)} stroke={PATH} strokeWidth={1} strokeDasharray="3 4" opacity={0.5} />
            <text x={frame.px(model.apex.point.x)} y={frame.py(model.apex.point.y) - 10} textAnchor="middle" fill={PATH} fontSize={geometry.note}>
              最高點 {model.apex.point.y.toFixed(1)} m
            </text>
          </>
        )}

        {isStairs && model.landing && (
          <>
            <circle cx={frame.px(model.landing.point.x)} cy={frame.py(model.landing.point.y)} r={6} fill="none" stroke={COMPARE} strokeWidth={2.4} />
            <text x={frame.px(model.landing.point.x) + 11} y={frame.py(model.landing.point.y) + 15} fill={COMPARE} fontSize={geometry.note + 1} fontWeight={700}>
              落在第 {model.landing.step} 階
            </text>
          </>
        )}

        {showCircle && (
          <circle cx={frame.px(centre.x)} cy={frame.py(centre.y)} r={Math.abs(frame.px(radius) - frame.px(0))} fill="none" stroke={ACCEL} strokeWidth={1} strokeDasharray="2 6" opacity={0.42} />
        )}

        {/* Comparison launches leave with the main one and are drawn on the same clock, so the
            complementary ball can be watched arriving late at the same landing point. */}
        {companion && <circle cx={frame.px(companion.point.x)} cy={frame.py(companion.point.y)} r={5} fill={COMPARE} />}
        {dragMarker && <circle cx={frame.px(dragMarker.point.x)} cy={frame.py(dragMarker.point.y)} r={4.5} fill={COMPARE} opacity={0.75} />}

        {model.duration > 0 && (
          <>
            <Arrow x1={cx} y1={cy} x2={tipVx.x} y2={tipVx.y} color={VELOCITY} width={1.5} dash="5 4" />
            <Arrow x1={cx} y1={cy} x2={tipVy.x} y2={tipVy.y} color={VELOCITY} width={1.5} dash="5 4" />
            <Arrow x1={cx} y1={cy} x2={tipV.x} y2={tipV.y} color={VELOCITY} width={2.6} />
            {state.showAcceleration && (
              <>
                <Arrow x1={cx} y1={cy} x2={tipAt.x} y2={tipAt.y} color={ACCEL} width={1.5} dash="5 4" />
                <Arrow x1={cx} y1={cy} x2={tipAn.x} y2={tipAn.y} color={ACCEL} width={1.5} dash="5 4" />
                <Arrow x1={cx} y1={cy} x2={tipG.x} y2={tipG.y} color={ACCEL} width={2.6} />
              </>
            )}
            <circle cx={cx} cy={cy} r={5} fill={cursor.airborne ? PATH : "#7a909b"} stroke="#0a2132" strokeWidth={1.5} />
          </>
        )}

        {probe && (
          <>
            <line x1={probeX} y1={plot.top} x2={probeX} y2={plot.bottom} stroke={LABEL} strokeWidth={1} opacity={0.3} />
            <circle cx={probeX} cy={probeY} r={4} fill="none" stroke={LABEL} strokeWidth={1.6} />
          </>
        )}
      </g>

      {probe && (
        <g pointerEvents="none">
          <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={5} fill="rgba(5,22,34,.93)" stroke="rgba(159,194,211,.35)" />
          {tooltipRows.map(([name, value], index) => (
            <g key={name}>
              <text x={tipX + 12} y={tipY + geometry.tip.row + 4 + index * geometry.tip.row} fill={LABEL} fontSize={geometry.tip.font}>{name}</text>
              <text x={tipX + tipW - 12} y={tipY + geometry.tip.row + 4 + index * geometry.tip.row} textAnchor="end" fill="#e6f1f6" fontSize={geometry.tip.font}>{value}</text>
            </g>
          ))}
        </g>
      )}

      {model.duration <= 0 && (
        <text x={geometry.w / 2} y={geometry.h / 2} textAnchor="middle" fill={COMPARE} fontSize={geometry.note + 2}>此設定下沒有飛行（重力為零或未離開地面）</text>
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Companion view: the components against time
 *
 * These three charts are the model's actual claim. x–t is straight, y–t is a parabola, and the
 * two velocity components are a flat line and a sloped one — the independence of horizontal and
 * vertical motion is not asserted in prose anywhere, it is just visible here. They are collapsed
 * by default because they are corroboration, not the thing being looked at.
 * ------------------------------------------------------------------------------------------ */

type Series = { label: string; color: string; dash?: string; points: Vec2[] };

function MiniChart({ title, note, series, duration, cursorT, yLabel }: {
  title: string;
  note: string;
  series: Series[];
  duration: number;
  cursorT: number;
  yLabel: string;
}) {
  const values = series.flatMap((line) => line.points.map((point) => point.y));
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(...values, rawMin + 1e-6);
  const padding = (rawMax - rawMin) * 0.12 || 1;
  const frame = frameFromRect(
    { xMin: 0, xMax: Math.max(duration, 1e-6), yMin: rawMin - padding, yMax: rawMax + padding },
    { left: MINI_PAD.left, right: MINI_W - MINI_PAD.right, top: MINI_PAD.top, bottom: MINI_H - MINI_PAD.bottom },
  );
  const { plot } = frame;
  const yTicks = niceTicks(frame.domain.yMin, frame.domain.yMax, 4);
  const xTicks = niceTicks(0, Math.max(duration, 1e-6), 5);
  const cursorX = frame.px(Math.min(cursorT, duration));

  return (
    <div className="projectile-mini">
      <div className="projectile-mini-head"><strong>{title}</strong><small>{note}</small></div>
      <svg viewBox={`0 0 ${MINI_W} ${MINI_H}`} width="100%" height="100%" role="img" aria-label={title}>
        {yTicks.map((tick) => (
          <line key={tick} x1={plot.left} y1={frame.py(tick)} x2={plot.right} y2={frame.py(tick)} stroke={GRID} strokeWidth={1} />
        ))}
        {yTicks.map((tick) => (
          <text key={`l${tick}`} x={plot.left - 7} y={frame.py(tick) + 5} textAnchor="end" fill={LABEL} fontSize={12}>{tick}</text>
        ))}
        {xTicks.map((tick) => (
          <text key={`x${tick}`} x={frame.px(tick)} y={plot.bottom + 19} textAnchor="middle" fill={LABEL} fontSize={12}>{tick}</text>
        ))}
        {frame.domain.yMin < 0 && frame.domain.yMax > 0 && (
          <line x1={plot.left} y1={frame.py(0)} x2={plot.right} y2={frame.py(0)} stroke={AXIS} strokeWidth={1.4} />
        )}
        <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} stroke={AXIS} strokeWidth={1.2} />
        <text x={plot.left - 7} y={plot.top - 7} textAnchor="end" fill={LABEL} fontSize={12}>{yLabel}</text>
        <text x={plot.right} y={plot.bottom + 36} textAnchor="end" fill={LABEL} fontSize={12}>t (s)</text>

        {series.map((line) => (
          <path key={line.label} d={pathFrom(line.points, frame)} fill="none" stroke={line.color} strokeWidth={2.2} strokeDasharray={line.dash} />
        ))}

        {duration > 0 && (
          <>
            <line x1={cursorX} y1={plot.top} x2={cursorX} y2={plot.bottom} stroke="#e6f1f6" strokeWidth={1} opacity={0.4} />
            {series.map((line) => {
              const index = Math.min(line.points.length - 1, Math.round((cursorT / duration) * (line.points.length - 1)));
              const point = line.points[Math.max(0, index)];
              return point ? <circle key={`d${line.label}`} cx={cursorX} cy={frame.py(point.y)} r={3.6} fill={line.color} /> : null;
            })}
          </>
        )}
      </svg>
    </div>
  );
}

/** The three time series the companion charts draw, all read off the same trajectory sampling. */
function componentSeries(model: ProjectileReadout) {
  const { trajectory, duration } = model;
  return {
    duration,
    horizontal: [{ label: "x", color: PATH, points: trajectory.map((s) => ({ x: s.t, y: s.point.x })) }] as Series[],
    vertical: [{ label: "y", color: PATH, points: trajectory.map((s) => ({ x: s.t, y: s.point.y })) }] as Series[],
    velocity: [
      { label: "vx", color: VELOCITY, dash: "6 4", points: trajectory.map((s) => ({ x: s.t, y: s.velocity.x })) },
      { label: "vy", color: VELOCITY, points: trajectory.map((s) => ({ x: s.t, y: s.velocity.y })) },
    ] as Series[],
  };
}

/* ---------------------------------------------------------------------------------------------
 * Lab
 * ------------------------------------------------------------------------------------------ */

function formatMetres(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(2)} m`;
}

/** A header button that opens a short list of choices. Scenario and preset are one-shot pickers
 * rather than settings to keep on screen, so they live behind a menu instead of in the panel. */
function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="projectile-menu" ref={ref}>
      <button className={open ? "active" : ""} onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        {label} <ChevronDown size={13} />
      </button>
      {open && <div className="projectile-menu-list" role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

/**
 * The theory notes as a centred overlay rather than a separate destination. Reading a formula is
 * something you do *while* looking at the model, so leaving the page would lose the state the
 * question came from; the same notes remain linkable at /projectile/notes.
 */
function TheoryOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    /* The page behind must not scroll while the overlay owns the screen. */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="theory-backdrop" onClick={onClose}>
      <div
        className="theory-panel"
        role="dialog"
        aria-modal="true"
        aria-label="拋體運動的理論與計算"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="theory-close" onClick={onClose} aria-label="關閉"><X size={16} /></button>
        <div className="theory-scroll"><TheoryNotes /></div>
      </div>
    </div>
  );
}

export default function ProjectileLab() {
  const [state, setState] = useState<ProjectileState>(initialProjectileState);
  const [cursorFraction, setCursorFraction] = useState(0.45);
  const [showComponents, setShowComponents] = useState(false);
  const [showEnvironment, setShowEnvironment] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [theoryOpen, setTheoryOpen] = useState(false);

  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartSize = useElementSize(chartHostRef);
  const geometry = useMemo(() => chartGeometry(chartSize.width, chartSize.height), [chartSize.width, chartSize.height]);

  const model = useMemo(() => deriveProjectileModel(state), [state]);
  const cursor = useMemo(() => deriveCursor(model, state.gravity, cursorFraction), [model, state.gravity, cursorFraction]);
  const charts = useMemo(() => componentSeries(model), [model]);

  const patchState = useCallback((patch: Partial<ProjectileState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  /* The cursor is animated outside the model so a moving marker never re-samples the flight or
   * re-runs the drag integration. */
  const clockRef = useRef(model.clockDuration);
  const speedRef = useRef(state.animationSpeed);
  const directionRef = useRef(state.direction);
  useEffect(() => { clockRef.current = model.clockDuration; }, [model.clockDuration]);
  useEffect(() => { speedRef.current = state.animationSpeed; }, [state.animationSpeed]);
  useEffect(() => { directionRef.current = state.direction; }, [state.direction]);

  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const clock = clockRef.current;
      if (clock > 0) {
        const advance = (dt * speedRef.current * directionRef.current) / clock;
        setCursorFraction((value) => (value + advance + 1) % 1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.playing]);

  const stepBy = useCallback((seconds: number) => {
    const clock = clockRef.current;
    if (clock <= 0) return;
    patchState({ playing: false });
    setCursorFraction((value) => Math.min(1, Math.max(0, value + seconds / clock)));
  }, [patchState]);

  const scrubTo = useCallback((t: number) => {
    const clock = clockRef.current;
    if (clock <= 0) return;
    patchState({ playing: false });
    setCursorFraction(Math.min(1, Math.max(0, t / clock)));
  }, [patchState]);

  const isStairs = state.scenario === "staircase";
  const dragActive = model.dragSamples.length > 0;

  /* A collapsed section must still say what it currently holds, or collapsing it has hidden
   * information rather than merely deferred it. */
  const gravityLabel = Object.values(GRAVITY_PRESETS).find((preset) => Math.abs(preset.value - state.gravity) < 1e-6)?.label ?? "自訂";
  const dragLabel = Object.values(DRAG_PRESETS).find((preset) => Math.abs(preset.value - state.dragFactor) < 1e-9)?.label ?? `k = ${state.dragFactor.toFixed(3)}`;

  const readouts: readonly (readonly [string, string])[] = [
    ["飛行時間", model.duration > 0 ? `${model.duration.toFixed(2)} s` : "—"],
    [isStairs ? "落點距離" : "水平射程", formatMetres(isStairs ? model.landing?.point.x : model.groundRange)],
    ["最高點", formatMetres(model.apex.point.y)],
    ["最佳發射角", `${model.optimalAngle.toFixed(1)}°`],
  ];
  const liveReadouts: readonly (readonly [string, string])[] = [
    ["當下速率", `${cursor.acceleration.speed.toFixed(2)} m/s`],
    ["曲率半徑", Number.isFinite(cursor.acceleration.radiusOfCurvature) ? `${cursor.acceleration.radiusOfCurvature.toFixed(1)} m` : "∞"],
  ];

  return (
    <main className="lab-shell projectile-lab">
      <div className="topbar projectile-topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow">Model 07</div>
          <h1><span className="live-dot" />拋體運動</h1>
        </div>
        <div className="header-actions">
          <Menu label="情境">
            <button className={!isStairs ? "active" : ""} onClick={() => patchState({ scenario: "field", ...SCENARIO_DEFAULTS.field })}>平地拋射</button>
            <button className={isStairs ? "active" : ""} onClick={() => patchState({ scenario: "staircase", ...SCENARIO_DEFAULTS.staircase })}>階梯落點</button>
          </Menu>
          <Menu label="教學預設">
            {Object.entries(PROJECTILE_PRESETS).map(([key, preset]) => {
              const { label, ...patch } = preset;
              return <button key={key} onClick={() => { patchState(patch); setCursorFraction(0); }}>{label}</button>;
            })}
          </Menu>
          <button className={theoryOpen ? "active" : ""} onClick={() => setTheoryOpen(true)} aria-haspopup="dialog" aria-expanded={theoryOpen}>
            <BookOpen size={14} /> 理論與計算
          </button>
          <button className={panelOpen ? "active" : ""} onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}>
            {panelOpen ? <X size={14} /> : <SlidersHorizontal size={14} />} {panelOpen ? "收合面板" : "調整參數"}
          </button>
          <button onClick={() => { setState(initialProjectileState()); setCursorFraction(0); }}><RotateCcw size={14} /> 重設</button>
        </div>
      </div>

      {/* The panel takes width from the chart rather than covering it, and the chart is drawn at
          whatever size it is left with, so opening the panel never hides the trajectory. */}
      <div className="projectile-stage" data-panel={panelOpen}>
        <section className="viewport-card projectile-path-card">
          <div className="card-label">
            <span>軌跡</span>
            <div>
              <strong>{isStairs ? "階梯落點" : "水平距離 × 高度"}</strong>
              <small>兩軸同尺度：畫面上的形狀就是真實軌跡</small>
            </div>
          </div>
          <div className="canvas-host" ref={chartHostRef}>
            <TrajectoryView state={state} model={model} cursor={cursor} geometry={geometry} onScrubTo={scrubTo} />
          </div>
          <div className="legend">
            <span><i style={{ background: PATH }} />本次軌跡</span>
            {(model.complementary || dragActive) && <span><i style={{ background: COMPARE }} />對照軌跡</span>}
            {model.envelope.length > 0 && <span><i style={{ background: BOUND }} />可及邊界</span>}
            <span><i style={{ background: VELOCITY }} />速度 v（分量為虛線）</span>
            {state.showAcceleration && <span><i style={{ background: ACCEL }} />加速度 g（分量為虛線）</span>}
          </div>
        </section>

        <aside className="projectile-side" data-open={panelOpen}>
          <div className="projectile-side-inner">
            {/* Sliders lead: they are the only controls touched continuously. */}
            <div className="projectile-group">
              <p className="projectile-group-label">發射參數</p>
              <div className="projectile-slider-stack">
                <label><span>發射速度 <b>{state.speed.toFixed(1)} m/s</b></span>
                  <input type="range" min={SPEED_RANGE[state.scenario].min} max={SPEED_RANGE[state.scenario].max} step={SPEED_RANGE[state.scenario].step} value={state.speed} onChange={(event) => patchState({ speed: Number(event.target.value) })} /></label>
                <label><span>發射角 <b>{state.angle.toFixed(0)}°</b></span>
                  <input type="range" min="-20" max="90" step="1" value={state.angle} onChange={(event) => patchState({ angle: Number(event.target.value) })} /></label>
                {isStairs ? (
                  <>
                    <label><span>階梯深度 <b>{state.stairs.width.toFixed(2)} m</b></span>
                      <input type="range" min="0.15" max="0.6" step="0.01" value={state.stairs.width} onChange={(event) => patchState({ stairs: { ...state.stairs, width: Number(event.target.value) } })} /></label>
                    <label><span>階梯高度 <b>{state.stairs.rise.toFixed(2)} m</b></span>
                      <input type="range" min="0.08" max="0.35" step="0.01" value={state.stairs.rise} onChange={(event) => patchState({ stairs: { ...state.stairs, rise: Number(event.target.value) } })} /></label>
                  </>
                ) : (
                  <label><span>發射高度 <b>{state.height.toFixed(1)} m</b></span>
                    <input type="range" min="0" max="60" step="0.5" value={state.height} onChange={(event) => patchState({ height: Number(event.target.value) })} /></label>
                )}
              </div>
              <small className="projectile-hint">最佳角 {model.optimalAngle.toFixed(1)}°；只有發射與落地同高時才會是 45°。</small>
            </div>

            {/* The eye icon here is the value, not decoration, so icon and text together earn
                their width. Elsewhere one or the other does. */}
            <div className="projectile-group">
              <p className="projectile-group-label">圖層</p>
              <div className="projectile-btn-column">
                {([
                  ["showComplementary", "互補角對照軌跡"],
                  ["showEnvelope", "安全拋物線與軌跡束"],
                  ["showAcceleration", "加速度分量與曲率圓"],
                  ["showDrag", "空氣阻力對照軌跡"],
                ] as const).map(([key, label]) => (
                  <button key={key} className={state[key] ? "active" : ""} onClick={() => patchState({ [key]: !state[key] })}>
                    {state[key] ? <Eye size={14} /> : <EyeOff size={14} />} {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="projectile-group projectile-group-flush">
              <button className="projectile-disclosure" onClick={() => setShowEnvironment((open) => !open)} aria-expanded={showEnvironment}>
                {showEnvironment ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                環境
                <small>{gravityLabel} {state.gravity.toFixed(2)} m/s² · {dragLabel}</small>
              </button>
              {showEnvironment && (
                <div className="projectile-disclosure-body">
                  <p className="projectile-group-label">重力加速度</p>
                  <div className="projectile-btn-grid">
                    {Object.entries(GRAVITY_PRESETS).map(([key, preset]) => (
                      <button key={key} className={Math.abs(state.gravity - preset.value) < 1e-6 ? "active" : ""} onClick={() => patchState({ gravity: preset.value })}>
                        {preset.label} {preset.value.toFixed(2)}
                      </button>
                    ))}
                  </div>
                  <p className="projectile-group-label">空氣阻力 k</p>
                  <div className="projectile-btn-grid">
                    {Object.entries(DRAG_PRESETS).map(([key, preset]) => (
                      <button key={key} disabled={isStairs} className={Math.abs(state.dragFactor - preset.value) < 1e-9 ? "active" : ""} onClick={() => patchState({ dragFactor: preset.value, showDrag: preset.value > 0 })}>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <label className="projectile-inline-slider"><b>{state.dragFactor.toFixed(3)} m⁻¹</b>
                    <input type="range" disabled={isStairs} min="0" max="0.2" step="0.005" value={state.dragFactor} onChange={(event) => patchState({ dragFactor: Number(event.target.value), showDrag: Number(event.target.value) > 0 })} /></label>
                  <small className="projectile-hint">
                    {isStairs ? "階梯情境不計空氣阻力。" : "阻力軌跡為 RK4 數值積分結果，其餘曲線皆為解析解。"}
                  </small>
                </div>
              )}
            </div>

            <div className="projectile-group projectile-group-flush">
              <button className="projectile-disclosure" onClick={() => setShowComponents((open) => !open)} aria-expanded={showComponents}>
                {showComponents ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                分量圖
                <small>x–t 是直線、y–t 是拋物線</small>
              </button>
              {showComponents && (
                <div className="projectile-mini-column">
                  <MiniChart title="水平位置 x–t" note="等速" series={charts.horizontal} duration={charts.duration} cursorT={cursor.t} yLabel="x (m)" />
                  <MiniChart title="垂直位置 y–t" note="等加速" series={charts.vertical} duration={charts.duration} cursorT={cursor.t} yLabel="y (m)" />
                  <MiniChart title="速度分量 v–t" note="vₓ 虛線，v_y 斜率 −g" series={charts.velocity} duration={charts.duration} cursorT={cursor.t} yLabel="v (m/s)" />
                </div>
              )}
            </div>

            <p className="projectile-note">
              {isStairs
                ? model.landing
                  ? `以 ${state.speed.toFixed(1)} m/s ${Math.abs(state.angle) < 1e-6 ? "水平" : `${state.angle.toFixed(0)}° 斜向`}離開階梯頂端，落在第 ${model.landing.step} 階。${model.horizontalStep ? `水平拋出可用 n = ⌈2v²·rise / (g·width²)⌉ = ${model.horizontalStep} 驗算；n 與 v² 成正比。` : ""}`
                  : `以 ${state.speed.toFixed(1)} m/s 拋出會越過這 ${state.stairs.count} 階全部，落在樓梯之外。`
                : model.complementary
                  ? model.rangesMatch
                    ? `${state.angle.toFixed(0)}° 與 ${model.complementary.angle.toFixed(0)}° 同時發射、落在同一點（${model.groundRange.toFixed(2)} m），但 ${Math.max(state.angle, model.complementary.angle).toFixed(0)}° 那顆晚了 ${Math.abs(model.complementary.duration - model.duration).toFixed(2)} 秒才到。`
                    : `發射高度 ${state.height.toFixed(1)} m，互補角已不再等射程：${state.angle.toFixed(0)}° 為 ${model.groundRange.toFixed(2)} m，${model.complementary.angle.toFixed(0)}° 為 ${model.complementary.range.toFixed(2)} m。`
                  : dragActive
                    ? `空氣阻力使射程從真空的 ${model.groundRange.toFixed(2)} m 減為 ${(model.dragLanding?.point.x ?? 0).toFixed(2)} m，減少約 ${((model.dragLoss ?? 0) / (model.groundRange || 1) * 100).toFixed(0)}%。`
                    : `此速度的可及邊界為安全拋物線，最遠射程 ${model.maxRange.toFixed(2)} m，發生在 ${model.optimalAngle.toFixed(1)}°。`}
            </p>
          </div>
        </aside>
      </div>

      <div className="projectile-dock">
        <div className="projectile-transport">
          <div className="projectile-transport-buttons">
            <button onClick={() => { patchState({ playing: false }); setCursorFraction(0); }} aria-label="回到起點" title="回到起點"><SkipBack size={14} /></button>
            <button onClick={() => stepBy(-STEP_SECONDS)} aria-label={`退 ${STEP_SECONDS} 秒`}>−{STEP_SECONDS}s</button>
            <button className={state.playing ? "active" : ""} onClick={() => patchState({ playing: !state.playing })} aria-label={state.playing ? "暫停" : "播放"}>
              {state.playing ? <Pause size={14} /> : <Play size={14} />}{state.playing ? "暫停" : "播放"}
            </button>
            <button onClick={() => stepBy(STEP_SECONDS)} aria-label={`進 ${STEP_SECONDS} 秒`}>+{STEP_SECONDS}s</button>
            <button className={state.direction < 0 ? "active" : ""} onClick={() => patchState({ direction: state.direction < 0 ? 1 : -1 })} aria-label="反向播放" title="反向播放"><Undo2 size={14} /></button>
            <button onClick={() => { patchState({ playing: false }); setCursorFraction(1); }} aria-label="跳到結束" title="跳到結束"><SkipForward size={14} /></button>
          </div>
          <input
            className="projectile-scrub"
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={cursorFraction}
            aria-label="時間游標"
            onChange={(event) => { setCursorFraction(Number(event.target.value)); patchState({ playing: false }); }}
          />
          <output className="projectile-clock">{cursor.clockTime.toFixed(2)} / {model.clockDuration.toFixed(2)} s</output>
          <div className="projectile-transport-speeds">
            {[0.25, 0.5, 1, 2].map((speed) => (
              <button key={speed} className={Math.abs(state.animationSpeed - speed) < 0.01 ? "active" : ""} onClick={() => patchState({ animationSpeed: speed })}>{speed}×</button>
            ))}
          </div>
        </div>
        <div className="projectile-readout">
          {readouts.map(([name, value]) => <span key={name}><i>{name}</i>{value}</span>)}
          {liveReadouts.map(([name, value]) => <span key={name} className="live"><i>{name}</i>{value}</span>)}
        </div>
      </div>

      {theoryOpen && <TheoryOverlay onClose={() => setTheoryOpen(false)} />}
    </main>
  );
}
