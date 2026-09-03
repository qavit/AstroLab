/**
 * Projectile motion. The vacuum case is solved in closed form throughout — every trajectory,
 * range, apex, envelope, and staircase landing below is evaluated from an algebraic expression,
 * never stepped forward in time. That is the model's whole point: horizontal and vertical motion
 * are independent, so the answer is available directly rather than accumulated.
 *
 * Air drag is the one exception and is confined to the clearly marked section at the bottom of
 * this file, because quadratic drag has no elementary closed-form solution. Nothing above that
 * marker integrates anything.
 */

export type Vec2 = { x: number; y: number };

/** Standard gravity, m/s². */
export const STANDARD_GRAVITY = 9.80665;

/** Surface gravity of other bodies, m/s² — the same launch, somewhere else. */
export const GRAVITY_PRESETS = {
  earth: { label: "地球", value: STANDARD_GRAVITY },
  moon: { label: "月球", value: 1.625 },
  mars: { label: "火星", value: 3.7278 },
  jupiter: { label: "木星", value: 24.79 },
} as const;

const vec = (x: number, y: number): Vec2 => ({ x, y });
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The launch velocity components, which is the only place the launch angle is ever resolved —
 * everything downstream works from vₓ and v_y so their independence stays visible in the code. */
export function launchVelocity(speed: number, angleDeg: number): Vec2 {
  const angle = radians(angleDeg);
  return vec(speed * Math.cos(angle), speed * Math.sin(angle));
}

/** Position at time `t`, measured from the launch point at height `height`. Horizontal motion is
 * uniform, vertical motion is uniformly accelerated; neither term contains the other. */
export function position(velocity: Vec2, height: number, gravity: number, t: number): Vec2 {
  return vec(velocity.x * t, height + velocity.y * t - 0.5 * gravity * t * t);
}

/** Velocity at time `t`. vₓ never changes; only v_y does. */
export function velocityAt(velocity: Vec2, gravity: number, t: number): Vec2 {
  return vec(velocity.x, velocity.y - gravity * t);
}

/**
 * Time from launch until the projectile returns to y = 0, launched from `height` above it.
 * The positive root of ½gt² − v_y t − h = 0. Zero gravity never lands, and is reported as null
 * rather than as an infinite flight the caller would have to special-case anyway.
 */
export function flightTime(velocity: Vec2, height: number, gravity: number): number | null {
  if (gravity <= 0) return null;
  const discriminant = velocity.y ** 2 + 2 * gravity * height;
  if (discriminant < 0) return null;
  return (velocity.y + Math.sqrt(discriminant)) / gravity;
}

/** Horizontal distance covered before landing. */
export function range(speed: number, angleDeg: number, height: number, gravity: number): number {
  const velocity = launchVelocity(speed, angleDeg);
  const t = flightTime(velocity, height, gravity);
  return t === null ? 0 : velocity.x * t;
}

/** The highest point reached, and when. A projectile launched downward peaks at t = 0, at the
 * launch point itself. */
export function apex(velocity: Vec2, height: number, gravity: number): { t: number; point: Vec2 } {
  if (gravity <= 0 || velocity.y <= 0) return { t: 0, point: vec(0, height) };
  const t = velocity.y / gravity;
  return { t, point: vec(velocity.x * t, height + velocity.y ** 2 / (2 * gravity)) };
}

/**
 * The launch angle giving maximum range: sin θ* = 1 / √(2 + 2gh/v²).
 *
 * It is 45° only when the launch and landing heights are equal. Launching from above the landing
 * plane makes the optimum shallower, because extra hang time is already provided for free by the
 * initial height and is better spent on horizontal speed.
 */
export function optimalAngle(speed: number, height: number, gravity: number): number {
  if (speed <= 0 || gravity <= 0) return 45;
  const sine = 1 / Math.sqrt(2 + (2 * gravity * height) / speed ** 2);
  return (Math.asin(Math.min(1, sine)) * 180) / Math.PI;
}

/**
 * The other angle reaching the same landing point, 90° − θ.
 *
 * This is a true pairing only for a level launch (height = 0). Once the launch point is raised,
 * the two angles no longer share a range, and the model reports both distances rather than
 * asserting an equality that has stopped holding.
 */
export function complementaryAngle(angleDeg: number): number {
  return 90 - angleDeg;
}

/**
 * The safety parabola: y = h + v²/2g − gx²/2v². Sweeping every launch angle at a fixed speed
 * traces a family of trajectories whose outer boundary is this single parabola, and it is itself
 * a closed form — every point below it is reachable by some angle, every point above it by none.
 */
