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
  /** Head-to-tail construction segments; empty when there is nothing to construct from (<=1 contribution). */
  readonly chain: readonly VectorSegment[];
  /** Screen-space displacement of the resultant (sum of `contributions`), drawn from the probe point. */
  readonly resultant: Vec2;
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function magnitude(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Builds a vector-addition construction (individual contributions, a head-to-tail chain, and
 * the resultant) from physical field components, all displayed through one shared linear scale.
 *
 * `display(E_total) = sum(display(E_i))` holds by construction: every displacement here is the
 * same `scale` times the physical component it represents, so relative magnitude and the
 * addition geometry are both preserved — nothing is normalized or clipped per vector. `scale` is
 * chosen only to fit the whole construction (every contribution and every point the head-to-tail
 * chain visits) inside `maxRadius_px`.
 */
export function buildVectorConstruction(components: readonly Vec2[], maxRadius_px: number): VectorConstruction {
  const total = components.reduce(add, { x: 0, y: 0 });
  const cumulative: Vec2[] = [];
  let running: Vec2 = { x: 0, y: 0 };
  for (const component of components) {
    running = add(running, component);
    cumulative.push(running);
  }
  const maxExtent = Math.max(0, ...components.map(magnitude), ...cumulative.map(magnitude));
  const scale = maxExtent > 0 ? maxRadius_px / maxExtent : 0;
  const scaled = (v: Vec2): Vec2 => ({ x: v.x * scale, y: v.y * scale });
  const origin: Vec2 = { x: 0, y: 0 };
  const chain: VectorSegment[] = components.length > 1
    ? components.map((_, index) => ({
        from: scaled(index === 0 ? origin : cumulative[index - 1]),
        to: scaled(cumulative[index]),
      }))
    : [];
  return {
    scale_px_per_NperC: scale,
    contributions: components.map(scaled),
    chain,
    resultant: scaled(total),
  };
}
