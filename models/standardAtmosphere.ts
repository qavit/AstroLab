import {
  ATMOSPHERE_BOUNDARIES,
  ATMOSPHERE_LAYER_BANDS,
  STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM,
  sampleStandardAtmosphere,
  standardAtmosphereProfile,
  type PhysicalQuantity,
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
  showLayerLabels: boolean;
  showBoundaries: boolean;
  showOzoneLayer: boolean;
};

export const ALTITUDE_PRESETS = {
  troposphere: { label: "對流層 0–13 km", maxAltitudeKm: 13 },
  stratosphere: { label: "平流層 0–52 km", maxAltitudeKm: 52 },
  mesosphere: { label: "中氣層 0–90 km", maxAltitudeKm: 90 },
  thermosphere: { label: "增溫層 0–600 km", maxAltitudeKm: 600 },
  full: { label: "全剖面 0–1000 km", maxAltitudeKm: STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM },
} as const;

export const QUANTITY_META: Record<PhysicalQuantity, { label: string; unit: string; color: string }> = {
  temperature: { label: "溫度", unit: "K", color: "#f2c66d" },
  pressure: { label: "氣壓", unit: "Pa", color: "#72aee6" },
  density: { label: "密度", unit: "kg/m³", color: "#5ed8c3" },
};

export function initialStandardAtmosphereState(): StandardAtmosphereState {
  return {
    maxAltitudeKm: 100,
    cursorAltitudeKm: 11,
    swapAxes: false,
    quantityA: "temperature",
    quantityB: "pressure",
    scaleByQuantity: { temperature: "linear", pressure: "log", density: "log" },
    temperatureUnit: "C",
    showLayerLabels: true,
    showBoundaries: true,
    showOzoneLayer: true,
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
