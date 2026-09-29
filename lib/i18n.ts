/** Locale primitives for the Lab app. UI copy lives here; science/model state remains locale-free. */
export const supportedLocales = ["zh-TW", "en"] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = "zh-TW";

// Keep the site's existing valid Chinese script tag on default URLs; locale identity remains zh-TW.
export const localeHtmlLang: Record<Locale, string> = { "zh-TW": "zh-Hant", en: "en" };
export const localeOpenGraph: Record<Locale, string> = { "zh-TW": "zh_TW", en: "en_US" };

export function localizedPath(locale: Locale, path: string) {
  return locale === defaultLocale ? path : `/en${path}`;
}

const atmosphereProfile = {
  "zh-TW": {
    title: "大氣垂直結構",
    description: "依 1976 年美國標準大氣模式，呈現溫度、氣壓、密度隨高度的變化剖面。",
    chartLabel: "大氣垂直結構剖面圖",
    catalog: "Kakau Lab 模型目錄",
    actions: { swapAxes: "對調座標軸", layers: "圖層", export: "匯出圖片", reset: "重設", fullscreen: "全螢幕檢視", exitFullscreen: "退出全螢幕" },
    controls: {
      title: "剖面控制台", maxAltitude: "顯示高度上限", cursorAltitude: "讀值游標高度",
      temperatureUnit: "溫度單位", pressureUnit: "氣壓單位", densityUnit: "密度單位",
      quantityA: "物理量 A（實線）", quantityB: "物理量 B（虛線）",
    },
    quantities: { temperature: "溫度", pressure: "氣壓", density: "密度" },
    altitude: "高度（km）",
    presets: { troposphere: "至對流層頂", stratosphere: "至平流層頂", mesosphere: "至中氣層頂", thermosphere: "至增溫層頂", full: "全剖面 0–1000 km" },
    layers: { troposphere: "對流層", stratosphere: "平流層", mesosphere: "中氣層", thermosphere: "增溫層", exosphere: "外氣層" },
    boundaries: { tropopause: "對流層頂", stratopause: "平流層頂", mesopause: "中氣層頂", thermopause: "增溫層頂" },
    ozone: "臭氧層",
    drawer: { title: "視圖圖層", close: "關閉圖層", layers: "大氣分層", layerLabels: "分層文字標籤", boundaries: "分層界線與標籤", ozone: "臭氧層帶狀區域", cursor: "讀值游標", tooltip: "數值卡片", axes: "物理量座標軸", linear: "線性", logarithmic: "對數" },
    source: "資料依據：",
    sourceCitation: "U.S. Standard Atmosphere, 1976（PDAS bigtables）",
    sourceNote: "（0–1000 km，每 5 km 一筆；格點間以線性〔溫度〕與對數線性〔氣壓、密度〕內插）。理想化水平分層模式：忽略緯度、季節、天氣系統造成的實際大氣變化，僅代表全球年平均概況。",
    language: { label: "語言", "zh-TW": "繁體中文", en: "English" },
  },
  en: {
    title: "Vertical Structure of the Atmosphere",
    description: "Explore how temperature, pressure, and density vary with altitude in the U.S. Standard Atmosphere 1976 model.",
    chartLabel: "Vertical atmospheric profile chart",
    catalog: "Kakau Lab model catalog",
    actions: { swapAxes: "Swap axes", layers: "Layers", export: "Export image", reset: "Reset", fullscreen: "View fullscreen", exitFullscreen: "Exit fullscreen" },
    controls: {
      title: "Profile controls", maxAltitude: "Maximum altitude shown", cursorAltitude: "Readout cursor altitude",
      temperatureUnit: "Temperature unit", pressureUnit: "Pressure unit", densityUnit: "Density unit",
      quantityA: "Quantity A (solid line)", quantityB: "Quantity B (dashed line)",
    },
    quantities: { temperature: "Temperature", pressure: "Pressure", density: "Density" },
    altitude: "Altitude (km)",
    presets: { troposphere: "To the tropopause", stratosphere: "To the stratopause", mesosphere: "To the mesopause", thermosphere: "To the thermopause", full: "Full profile, 0–1000 km" },
    layers: { troposphere: "Troposphere", stratosphere: "Stratosphere", mesosphere: "Mesosphere", thermosphere: "Thermosphere", exosphere: "Exosphere" },
    boundaries: { tropopause: "Tropopause", stratopause: "Stratopause", mesopause: "Mesopause", thermopause: "Thermopause" },
    ozone: "Ozone layer",
    drawer: { title: "View layers", close: "Close layers", layers: "Atmospheric layers", layerLabels: "Layer labels", boundaries: "Boundary lines and labels", ozone: "Ozone-layer band", cursor: "Readout cursor", tooltip: "Value card", axes: "Physical-quantity axes", linear: "Linear", logarithmic: "Logarithmic" },
    source: "Source:",
    sourceCitation: "U.S. Standard Atmosphere, 1976 (PDAS bigtables)",
    sourceNote: "(0–1000 km, at 5 km intervals; temperature is linearly interpolated and pressure and density are log-linearly interpolated between grid points.) This idealized horizontally layered model omits real variation from latitude, season, and weather systems; it represents a global annual-average picture only.",
    language: { label: "Language", "zh-TW": "繁體中文", en: "English" },
  },
} as const;

export function atmosphereProfileCopy(locale: Locale) {
  return atmosphereProfile[locale];
}

export type AtmosphereProfileCopy = ReturnType<typeof atmosphereProfileCopy>;
