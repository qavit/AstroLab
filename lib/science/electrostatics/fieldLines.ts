import { fieldAt, orderSources } from "./field.ts";
import type { Domain, SourceCharge, Vec2 } from "./types.ts";

/**
 * Electric field lines: integral curves of the same `fieldAt()` field,
 *   dr/ds = E(r) / |E(r)|,
 * where s is arc length (a geometric parameter, never time). The field is the planar slice of
 * the 3D point-charge Coulomb field, so lines seeded in the plane stay in the plane.
 *
 * Renderer-neutral: world-space points and typed terminal reasons only; no pixels or styling.
 */

export interface FieldLineOptions {
  /** Adaptive RK4 step envelope along arc length, in metres. */
  readonly hInitial_m: number;
  readonly hMin_m: number;
  readonly hMax_m: number;
  /** Accepted local error of one step, measured by step doubling, in metres. */
  readonly tolerance_m: number;
  /** Per half-line (each direction away from the seed) safety limits. */
  readonly maxLength_m: number;
  readonly maxSteps: number;
  /** A half-line returning within this distance of its own earlier path is a numerical loop. */
  readonly loopRadius_m: number;
  /** Seed ring radius as a multiple of the core radius; must be > 1. */
  readonly seedRadiusFactor: number;
}

export const FIELD_LINE_OPTIONS_V1: FieldLineOptions = {
  hInitial_m: 0.02,
  hMin_m: 0.002,
  hMax_m: 0.04,
  tolerance_m: 2e-5,
  maxLength_m: 12,
  maxSteps: 4000,
  loopRadius_m: 0.004,
  seedRadiusFactor: 1.2,
};

/** Arc length that must separate two points of one half-line before proximity counts as a loop. */
const LOOP_ARC_EXCLUSION_M = 0.5;

export type FieldLineTerminal =
  | { readonly reason: "source-core"; readonly sourceId: string }
  | { readonly reason: "domain-boundary" }
  /** The field vanishes, or its direction reverses within one minimum step (a null point). */
  | { readonly reason: "zero-field" }
  | { readonly reason: "max-length" }
  | { readonly reason: "max-steps" }
  | { readonly reason: "no-progress" }
  | { readonly reason: "numerical-loop" }
  | { readonly reason: "invalid-field" };

export interface FieldLineSeed {
  readonly sourceId: string;
  /** Index among this source's candidate seeds, and their count. */
  readonly index: number;
  readonly count: number;
  /** Angle from +x, counter-clockwise, around the source centre. */
  readonly angle_rad: number;
  readonly point: Vec2;
}

export interface FieldLine {
  readonly seed: FieldLineSeed;
  /** Always ordered along +E: points[0] is the upstream end, the last point the downstream end. */
  readonly orientation: "along-E";
  readonly points: readonly Vec2[];
  /** Why the line stops at points[0] (tracing along −E) and at the last point (along +E). */
  readonly start: FieldLineTerminal;
  readonly end: FieldLineTerminal;
  readonly length_m: number;
  readonly acceptedSteps: number;
}

interface HalfLine {
  /** Points after the seed, in tracing order. */
  readonly points: Vec2[];
  readonly terminal: FieldLineTerminal;
  readonly length_m: number;
  readonly steps: number;
}

type Direction =
  | { readonly ok: true; readonly x: number; readonly y: number }
  | { readonly ok: false; readonly terminal: FieldLineTerminal };

function direction(point: Vec2, sources: readonly SourceCharge[], rCore_m: number, sign: 1 | -1): Direction {
  const field = fieldAt(point, sources, rCore_m);
  if (!field.valid) {
    return field.reason === "inside-source-core" && field.sourceId !== undefined
      ? { ok: false, terminal: { reason: "source-core", sourceId: field.sourceId } }
      : { ok: false, terminal: { reason: "invalid-field" } };
  }
  // Never normalize an undefined direction.
  if (field.isZero) return { ok: false, terminal: { reason: "zero-field" } };
  const scale = sign / field.magnitude_N_per_C;
  return { ok: true, x: field.Ex_N_per_C * scale, y: field.Ey_N_per_C * scale };
}

