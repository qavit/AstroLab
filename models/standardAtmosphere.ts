import {
  ATMOSPHERE_BOUNDARIES,
  ATMOSPHERE_LAYER_BANDS,
  STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM,
  sampleStandardAtmosphere,
  standardAtmosphereProfile,
  type DensityUnit,
  type PhysicalQuantity,
  type PressureUnit,
  type TemperatureUnit,
} from "@/lib/science/standardAtmosphere";

export type AxisScale = "linear" | "log";

export type StandardAtmosphereState = {
  maxAltitudeKm: number;
  cursorAltitudeKm: number;
  swapAxes: boolean;
  quantityA: PhysicalQuantity;
  quantityB: PhysicalQuantity;
  scaleByQuantity: Record<PhysicalQuantity, AxisScale>;
  temperatureUnit: TemperatureUnit;
  pressureUnit: PressureUnit;
  densityUnit: DensityUnit;
  showLayerLabels: boolean;
  showBoundaries: boolean;
  showOzoneLayer: boolean;
  showTooltip: boolean;
};

export const ALTITUDE_PRESETS = {
  troposphere: { label: "至對流層頂", maxAltitudeKm: 13 },
  stratosphere: { label: "至平流層頂", maxAltitudeKm: 52 },
  mesosphere: { label: "至中氣層頂", maxAltitudeKm: 83 },
  thermosphere: { label: "至增溫層頂", maxAltitudeKm: 600 },
  full: { label: "全剖面 0–1000 km", maxAltitudeKm: STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM },
} as const;

export const QUANTITY_META: Record<PhysicalQuantity, { label: string; unit: string; color: string }> = {
  temperature: { label: "溫度", unit: "K", color: "#f2c66d" },
  pressure: { label: "氣壓", unit: "Pa", color: "#72aee6" },
  density: { label: "密度", unit: "kg/m³", color: "#5ed8c3" },
};

export function initialStandardAtmosphereState(): StandardAtmosphereState {
  return {
    maxAltitudeKm: 120,
    cursorAltitudeKm: 11,
    swapAxes: false,
    quantityA: "temperature",
    quantityB: "pressure",
    scaleByQuantity: { temperature: "linear", pressure: "log", density: "log" },
    temperatureUnit: "C",
    pressureUnit: "hPa",
    densityUnit: "kg/m3",
    showLayerLabels: true,
    showBoundaries: true,
    showOzoneLayer: true,
    showTooltip: true,
  };
}

export function deriveStandardAtmosphereModel(state: StandardAtmosphereState) {
  const profile = standardAtmosphereProfile(state.maxAltitudeKm);
  const layers = ATMOSPHERE_LAYER_BANDS.filter((band) => band.from < state.maxAltitudeKm).map((band) => ({
    ...band,
    to: Math.min(band.to, state.maxAltitudeKm),
  }));
  const boundaries = ATMOSPHERE_BOUNDARIES.filter((boundary) => boundary.altitudeKm <= state.maxAltitudeKm);
  const cursor = sampleStandardAtmosphere(Math.min(state.cursorAltitudeKm, state.maxAltitudeKm));
  return { profile, layers, boundaries, cursor };
}

export type StandardAtmosphereReadout = ReturnType<typeof deriveStandardAtmosphereModel>;
