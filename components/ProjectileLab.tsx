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
  Home,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import TheoryNotes from "@/components/projectile/TheoryNotes";
import { MathProvider, Tex } from "@/components/projectile/mathjax";
import type { PathAcceleration, TrajectorySample, Vec2 } from "@/lib/science/projectile";
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

const PANEL_DEFAULT_WIDTH = 360;
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 620;

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

/**
 * The user's own pan/zoom, expressed as a centre and a single meters-per-pixel scale shared by
 * both axes — the same equal-scale invariant the auto-fit view holds, but now a scale the user
 * can pick rather than one derived from the flight. `null` means "no manual view yet": the chart
 * follows the auto-fit target, as it always has.
 */
type ManualView = { centerX: number; centerY: number; mpp: number };

function domainFromView(view: ManualView, plotW: number, plotH: number): Domain {
  const halfW = (plotW / 2) * view.mpp;
  const halfH = (plotH / 2) * view.mpp;
  return { xMin: view.centerX - halfW, xMax: view.centerX + halfW, yMin: view.centerY - halfH, yMax: view.centerY + halfH };
}

/**
 * The one primitive every pan/zoom gesture reduces to: choose centre and scale so that
 * `domainPoint` continues to land at `screenPoint`. Dragging is this with `mpp` unchanged (the
 * point under the pointer doesn't move); zooming toward the cursor or a pinch midpoint is this
 * with `mpp` changed first, so the point under the gesture is what stays fixed rather than the
 * plot's corner.
 */
