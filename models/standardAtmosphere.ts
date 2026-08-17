import {
  STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM,
  sampleStandardAtmosphere,
  standardAtmosphereLayerBoundaries,
  standardAtmosphereProfile,
} from "@/lib/science/standardAtmosphere";

export type StandardAtmosphereState = {
  maxAltitudeKm: number;
  cursorAltitudeKm: number;
};

export const ALTITUDE_PRESETS = {
  troposphere: { label: "對流層 0–11 km", maxAltitudeKm: 11 },
  stratosphere: { label: "同溫層 0–51 km", maxAltitudeKm: 51 },
  full: { label: "全剖面 0–86 km", maxAltitudeKm: STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM },
} as const;

export function initialStandardAtmosphereState(): StandardAtmosphereState {
  return { maxAltitudeKm: STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM, cursorAltitudeKm: 11 };
}

export function deriveStandardAtmosphereModel(state: StandardAtmosphereState) {
  const profile = standardAtmosphereProfile(state.maxAltitudeKm, 220);
  const layers = standardAtmosphereLayerBoundaries().filter((layer) => layer.baseHeight <= state.maxAltitudeKm);
  const cursor = sampleStandardAtmosphere(Math.min(state.cursorAltitudeKm, state.maxAltitudeKm));
  return { profile, layers, cursor };
}

export type StandardAtmosphereReadout = ReturnType<typeof deriveStandardAtmosphereModel>;