type Rk4 =
  | { readonly ok: true; readonly point: Vec2; readonly minStageDot: number }
  | { readonly ok: false; readonly terminal: FieldLineTerminal };

/** One classical RK4 step of length h in the unit direction field. */
function rk4(point: Vec2, h: number, sources: readonly SourceCharge[], rCore_m: number, sign: 1 | -1): Rk4 {
  const k1 = direction(point, sources, rCore_m, sign);
  if (!k1.ok) return k1;
  const k2 = direction({ x: point.x + 0.5 * h * k1.x, y: point.y + 0.5 * h * k1.y }, sources, rCore_m, sign);
  if (!k2.ok) return k2;
  const k3 = direction({ x: point.x + 0.5 * h * k2.x, y: point.y + 0.5 * h * k2.y }, sources, rCore_m, sign);
  if (!k3.ok) return k3;
  const k4 = direction({ x: point.x + h * k3.x, y: point.y + h * k3.y }, sources, rCore_m, sign);
  if (!k4.ok) return k4;
  const minStageDot = Math.min(k1.x * k2.x + k1.y * k2.y, k1.x * k3.x + k1.y * k3.y, k1.x * k4.x + k1.y * k4.y);
  return {
    ok: true,
    point: {
      x: point.x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: point.y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    },
    minStageDot,
  };
}

function insideDomain(point: Vec2, domain: Domain): boolean {
  return point.x >= domain.xmin && point.x <= domain.xmax && point.y >= domain.ymin && point.y <= domain.ymax;
}

interface Crossing {
  readonly t: number;
  readonly point: Vec2;
  readonly terminal: FieldLineTerminal;
}

/**
 * First place the chord a→b (a valid, inside the domain) meets a core circle or leaves the domain
 * rectangle. Core entry is the smaller root of |a + t(b − a) − c|² = rCore²; the returned point is
 * snapped radially onto the circle so it lies on the boundary to rounding, never inside.
 */
function firstCrossing(a: Vec2, b: Vec2, sources: readonly SourceCharge[], domain: Domain, rCore_m: number): Crossing | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let best: Crossing | null = null;
  const A = dx * dx + dy * dy;
  if (A === 0) return null;
  for (const source of sources) {
    const fx = a.x - source.x_m;
    const fy = a.y - source.y_m;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - rCore_m * rCore_m;
    const disc = B * B - 4 * A * C;
    if (disc < 0) continue;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t < 0 || t > 1 || (best !== null && t >= best.t)) continue;
    const px = a.x + t * dx - source.x_m;
    const py = a.y + t * dy - source.y_m;
    const r = Math.hypot(px, py);
    best = {
      t,
      point: { x: source.x_m + (px * rCore_m) / r, y: source.y_m + (py * rCore_m) / r },
      terminal: { reason: "source-core", sourceId: source.id },
    };
  }
  if (!insideDomain(b, domain)) {
    // Liang–Barsky style: the smallest t at which one of the four boundary lines is crossed outward.
    let t = 1;
    if (dx > 0 && b.x > domain.xmax) t = Math.min(t, (domain.xmax - a.x) / dx);
    if (dx < 0 && b.x < domain.xmin) t = Math.min(t, (domain.xmin - a.x) / dx);
    if (dy > 0 && b.y > domain.ymax) t = Math.min(t, (domain.ymax - a.y) / dy);
    if (dy < 0 && b.y < domain.ymin) t = Math.min(t, (domain.ymin - a.y) / dy);
    if (best === null || t < best.t) {
      const point = {
        x: Math.min(domain.xmax, Math.max(domain.xmin, a.x + t * dx)),
        y: Math.min(domain.ymax, Math.max(domain.ymin, a.y + t * dy)),
      };
      best = { t, point, terminal: { reason: "domain-boundary" } };
    }
  }
  return best;
}

/** Proximity index over one half-line's accepted points, for the self-return guard. */
class LoopGuard {
  private readonly cells = new Map<number, number[]>();
  private readonly radius: number;

  constructor(radius: number) {
    this.radius = radius;
  }