function recenterOn(domainPoint: Vec2, screenPoint: Vec2, mpp: number, plot: Frame["plot"], plotW: number, plotH: number): ManualView {
  const xMin = domainPoint.x - (screenPoint.x - plot.left) * mpp;
  const yMin = domainPoint.y - (plot.bottom - screenPoint.y) * mpp;
  return { centerX: xMin + (plotW * mpp) / 2, centerY: yMin + (plotH * mpp) / 2, mpp };
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

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

type Probe = { t: number; point: Vec2; velocity: Vec2; acceleration: PathAcceleration; angle: number };

function TrajectoryView({ state, model, cursor, geometry, manualView, onManualViewChange, onScrubTo }: {
  state: ProjectileState;
  model: ProjectileReadout;
  cursor: CursorReadout;
  geometry: Geometry;
  manualView: ManualView | null;
  onManualViewChange: (view: ManualView | null) => void;
  onScrubTo: (t: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [dragging, setDragging] = useState(false);
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

  const availW = geometry.w - geometry.pad.left - geometry.pad.right;
  const availH = geometry.h - geometry.pad.top - geometry.pad.bottom;

  const settled = useSettledDomain(target);
  const fitted = fitEqualAspect(settled, availW, availH, isStairs ? "down" : "up");

  /* Once the user has framed their own view, parameter changes leave it alone — a preset that
   * silently yanked the picture back to auto-fit would undo the very thing panning or zooming
   * was for. The auto-fit result above is still computed every render regardless, both to drive
   * the settling animation that resumes the moment the user asks for it (the "fit" button), and
   * to keep the zoom bounds below anchored to the flight's own scale rather than a fixed number. */
  const isManual = manualView !== null;
  const plotW = isManual ? availW : fitted.plotW;
  const plotH = isManual ? availH : fitted.plotH;
  const domain = isManual ? domainFromView(manualView, plotW, plotH) : fitted.domain;
  const frame = centredFrame(domain, geometry.w, geometry.h, geometry.pad, plotW, plotH);
  const { plot } = frame;

  /* Bounds scale with the flight rather than being a fixed number of metres, so a 2 m toy hop and
   * a 130 m bomb offer the same *relative* room to zoom rather than wildly different absolute ones. */
  const naturalMpp = (fitted.domain.xMax - fitted.domain.xMin) / fitted.plotW;
  const minMpp = naturalMpp / 20;
  const maxMpp = naturalMpp * 8;

  /** Screen → domain, the inverse of `frame.px`/`frame.py`. Only valid while `mpp` is the same on
   * both axes, which every view here maintains by construction. */
  const domainAt = (screenX: number, screenY: number): Vec2 => ({
    x: domain.xMin + ((screenX - plot.left) / plotW) * (domain.xMax - domain.xMin),
    y: domain.yMin + ((plot.bottom - screenY) / plotH) * (domain.yMax - domain.yMin),
  });

  /** The view a gesture starts from: the user's own if one exists, otherwise the auto-fit view
   * showing right now — seeding manual mode from whatever was already on screen keeps the first
   * pan or scroll from jumping. */
  const currentView = (): ManualView =>
    manualView ?? { centerX: (domain.xMin + domain.xMax) / 2, centerY: (domain.yMin + domain.yMax) / 2, mpp: naturalMpp };

  const zoomBy = (factor: number) => {
    const base = currentView();
    onManualViewChange({ ...base, mpp: clamp(base.mpp * factor, minMpp, maxMpp) });
  };

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

  /* Hovering reads the flight out without disturbing it; a tap or click that doesn't drag moves
   * the time cursor there instead. Nearest-in-screen-space rather than nearest-in-x, so a steep or
   * vertical launch still probes. Takes raw client coordinates rather than an event so the same
   * lookup serves a live hover, a finished drag, and a finished pinch alike. */
  const toLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const origin = svg.createSVGPoint();
    origin.x = clientX;
    origin.y = clientY;
    return origin.matrixTransform(matrix.inverse());
  };

  /**
   * The time under the pointer, resolved continuously rather than snapped to one of the sampled
   * points. Snapping is invisible at the default framing but turns into a coarse ratchet once the
   * view is zoomed in, where consecutive samples sit tens of pixels apart. So the nearest sample
   * only picks the segment; the pointer is then projected onto that segment to land anywhere along
   * it — exact against the polyline that is actually drawn, at any zoom.
   */
  const probeTimeAt = (clientX: number, clientY: number): number | null => {
    const local = toLocal(clientX, clientY);
    const samples = model.trajectory;
    if (!local || samples.length < 2) return null;

    let nearest = 0;
    let nearestDistance = Infinity;
    for (let index = 0; index < samples.length; index += 1) {
      const distance =
        (frame.px(samples[index].point.x) - local.x) ** 2 + (frame.py(samples[index].point.y) - local.y) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }

    let bestT = samples[nearest].t;
    let bestDistance = nearestDistance;
    for (const [a, b] of [[nearest - 1, nearest], [nearest, nearest + 1]]) {
      if (a < 0 || b >= samples.length) continue;
      const ax = frame.px(samples[a].point.x);
      const ay = frame.py(samples[a].point.y);
      const bx = frame.px(samples[b].point.x);
      const by = frame.py(samples[b].point.y);
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 1e-9) continue;
      const u = clamp(((local.x - ax) * dx + (local.y - ay) * dy) / lengthSquared, 0, 1);
      const distance = (ax + dx * u - local.x) ** 2 + (ay + dy * u - local.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestT = lerp(samples[a].t, samples[b].t, u);
      }
    }
    return bestDistance <= 90 ** 2 ? bestT : null;
  };

  /** Everything the readout shows, evaluated at that instant by the model rather than read off the
   * drawn samples, so the numbers stay exact however finely the pointer resolves the time. */
  const readProbe = (clientX: number, clientY: number): Probe | null => {
    const t = probeTimeAt(clientX, clientY);
    if (t === null || model.clockDuration <= 0) return null;
    const at = deriveCursor(model, state.gravity, t / model.clockDuration);
    return {
      t: at.t,
      point: at.point,
      velocity: at.velocity,
      acceleration: at.acceleration,
      angle: (Math.atan2(at.velocity.y, at.velocity.x) * 180) / Math.PI,
    };
  };

  const handleHover = (event: ReactPointerEvent<SVGSVGElement>) => {
    setProbe(readProbe(event.clientX, event.clientY));
  };

  /*
   * Pan and pinch-zoom. One finger drags the view; two fingers (or a mouse held down while a
   * second touch somehow joins, which never happens but costs nothing to allow) pinch it. A press
   * that never moves past a small threshold is a tap or click instead — handled on release, by
   * finding the nearest sample at the *release* point rather than trusting `probe`, since a touch
   * tap has no hover event beforehand to have set it.
   */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDistance: number; startMpp: number } | null>(null);
  const downPointRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    /* Capture only keeps the drag alive once the pointer leaves the chart; the spec lets it throw
     * when the pointer has already ended, and a pan that merely stops at the edge is a far better
     * outcome than an exception thrown out of an event handler with nothing to catch it. */
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Drag still works while the pointer stays over the chart. */
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      downPointRef.current = { x: event.clientX, y: event.clientY };
      draggedRef.current = false;
    } else {
      pinchRef.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointersRef.current.size === 0) {
      handleHover(event);
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      if (!pinchRef.current) pinchRef.current = { startDistance: distance, startMpp: currentView().mpp };
      const { startDistance, startMpp } = pinchRef.current;
      const nextMpp = clamp((startMpp * startDistance) / distance, minMpp, maxMpp);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const midLocal = toLocal(midpoint.x, midpoint.y);
      if (midLocal) onManualViewChange(recenterOn(domainAt(midLocal.x, midLocal.y), midLocal, nextMpp, plot, plotW, plotH));
      draggedRef.current = true;
      setDragging(true);
      setProbe(null);
      return;
    }

    const local = toLocal(event.clientX, event.clientY);
    const down = downPointRef.current;
    if (!local || !down) return;
    if (!draggedRef.current && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) {
      draggedRef.current = true;
      setDragging(true);
    }
    if (!draggedRef.current) return;

    /* The point that was under the pointer a moment ago — read off the *current* domain, which
     * this move hasn't touched yet — is exactly the point that must stay under the pointer now.
     * `movementX/Y` gives that previous position without needing to track it separately. */
    const native = event.nativeEvent;
    const previousLocal = toLocal(event.clientX - native.movementX, event.clientY - native.movementY);
    const anchor = domainAt((previousLocal ?? local).x, (previousLocal ?? local).y);
    onManualViewChange(recenterOn(anchor, local, currentView().mpp, plot, plotW, plotH));
    setProbe(null);
  };

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size > 0) return;
    if (!draggedRef.current) {
      const t = probeTimeAt(event.clientX, event.clientY);
      if (t !== null) onScrubTo(t);
    }
    downPointRef.current = null;
    draggedRef.current = false;
    setDragging(false);
  };

  /* Wheel zoom needs a real (non-passive) listener to stop the page from scrolling underneath it —
   * React's synthetic onWheel is passive by default and cannot preventDefault. Re-attached every
   * render rather than memoized, so it always closes over this render's domain and plot rect
   * instead of a stale one from whenever it was last created. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const local = toLocal(event.clientX, event.clientY);
      if (!local) return;
      const base = currentView();
      const factor = Math.exp(event.deltaY * 0.0016);
      const nextMpp = clamp(base.mpp * factor, minMpp, maxMpp);
      onManualViewChange(recenterOn(domainAt(local.x, local.y), local, nextMpp, plot, plotW, plotH));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  /* The readout is HTML rather than SVG text so its symbols can be typeset: an SVG <text> cannot
   * hold MathJax, which is why this used to spell v_y out with an underscore. The acceleration
   * split only appears when its layer is on, so the box answers what is actually being shown. */
  const tooltipRows: [string, string][] = probe
    ? [
        ["t", `${probe.t.toFixed(2)} s`],
        ["x", `${probe.point.x.toFixed(2)} m`],
        ["y", `${probe.point.y.toFixed(2)} m`],
        ["v", `${probe.acceleration.speed.toFixed(2)} m/s`],
        ["v_x", `${probe.velocity.x.toFixed(2)} m/s`],
        ["v_y", `${probe.velocity.y.toFixed(2)} m/s`],
        ["\\theta_\\text{path}", `${probe.angle.toFixed(1)}°`],
        ...(state.showAcceleration
          ? ([
              ["a_\\parallel", `${probe.acceleration.tangential.toFixed(2)} m/s²`],
              ["a_\\perp", `${probe.acceleration.normal.toFixed(2)} m/s²`],
              [
                "\\rho",
                Number.isFinite(probe.acceleration.radiusOfCurvature)
                  ? `${probe.acceleration.radiusOfCurvature.toFixed(2)} m`
                  : "∞",
              ],
            ] as [string, string][])
          : []),
      ]
    : [];
  const tipW = geometry.tip.w;
  const tipH = tooltipRows.length * geometry.tip.row + geometry.tip.row + 4;
  const probeX = probe ? frame.px(probe.point.x) : 0;
  const probeY = probe ? frame.py(probe.point.y) : 0;
  const tipX = probeX + tipW + 20 > plot.right ? probeX - tipW - 14 : probeX + 14;
  const tipY = Math.min(Math.max(plot.top, probeY - tipH / 2), Math.max(plot.top, plot.bottom - tipH));

  return (
    <>
    <svg
      ref={svgRef}
      viewBox={`0 0 ${geometry.w} ${geometry.h}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="拋體運動軌跡圖，可拖曳平移、滾輪或雙指縮放"
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={() => { if (pointersRef.current.size === 0) setProbe(null); }}
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

      {model.duration <= 0 && (
        <text x={geometry.w / 2} y={geometry.h / 2} textAnchor="middle" fill={COMPARE} fontSize={geometry.note + 2}>此設定下沒有飛行（重力為零或未離開地面）</text>
      )}
    </svg>

    {probe && (
      <div
        className="projectile-tip"
        style={{ left: tipX, top: tipY, width: tipW, fontSize: geometry.tip.font }}
      >
        {tooltipRows.map(([name, value]) => (
          <div key={name}><Tex>{name}</Tex><span>{value}</span></div>
        ))}
      </div>
    )}

    {/* Plain HTML, not SVG, so this cluster stays put at the card's corner as the map underneath
        it pans and zooms — Google Maps' own +/− and recentre controls work the same way. */}
    <div className="projectile-map-controls">
      <div className="projectile-zoom-group">
        <button onClick={() => zoomBy(1 / 1.4)} disabled={currentView().mpp <= minMpp * 1.001} aria-label="放大"><ZoomIn size={16} /></button>
        <button onClick={() => zoomBy(1.4)} disabled={currentView().mpp >= maxMpp * 0.999} aria-label="縮小"><ZoomOut size={16} /></button>
      </div>
      <button
        className={`projectile-map-reset${isManual ? " active" : ""}`}
        onClick={() => onManualViewChange(null)}
        aria-label="回到預設視圖"
        title="回到預設視圖"
      >
        <Home size={15} />
      </button>
    </div>
    </>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Companion view: the components against time
 *
 * These charts are the model's actual claim: horizontal and vertical motion evolve independently.
 * Nothing here says so in prose — the shapes say it, and the hover probe lets a reader measure the
 * slope and the area for themselves rather than being told what they are.
 * ------------------------------------------------------------------------------------------ */

/* Colour separates the two directions here, because a merged chart puts them side by side and
 * they are genuinely different quantities. Line style separates vacuum from drag, matching the
 * main chart's convention that a comparison path is drawn dashed. */
const SERIES_X = "#6fc3ef";
const SERIES_Y = "#e79bc4";

type Series = {
  /** Legend symbol and equation, as TeX. */
  symbol: string;
  equation: string;
  /** Set when the curve is integrated rather than solved. */
  note?: string;
  color: string;
  dash?: string;
  points: Vec2[];
  /** d(value)/dt — exact wherever an exact form exists, numerical only for the drag paths. */
  slopeAt: (t: number) => number;
  /** ∫₀ᵗ v dt, on velocity curves only: the area a reader can check against the position chart. */
  areaAt?: (t: number) => number;
  unit: string;
  slopeUnit: string;
};

/** Linear interpolation on a sampled (t, value) polyline. */
function valueAt(points: readonly Vec2[], t: number): number {
  if (points.length === 0) return 0;
  if (t <= points[0].x) return points[0].y;
  const last = points[points.length - 1];
  if (t >= last.x) return last.y;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].x <= t) low = mid;
    else high = mid;
  }
  const span = points[high].x - points[low].x;
  return span > 1e-12 ? lerp(points[low].y, points[high].y, (t - points[low].x) / span) : points[low].y;
}

/** Central difference, for the drag curves that have no closed form to differentiate. */
function numericSlope(points: readonly Vec2[], t: number): number {
  const step = 0.01;
  return (valueAt(points, t + step) - valueAt(points, t - step)) / (2 * step);
}

/** Trapezoid areas accumulated at every sample, so the probe's area readout is a lookup rather
 * than a fresh integration on each pointer move. */
function cumulativeArea(points: readonly Vec2[]): Vec2[] {
  const running: Vec2[] = [{ x: points[0]?.x ?? 0, y: 0 }];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += ((points[index].y + points[index - 1].y) / 2) * (points[index].x - points[index - 1].x);
    running.push({ x: points[index].x, y: total });
  }
  return running;
}

/** A subscripted symbol for SVG text, where MathJax cannot reach: a real baseline shift rather
 * than the bare underscore that TeX source would otherwise leave on screen. Unicode has a
 * subscript x but no subscript y, so the two cannot be written the same way without this. */
function Sub({ base, sub }: { base: string; sub: string }) {
  return (
    <>
      {base}
      <tspan baselineShift="sub" fontSize="0.72em">{sub}</tspan>
    </>
  );
}

type ChartSpec = { key: string; title: ReactNode; yLabel: ReactNode; series: Series[] };

/** Every curve the companion charts can draw, built once from the same sampling the main view uses. */
function componentSeries(model: ProjectileReadout, state: ProjectileState) {
  const { trajectory, duration, dragSamples } = model;
  const g = state.gravity;
  const vx = model.velocity.x;
  const vy0 = model.velocity.y;
  const h = model.height;
  const n = (value: number) => value.toFixed(2);

  const vacuum = {
    x: {
      symbol: "x",
      equation: `x = ${n(vx)}\\,t`,
      color: SERIES_X,
      points: trajectory.map((sample) => ({ x: sample.t, y: sample.point.x })),
      slopeAt: () => vx,
      unit: "m",
      slopeUnit: "m/s",
    },
    y: {
      symbol: "y",
      equation: `y = ${h > 0 ? `${n(h)} + ` : ""}${n(vy0)}\\,t - ${n(g / 2)}\\,t^2`,
      color: SERIES_Y,
      points: trajectory.map((sample) => ({ x: sample.t, y: sample.point.y })),
      slopeAt: (t: number) => vy0 - g * t,
      unit: "m",
      slopeUnit: "m/s",
    },
    vx: {
      symbol: "v_x",
      equation: `v_x = ${n(vx)}`,
      color: SERIES_X,
      points: trajectory.map((sample) => ({ x: sample.t, y: sample.velocity.x })),
      slopeAt: () => 0,
      areaAt: (t: number) => vx * t,
      unit: "m/s",
      slopeUnit: "m/s²",
    },
    vy: {
      symbol: "v_y",
      equation: `v_y = ${n(vy0)} - ${n(g)}\\,t`,
      color: SERIES_Y,
      points: trajectory.map((sample) => ({ x: sample.t, y: sample.velocity.y })),
      slopeAt: () => -g,
      areaAt: (t: number) => vy0 * t - (g / 2) * t * t,
      unit: "m/s",
      slopeUnit: "m/s²",
    },
  } satisfies Record<string, Series>;

  /* The drag curves are the one thing here that is integrated rather than solved, so their slope
   * and area are read off the samples too — the same quarantine the science layer keeps. */
  const dragSeries = (
    symbol: string,
    color: string,
    unit: string,
    slopeUnit: string,
    pick: (sample: TrajectorySample) => number,
    withArea: boolean,
  ): Series => {
    const points = dragSamples.map((sample) => ({ x: sample.t, y: pick(sample) }));
    const areas = withArea ? cumulativeArea(points) : null;
    return {
      symbol: `${symbol}^{\\,\\text{drag}}`,
      equation: `${symbol}^{\\,\\text{drag}}`,
      note: "RK4 數值解，無封閉形式",
      color,
      dash: "5 4",
      points,
      slopeAt: (t: number) => numericSlope(points, t),
      areaAt: areas ? (t: number) => valueAt(areas, t) : undefined,
      unit,
      slopeUnit,
    };
  };

  const hasDrag = dragSamples.length > 0;
  const withDrag = (base: Series, drag: Series | null) => (drag ? [base, drag] : [base]);

  return {
    duration,
    x: withDrag(vacuum.x, hasDrag ? dragSeries("x", SERIES_X, "m", "m/s", (s) => s.point.x, false) : null),
    y: withDrag(vacuum.y, hasDrag ? dragSeries("y", SERIES_Y, "m", "m/s", (s) => s.point.y, false) : null),
    vx: withDrag(vacuum.vx, hasDrag ? dragSeries("v_x", SERIES_X, "m/s", "m/s²", (s) => s.velocity.x, true) : null),
    vy: withDrag(vacuum.vy, hasDrag ? dragSeries("v_y", SERIES_Y, "m/s", "m/s²", (s) => s.velocity.y, true) : null),
  };
}

/** The charts to draw, either merged onto shared axes or one quantity each. */
function componentCharts(series: ReturnType<typeof componentSeries>, merged: boolean): ChartSpec[] {
  if (merged) {
    return [
      { key: "position", title: "位置 – 時間", yLabel: <>x, y (m)</>, series: [...series.x, ...series.y] },
      {
        key: "velocity",
        title: "速度 – 時間",
        yLabel: <><Sub base="v" sub="x" />, <Sub base="v" sub="y" /> (m/s)</>,
        series: [...series.vx, ...series.vy],
      },
    ];
  }
  return [
    { key: "x", title: "水平位置 x–t", yLabel: <>x (m)</>, series: series.x },
    { key: "y", title: "垂直位置 y–t", yLabel: <>y (m)</>, series: series.y },
    { key: "vx", title: <>水平速度 <Sub base="v" sub="x" />–t</>, yLabel: <><Sub base="v" sub="x" /> (m/s)</>, series: series.vx },
    { key: "vy", title: <>垂直速度 <Sub base="v" sub="y" />–t</>, yLabel: <><Sub base="v" sub="y" /> (m/s)</>, series: series.vy },
  ];
}

function MiniChart({ chart, duration, cursorT }: { chart: ChartSpec; duration: number; cursorT: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const values = chart.series.flatMap((line) => line.points.map((point) => point.y));
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

  /* The readout follows the transport cursor until the pointer takes over, so it always shows a
   * meaningful instant and hovering simply scrubs it — no tooltip appearing and disappearing, and
   * no layout shifting under the pointer. */
  const probeT = clamp(hoverT ?? cursorT, 0, Math.max(duration, 0));
  const probeX = frame.px(probeT);

  const trackPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix || duration <= 0) return;
    const origin = svg.createSVGPoint();
    origin.x = event.clientX;
    origin.y = event.clientY;
    const local = origin.matrixTransform(matrix.inverse());
    const fraction = (local.x - plot.left) / (plot.right - plot.left);
    setHoverT(clamp(fraction * duration, 0, duration));
  };

  return (
    <div className="projectile-mini">
      <div className="projectile-mini-head"><strong>{chart.title}</strong></div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MINI_W} ${MINI_H}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={chart.key}
        style={{ cursor: "crosshair", touchAction: "none" }}
        onPointerMove={trackPointer}
        onPointerLeave={() => setHoverT(null)}
      >
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
        <text x={plot.left - 7} y={plot.top - 9} textAnchor="start" fill={LABEL} fontSize={12}>{chart.yLabel}</text>
        <text x={plot.right} y={plot.bottom + 36} textAnchor="end" fill={LABEL} fontSize={12}>t (s)</text>

        {/* The integral the probe reports, drawn: the area it names is shaded up to the same
            instant, so the number and the region are visibly the same thing. */}
        {duration > 0 && chart.series.map((line) => {
          if (!line.areaAt) return null;
          const span = line.points.filter((point) => point.x <= probeT);
          const edge = { x: probeT, y: valueAt(line.points, probeT) };
          const region = [{ x: 0, y: 0 }, ...span, edge, { x: probeT, y: 0 }];
          return (
            <path key={`a${line.symbol}`} d={`${pathFrom(region, frame)} Z`} fill={line.color} opacity={0.16} stroke="none" />
          );
        })}

        {chart.series.map((line) => (
          <path key={line.symbol} d={pathFrom(line.points, frame)} fill="none" stroke={line.color} strokeWidth={2.2} strokeDasharray={line.dash} />
        ))}

        {duration > 0 && (
          <>
            <line x1={probeX} y1={plot.top} x2={probeX} y2={plot.bottom} stroke="#e6f1f6" strokeWidth={1} opacity={hoverT === null ? 0.4 : 0.75} />
            {chart.series.map((line) => (
              <circle key={`d${line.symbol}`} cx={probeX} cy={frame.py(valueAt(line.points, probeT))} r={3.6} fill={line.color} />
            ))}
          </>
        )}
      </svg>

      {/* Legend and equation are the same row: the equation already names the curve, so a separate
          key would only repeat it. */}
      <div className="projectile-mini-legend">
        {chart.series.map((line) => (
          <div key={`e${line.symbol}`}>
            <i style={{ background: line.color, borderTop: line.dash ? `2px dashed ${line.color}` : undefined }} />
            <Tex>{line.equation}</Tex>
            {line.note && <small>{line.note}</small>}
          </div>
        ))}
      </div>

      {/* The probe states the derivative and the integral as operations rather than as the words
          "slope" and "area", so what a reader measures off the curve is named the way the
          mathematics names it — and so the area under a velocity curve can be checked against the
          position chart's own reading at the same instant. */}
      <div className="projectile-mini-probe">
        <div className="projectile-probe-t"><Tex>{`t = ${probeT.toFixed(2)}`}</Tex> s</div>
        {chart.series.map((line) => {
          const value = valueAt(line.points, probeT);
          const slope = line.slopeAt(probeT);
          const area = line.areaAt?.(probeT);
          return (
            <div key={`p${line.symbol}`} style={{ color: line.color }}>
              <span><Tex>{`${line.symbol} = ${value.toFixed(2)}`}</Tex> {line.unit}</span>
              <span><Tex>{`\\mathrm{d}${line.symbol}/\\mathrm{d}t = ${slope.toFixed(2)}`}</Tex> {line.slopeUnit}</span>
              {area !== undefined && (
                <span><Tex>{`\\int_0^t ${line.symbol}\\,\\mathrm{d}t = ${area.toFixed(2)}`}</Tex> m</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [manualView, setManualView] = useState<ManualView | null>(null);
  const [mergedCharts, setMergedCharts] = useState(true);
  /* The panel's width is the reader's to set, but opening it is a fresh start: the button always
   * restores the default rather than reopening at whatever width was last dragged. */
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);

  const startPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    const onMove = (move: PointerEvent) => {
      setPanelWidth(clamp(startWidth + (startX - move.clientX), PANEL_MIN_WIDTH, PANEL_MAX_WIDTH));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    /* Held on the body so the cursor does not flicker back as the pointer crosses the chart. */
    document.body.style.cursor = "col-resize";
  }, [panelWidth]);

  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartSize = useElementSize(chartHostRef);
  const geometry = useMemo(() => chartGeometry(chartSize.width, chartSize.height), [chartSize.width, chartSize.height]);

  const model = useMemo(() => deriveProjectileModel(state), [state]);
  const cursor = useMemo(() => deriveCursor(model, state.gravity, cursorFraction), [model, state.gravity, cursorFraction]);
  const charts = useMemo(() => componentSeries(model, state), [model, state]);

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
  const dragLabel = Object.values(DRAG_PRESETS).find((preset) => Math.abs(preset.value - state.dragFactor) < 1e-9)?.label ?? `b = ${state.dragFactor.toFixed(3)} m⁻¹`;

  const readouts: readonly (readonly [string, string])[] = [
    ["飛行時間", model.duration > 0 ? `${model.duration.toFixed(2)} s` : "—"],
    [isStairs ? "落點距離" : "水平射程", formatMetres(isStairs ? model.landing?.point.x : model.groundRange)],
    ["最高點", formatMetres(model.apex.point.y)],
    ["最佳發射角 θ*", `${model.optimalAngle.toFixed(1)}°`],
  ];
  const liveReadouts: readonly (readonly [string, string])[] = [
    ["當下速率 v", `${cursor.acceleration.speed.toFixed(2)} m/s`],
    ["曲率半徑 ρ", Number.isFinite(cursor.acceleration.radiusOfCurvature) ? `${cursor.acceleration.radiusOfCurvature.toFixed(1)} m` : "∞"],
  ];

  return (
    <MathProvider>
    <main className="lab-shell projectile-lab">
      <div className="topbar projectile-topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow">Model 07</div>
          <h1><span className="live-dot" />拋體運動</h1>
        </div>
        <div className="header-actions">
          <Menu label="情境">
            <button className={!isStairs ? "active" : ""} onClick={() => { patchState({ scenario: "field", ...SCENARIO_DEFAULTS.field }); setManualView(null); }}>平地拋射</button>
            <button className={isStairs ? "active" : ""} onClick={() => { patchState({ scenario: "staircase", ...SCENARIO_DEFAULTS.staircase }); setManualView(null); }}>階梯落點</button>
          </Menu>
          <Menu label="教學預設">
            {Object.entries(PROJECTILE_PRESETS).map(([key, preset]) => {
              const { label, ...patch } = preset;
              return <button key={key} onClick={() => { patchState(patch); setCursorFraction(0); setManualView(null); }}>{label}</button>;
            })}
          </Menu>
          <button className={theoryOpen ? "active" : ""} onClick={() => setTheoryOpen(true)} aria-haspopup="dialog" aria-expanded={theoryOpen}>
            <BookOpen size={14} /> 理論與計算
          </button>
          <button
            className={panelOpen ? "active" : ""}
            onClick={() => { setPanelOpen((open) => !open); setPanelWidth(PANEL_DEFAULT_WIDTH); }}
            aria-expanded={panelOpen}
          >
            {panelOpen ? <X size={14} /> : <SlidersHorizontal size={14} />} {panelOpen ? "收合面板" : "調整參數"}
          </button>
          <button onClick={() => { setState(initialProjectileState()); setCursorFraction(0); setManualView(null); }}><RotateCcw size={14} /> 重設</button>
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
            <TrajectoryView state={state} model={model} cursor={cursor} geometry={geometry} manualView={manualView} onManualViewChange={setManualView} onScrubTo={scrubTo} />
          </div>
          <div className="legend">
            <span><i style={{ background: PATH }} />本次軌跡</span>
            {(model.complementary || dragActive) && <span><i style={{ background: COMPARE }} />對照軌跡</span>}
            {model.envelope.length > 0 && <span><i style={{ background: BOUND }} />可及邊界</span>}
            <span><i style={{ background: VELOCITY }} />速度 <Tex>{"\\vec v"}</Tex>（分量為虛線）</span>
            {state.showAcceleration && <span><i style={{ background: ACCEL }} />加速度 <Tex>{"g"}</Tex>（分量為虛線）</span>}
          </div>
        </section>

        <aside className="projectile-side" data-open={panelOpen} style={{ width: panelOpen ? panelWidth : undefined }}>
          <div
            className="projectile-side-grip"
            onPointerDown={startPanelResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="調整面板寬度"
          />
          <div className="projectile-side-inner" style={{ width: panelWidth }}>
            {/* Sliders lead: they are the only controls touched continuously. */}
            <div className="projectile-group">
              <p className="projectile-group-label">發射參數</p>
              <div className="projectile-slider-stack">
                <label><span>發射速度 <Tex>{"v_0"}</Tex> <b>{state.speed.toFixed(1)} m/s</b></span>
                  <input type="range" min={SPEED_RANGE[state.scenario].min} max={SPEED_RANGE[state.scenario].max} step={SPEED_RANGE[state.scenario].step} value={state.speed} onChange={(event) => patchState({ speed: Number(event.target.value) })} /></label>
                <label><span>發射角 <Tex>{"\\theta"}</Tex> <b>{state.angle.toFixed(0)}°</b></span>
                  <input type="range" min="-20" max="90" step="1" value={state.angle} onChange={(event) => patchState({ angle: Number(event.target.value) })} /></label>
                {isStairs ? (
                  <>
                    <label><span>階梯深度 <Tex>{"w"}</Tex> <b>{state.stairs.width.toFixed(2)} m</b></span>
                      <input type="range" min="0.15" max="0.6" step="0.01" value={state.stairs.width} onChange={(event) => patchState({ stairs: { ...state.stairs, width: Number(event.target.value) } })} /></label>
                    <label><span>階梯高度 <Tex>{"r"}</Tex> <b>{state.stairs.rise.toFixed(2)} m</b></span>
                      <input type="range" min="0.08" max="0.35" step="0.01" value={state.stairs.rise} onChange={(event) => patchState({ stairs: { ...state.stairs, rise: Number(event.target.value) } })} /></label>
                  </>
                ) : (
                  <label><span>發射高度 <Tex>{"h"}</Tex> <b>{state.height.toFixed(1)} m</b></span>
                    <input type="range" min="0" max="60" step="0.5" value={state.height} onChange={(event) => patchState({ height: Number(event.target.value) })} /></label>
                )}
              </div>
              <small className="projectile-hint">最佳角 <Tex>{"\\theta^{*}"}</Tex> = {model.optimalAngle.toFixed(1)}°；只有 <Tex>{"h = 0"}</Tex> 時才會是 45°。</small>
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
                  <p className="projectile-group-label">重力加速度 <Tex>{"g"}</Tex></p>
                  <div className="projectile-btn-grid">
                    {Object.entries(GRAVITY_PRESETS).map(([key, preset]) => (
                      <button key={key} className={Math.abs(state.gravity - preset.value) < 1e-6 ? "active" : ""} onClick={() => patchState({ gravity: preset.value })}>
                        {preset.label} {preset.value.toFixed(2)} m/s²
                      </button>
                    ))}
                  </div>
                  <p className="projectile-group-label">空氣阻力 <Tex>{"b"}</Tex></p>
                  <div className="projectile-btn-grid">
                    {Object.entries(DRAG_PRESETS).map(([key, preset]) => (
                      <button key={key} disabled={isStairs} className={Math.abs(state.dragFactor - preset.value) < 1e-9 ? "active" : ""} onClick={() => patchState({ dragFactor: preset.value, showDrag: preset.value > 0 })}>
                        {preset.label} {preset.value.toFixed(3)} m⁻¹
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
                <small>{mergedCharts ? "合併 2 張" : "分開 4 張"}</small>
              </button>
              {showComponents && (
                <div className="projectile-mini-column">
                  <div className="projectile-btn-grid">
                    <button className={mergedCharts ? "active" : ""} onClick={() => setMergedCharts(true)}>合併顯示</button>
                    <button className={!mergedCharts ? "active" : ""} onClick={() => setMergedCharts(false)}>分開顯示</button>
                  </div>
                  {componentCharts(charts, mergedCharts).map((chart) => (
                    <MiniChart key={chart.key} chart={chart} duration={charts.duration} cursorT={cursor.t} />
                  ))}
                </div>
              )}
            </div>

            <p className="projectile-note">
              {isStairs
                ? model.landing
                  ? (
                    <>
                      以 {state.speed.toFixed(1)} m/s {Math.abs(state.angle) < 1e-6 ? "水平" : `${state.angle.toFixed(0)}° 斜向`}離開階梯頂端，落在第 {model.landing.step} 階。
                      {model.horizontalStep ? (
                        <>
                          水平拋出可用 <Tex>{`n = \\left\\lceil 2v_0^2 r / (g w^2) \\right\\rceil = ${model.horizontalStep}`}</Tex> 驗算；<Tex>{"n"}</Tex> 與 <Tex>{"v_0^2"}</Tex> 成正比。
                        </>
                      ) : null}
                    </>
                  )
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
    </MathProvider>
  );
}
