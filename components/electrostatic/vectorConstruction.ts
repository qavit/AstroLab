import type { Vec2 } from "../../lib/science/electrostatics/types.ts";

export interface VectorSegment {
  readonly from: Vec2;
  readonly to: Vec2;
}

export interface VectorConstruction {
  /** One shared px-per-(N/C) factor applied to every vector below; never chosen per-vector. */
  readonly scale_px_per_NperC: number;
  /** Screen-space displacement of each contribution, in input order, drawn from the probe point. */
  readonly contributions: readonly Vec2[];
  /**
   * Parallelogram construction segments (the two "opposite sides" translated to each
   * contribution's tip, both meeting at the resultant's tip) — only for exactly two
   * contributions. Empty for one contribution (nothing to construct) and for three or more
   * (v0.1 shows individual contributions + resultant only, with no arbitrary chain ordering).
   */
  readonly chain: readonly VectorSegment[];
  /** Screen-space displacement of the resultant (sum of `contributions`), drawn from the probe point. */
  readonly resultant: Vec2;
}

/**
 * Calibration anchors for the probe-vector envelope radius: at a 320px-wide mobile Canvas the
 * construction should read at roughly 56-72px, and at a typical desktop Canvas roughly 90-120px.
 * Linear between them, clamped at the ends — camera zoom is irrelevant here, this only tracks
 * the Canvas element's own on-screen size, never `camera.scale`.
 */
const ENVELOPE_MIN_DIMENSION_PX = 320;
const ENVELOPE_MIN_RADIUS_PX = 64;
const ENVELOPE_REFERENCE_DIMENSION_PX = 700;
const ENVELOPE_REFERENCE_RADIUS_PX = 105;
const ENVELOPE_FLOOR_PX = 56;
const ENVELOPE_CEILING_PX = 120;

/** Bounded, viewport-aware envelope radius for the probe's vector-addition construction. */
export function probeVectorEnvelopeRadius(canvasMinDimension_px: number): number {
  const slope = (ENVELOPE_REFERENCE_RADIUS_PX - ENVELOPE_MIN_RADIUS_PX) / (ENVELOPE_REFERENCE_DIMENSION_PX - ENVELOPE_MIN_DIMENSION_PX);
  const radius = ENVELOPE_MIN_RADIUS_PX + slope * (canvasMinDimension_px - ENVELOPE_MIN_DIMENSION_PX);
  return Math.min(ENVELOPE_CEILING_PX, Math.max(ENVELOPE_FLOOR_PX, radius));
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function magnitude(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Builds a vector-addition construction (individual contributions, an optional parallelogram
 * construction, and the resultant) from physical field components, all displayed through one
 * shared linear scale.
 *
 * `display(E_total) = sum(display(E_i))` holds by construction: every displacement here is the
 * same `scale` times the physical component it represents, so relative magnitude and the
 * addition geometry are both preserved — nothing is normalized or clipped per vector. `scale` is
 * chosen only to fit the whole construction (every contribution and the resultant) inside
 * `maxRadius_px`.
 */
export function buildVectorConstruction(components: readonly Vec2[], maxRadius_px: number): VectorConstruction {
  const total = components.reduce(add, { x: 0, y: 0 });
  const maxExtent = Math.max(0, ...components.map(magnitude), magnitude(total));
  const scale = maxExtent > 0 ? maxRadius_px / maxExtent : 0;
  const scaled = (v: Vec2): Vec2 => ({ x: v.x * scale, y: v.y * scale });
  const scaledComponents = components.map(scaled);
  const scaledTotal = scaled(total);
  // Parallelogram: both real contribution vectors start at the probe; the two dashed sides are
  // each contribution translated to the other's tip, both landing on the resultant's tip.
  const chain: VectorSegment[] = components.length === 2
    ? [
        { from: scaledComponents[0], to: scaledTotal },
        { from: scaledComponents[1], to: scaledTotal },
      ]
    : [];
  return {
    scale_px_per_NperC: scale,
    contributions: scaledComponents,
    chain,
    resultant: scaledTotal,
  };
}
