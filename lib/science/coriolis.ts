/**
 * Pure kinematics for the Coriolis effect: an exact rotating-frame coordinate transform of
 * straight-line inertial motion, plus the classroom Coriolis-parameter and Foucault-pendulum
 * formulas. The curvature a rotating observer sees is not a numerically integrated fictitious
 * force — it falls straight out of re-expressing a fixed straight line in spinning coordinates.
 */

export type PlanarPoint = { x: number; y: number };

/** Earth's sidereal angular velocity, rad/s. */
export const EARTH_ANGULAR_VELOCITY = 7.2921159e-5;

const point = (x: number, y: number): PlanarPoint => ({ x, y });

/**
 * Position at time `t` (s) of an object launched from `origin` at constant `velocity`, as seen by
 * an observer fixed in space. No real horizontal force acts on it once launched, so this is a
 * straight line — the ground truth every rotating view in this module is measured against.
 */
export function inertialPosition(origin: PlanarPoint, velocity: PlanarPoint, t: number): PlanarPoint {
  return point(origin.x + velocity.x * t, origin.y + velocity.y * t);
}

/**
 * The same inertial-frame point, expressed in coordinates that co-rotate with a disc or local
 * tangent plane spinning at `angularVelocity` (rad/s, positive = counterclockwise seen from
 * above). An exact coordinate rotation, not an integration: what looks curved from the disc is
 * entirely a bookkeeping artifact of the disc's own spinning coordinates.
 */
export function rotatingFramePosition(inertial: PlanarPoint, angularVelocity: number, t: number): PlanarPoint {
  const angle = angularVelocity * t;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return point(inertial.x * cos + inertial.y * sin, -inertial.x * sin + inertial.y * cos);
}

/**
 * Elapsed time until a straight inertial path launched from inside a circle of `radius` reaches
 * that radius (the disc's rim, or the edge of the visualized ground patch). Returns null if the
 * path never gets there, e.g. zero launch speed.
 */
export function exitTime(origin: PlanarPoint, velocity: PlanarPoint, radius: number): number | null {
  const speedSquared = velocity.x ** 2 + velocity.y ** 2;
  if (speedSquared < 1e-9) return null;
  const linear = 2 * (origin.x * velocity.x + origin.y * velocity.y);
  const constant = origin.x ** 2 + origin.y ** 2 - radius ** 2;
  const discriminant = linear ** 2 - 4 * speedSquared * constant;
  if (discriminant < 0) return null;
  const t = (-linear + Math.sqrt(discriminant)) / (2 * speedSquared);
  return t > 0 ? t : null;
}

export type TrajectorySample = { t: number; inertial: PlanarPoint; rotating: PlanarPoint };

/** Samples one flight in both frames at once, so callers draw the ghost line and the traced
 * curve from a single pass. */
export function sampleTrajectory(
  origin: PlanarPoint,
  velocity: PlanarPoint,
  angularVelocity: number,
  duration: number,
  steps = 96,
): TrajectorySample[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = (duration * index) / steps;
    const inertial = inertialPosition(origin, velocity, t);
    return { t, inertial, rotating: rotatingFramePosition(inertial, angularVelocity, t) };
  });
}

/**
 * Coriolis parameter f = 2Ω sinφ (s⁻¹): twice the local vertical component of an angular
 * velocity Ω (rad/s) at latitude φ. Its sign is the deflection sense — positive curves a moving
 * body to the right, negative to the left.
 */
export function coriolisParameter(latitude: number, angularVelocity: number): number {
  return 2 * angularVelocity * Math.sin((latitude * Math.PI) / 180);
}

/** The local vertical spin rate at `latitude` on a body turning at `angularVelocity` (rad/s) —
 * exactly what plays the role of a turntable's own rotation for a patch of ground at that
 * latitude. Zero at the equator, maximal (equal to the full rate) at the poles. */
export function localAngularVelocity(latitude: number, angularVelocity: number): number {
  return angularVelocity * Math.sin((latitude * Math.PI) / 180);
}

/** Hours for a Foucault pendulum's swing plane to complete one apparent rotation, relative to
 * the ground, at `latitude` on a body turning at `rotationRate` times Earth's rate. Infinite at
 * the equator, where the ground never turns the pendulum at all. */
export function foucaultPeriodHours(latitude: number, rotationRate = 1): number {
  const sinLatitude = Math.sin((latitude * Math.PI) / 180);
  if (Math.abs(sinLatitude) < 1e-9) return Infinity;
  const angularVelocity = EARTH_ANGULAR_VELOCITY * rotationRate * Math.abs(sinLatitude);
  return (2 * Math.PI) / angularVelocity / 3600;
}

export function deflectionSide(angularVelocity: number): "right" | "left" | "none" {
  if (angularVelocity > 1e-9) return "right";
  if (angularVelocity < -1e-9) return "left";
  return "none";
}
