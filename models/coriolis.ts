import {
  EARTH_ANGULAR_VELOCITY,
  coriolisParameter,
  deflectionSide,
  exitTime,
  foucaultPeriodHours,
  inertialPosition,
  localAngularVelocity,
  sampleTrajectory,
  type PlanarPoint,
} from "@/lib/science/coriolis";

export type CoriolisScenario = "turntable" | "earth";

export type CoriolisState = {
  scenario: CoriolisScenario;
  /** Turntable scenario: the platform's own angular velocity, rad/s, signed. */
  angularVelocity: number;
  /** Earth scenario: rotation rate as a multiple of Earth's sidereal rate. */
  rotationRate: number;
  /** Earth scenario: launch latitude, degrees. */
  latitude: number;
  /** Model-space speed units per second. */
  launchSpeed: number;
  /** Degrees clockwise from "north" (+y). */
  launchAzimuth: number;
  /** Visual framing radius: the disc's rim in the turntable scenario, the edge of the drawn
   * ground patch in the earth scenario. */
  planeRadius: number;
  showInertialGhost: boolean;
  showTargetRing: boolean;
  playing: boolean;
  animationSpeed: number;
};

/**
 * Earth's real angular velocity would take hours to show any visible curve at a legible disc
 * size. The animation exaggerates it by this fixed factor so the effect is visible in seconds;
 * the readout panel reports the true Coriolis parameter and Foucault period alongside it,
 * computed from the real rate, so the exaggeration never leaks into the physics shown as numbers.
 */
const EARTH_VISUAL_SCALE = 20000;

export const CORIOLIS_PRESETS: Record<string, { label: string } & Partial<CoriolisState>> = {
  turntableSlow: { label: "平台慢轉", scenario: "turntable", angularVelocity: 0.9 },
  turntableFast: { label: "平台快轉", scenario: "turntable", angularVelocity: 2.4 },
  turntableReverse: { label: "平台反向", scenario: "turntable", angularVelocity: -1.6 },
  equator: { label: "赤道 0°", scenario: "earth", latitude: 0 },
  midNorth: { label: "北緯 45°", scenario: "earth", latitude: 45 },
  midSouth: { label: "南緯 45°", scenario: "earth", latitude: -45 },
  pole: { label: "極地 89°N", scenario: "earth", latitude: 89 },
};

export function initialCoriolisState(): CoriolisState {
  return {
    scenario: "turntable",
    angularVelocity: 1.4,
    rotationRate: 1,
    latitude: 45,
    launchSpeed: 1.6,
    launchAzimuth: 0,
    planeRadius: 2.3,
    showInertialGhost: true,
    showTargetRing: true,
    playing: true,
    animationSpeed: 1,
  };
}

export type CoriolisReadout = ReturnType<typeof deriveCoriolisModel>;

/**
 * One launch, resolved in both frames. The turntable and earth scenarios share the same engine:
 * an earth latitude just supplies the local angular velocity (Ω sinφ) that a turntable's slider
 * supplies directly, so both reduce to "spin a plane at some rate and launch something across it."
 */
export function deriveCoriolisModel(state: CoriolisState) {
  const isEarth = state.scenario === "earth";
  const realAngularVelocity = isEarth ? EARTH_ANGULAR_VELOCITY * state.rotationRate : state.angularVelocity;
  const realLocalOmega = isEarth ? localAngularVelocity(state.latitude, realAngularVelocity) : realAngularVelocity;
  const visualOmega = isEarth ? realLocalOmega * EARTH_VISUAL_SCALE : realLocalOmega;

  const azimuth = (state.launchAzimuth * Math.PI) / 180;
  const velocity: PlanarPoint = { x: state.launchSpeed * Math.sin(azimuth), y: state.launchSpeed * Math.cos(azimuth) };
  const origin: PlanarPoint = { x: 0, y: 0 };

  const duration = exitTime(origin, velocity, state.planeRadius) ?? 0;
  const trajectory = sampleTrajectory(origin, velocity, visualOmega, duration);
  const endpoint = trajectory[trajectory.length - 1] ?? { t: 0, inertial: origin, rotating: origin };
  const targetPoint = inertialPosition(origin, velocity, duration);
  const deflection = Math.hypot(endpoint.rotating.x - targetPoint.x, endpoint.rotating.y - targetPoint.y);

  return {
    origin,
    velocity,
    duration,
    trajectory,
    endpoint,
    targetPoint,
    deflection,
    visualOmega,
    side: deflectionSide(visualOmega),
    rotationPeriod: Math.abs(visualOmega) > 1e-9 ? (2 * Math.PI) / Math.abs(visualOmega) : Infinity,
    realCoriolisParameter: isEarth
      ? coriolisParameter(state.latitude, realAngularVelocity)
      : coriolisParameter(90, state.angularVelocity),
    foucaultHours: isEarth ? foucaultPeriodHours(state.latitude, state.rotationRate) : null,
  };
}
