import {
  DRAG_PRESETS,
  GRAVITY_PRESETS,
  STANDARD_GRAVITY,
  anglesToTarget,
  apex,
  complementaryAngle,
  envelopeHeight,
  envelopeReach,
  flightTime,
  horizontalStaircaseStep,
  launchVelocity,
  optimalAngle,
  pathAcceleration,
  position,
  sampleDragTrajectory,
  sampleTrajectory,
  staircaseLanding,
  thinSamples,
  velocityAt,
  type Staircase,
  type TrajectorySample,
  type Vec2,
} from "@/lib/science/projectile";

export { DRAG_PRESETS, GRAVITY_PRESETS };

/** 平地拋射 vs 階梯落點：兩者共用同一組運動方程式，只有「地面長什麼樣」不同。 */
export type ProjectileScenario = "field" | "staircase";

export type ProjectileState = {
  scenario: ProjectileScenario;
  /** Launch speed, m/s. */
  speed: number;
  /** Launch angle above the horizontal, degrees. */
  angle: number;
  /** Launch height above the landing plane, m. Ignored in the staircase scenario, where the
   * launch point is the top nose by definition. */
  height: number;
  /** Surface gravity, m/s². */
  gravity: number;
  /** Quadratic drag factor k = ½ρC_dA/m, m⁻¹. Zero is the vacuum case. */
  dragFactor: number;
  stairs: Staircase;
  showComplementary: boolean;
  showEnvelope: boolean;
  showAcceleration: boolean;
  showDrag: boolean;
  playing: boolean;
  /** Playback direction: +1 runs the flight forwards, −1 rewinds it. */
  direction: 1 | -1;
  animationSpeed: number;
};

/** Presets are complete display states, not partial patches: leaving a previous preset's
 * envelope or drag curve on top of the next one turns a demonstration into clutter. */
const OFF = { showComplementary: false, showEnvelope: false, showDrag: false, showAcceleration: true } as const;

/** Every preset states its own launch speed: the two scenarios work at speeds an order of
 * magnitude apart, so a preset that inherited the previous one's speed would land off-screen. */
export const PROJECTILE_PRESETS: Record<string, { label: string } & Partial<ProjectileState>> = {
  optimal45: { label: "45° 最遠", scenario: "field", speed: 24, angle: 45, height: 0, dragFactor: 0, ...OFF },
  complementary: { label: "互補角對比", scenario: "field", speed: 20, angle: 30, height: 0, dragFactor: 0, ...OFF, showComplementary: true },
  elevated: { label: "高台拋射", scenario: "field", speed: 20, angle: 30, height: 25, dragFactor: 0, ...OFF, showComplementary: true },
  envelope: { label: "安全拋物線", scenario: "field", speed: 20, angle: 60, height: 0, dragFactor: 0, ...OFF, showEnvelope: true },
  staircase: { label: "階梯落點", scenario: "staircase", speed: 4, angle: 0, dragFactor: 0, ...OFF },
  drag: { label: "羽球阻力", scenario: "field", speed: 22, angle: 40, height: 0, ...OFF, dragFactor: DRAG_PRESETS.shuttlecock.value, showDrag: true },
  moon: { label: "月球重力", scenario: "field", speed: 24, angle: 45, height: 0, dragFactor: 0, ...OFF, gravity: GRAVITY_PRESETS.moon.value },
};

/**
 * Sensible launches for each scenario. A 24 m/s throw is the natural scale for a field but flies
 * clean over any staircase, so switching scenario carries the launch parameters with it rather
 * than leaving the previous scenario's numbers behind to produce an empty frame.
 */
export const SCENARIO_DEFAULTS: Record<ProjectileScenario, Pick<ProjectileState, "speed" | "angle" | "height">> = {
  field: { speed: 24, angle: 45, height: 0 },
  staircase: { speed: 4, angle: 0, height: 0 },
};

/** Slider bounds for the launch speed, which differ by an order of magnitude between scenarios. */
export const SPEED_RANGE: Record<ProjectileScenario, { min: number; max: number; step: number }> = {
  field: { min: 1, max: 60, step: 0.5 },
  staircase: { min: 0.5, max: 12, step: 0.1 },
};

export function initialProjectileState(): ProjectileState {
  return {
    scenario: "field",
    speed: 24,
    angle: 45,
    height: 0,
    gravity: STANDARD_GRAVITY,
    dragFactor: 0,
    stairs: { width: 0.3, rise: 0.18, count: 24 },
    showComplementary: false,
    showEnvelope: false,
    showAcceleration: true,
    showDrag: false,
    playing: true,
    direction: 1,
    animationSpeed: 1,
  };
}

export type ProjectileReadout = ReturnType<typeof deriveProjectileModel>;

/** One extra trajectory drawn beside the main one, for comparison rather than for its own sake. */
export type CompanionPath = { label: string; angle: number; range: number; duration: number; samples: TrajectorySample[] };

const EMPTY: Vec2 = { x: 0, y: 0 };

function vacuumPath(speed: number, angle: number, height: number, gravity: number): CompanionPath {
  const velocity = launchVelocity(speed, angle);
  const duration = flightTime(velocity, height, gravity) ?? 0;
  return {
    label: `${angle.toFixed(0)}°`,
    angle,
    range: velocity.x * duration,
    duration,
    samples: sampleTrajectory(velocity, height, gravity, duration, 96),
  };
}