  private key(ix: number, iy: number): number {
    return ix * 1_000_003 + iy;
  }

  /** True if `point` comes back near a point at least LOOP_ARC_EXCLUSION_M of arc earlier. */
  revisits(point: Vec2, arc_m: number, path: readonly Vec2[], arcs: readonly number[]): boolean {
    const ix = Math.floor(point.x / this.radius);
    const iy = Math.floor(point.y / this.radius);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        for (const index of this.cells.get(this.key(ix + ox, iy + oy)) ?? []) {
          if (arc_m - arcs[index] < LOOP_ARC_EXCLUSION_M) continue;
          if (Math.hypot(point.x - path[index].x, point.y - path[index].y) < this.radius) return true;
        }
      }
    }
    return false;
  }

  add(point: Vec2, index: number): void {
    const key = this.key(Math.floor(point.x / this.radius), Math.floor(point.y / this.radius));
    const list = this.cells.get(key);
    if (list) list.push(index);
    else this.cells.set(key, [index]);
  }
}

/**
 * Trace from `start` along sign·E until a typed terminal. Adaptive step doubling: one RK4 step of
 * h against two of h/2; reject and halve while the difference exceeds the tolerance, grow ×2 when
 * it is 32× smaller. A step whose stages reverse direction, touch invalid field, or whose chord
 * meets a core is refined down to hMin before a terminal is declared.
 */
function traceHalf(
  start: Vec2,
  sign: 1 | -1,
  sources: readonly SourceCharge[],
  domain: Domain,
  rCore_m: number,
  options: FieldLineOptions,
): HalfLine {
  const points: Vec2[] = [];
  const path: Vec2[] = [start];
  const arcs: number[] = [0];
  const guard = new LoopGuard(options.loopRadius_m);
  guard.add(start, 0);
  let p = start;
  let h = options.hInitial_m;
  let length = 0;
  let steps = 0;
  const finish = (terminal: FieldLineTerminal): HalfLine => ({ points, terminal, length_m: length, steps });

  for (;;) {
    if (steps >= options.maxSteps) return finish({ reason: "max-steps" });
    if (length >= options.maxLength_m) return finish({ reason: "max-length" });

    const full = rk4(p, h, sources, rCore_m, sign);
    const half1 = full.ok ? rk4(p, h / 2, sources, rCore_m, sign) : full;
    const half2 = half1.ok ? rk4(half1.point, h / 2, sources, rCore_m, sign) : half1;
    const atMin = h <= options.hMin_m;

    if (!full.ok || !half1.ok || !half2.ok) {
      if (!atMin) { h = Math.max(options.hMin_m, h / 2); continue; }
      const failure = !full.ok ? full.terminal : !half1.ok ? half1.terminal : (half2 as { terminal: FieldLineTerminal }).terminal;
      if (failure.reason !== "source-core") return finish(failure);
      // A stage within hMin reached a core: continue the current direction onto the circle.
      const d = direction(p, sources, rCore_m, sign);
      if (!d.ok) return finish(d.terminal);
      const reach = 4 * options.hMin_m;
      const crossing = firstCrossing(p, { x: p.x + reach * d.x, y: p.y + reach * d.y }, sources, domain, rCore_m);
      if (!crossing) return finish({ reason: "invalid-field" });
      points.push(crossing.point);
      length += Math.hypot(crossing.point.x - p.x, crossing.point.y - p.y);
      steps += 1;
      return finish(crossing.terminal);
    }

    const error = Math.hypot(full.point.x - half2.point.x, full.point.y - half2.point.y);
    const reversal = Math.min(full.minStageDot, half1.minStageDot, half2.minStageDot) < 0;
    if ((error > options.tolerance_m || reversal) && !atMin) { h = Math.max(options.hMin_m, h / 2); continue; }
    // Direction flips within one minimum step: the line has run into a null point.
    if (reversal) return finish({ reason: "zero-field" });

    const q = half2.point;
    const crossing = firstCrossing(p, q, sources, domain, rCore_m);
    if (crossing) {
      if (crossing.terminal.reason === "source-core" && !atMin) { h = Math.max(options.hMin_m, h / 2); continue; }
      points.push(crossing.point);
      length += Math.hypot(crossing.point.x - p.x, crossing.point.y - p.y);
      steps += 1;
      return finish(crossing.terminal);
    }

    const advance = Math.hypot(q.x - p.x, q.y - p.y);
    if (advance < 0.25 * h) return finish({ reason: "no-progress" });
    const arc = length + advance;
    if (guard.revisits(q, arc, path, arcs)) return finish({ reason: "numerical-loop" });

    points.push(q);
    path.push(q);
    arcs.push(arc);
    guard.add(q, path.length - 1);
    length = arc;
    steps += 1;
    p = q;
    if (error < options.tolerance_m / 32) h = Math.min(options.hMax_m, 2 * h);
  }
}

