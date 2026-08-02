import {
  circulationBoundaries,
  pressureBands,
  surfaceWindAt,
  thermalEquatorLatitude,
  type AtmosphereParameters,
} from "@/lib/science/atmosphere";

export type AtmosphereState = AtmosphereParameters & {
  showPressureBelts: boolean;
  showWindArrows: boolean;
  showTracers: boolean;
  playing: boolean;
  particleDensity: "light" | "standard" | "dense" | "stream";
  animationSpeed: number;
};

export const PARTICLE_DENSITIES = {
  light: { label: "少量", count: 180 },
  standard: { label: "標準", count: 540 },
  dense: { label: "大量", count: 1200 },
  stream: { label: "流線感", count: 2400 },
} as const;

export const ATMOSPHERE_PRESETS = {
  march: { label: "春分", solarDeclination: 0 },
  june: { label: "夏至", solarDeclination: 23.44 },
  september: { label: "秋分", solarDeclination: 0 },
  december: { label: "冬至", solarDeclination: -23.44 },
} as const;

export function initialAtmosphereState(): AtmosphereState {
  return {
    solarDeclination: 0,
    rotationRate: 1,
    surfaceDrag: 0.42,
    showPressureBelts: true,
    showWindArrows: true,
    showTracers: true,
    playing: true,
    particleDensity: "standard",
    animationSpeed: 1,
  };
}

export function deriveAtmosphereModel(state: AtmosphereState) {
  const samples = [-75, -45, -15, 15, 45, 75].map((latitude) => ({
    latitude,
    wind: surfaceWindAt(latitude, state),
  }));
  return {
    thermalEquator: thermalEquatorLatitude(state.solarDeclination),
    boundaries: circulationBoundaries(state.solarDeclination),
    bands: pressureBands(state.solarDeclination),
    samples,
    maxSampleSpeed: Math.max(...samples.map(({ wind }) => wind.speed)),
  };
}

export type AtmosphereReadout = ReturnType<typeof deriveAtmosphereModel>;
