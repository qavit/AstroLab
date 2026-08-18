/**
 * U.S. Standard Atmosphere, 1976 — full sea-level-to-1000 km reference table (5 km steps),
 * transcribed from https://www.pdas.com/bigtables.html. Values between grid points come from
 * interpolation: linear for temperature, log-linear for pressure and density, since both vary
 * quasi-exponentially with altitude and log-linear interpolation tracks that shape closely.
 */

export type PhysicalQuantity = "temperature" | "pressure" | "density";

export const STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM = 1000;
export const STANDARD_ATMOSPHERE_GRID_STEP_KM = 5;
export const STANDARD_ATMOSPHERE_SOURCE = {
  label: "U.S. Standard Atmosphere, 1976（PDAS bigtables）",
  url: "https://www.pdas.com/bigtables.html",
};

/** [altitude km, temperature K, pressure Pa, density kg/m³] at each 5 km grid point, 0–1000 km. */
const TABLE: readonly [number, number, number, number][] = [
  [0, 288.15, 1.0132e5, 1.225e0], [5, 255.676, 5.4048e4, 7.3643e-1], [10, 223.252, 2.65e4, 4.1351e-1],
  [15, 216.65, 1.2112e4, 1.9476e-1], [20, 216.65, 5.5293e3, 8.891e-2], [25, 221.552, 2.5492e3, 4.0084e-2],
  [30, 226.509, 1.197e3, 1.841e-2], [35, 236.513, 5.7459e2, 8.4634e-3], [40, 250.35, 2.8714e2, 3.9957e-3],
  [45, 264.164, 1.491e2, 1.9663e-3], [50, 270.65, 7.9779e1, 1.0269e-3], [55, 260.771, 4.2525e1, 5.681e-4],
  [60, 247.021, 2.1959e1, 3.0968e-4], [65, 233.292, 1.093e1, 1.6321e-4], [70, 219.585, 5.2209e0, 8.2829e-5],
  [75, 208.399, 2.3881e0, 3.9921e-5], [80, 198.639, 1.0525e0, 1.8458e-5], [85, 188.893, 4.4568e-1, 8.2195e-6],
  [90, 186.867, 1.8435e-1, 3.44e-6], [95, 188.418, 7.5775e-2, 1.3873e-6], [100, 195.081, 3.2012e-2, 5.6044e-7],
  [105, 208.835, 1.4423e-2, 2.3325e-7], [110, 240, 7.1493e-3, 9.6734e-8], [115, 300, 4.0037e-3, 4.2794e-8],
  [120, 360, 2.5366e-3, 2.2199e-8], [125, 417.231, 1.736e-3, 1.2918e-8], [130, 469.268, 1.2503e-3, 8.1494e-9],
  [135, 516.589, 9.3569e-4, 5.4647e-9], [140, 559.627, 7.2029e-4, 3.8313e-9], [145, 598.776, 5.669e-4, 2.7805e-9],
  [150, 634.392, 4.5422e-4, 2.0752e-9], [155, 666.799, 3.6929e-4, 1.5848e-9], [160, 696.29, 3.0394e-4, 1.2336e-9],
  [165, 723.132, 2.5277e-4, 9.7526e-10], [170, 747.566, 2.121e-4, 7.8155e-10], [175, 769.811, 1.7936e-4, 6.3382e-10],
  [180, 790.066, 1.5272e-4, 5.194e-10], [185, 808.511, 1.3081e-4, 4.2952e-10], [190, 825.312, 1.1265e-4, 3.5807e-10],
  [195, 840.616, 9.7489e-5, 3.0064e-10], [200, 854.559, 8.4736e-5, 2.5407e-10], [205, 867.264, 7.3943e-5, 2.1596e-10],
  [210, 878.842, 6.4757e-5, 1.8456e-10], [215, 889.395, 5.6902e-5, 1.5849e-10], [220, 899.014, 5.015e-5, 1.3671e-10],
  [225, 907.785, 4.4321e-5, 1.1839e-10], [230, 915.782, 3.927e-5, 1.029e-10], [235, 923.075, 3.4879e-5, 8.9757e-11],
  [240, 929.726, 3.1051e-5, 7.855e-11], [245, 935.794, 2.7701e-5, 6.8954e-11], [250, 941.33, 2.4762e-5, 6.0706e-11],
  [255, 946.381, 2.2176e-5, 5.3587e-11], [260, 950.991, 1.9894e-5, 4.742e-11], [265, 955.198, 1.7875e-5, 4.2058e-11],
  [270, 959.039, 1.6084e-5, 3.7382e-11], [275, 962.545, 1.4494e-5, 3.3294e-11], [280, 965.746, 1.3078e-5, 2.971e-11],
  [285, 968.67, 1.1815e-5, 2.656e-11], [290, 971.34, 1.0686e-5, 2.3783e-11], [295, 973.779, 9.676e-6, 2.1331e-11],
  [300, 976.008, 8.7704e-6, 1.9159e-11], [305, 978.044, 7.9571e-6, 1.7232e-11], [310, 979.904, 7.2259e-6, 1.5519e-11],
  [315, 981.605, 6.5678e-6, 1.3994e-11], [320, 983.159, 5.9748e-6, 1.2634e-11], [325, 984.58, 5.44e-6, 1.1419e-11],
  [330, 985.88, 4.9571e-6, 1.0333e-11], [335, 987.068, 4.5208e-6, 9.3607e-12], [340, 988.154, 4.126e-6, 8.4886e-12],
  [345, 989.148, 3.7686e-6, 7.7054e-12], [350, 990.057, 3.4446e-6, 7.0011e-12], [355, 990.889, 3.1507e-6, 6.367e-12],
  [360, 991.65, 2.8839e-6, 5.7954e-12], [365, 992.347, 2.6414e-6, 5.2795e-12], [370, 992.984, 2.4208e-6, 4.8132e-12],
  [375, 993.568, 2.22e-6, 4.3914e-12], [380, 994.102, 2.037e-6, 4.0093e-12], [385, 994.591, 1.8702e-6, 3.6629e-12],
  [390, 995.039, 1.7179e-6, 3.3484e-12], [395, 995.45, 1.5789e-6, 3.0627e-12], [400, 995.825, 1.4518e-6, 2.8028e-12],
  [405, 996.17, 1.3356e-6, 2.5662e-12], [410, 996.485, 1.2292e-6, 2.3507e-12], [415, 996.774, 1.1319e-6, 2.1543e-12],
  [420, 997.039, 1.0428e-6, 1.9752e-12], [425, 997.282, 9.6119e-7, 1.8118e-12], [430, 997.505, 8.8642e-7, 1.6626e-12],
  [435, 997.709, 8.1789e-7, 1.5265e-12], [440, 997.896, 7.5505e-7, 1.402e-12], [445, 998.067, 6.9741e-7, 1.2883e-12],
  [450, 998.225, 6.4452e-7, 1.1843e-12], [455, 998.369, 5.9597e-7, 1.0891e-12], [460, 998.502, 5.5139e-7, 1.002e-12],
  [465, 998.623, 5.1043e-7, 9.2222e-13], [470, 998.735, 4.7279e-7, 8.4913e-13], [475, 998.837, 4.3818e-7, 7.8214e-13],
  [480, 998.931, 4.0634e-7, 7.207e-13], [485, 999.017, 3.7705e-7, 6.6434e-13], [490, 999.096, 3.5008e-7, 6.1261e-13],
  [495, 999.169, 3.2524e-7, 5.6511e-13], [500, 999.236, 3.0235e-7, 5.2148e-13], [505, 999.297, 2.8126e-7, 4.8139e-13],
  [510, 999.353, 2.618e-7, 4.4454e-13], [515, 999.405, 2.4386e-7, 4.1065e-13], [520, 999.452, 2.273e-7, 3.7949e-13],
  [525, 999.496, 2.1202e-7, 3.5083e-13], [530, 999.536, 1.979e-7, 3.2446e-13], [535, 999.573, 1.8486e-7, 3.0019e-13],
  [540, 999.607, 1.7281e-7, 2.7785e-13], [545, 999.638, 1.6168e-7, 2.5727e-13], [550, 999.667, 1.5137e-7, 2.3832e-13],
  [555, 999.693, 1.4184e-7, 2.2086e-13], [560, 999.717, 1.3302e-7, 2.0477e-13], [565, 999.74, 1.2485e-7, 1.8993e-13],
  [570, 999.76, 1.1728e-7, 1.7625e-13], [575, 999.779, 1.1027e-7, 1.6363e-13], [580, 999.796, 1.0377e-7, 1.5199e-13],
  [585, 999.812, 9.7739e-8, 1.4124e-13], [590, 999.827, 9.2145e-8, 1.3131e-13], [595, 999.841, 8.6952e-8, 1.2214e-13],
  [600, 999.853, 8.213e-8, 1.1367e-13], [605, 999.864, 7.765e-8, 1.0584e-13], [610, 999.875, 7.3486e-8, 9.8597e-14],
  [615, 999.885, 6.9612e-8, 9.1903e-14], [620, 999.894, 6.6005e-8, 8.571e-14], [625, 999.902, 6.2644e-8, 7.9981e-14],
  [630, 999.91, 5.951e-8, 7.4678e-14], [635, 999.917, 5.6585e-8, 6.977e-14], [640, 999.923, 5.3855e-8, 6.5225e-14],
  [645, 999.929, 5.1303e-8, 6.1015e-14], [650, 999.934, 4.8917e-8, 5.7114e-14], [655, 999.939, 4.6684e-8, 5.3499e-14],
  [660, 999.944, 4.4594e-8, 5.0147e-14], [665, 999.948, 4.2635e-8, 4.7038e-14], [670, 999.952, 4.0799e-8, 4.4154e-14],
  [675, 999.956, 3.9076e-8, 4.1478e-14], [680, 999.959, 3.7459e-8, 3.8993e-14], [685, 999.962, 3.594e-8, 3.6686e-14],
  [690, 999.965, 3.4513e-8, 3.4542e-14], [695, 999.968, 3.3171e-8, 3.255e-14], [700, 999.97, 3.1908e-8, 3.0698e-14],
  [705, 999.973, 3.072e-8, 2.8976e-14], [710, 999.975, 2.96e-8, 2.7374e-14], [715, 999.977, 2.8543e-8, 2.5882e-14],
  [720, 999.978, 2.7546e-8, 2.4491e-14], [725, 999.98, 2.6605e-8, 2.3196e-14], [730, 999.982, 2.5714e-8, 2.1987e-14],
  [735, 999.983, 2.4871e-8, 2.0858e-14], [740, 999.984, 2.4072e-8, 1.9805e-14], [745, 999.985, 2.3314e-8, 1.882e-14],
  [750, 999.986, 2.2595e-8, 1.79e-14], [755, 999.987, 2.1912e-8, 1.7039e-14], [760, 999.988, 2.1263e-8, 1.6233e-14],
  [765, 999.989, 2.0644e-8, 1.5478e-14], [770, 999.99, 2.0055e-8, 1.4771e-14], [775, 999.991, 1.9493e-8, 1.4108e-14],
  [780, 999.992, 1.8957e-8, 1.3487e-14], [785, 999.992, 1.8445e-8, 1.2903e-14], [790, 999.993, 1.7955e-8, 1.2356e-14],
  [795, 999.993, 1.7485e-8, 1.1841e-14], [800, 999.994, 1.7036e-8, 1.1358e-14], [805, 999.994, 1.6604e-8, 1.0904e-14],
  [810, 999.995, 1.619e-8, 1.0477e-14], [815, 999.995, 1.5793e-8, 1.0074e-14], [820, 999.995, 1.5411e-8, 9.6947e-15],
  [825, 999.996, 1.5044e-8, 9.337e-15], [830, 999.996, 1.469e-8, 8.9992e-15], [835, 999.996, 1.435e-8, 8.6801e-15],
  [840, 999.997, 1.4023e-8, 8.3783e-15], [845, 999.997, 1.3707e-8, 8.0928e-15], [850, 999.997, 1.3403e-8, 7.8223e-15],
  [855, 999.997, 1.311e-8, 7.5659e-15], [860, 999.997, 1.2827e-8, 7.3227e-15], [865, 999.998, 1.2553e-8, 7.0917e-15],
  [870, 999.998, 1.2289e-8, 6.8723e-15], [875, 999.998, 1.2033e-8, 6.6635e-15], [880, 999.998, 1.1786e-8, 6.4649e-15],
  [885, 999.998, 1.1547e-8, 6.2757e-15], [890, 999.998, 1.1315e-8, 6.0952e-15], [895, 999.999, 1.1091e-8, 5.9231e-15],
  [900, 999.999, 1.0873e-8, 5.7587e-15], [905, 999.999, 1.0662e-8, 5.6016e-15], [910, 999.999, 1.0457e-8, 5.4514e-15],
  [915, 999.999, 1.0258e-8, 5.3075e-15], [920, 999.999, 1.0064e-8, 5.1698e-15], [925, 999.999, 9.8752e-9, 5.0377e-15],
  [930, 999.999, 9.6915e-9, 4.9111e-15], [935, 999.999, 9.5126e-9, 4.7895e-15], [940, 999.999, 9.338e-9, 4.6728e-15],
  [945, 999.999, 9.1677e-9, 4.5605e-15], [950, 999.999, 9.0013e-9, 4.4525e-15], [955, 999.999, 8.8387e-9, 4.3486e-15],
  [960, 999.999, 8.6796e-9, 4.2484e-15], [965, 999.999, 8.5239e-9, 4.1519e-15], [970, 1000, 8.3713e-9, 4.0587e-15],
  [975, 1000, 8.2218e-9, 3.9687e-15], [980, 1000, 8.0751e-9, 3.8818e-15], [985, 1000, 7.9311e-9, 3.7977e-15],
  [990, 1000, 7.7896e-9, 3.7163e-15], [995, 1000, 7.6505e-9, 3.6375e-15], [1000, 1000, 7.5138e-9, 3.5611e-15],
];