export function envelopeHeight(x: number, speed: number, height: number, gravity: number): number {
  if (speed <= 0 || gravity <= 0) return height;
  return height + speed ** 2 / (2 * gravity) - (gravity * x ** 2) / (2 * speed ** 2);
}

/** Horizontal reach of the safety parabola at ground level — the farthest point any angle can
 * reach at this speed, which is the range achieved by `optimalAngle`. */
export function envelopeReach(speed: number, height: number, gravity: number): number {
  if (speed <= 0 || gravity <= 0) return 0;
  return (speed / gravity) * Math.sqrt(speed ** 2 + 2 * gravity * height);
}

/**
 * The launch angles that hit a target at horizontal distance `x` and height `y` (both measured
 * from the launch point). Returns the low and high solutions, or null when the target lies
 * outside the safety parabola and no angle reaches it.
 */
export function anglesToTarget(x: number, y: number, speed: number, gravity: number): { low: number; high: number } | null {
  if (x <= 0 || speed <= 0 || gravity <= 0) return null;
  const discriminant = speed ** 4 - gravity * (gravity * x ** 2 + 2 * y * speed ** 2);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const toDegrees = (tangent: number) => (Math.atan(tangent) * 180) / Math.PI;
  const a = toDegrees((speed ** 2 - root) / (gravity * x));
  const b = toDegrees((speed ** 2 + root) / (gravity * x));
  return { low: Math.min(a, b), high: Math.max(a, b) };
}

/**
 * The acceleration split along and across the path. Gravity is constant, but the part of it that
 * changes the speed and the part that bends the path trade off continuously: at the apex all of
 * it is bending, and on a purely vertical path all of it is speeding up or slowing down.
 */
export type PathAcceleration = {
  speed: number;
  /** Along the direction of motion, signed: negative while climbing, positive while falling. */
  tangential: number;
  /** Perpendicular to the motion, always ≥ 0 — the part that curves the path. */
  normal: number;
  /** Curvature κ = a_n / v², maximal at the apex where the path is slowest and bending hardest. */
  curvature: number;
  /** Radius of the circle matching the path's bend here; infinite where the path is straight. */
  radiusOfCurvature: number;
};

export function pathAcceleration(velocity: Vec2, gravity: number, t: number): PathAcceleration {
  const current = velocityAt(velocity, gravity, t);
  const speed = Math.hypot(current.x, current.y);
  if (speed < 1e-9) {
    return { speed: 0, tangential: gravity, normal: 0, curvature: Infinity, radiusOfCurvature: 0 };
  }
  const tangential = (-gravity * current.y) / speed;
  const normal = (gravity * Math.abs(current.x)) / speed;
  const curvature = normal / speed ** 2;
  return {
    speed,
    tangential,
    normal,
    curvature,
    radiusOfCurvature: curvature > 1e-12 ? 1 / curvature : Infinity,
  };
}

export type TrajectorySample = { t: number; point: Vec2; velocity: Vec2 };

/** Samples the vacuum flight at `steps` equal time intervals. */
export function sampleTrajectory(
  velocity: Vec2,
  height: number,
  gravity: number,
  duration: number,
  steps = 120,
): TrajectorySample[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = (duration * index) / steps;
    return { t, point: position(velocity, height, gravity, t), velocity: velocityAt(velocity, gravity, t) };
  });
}

/* -------------------------------------------------------------------------------------------
 * Staircase landing
 * ---------------------------------------------------------------------------------------- */

export type Staircase = { /** Tread depth, m. */ width: number; /** Riser height, m. */ rise: number; count: number };

export type StaircaseLanding = { step: number; t: number; point: Vec2 };

/**
 * Which step a projectile launched from the top nose lands on. Step n's tread sits at y = −n·rise
 * and spans x ∈ [(n−1)·width, n·width], so the flight clears step n exactly when it is still
 * beyond that tread's outer edge as it passes the tread's height.
 *
 * Each step is one algebraic test, not a collision search: the time to fall to y = −n·rise is the
 * positive root of ½gt² − v_y t − n·rise = 0, and the step is cleared if v_x t exceeds n·width.
 * Returns null when the projectile clears the whole flight of stairs.
 */
