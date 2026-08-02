/** Pure, idealized tri-cell atmospheric-circulation calculations. */

export type CirculationCell = "hadley" | "ferrel" | "polar";
export type VerticalMotion = "rising" | "sinking";

export type AtmosphereParameters = {
  solarDeclination: number;
  rotationRate: number;
  surfaceDrag: number;
};

export type PressureBand = {
  latitude: number;
  kind: "low" | "high";
  motion: VerticalMotion;
  label: string;
};

export type SurfaceWind = {
  east: number;
  north: number;
  speed: number;
  cell: CirculationCell;
  name: "東北信風" | "東南信風" | "盛行西風" | "極地東風";
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * A deliberately smooth classroom approximation. Oceans and thermal inertia keep the
 * annual-mean ITCZ excursion smaller than the solar declination excursion.
 */
export function thermalEquatorLatitude(solarDeclination: number) {
  return clamp(solarDeclination * 0.55, -13, 13);
}

export function circulationBoundaries(solarDeclination: number) {
  const itcz = thermalEquatorLatitude(solarDeclination);
  return {
    southPole: -90,
    southSubpolar: clamp(itcz - 60, -74, -48),
    southSubtropical: clamp(itcz - 30, -42, -18),
    itcz,
    northSubtropical: clamp(itcz + 30, 18, 42),
    northSubpolar: clamp(itcz + 60, 48, 74),
    northPole: 90,
  };
}

export function pressureBands(solarDeclination: number): PressureBand[] {
  const b = circulationBoundaries(solarDeclination);
  return [
    { latitude: b.southPole, kind: "high", motion: "sinking", label: "南極高壓" },
    { latitude: b.southSubpolar, kind: "low", motion: "rising", label: "副極地低壓" },
    { latitude: b.southSubtropical, kind: "high", motion: "sinking", label: "副熱帶高壓" },
    { latitude: b.itcz, kind: "low", motion: "rising", label: "赤道低壓／ITCZ" },
    { latitude: b.northSubtropical, kind: "high", motion: "sinking", label: "副熱帶高壓" },
    { latitude: b.northSubpolar, kind: "low", motion: "rising", label: "副極地低壓" },
    { latitude: b.northPole, kind: "high", motion: "sinking", label: "北極高壓" },
  ];
}

/** Coriolis parameter in s⁻¹, scaled from Earth's sidereal rotation. */
export function coriolisParameter(latitude: number, rotationRate = 1) {
  const earthAngularVelocity = 7.2921159e-5;
  return 2 * earthAngularVelocity * rotationRate * Math.sin((latitude * Math.PI) / 180);
}

/**
 * Surface flow follows the pressure gradient between the seven pressure belts, then turns
 * under Coriolis acceleration. Drag retains a cross-isobar component toward lower pressure.
 */
export function surfaceWindAt(latitude: number, parameters: AtmosphereParameters): SurfaceWind {
  const relative = latitude - thermalEquatorLatitude(parameters.solarDeclination);
  const hemisphere = relative >= 0 ? 1 : -1;
  const distance = Math.abs(relative);
  const cell: CirculationCell = distance < 30 ? "hadley" : distance < 60 ? "ferrel" : "polar";
  const meridionalSign = cell === "ferrel" ? hemisphere : -hemisphere;
  const drag = clamp(parameters.surfaceDrag, 0.05, 0.95);
  const rotation = clamp(parameters.rotationRate, 0, 2);
  const latitudeEffect = 0.35 + 0.65 * Math.abs(Math.sin((latitude * Math.PI) / 180));
  const north = meridionalSign * (3.2 + 6.8 * drag);
  const eastSign = hemisphere * meridionalSign;
  const east = eastSign * (4 + 13 * rotation * latitudeEffect) * (1.12 - 0.55 * drag);
  const speed = Math.hypot(east, north);
  const name = cell === "ferrel"
    ? "盛行西風"
    : cell === "polar"
      ? "極地東風"
      : hemisphere > 0
        ? "東北信風"
        : "東南信風";
  return { east, north, speed, cell, name };
}

export function windDeflectionDegrees(latitude: number, parameters: AtmosphereParameters) {
  const wind = surfaceWindAt(latitude, parameters);
  return Math.atan2(wind.east, wind.north) * 180 / Math.PI;
}