export type AtmosphereSample = {
  altitudeKm: number;
  temperatureK: number;
  temperatureC: number;
  pressurePa: number;
  pressureHPa: number;
  densityKgM3: number;
};

const VALUE_OF: Record<PhysicalQuantity, (sample: AtmosphereSample) => number> = {
  temperature: (sample) => sample.temperatureK,
  pressure: (sample) => sample.pressurePa,
  density: (sample) => sample.densityKgM3,
};

export function quantityValue(sample: AtmosphereSample, quantity: PhysicalQuantity) {
  return VALUE_OF[quantity](sample);
}

export type TemperatureUnit = "K" | "C" | "F";
export type PressureUnit = "Pa" | "hPa" | "bar" | "atm" | "cmHg" | "mmHg" | "Torr";
export type DensityUnit = "kg/m3" | "g/cm3";

export type DisplayUnits = {
  temperature: TemperatureUnit;
  pressure: PressureUnit;
  density: DensityUnit;
};

export const TEMPERATURE_UNIT_LABEL: Record<TemperatureUnit, string> = { K: "K", C: "°C", F: "°F" };

export const PRESSURE_UNIT_LABEL: Record<PressureUnit, string> = {
  Pa: "Pa", hPa: "hPa", bar: "bar", atm: "atm", cmHg: "cmHg", mmHg: "mmHg", Torr: "Torr",
};

