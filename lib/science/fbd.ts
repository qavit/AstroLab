export type Vec2 = Readonly<{
  x: number;
  y: number;
}>;

export type ForceVector = Readonly<{
  /** Force magnitude in newtons. `null` means the learner has not assigned a magnitude yet. */
  magnitudeN: number | null;
  /** Unit direction in diagram coordinates. */
  direction: Vec2;
}>;

const EPSILON = 1e-12;

export function vectorMagnitude(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

export function normalize(vector: Vec2): Vec2 | null {
  const length = vectorMagnitude(vector);
  if (!Number.isFinite(length) || length <= EPSILON) {
    return null;
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

/** Degrees measured counter-clockwise from +x. */
export function directionFromDegrees(degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians),
  };
}

export function forceComponents(force: ForceVector): Vec2 | null {
  if (force.magnitudeN === null || force.magnitudeN < 0) {
    return null;
  }
  const direction = normalize(force.direction);
  if (!direction) {
    return null;
  }
  return {
    x: force.magnitudeN * direction.x,
    y: force.magnitudeN * direction.y,
  };
}

export type KnownForceResolution = Readonly<{
  /** Resultant of only the forces whose magnitudes and directions are numerically valid. */
  knownResultantN: Vec2;
  knownCount: number;
  unknownCount: number;
  /** True only when every force is numerically known. */
  isComplete: boolean;
}>;

/**
 * Resolve the numerically known subset without pretending that a partial sum is the net force.
 * Qualitative FBD work is allowed to leave magnitudes unknown, so callers must check `isComplete`
 * before interpreting `knownResultantN` as the total force.
 */
export function resolveKnownForces(
  forces: readonly ForceVector[],
): KnownForceResolution {
  let x = 0;
  let y = 0;
  let knownCount = 0;
  let unknownCount = 0;

  for (const force of forces) {
    const components = forceComponents(force);
    if (!components) {
      unknownCount += 1;
      continue;
    }
    x += components.x;
    y += components.y;
    knownCount += 1;
  }

  return {
    knownResultantN: { x, y },
    knownCount,
    unknownCount,
    isComplete: unknownCount === 0,
  };
}

export function accelerationFromForce(
  forceN: Vec2,
  massKg: number | null,
): Vec2 | null {
  if (massKg === null || !Number.isFinite(massKg) || massKg <= 0) {
    return null;
  }
  return {
    x: forceN.x / massKg,
    y: forceN.y / massKg,
  };
}