/**
 * One launch, resolved completely. The two scenarios share every equation; the staircase differs
 * only in what counts as "the ground", so its flight ends at a tread rather than at y = 0.
 */
export function deriveProjectileModel(state: ProjectileState) {
  const { gravity, speed, stairs } = state;
  const isStairs = state.scenario === "staircase";
  const height = isStairs ? 0 : state.height;
  const velocity = launchVelocity(speed, state.angle);

  const landing = isStairs ? staircaseLanding(velocity, gravity, stairs) : null;
  const groundTime = flightTime(velocity, height, gravity) ?? 0;
  /* A launch fast enough to clear the whole flight of stairs still has to be drawn — showing an
   * empty frame would hide the very case worth seeing — so the flight then runs to the foot of
   * the staircase instead of to a tread. */
  const stairsFloor = flightTime(velocity, stairs.rise * stairs.count, gravity) ?? 0;
  const duration = isStairs ? landing?.t ?? stairsFloor : groundTime;

  const trajectory = sampleTrajectory(velocity, height, gravity, duration);
  const peak = apex(velocity, height, gravity);
  const groundRange = velocity.x * groundTime;

  /* The complementary angle is a genuine equal-range partner only for a level launch; above the
   * landing plane the two ranges separate, so both are reported rather than assumed equal. */
  const partnerAngle = complementaryAngle(state.angle);
  const complementary =
    state.showComplementary && !isStairs && partnerAngle > 0 && partnerAngle < 90
      ? vacuumPath(speed, partnerAngle, height, gravity)
      : null;
  const rangesMatch = complementary ? Math.abs(complementary.range - groundRange) < 1e-6 : false;

  /* The safety parabola, plus a fan of the trajectories it bounds — the envelope means nothing
   * on its own until the family it caps is visible underneath it. */
  const reach = envelopeReach(speed, height, gravity);
  const envelope = state.showEnvelope && !isStairs
    ? Array.from({ length: 81 }, (_, index) => {
        const x = (reach * index) / 80;
        return { x, y: Math.max(0, envelopeHeight(x, speed, height, gravity)) };
      })
    : [];
  const envelopeFan = state.showEnvelope && !isStairs
    ? [15, 30, 45, 60, 75].map((angle) => vacuumPath(speed, angle, height, gravity))
    : [];

  /* Drag has no closed form, so this is the module's only integrated path. It is drawn against
   * the vacuum trajectory rather than replacing it, which is the whole comparison. */
  const dragSamples =
    state.showDrag && state.dragFactor > 0 && !isStairs
      ? thinSamples(sampleDragTrajectory(velocity, height, gravity, state.dragFactor))
      : [];
  const dragLanding = dragSamples.length > 0 ? dragSamples[dragSamples.length - 1] : null;

  /* Comparison launches leave at the same instant as the main one but need not land with it —
   * two complementary angles share a landing point and disagree about when they get there, which
   * is the whole lesson — so the shared clock runs until the last of them is down. */
  const clockDuration = Math.max(duration, complementary?.duration ?? 0, dragLanding?.t ?? 0);

  return {
    velocity,
    height,
    clockDuration,
    duration,
    trajectory,
    apex: peak,
    /** Range over level ground, which the staircase scenario also reports for reference. */
    groundRange,
    optimalAngle: optimalAngle(speed, height, gravity),
    maxRange: reach,
    complementary,
    rangesMatch,
    envelope,
    envelopeFan,
    dragSamples,
    dragLanding,
    /** How much of the vacuum range air resistance removes. */
    dragLoss: dragLanding ? groundRange - dragLanding.point.x : null,
    landing,
    /** The classroom shortcut for a horizontal launch, shown beside the general result. */
    horizontalStep: isStairs && Math.abs(state.angle) < 1e-6 ? horizontalStaircaseStep(speed, gravity, stairs) : null,
    impactSpeed: Math.hypot(velocityAt(velocity, gravity, duration).x, velocityAt(velocity, gravity, duration).y),
    /** Whether the target the current angle pair reaches is inside the safety parabola at all. */
    anglesToApex: anglesToTarget(peak.point.x || 1, peak.point.y - height, speed, gravity),
    origin: EMPTY,
  };
}

export type CursorReadout = ReturnType<typeof deriveCursor>;

/**
 * The instant the time cursor points at, resolved from closed forms alone.
 *
 * Kept separate from `deriveProjectileModel` because the cursor moves every animation frame while
 * the flight itself does not: re-sampling the trajectory (and re-integrating the drag path) sixty
 * times a second to move a marker would be pure waste. `cursor` is normalized to 0–1 so it stays
 * meaningful when a parameter change shortens or lengthens the flight.
 */
export function deriveCursor(model: ProjectileReadout, gravity: number, cursor: number) {
  /* The cursor rides the shared clock, then each path is read at the part of it that path was
   * still in the air for — so a marker parks at its landing point instead of running past it. */
  const clockTime = model.clockDuration * Math.min(1, Math.max(0, cursor));
  const t = Math.min(clockTime, model.duration);
  return {
    t,
    clockTime,
    airborne: clockTime <= model.duration + 1e-9,
    point: position(model.velocity, model.height, gravity, t),
    velocity: velocityAt(model.velocity, gravity, t),
    acceleration: pathAcceleration(model.velocity, gravity, t),
  };
}
