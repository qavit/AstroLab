import {
  compassLabel,
  degrees,
  horizontalAngles,
  radians,
  shadowForUnitGnomon,
  solarDeclination,
  sunHorizontal,
} from "@/lib/science/solar";

/** The three synchronized quantities every view of the solar model reads from. */
export type SolarLabState = { latitude: number; day: number; time: number };

export type ObserverMode = "person" | "dot" | "gnomon";
export type ExportTarget = "global" | "local" | "shadow";
export type ExportMode = "color" | "grayscale" | "line";
export type PlaybackMode = "day" | "year" | null;

export type ShadowSample = { time: number; day: number };
export type ShadowTrace = { enabled: boolean; samples: ShadowSample[] };

export type AppearanceState = {
  globalObserver: ObserverMode;
  localObserver: ObserverMode;
  directManipulation: boolean;
  earthOpaque: boolean;
  compassPoints: 4 | 8 | 16;
};

export type LayerState = {
  celestialSphere: boolean;
  rightAscensionLines: boolean;
  declinationLines: boolean;
  rightAscensionLabels: boolean;
  declinationLabels: boolean;
  celestialEquator: boolean;
  ecliptic: boolean;
  eclipticLongitudeLines: boolean;
  eclipticLatitudeLines: boolean;
  eclipticLongitudeLabels: boolean;
  eclipticLatitudeLabels: boolean;
  seasonalMarkers: boolean;
  solarTermLabels: boolean;
  apsides: boolean;
  celestialAxis: boolean;
  observer: boolean;
  tangentPlane: boolean;
  geographicGrid: boolean;
  observerLatitude: boolean;
  observerMeridian: boolean;
  subsolarPoint: boolean;
  timeLabels: boolean;
  nadir: boolean;
  compassLabels: boolean;
  horizontalAltitudeLines: boolean;
  horizontalAzimuthLines: boolean;
  horizontalAltitudeLabels: boolean;
  horizontalAzimuthLabels: boolean;
  meridianCircle: boolean;
  primeVertical: boolean;
  seasonalPaths: boolean;
  seasonalPathLabels: boolean;
  currentPath: boolean;
  belowHorizon: boolean;
  shadow: boolean;
};

export const initialSolarState: SolarLabState = { latitude: 23.5, day: 172, time: 12 };

export const initialAppearance: AppearanceState = {
  globalObserver: "dot",
  localObserver: "gnomon",
  directManipulation: false,
  earthOpaque: true,
  compassPoints: 4,
};

export const initialLayers: LayerState = {
  celestialSphere: true,
  rightAscensionLines: true,
  declinationLines: true,
  rightAscensionLabels: true,
  declinationLabels: true,
  celestialEquator: true,
  ecliptic: true,
  eclipticLongitudeLines: false,
  eclipticLatitudeLines: false,
  eclipticLongitudeLabels: false,
  eclipticLatitudeLabels: false,
  seasonalMarkers: true,
  solarTermLabels: false,
  apsides: true,
  celestialAxis: true,
  observer: true,
  tangentPlane: true,
  geographicGrid: true,
  observerLatitude: true,
  observerMeridian: true,
  subsolarPoint: true,
  timeLabels: false,
  nadir: false,
  compassLabels: true,
  horizontalAltitudeLines: true,
  horizontalAzimuthLines: true,
  horizontalAltitudeLabels: true,
  horizontalAzimuthLabels: false,
  meridianCircle: true,
  primeVertical: true,
  seasonalPaths: true,
  seasonalPathLabels: false,
  currentPath: true,
  belowHorizon: true,
  shadow: true,
};

export const latitudePresets = [
  ["北極", 90], ["北極圈", 66.5], ["北回歸線", 23.5], ["赤道", 0],
  ["南回歸線", -23.5], ["南極圈", -66.5], ["南極", -90],
] as const;

export const datePresets = [
  ["春分", 80], ["夏至", 172], ["秋分", 266], ["冬至", 355],
] as const;

