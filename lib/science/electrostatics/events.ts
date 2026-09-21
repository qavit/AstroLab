import { orderSources } from "./field.ts";
import type { Domain, SourceCharge, StopReason, Vec2 } from "./types.ts";

/** Tolerance on the orthogonal coordinate when a segment crosses a domain edge. */
const EDGE_SLACK_M = 1e-12;

export interface SegmentEvent {
  /** Fraction of the segment p0 → p1 at the first intersection, in [0, 1]. */
  readonly fraction: number;
  readonly reason: StopReason;
  readonly sourceId?: string;
}

/**
 * First intersection of the straight segment p0 → p1 with any excluded core circle
 * |r − r_i| = rCore. Solves |p0 + s(p1 − p0) − r_i|² = rCore² for s ∈ [0, 1].
 */
export function firstCoreIntersection(
  p0: Vec2,
  p1: Vec2,
  sources: readonly SourceCharge[],
  rCore_m: number,
): { fraction: number; sourceId: string } | null {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  let best: { fraction: number; sourceId: string } | null = null;
  for (const source of orderSources(sources)) {
    const fx = p0.x - source.x_m;
    const fy = p0.y - source.y_m;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - rCore_m * rCore_m;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;
    const root = Math.sqrt(Math.max(0, discriminant));
    for (const s of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      if (s >= 0 && s <= 1 && (best === null || s < best.fraction)) {
        best = { fraction: s, sourceId: source.id };
      }
    }
  }
  return best;
}

/** First crossing of the domain rectangle by p0 → p1, or null while p1 is still inside. */
export function firstBoundaryIntersection(p0: Vec2, p1: Vec2, domain: Domain): number | null {
  if (p1.x >= domain.xmin && p1.x <= domain.xmax && p1.y >= domain.ymin && p1.y <= domain.ymax) {
    return null;
  }
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  let best: number | null = null;
  const consider = (s: number) => {
    if (best === null || s < best) best = s;
  };
  if (dx !== 0) {
    for (const x of [domain.xmin, domain.xmax]) {
      const s = (x - p0.x) / dx;
      const y = p0.y + s * dy;
      if (s >= 0 && s <= 1 && y >= domain.ymin - EDGE_SLACK_M && y <= domain.ymax + EDGE_SLACK_M) consider(s);
    }
  }
  if (dy !== 0) {
    for (const y of [domain.ymin, domain.ymax]) {
      const s = (y - p0.y) / dy;
      const x = p0.x + s * dx;
      if (s >= 0 && s <= 1 && x >= domain.xmin - EDGE_SLACK_M && x <= domain.xmax + EDGE_SLACK_M) consider(s);
    }
  }
  return best;
}

/**
 * Earliest stop event on a trial segment. On an exact tie the core event wins, because the
 * point is then already outside the model's validity region.
 */
export function firstSegmentEvent(
  p0: Vec2,
  p1: Vec2,
  sources: readonly SourceCharge[],
  domain: Domain,
  rCore_m: number,
): SegmentEvent | null {
  const core = firstCoreIntersection(p0, p1, sources, rCore_m);
  const boundary = firstBoundaryIntersection(p0, p1, domain);
  if (core !== null && (boundary === null || core.fraction <= boundary)) {
    return { fraction: core.fraction, reason: "entered-source-core", sourceId: core.sourceId };
  }
  if (boundary !== null) return { fraction: boundary, reason: "left-domain" };
  return null;
}

/** Point p0 + s (p1 − p0). */
export function pointOnSegment(p0: Vec2, p1: Vec2, fraction: number): Vec2 {
  return { x: p0.x + fraction * (p1.x - p0.x), y: p0.y + fraction * (p1.y - p0.y) };
}