export const DENSITY_UNIT_LABEL: Record<DensityUnit, string> = { "kg/m3": "kg/m³", "g/cm3": "g/cm³" };

/** Pascals per unit, so `pascals / PASCALS_PER_UNIT[unit]` converts to that unit. */
const PASCALS_PER_UNIT: Record<PressureUnit, number> = {
  Pa: 1,
  hPa: 100,
  bar: 1e5,
  atm: 101325,
  cmHg: 1333.22387415,
  mmHg: 133.322387415,
  Torr: 101325 / 760,
};

export function convertTemperature(kelvin: number, unit: TemperatureUnit) {
  if (unit === "K") return kelvin;
  const celsius = kelvin - 273.15;
  return unit === "C" ? celsius : (celsius * 9) / 5 + 32;
}

export function convertPressure(pascals: number, unit: PressureUnit) {
  return pascals / PASCALS_PER_UNIT[unit];
}

export function convertDensity(kilogramsPerCubicMeter: number, unit: DensityUnit) {
  return unit === "kg/m3" ? kilogramsPerCubicMeter : kilogramsPerCubicMeter / 1000;
}

/** Like `quantityValue`, but reports the value in the requested display unit. */
export function quantityDisplayValue(sample: AtmosphereSample, quantity: PhysicalQuantity, units: DisplayUnits) {
  if (quantity === "temperature") return convertTemperature(sample.temperatureK, units.temperature);
  if (quantity === "pressure") return convertPressure(sample.pressurePa, units.pressure);
  return convertDensity(sample.densityKgM3, units.density);
}

