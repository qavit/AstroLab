/**
 * U.S. Standard Atmosphere, 1976 — piecewise-linear temperature-lapse model for the
 * geopotential layers from sea level to 86 km, reproducing the reference tables at
 * https://www.pdas.com/bigtables.html (and the original NOAA-S/T 76-1562 document).
 */

const g0 = 9.80665; // m/s², standard gravity
const molarMass = 0.0289644; // kg/mol, mean molecular weight of air
const gasConstant = 8.31432; // J/(mol·K), the 1976 standard's value of R*

type Layer = { baseHeight: number; baseTemp: number; lapseRate: number; basePressure: number };

/** Layer base data: geopotential height (km), base temperature (K), lapse rate (K/km). */
const LAYER_SEEDS = [
  { baseHeight: 0, baseTemp: 288.15, lapseRate: -6.5 },
  { baseHeight: 11, baseTemp: 216.65, lapseRate: 0.0 },
  { baseHeight: 20, baseTemp: 216.65, lapseRate: 1.0 },
  { baseHeight: 32, baseTemp: 228.65, lapseRate: 2.8 },
  { baseHeight: 47, baseTemp: 270.65, lapseRate: 0.0 },
  { baseHeight: 51, baseTemp: 270.65, lapseRate: -2.8 },
  { baseHeight: 71, baseTemp: 214.65, lapseRate: -2.0 },
] as const;

const SEA_LEVEL_PRESSURE = 101325; // Pa

export const STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM = 84.852;
export const STANDARD_ATMOSPHERE_SOURCE = {
  label: "U.S. Standard Atmosphere, 1976 (PDAS reference tables)",
  url: "https://www.pdas.com/bigtables.html",
};

function pressureAtLayerTop(layer: Omit<Layer, "basePressure"> & { basePressure: number }, topHeight: number) {
  const thickness = topHeight - layer.baseHeight;
  if (layer.lapseRate === 0) {
    return layer.basePressure * Math.exp((-g0 * molarMass * thickness * 1000) / (gasConstant * layer.baseTemp));
  }
  const topTemp = layer.baseTemp + layer.lapseRate * thickness;
  return layer.basePressure * (layer.baseTemp / topTemp) ** ((g0 * molarMass) / (gasConstant * layer.lapseRate / 1000));
}

/** Layer table with base pressures resolved by chaining the barometric formula layer by layer. */
const LAYERS: Layer[] = (() => {
  const layers: Layer[] = [{ ...LAYER_SEEDS[0], basePressure: SEA_LEVEL_PRESSURE }];
  for (let index = 1; index < LAYER_SEEDS.length; index += 1) {
    const previous = layers[index - 1];
    const basePressure = pressureAtLayerTop(previous, LAYER_SEEDS[index].baseHeight);
    layers.push({ ...LAYER_SEEDS[index], basePressure });
  }
  return layers;
})();

export type AtmosphereSample = {
  /** Geometric altitude in km. */
  altitudeKm: number;
  temperatureK: number;
  temperatureC: number;
  pressurePa: number;
  pressureHPa: number;
  densityKgM3: number;
  layerIndex: number;
};

function layerFor(geopotentialKm: number) {
  let index = 0;
  for (let i = 0; i < LAYERS.length; i += 1) {
    if (geopotentialKm >= LAYERS[i].baseHeight) index = i;
  }
  return index;
}

/**
 * Sample temperature, pressure and density at a given geopotential altitude (km, 0–86 km) —
 * the same altitude coordinate the 1976 standard's layer table and PDAS tables are indexed by.
 * It matches geometric altitude to within ~0.3% below 32 km and ~3% at 86 km.
 */
export function sampleStandardAtmosphere(altitudeKm: number): AtmosphereSample {
  const clamped = Math.min(Math.max(altitudeKm, 0), STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM);
  const height = clamped;
  const layerIndex = layerFor(height);
  const layer = LAYERS[layerIndex];
  const thickness = height - layer.baseHeight;
  const temperatureK = layer.baseTemp + layer.lapseRate * thickness;
  const pressurePa =
    layer.lapseRate === 0
      ? layer.basePressure * Math.exp((-g0 * molarMass * thickness * 1000) / (gasConstant * layer.baseTemp))
      : layer.basePressure * (layer.baseTemp / temperatureK) ** ((g0 * molarMass) / (gasConstant * layer.lapseRate / 1000));
  const densityKgM3 = (pressurePa * molarMass) / (gasConstant * temperatureK);
  return {
    altitudeKm: clamped,
    temperatureK,
    temperatureC: temperatureK - 273.15,
    pressurePa,
    pressureHPa: pressurePa / 100,
    densityKgM3,
    layerIndex,
  };
}

export const STANDARD_ATMOSPHERE_LAYER_NAMES = [
  "對流層",
  "同溫層下部（等溫）",
  "同溫層",
  "同溫層上部",
  "同溫層頂（等溫）",
  "中氣層",
  "中氣層上部",
] as const;

/** Evenly spaced samples from 0 to `maxAltitudeKm`, plus every layer boundary, sorted by altitude. */
export function standardAtmosphereProfile(maxAltitudeKm = STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM, steps = 200): AtmosphereSample[] {
  const top = Math.min(maxAltitudeKm, STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM);
  const altitudes = new Set<number>();
  for (let i = 0; i <= steps; i += 1) altitudes.add((top * i) / steps);
  for (const layer of LAYERS) if (layer.baseHeight <= top) altitudes.add(layer.baseHeight);
  return Array.from(altitudes)
    .sort((a, b) => a - b)
    .map(sampleStandardAtmosphere);
}

export function standardAtmosphereLayerBoundaries() {
  return LAYERS.map((layer, index) => ({
    ...layer,
    name: STANDARD_ATMOSPHERE_LAYER_NAMES[index],
    sample: sampleStandardAtmosphere(layer.baseHeight),
  }));
}
