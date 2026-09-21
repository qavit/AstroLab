import type {
  FieldContribution,
  FieldResult,
  SourceCharge,
  Vec2,
} from "./types.ts";

/** Coulomb constant k = 1/(4πε₀), N·m²/C². */
export const COULOMB_K = 8.9875517923e9;

/** Radius of the public excluded source core (D-03). */
export const R_CORE_M = 0.12;

/** Relative factor of the zero-field tolerance τ_zero = 1e-12 · max(1 N/C, Σ|E_i|). */
export const ZERO_FIELD_RELATIVE = 1e-12;

const TWO_PI = 2 * Math.PI;

/** Deterministic code-unit comparison, independent of locale. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sources in stable id order; returns the same array when it is already ordered. */
export function orderSources(sources: readonly SourceCharge[]): readonly SourceCharge[] {
  for (let i = 1; i < sources.length; i += 1) {
    if (compareIds(sources[i - 1].id, sources[i].id) > 0) {
      return [...sources].sort((a, b) => compareIds(a.id, b.id));
    }
  }
  return sources;
}

/** Neumaier-compensated running sum; order-stable and far less sensitive to cancellation. */
class CompensatedSum {
  private sum = 0;
  private carry = 0;

  add(value: number): void {
    const next = this.sum + value;
    if (Math.abs(this.sum) >= Math.abs(value)) {
      this.carry += this.sum - next + value;
    } else {
      this.carry += value - next + this.sum;
    }
    this.sum = next;
  }

  value(): number {
    return this.sum + this.carry;
  }
}

/** Angle from +x, counter-clockwise, normalised to [0, 2π). */
export function normalizedAngle(x: number, y: number): number {
  const angle = Math.atan2(y, x);
  const wrapped = angle < 0 ? angle + TWO_PI : angle;
  return wrapped >= TWO_PI ? 0 : wrapped;
}

/**
 * Electric field of fixed point charges at `point`:
 *   E_i = k q_i d_i / |d_i|³,  d_i = r − r_i,  E = Σ E_i.
 *
 * A point on or inside any excluded core (|d_i| ≤ rCore) is outside the model's validity:
 * the result is typed invalid and nothing is divided, clamped, softened or shifted.
 */
export function fieldAt(
  point: Vec2,
  sources: readonly SourceCharge[],
  rCore_m: number = R_CORE_M,
): FieldResult {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(rCore_m) || rCore_m < 0) {
    return { valid: false, reason: "non-finite-input" };
  }
  if (sources.length === 0) return { valid: false, reason: "no-sources" };
  const ordered = orderSources(sources);
  const rCoreSquared = rCore_m * rCore_m;
  const contributions: FieldContribution[] = [];
  const ex = new CompensatedSum();
  const ey = new CompensatedSum();
  const magnitudes = new CompensatedSum();

  for (const source of ordered) {
    if (!Number.isFinite(source.x_m) || !Number.isFinite(source.y_m) || !Number.isFinite(source.q_C)) {
      return { valid: false, reason: "non-finite-input" };
    }
    const dx = point.x - source.x_m;
    const dy = point.y - source.y_m;
    const r2 = dx * dx + dy * dy;
    if (r2 <= rCoreSquared || r2 === 0) {
      return { valid: false, reason: "inside-source-core", sourceId: source.id };
    }
    const r = Math.sqrt(r2);
    const scale = (COULOMB_K * source.q_C) / (r2 * r);
    const cx = scale * dx;
    const cy = scale * dy;
    const magnitude = Math.abs(COULOMB_K * source.q_C) / r2;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      return { valid: false, reason: "non-finite-input" };
    }
    ex.add(cx);
    ey.add(cy);
    magnitudes.add(magnitude);
    contributions.push({
      sourceId: source.id,
      dx_m: dx,
      dy_m: dy,
      r_m: r,
      Ex_N_per_C: cx,
      Ey_N_per_C: cy,
      magnitude_N_per_C: magnitude,
    });
  }

  const Ex = ex.value();
  const Ey = ey.value();
  const magnitude = Math.hypot(Ex, Ey);
  const zeroTolerance = ZERO_FIELD_RELATIVE * Math.max(1, magnitudes.value());
  const isZero = magnitude <= zeroTolerance;
  return {
    valid: true,
    contributions,
    Ex_N_per_C: Ex,
    Ey_N_per_C: Ey,
    magnitude_N_per_C: magnitude,
    zeroTolerance_N_per_C: zeroTolerance,
    isZero,
    direction_rad: isZero ? null : normalizedAngle(Ex, Ey),
  };
}

/** F = q E, in newtons. */
export function forceFromField(Ex_N_per_C: number, Ey_N_per_C: number, q_C: number): Vec2 {
  return { x: q_C * Ex_N_per_C, y: q_C * Ey_N_per_C };
}

/** a = (q/m) E, in m/s². */
export function accelerationFromField(
  Ex_N_per_C: number,
  Ey_N_per_C: number,
  q_C: number,
  mass_kg: number,
): Vec2 {
  const beta = q_C / mass_kg;
  return { x: beta * Ex_N_per_C, y: beta * Ey_N_per_C };
}

/** Distance from `point` to the nearest source centre, with that source's id. */
export function nearestSource(
  point: Vec2,
  sources: readonly SourceCharge[],
): { sourceId: string; distance_m: number } | null {
  let best: { sourceId: string; distance_m: number } | null = null;
  for (const source of orderSources(sources)) {
    const distance = Math.hypot(point.x - source.x_m, point.y - source.y_m);
    if (best === null || distance < best.distance_m) best = { sourceId: source.id, distance_m: distance };
  }
  return best;
}
