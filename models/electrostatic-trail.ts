/**
 * Bounded visual trail for the Electrostatic test particle. The trail is runtime evidence
 * built only from accepted particle states; it is never physics state and never serialized.
 * When full it keeps every other point and doubles its stride, so storage stays bounded while
 * the path shape stays representative. Physics steps themselves are never decimated.
 */

export const TRAIL_LIMIT = 5000;

export interface ParticleTrail {
  /** Interleaved x, y world coordinates (m), oldest first. */
  readonly points: Float64Array;
  readonly count: number;
  /** Accepted macro steps per recorded point. */
  readonly stride: number;
  /** Accepted macro steps since the last recorded point. */
  readonly sinceLast: number;
}

export function createTrail(x_m: number, y_m: number): ParticleTrail {
  const points = new Float64Array(2 * TRAIL_LIMIT);
  points[0] = x_m;
  points[1] = y_m;
  return { points, count: 1, stride: 1, sinceLast: 0 };
}

/** Mutable working copy used to append a batch of states with a single allocation. */
export interface TrailBuilder {
  points: Float64Array;
  count: number;
  stride: number;
  sinceLast: number;
}

export function beginTrail(trail: ParticleTrail): TrailBuilder {
  return { points: new Float64Array(trail.points), count: trail.count, stride: trail.stride, sinceLast: trail.sinceLast };
}

function decimate(builder: TrailBuilder): void {
  let kept = 0;
  for (let i = 0; i < builder.count; i += 2) {
    builder.points[2 * kept] = builder.points[2 * i];
    builder.points[2 * kept + 1] = builder.points[2 * i + 1];
    kept += 1;
  }
  builder.count = kept;
  builder.stride *= 2;
}

/** Record one accepted macro-step state. `force` always records it (stop points). */
export function pushTrail(builder: TrailBuilder, x_m: number, y_m: number, force = false): void {
  builder.sinceLast += 1;
  if (!force && builder.sinceLast < builder.stride) return;
  if (builder.count >= TRAIL_LIMIT) decimate(builder);
  builder.points[2 * builder.count] = x_m;
  builder.points[2 * builder.count + 1] = y_m;
  builder.count += 1;
  builder.sinceLast = 0;
}

export function finishTrail(builder: TrailBuilder): ParticleTrail {
  return { points: builder.points, count: builder.count, stride: builder.stride, sinceLast: builder.sinceLast };
}

export function trailPoint(trail: ParticleTrail, index: number): { x: number; y: number } {
  return { x: trail.points[2 * index], y: trail.points[2 * index + 1] };
}