export function staircaseLanding(
  velocity: Vec2,
  gravity: number,
  stairs: Staircase,
): StaircaseLanding | null {
  if (gravity <= 0) return null;
  for (let step = 1; step <= stairs.count; step += 1) {
    const drop = step * stairs.rise;
    const t = (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * gravity * drop)) / gravity;
    const x = velocity.x * t;
    if (x <= step * stairs.width) return { step, t, point: vec(x, -drop) };
  }
  return null;
}

/**
 * The classroom closed form for the horizontal-launch case: a ball rolled off the top at speed v
 * first strikes step n = ⌈2v²·rise / (g·width²)⌉. Doubling the speed therefore moves the landing
 * four steps' worth further down, not two.
 *
 * Only valid for a horizontal launch; `staircaseLanding` handles any launch angle.
 */
export function horizontalStaircaseStep(speed: number, gravity: number, stairs: Staircase): number {
  if (speed <= 0 || gravity <= 0 || stairs.width <= 0) return 1;
  return Math.max(1, Math.ceil((2 * speed ** 2 * stairs.rise) / (gravity * stairs.width ** 2)));
}

/* -------------------------------------------------------------------------------------------
 * Air drag — the only numerically integrated part of this module
 *
 * Quadratic drag, a = −g ĵ − k|v|v, has no elementary closed-form solution, so this section
 * steps the motion forward with RK4 instead of evaluating a formula. Everything above this
 * marker is exact; results from here carry integration error and are labelled as such in the UI.
 * ---------------------------------------------------------------------------------------- */

/** Drag factor k = ½ρC_dA/m, in m⁻¹. A baseball is near 0.006 m⁻¹; a ping-pong ball near 0.12. */
export const DRAG_PRESETS = {
  none: { label: "真空", value: 0 },
  baseball: { label: "棒球", value: 0.0055 },
  shuttlecock: { label: "羽球", value: 0.12 },
} as const;

type DragDerivative = { vx: number; vy: number; ax: number; ay: number };

function dragDerivative(vx: number, vy: number, gravity: number, k: number): DragDerivative {
  const speed = Math.hypot(vx, vy);
  return { vx, vy, ax: -k * speed * vx, ay: -gravity - k * speed * vy };
}

/**
 * Integrates the drag trajectory until it returns to y = 0, with a final linear interpolation onto
 * the ground so the reported landing point isn't quantized to the step size. `dt` is fixed; the
 * flight is capped so a runaway configuration terminates rather than spinning.
 */
export function sampleDragTrajectory(
  velocity: Vec2,
  height: number,
  gravity: number,
  dragFactor: number,
  dt = 0.002,
  maxTime = 120,
): TrajectorySample[] {
  const samples: TrajectorySample[] = [{ t: 0, point: vec(0, height), velocity: { ...velocity } }];
  let [x, y, vx, vy, t] = [0, height, velocity.x, velocity.y, 0];

  while (t < maxTime) {
    const k1 = dragDerivative(vx, vy, gravity, dragFactor);
    const k2 = dragDerivative(vx + (k1.ax * dt) / 2, vy + (k1.ay * dt) / 2, gravity, dragFactor);
    const k3 = dragDerivative(vx + (k2.ax * dt) / 2, vy + (k2.ay * dt) / 2, gravity, dragFactor);
    const k4 = dragDerivative(vx + k3.ax * dt, vy + k3.ay * dt, gravity, dragFactor);

    const nextX = x + (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx);
    const nextY = y + (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy);
    const nextVx = vx + (dt / 6) * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax);
    const nextVy = vy + (dt / 6) * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay);
    t += dt;

    if (nextY <= 0 && t > dt) {
      const fraction = y / (y - nextY);
      samples.push({
        t: t - dt + dt * fraction,
        point: vec(x + (nextX - x) * fraction, 0),
        velocity: vec(vx + (nextVx - vx) * fraction, vy + (nextVy - vy) * fraction),
      });
      break;
    }
    [x, y, vx, vy] = [nextX, nextY, nextVx, nextVy];
    samples.push({ t, point: vec(x, y), velocity: vec(vx, vy) });
  }

  return samples;
}

/** Thins an integrated trajectory down to `steps` evenly indexed samples for drawing, always
 * keeping the final landing sample so the drawn path ends exactly where the flight did. */
export function thinSamples(samples: TrajectorySample[], steps = 120): TrajectorySample[] {
  if (samples.length <= steps) return samples;
  const stride = (samples.length - 1) / steps;
  const thinned = Array.from({ length: steps }, (_, index) => samples[Math.round(index * stride)]);
  thinned.push(samples[samples.length - 1]);
  return thinned;
}