/** Sample temperature, pressure and density at any altitude (km, 0–1000 km) via table interpolation. */
export function sampleStandardAtmosphere(altitudeKm: number): AtmosphereSample {
  const clamped = Math.min(Math.max(altitudeKm, 0), STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM);
  const position = clamped / STANDARD_ATMOSPHERE_GRID_STEP_KM;
  const lowIndex = Math.min(TABLE.length - 2, Math.floor(position));
  const frac = position - lowIndex;
  const [, tLow, pLow, rhoLow] = TABLE[lowIndex];
  const [, tHigh, pHigh, rhoHigh] = TABLE[lowIndex + 1];
  const temperatureK = tLow + (tHigh - tLow) * frac;
  const pressurePa = Math.exp(Math.log(pLow) + (Math.log(pHigh) - Math.log(pLow)) * frac);
  const densityKgM3 = Math.exp(Math.log(rhoLow) + (Math.log(rhoHigh) - Math.log(rhoLow)) * frac);
  return {
    altitudeKm: clamped,
    temperatureK,
    temperatureC: temperatureK - 273.15,
    pressurePa,
    pressureHPa: pressurePa / 100,
    densityKgM3,
  };
}

/** Every table grid point up to `maxAltitudeKm`, plus the exact top altitude if it isn't on the grid. */
export function standardAtmosphereProfile(maxAltitudeKm = STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM): AtmosphereSample[] {
  const top = Math.min(Math.max(maxAltitudeKm, 0), STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM);
  const samples = TABLE.filter(([z]) => z <= top).map(([z]) => sampleStandardAtmosphere(z));
  const lastZ = samples[samples.length - 1]?.altitudeKm ?? -1;
  if (top - lastZ > 1e-6) samples.push(sampleStandardAtmosphere(top));
  return samples;
}

