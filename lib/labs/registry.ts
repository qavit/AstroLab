/**
 * Kakau Lab model registry.
 *
 * Pure, machine-readable metadata for every lab in the Kakau Lab catalog. This module must
 * never import React, Three.js, lucide-react, or any other presentation-layer package — the
 * catalog component maps `presentation.icon` string keys to actual icon components, and other
 * presentation concerns (card art, preview images) are resolved the same way. Keeping this file
 * free of components means the manifest data can be tested, diffed, and reused without pulling
 * in a rendering runtime.
 *
 * Stage 0 populates only what the current catalog already shows. `assumptions`, `approximations`,
 * `validity`, and `verification` are reserved on `LabManifest` for a future pedagogical-quality
 * pass (see docs/architecture.md), not filled in here.
 */

export type LabSubject =
  | "physics"
  | "earth-science"
  | "astronomy"
  | "math"
  | "chemistry";

export type LabStatus = "published" | "experimental" | "paused";

/** Which first-party Kakau app hosts the implementation. */
export type LabApp = "kakau-lab" | "kakau-web";

/**
 * Discriminated on `app` so a manifest that pairs the wrong field with an app (a `kakau-lab`
 * entry with no `route`, a `kakau-web` entry with a `route` instead of a `url`) fails to compile
 * rather than silently reaching the catalog's fallback href.
 */
export type LabImplementation =
  | {
      app: "kakau-lab";
      /** Local route within this app. */
      route: string;
      url?: never;
    }
  | {
      app: "kakau-web";
      /** Absolute URL to the hosting Kakau property. */
      url: string;
      route?: never;
    };

export interface LabPresentation {
  tone?: string;
  previewImage?: string;
  cardArt?: string;
  icon?: string;
}

/**
 * Future pedagogical-quality contract. Reserved for Stage 0.1+: every field is optional so
 * existing manifests remain valid, but the shape is fixed now so later work has one place to
 * fill in rather than inventing per-model conventions.
 */
export interface LabScientificQuality {
  assumptions?: readonly string[];
  approximations?: readonly string[];
  validity?: readonly string[];
  verification?: readonly string[];
}

export interface LabManifest {
  id: string;
  /** Catalogue number, which follows the order the models were built, not the order shown. */
  number: string;
  title: string;
  subject: LabSubject;
  description: string;
  topics: readonly string[];
  concepts?: readonly string[];
  representations?: readonly string[];
  level: readonly string[];
  implementation: LabImplementation;
  status: LabStatus;
  presentation?: LabPresentation;
  scientificQuality?: LabScientificQuality;
}

export const labRegistry: readonly LabManifest[] = [
  {
    id: "solar-sphere",
    number: "01",
    title: "太陽、天球與竿影",
    subject: "astronomy",
    description: "同步觀看地心天球與觀察者天空，連結季節、日行跡與竿影。",
    topics: ["天球座標", "四季", "日行跡"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/solar" },
    status: "published",
    presentation: { tone: "solar", previewImage: "/solar-sphere-preview.png", icon: "orbit" },
  },
  {
    id: "magnetic-field-superposition",
    number: "02",
    title: "多導線磁場疊加",
    subject: "physics",
    description: "從空間視角與俯視圖同步理解安培定律與磁場向量疊加。",
    topics: ["安培定律", "向量疊加", "右手定則"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/magnetism" },
    status: "published",
    presentation: { tone: "magnetism", cardArt: "magnet", icon: "magnet" },
  },
  {
    id: "planetary-wind-systems",
    number: "03",
    title: "全球行星風系",
    subject: "earth-science",
    description: "用風帶、氣壓帶與粒子流，理解三圈環流與科氏偏轉。",
    topics: ["三圈環流", "ITCZ", "風場粒子"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/atmosphere" },
    status: "published",
    presentation: { tone: "atmosphere", previewImage: "/atmosphere-preview.png", icon: "wind" },
  },
  {
    id: "valley-bedding",
    number: "04",
    title: "岩層位態 × 河谷地形",
    subject: "earth-science",
    description: "將地質圖與立體塊體同步，練習走向、傾向與 V 字法則。",
    topics: ["地質圖", "V 字法則", "岩層位態"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/geology" },
    status: "published",
    presentation: { tone: "geology", previewImage: "/geology-preview.png", icon: "mountain" },
  },
  {
    id: "standard-atmosphere-profile",
    number: "05",
    title: "大氣垂直結構",
    subject: "earth-science",
    description: "依美國標準大氣 1976 模式，繪製溫度、氣壓、密度隨高度變化的剖面。",
    topics: ["標準大氣", "氣壓遞減", "大氣分層"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/atmosphere-profile" },
    status: "published",
    presentation: { tone: "atmosphere", cardArt: "layers", icon: "layers" },
  },
  {
    id: "coriolis-effect",
    number: "06",
    title: "科氏力效應",
    subject: "physics",
    description: "同步顯示慣性系直線與旋轉系彎曲路徑，理解科氏偏轉如何隨緯度與轉速改變。",
    topics: ["旋轉參考系", "科氏參數", "傅科擺"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/coriolis" },
    status: "published",
    presentation: { tone: "coriolis", cardArt: "coriolis", icon: "rotate-cw" },
  },
  {
    id: "projectile-motion",
    number: "07",
    title: "拋體運動",
    subject: "physics",
    description: "把拋物線拆成水平等速與垂直等加速，並比較互補角、安全拋物線與空氣阻力。",
    topics: ["水平垂直獨立", "安全拋物線", "曲率與加速度分量"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/projectile" },
    status: "published",
    presentation: { tone: "projectile", cardArt: "projectile", icon: "target" },
  },
  {
    id: "two-source-interference",
    number: "08",
    title: "雙點波源干涉",
    subject: "physics",
    description: "同調雙波源的疊加場，如何由波程差決定相長與相消干涉的雙曲線圖樣。",
    topics: ["波動", "干涉", "波程差", "雙曲線"],
    concepts: [
      "coherent-sources",
      "path-difference",
      "phase-difference",
      "constructive-interference",
      "destructive-interference",
    ],
    representations: [
      "field",
      "wavefront",
      "path-difference-geometry",
      "point-measurement",
      "time-evolution",
    ],
    level: ["high-school"],
    implementation: { app: "kakau-web", url: "https://kakau.tw/lab/interference" },
    status: "published",
    presentation: { tone: "interference", icon: "waves" },
  },
  {
    id: "electrostatics",
    number: "09",
    title: "靜電學",
    subject: "physics",
    description: "從點電荷與電場開始，探索看不見的電作用。",
    topics: ["庫侖定律", "向量疊加", "電場"],
    concepts: ["electric-field", "vector-superposition", "source-core"],
    representations: ["vector-field", "spatial-probe", "per-source-contributions"],
    level: ["high-school"],
    implementation: { app: "kakau-lab", route: "/electrostatics" },
    status: "experimental",
    presentation: { tone: "electrostatic", icon: "zap" },
  },
];

export function publishedLabs(registry: readonly LabManifest[] = labRegistry): readonly LabManifest[] {
  return registry.filter((lab) => lab.status === "published");
}

export function experimentalLabs(registry: readonly LabManifest[] = labRegistry): readonly LabManifest[] {
  return registry.filter((lab) => lab.status === "experimental");
}