export const solarTerms = [
  "春分", "清明", "穀雨", "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑", "白露",
  "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒", "立春", "雨水", "驚蟄",
] as const;

/** The 16-point compass rose, as azimuth in degrees measured east from north. */
export const compassRose = [
  [0, "北"], [22.5, "北北東"], [45, "東北"], [67.5, "東北東"],
  [90, "東"], [112.5, "東南東"], [135, "東南"], [157.5, "南南東"],
  [180, "南"], [202.5, "南南西"], [225, "西南"], [247.5, "西南西"],
  [270, "西"], [292.5, "西北西"], [315, "西北"], [337.5, "北北西"],
] as const;

/** The three representative declinations compared against the current day's path. */
export const seasonalDeclinations = [
  { label: "夏至", declination: degrees(23.44) },
  { label: "春／秋分", declination: 0 },
  { label: "冬至", declination: degrees(-23.44) },
] as const;

/** Day of year at which the sun reaches the given solar term, spacing the 24 terms evenly from the vernal equinox. */
export function dayForSolarTerm(index: number) {
  return ((80 + (index * 365) / 24 - 1) % 365) + 1;
}

/** The mutual exclusion between solar-term labels and equinox/solstice markers keeps the ecliptic readable. */
export function withLayerToggled(layers: LayerState, key: keyof LayerState): LayerState {
  const next = { ...layers, [key]: !layers[key] };
  if (key === "solarTermLabels" && next.solarTermLabels) next.seasonalMarkers = false;
  if (key === "seasonalMarkers" && next.seasonalMarkers) next.solarTermLabels = false;
  return next;
}

/**
 * Advances the shared clock. Daily playback moves the sun across one sky; yearly playback runs
 * the two motions together at a visually legible ratio rather than the true 365.24 : 1.
 */
export function advanceSolarState(state: SolarLabState, playing: Exclude<PlaybackMode, null>, delta: number): SolarLabState {
  if (playing === "year") {
    return {
      ...state,
      day: ((state.day - 1 + delta * 6) % 365) + 1,
      time: (state.time + delta * 144) % 24,
    };
  }
  return { ...state, time: (state.time + delta * 2.2) % 24 };
}

/** The hour angle of the sun for a local solar time, in radians, zero at local noon. */
export function hourAngleForTime(time: number) {
  return degrees(15 * (time - 12));
}

export type SolarReadout = ReturnType<typeof deriveSolarModel>;

/** Every quantity the views and the metrics row display, derived from the shared state alone. */
export function deriveSolarModel(state: SolarLabState) {
  const declination = solarDeclination(state.day);
  const hourAngle = hourAngleForTime(state.time);
  const sunVector = sunHorizontal(state.latitude, declination, hourAngle);
  const angles = horizontalAngles(sunVector);
  const cast = shadowForUnitGnomon(sunVector);
  const noonAltitude = 90 - Math.abs(state.latitude - radians(declination));
  const shadow = cast
    ? {
        length: cast.length > 40 ? "極長" : `${cast.length.toFixed(2)} 倍`,
        direction: `${compassLabel(cast.azimuth)}（${cast.azimuth.toFixed(0)}°）`,
      }
    : { length: "看不見", direction: "夜晚" };
  return { declination, hourAngle, sunVector, angles, cast, noonAltitude, shadow };
}

/**
 * The shadow trace records one tip per fixed clock slot, so samples stay evenly spaced no
 * matter how many animation frames land inside a slot. Returns null when the sun is down.
 */
export function shadowSampleAt(state: SolarLabState, intervalMinutes: number) {
  const slot = Math.floor((state.time * 60) / intervalMinutes);
  const time = (slot * intervalMinutes) / 60;
  const vector = sunHorizontal(state.latitude, solarDeclination(state.day), hourAngleForTime(time));
  if (vector.z <= 0) return null;
  return { slot, sample: { time, day: state.day } satisfies ShadowSample };
}