/**
 * Trace the whole field line through `seed`: along −E to its upstream end and along +E to its
 * downstream end, joined so the result is always ordered along +E. A seed next to a negative
 * source therefore yields boundary/positive-core → negative core, exactly as a seed next to a
 * positive source yields positive core → boundary/negative core.
 */
export function traceFieldLine(
  seed: Vec2,
  sources: readonly SourceCharge[],
  domain: Domain,
  rCore_m: number,
  options: FieldLineOptions = FIELD_LINE_OPTIONS_V1,
): Omit<FieldLine, "seed"> {
  const ordered = orderSources(sources);
  const upstream = traceHalf(seed, -1, ordered, domain, rCore_m, options);
  const downstream = traceHalf(seed, 1, ordered, domain, rCore_m, options);
  return {
    orientation: "along-E",
    points: [...upstream.points.reverse(), seed, ...downstream.points],
    start: upstream.terminal,
    end: downstream.terminal,
    length_m: upstream.length_m + downstream.length_m,
    acceptedSteps: upstream.steps + downstream.steps,
  };
}

/** Every non-zero source gets the same seeds, every 30° from +x. */
export const SEEDS_PER_SOURCE = 12;

/**
 * Field-line count is a presentation sampling convention, never an encoding of |E| (the arrows,
 * the strength map and the probe readout carry magnitude). So the count does not depend on |q|:
 * editing a source's charge never moves a seed.
 */
export function seedCountForCharge(q_C: number): number {
  return Math.abs(q_C) > 0 ? SEEDS_PER_SOURCE : 0;
}

/**
 * Deterministic source-centred candidates on a ring just outside each core, at angles 2πk/n from
 * +x (n = 12, so every 30°; the set is closed under both mirrors and 90° rotation). The
 * count is a display density choice, not a physical quantity. Candidates that fall inside another
 * source's core or outside the domain are omitted (their index stays visible through `count`).
 */
export function fieldLineSeeds(
  sources: readonly SourceCharge[],
  domain: Domain,
  rCore_m: number,
  options: FieldLineOptions = FIELD_LINE_OPTIONS_V1,
): FieldLineSeed[] {
  const radius = options.seedRadiusFactor * rCore_m;
  const seeds: FieldLineSeed[] = [];
  const ordered = orderSources(sources);
  for (const source of ordered) {
    const count = seedCountForCharge(source.q_C);
    for (let index = 0; index < count; index += 1) {
      const angle = (2 * Math.PI * index) / count;
      const point = { x: source.x_m + radius * Math.cos(angle), y: source.y_m + radius * Math.sin(angle) };
      if (!insideDomain(point, domain) || !fieldAt(point, ordered, rCore_m).valid) continue;
      seeds.push({ sourceId: source.id, index, count, angle_rad: angle, point });
    }
  }
  return seeds;
}

/** All candidate lines of a scene, one per seed. Gate 1 does no de-duplication. */
export function traceFieldLines(
  sources: readonly SourceCharge[],
  domain: Domain,
  rCore_m: number,
  options: FieldLineOptions = FIELD_LINE_OPTIONS_V1,
): FieldLine[] {
  return fieldLineSeeds(sources, domain, rCore_m, options).map((seed) => ({
    seed,
    ...traceFieldLine(seed.point, sources, domain, rCore_m, options),
  }));
}