export type AtmosphereLayerName = "對流層" | "平流層" | "中氣層" | "增溫層" | "外氣層";

/** Named layer bands. Boundaries follow the ranges commonly cited for each -pause; a single
 * representative altitude (tropopause 13 km, stratopause 52 km, mesopause 83 km) is used to
 * split bands, matching the boundary lines drawn on the chart. */
export const ATMOSPHERE_LAYER_BANDS: readonly { name: AtmosphereLayerName; from: number; to: number }[] = [
  { name: "對流層", from: 0, to: 13 },
  { name: "平流層", from: 13, to: 52 },
  { name: "中氣層", from: 52, to: 83 },
  { name: "增溫層", from: 83, to: 600 },
  { name: "外氣層", from: 600, to: STANDARD_ATMOSPHERE_MAX_ALTITUDE_KM },
];

export type AtmosphereBoundaryKey = "tropopause" | "stratopause" | "mesopause" | "thermopause";

export const ATMOSPHERE_BOUNDARIES: readonly { key: AtmosphereBoundaryKey; label: string; altitudeKm: number; range: string }[] = [
  { key: "tropopause", label: "對流層頂", altitudeKm: 13, range: "8–18 km" },
  { key: "stratopause", label: "平流層頂", altitudeKm: 52, range: "50–55 km" },
  { key: "mesopause", label: "中氣層頂", altitudeKm: 83, range: "80–85 km" },
  { key: "thermopause", label: "增溫層頂", altitudeKm: 600, range: "~600 km" },
];

export const OZONE_LAYER = { from: 20, to: 30, label: "臭氧層" };
