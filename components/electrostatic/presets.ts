import type { PresetId } from "../../models/electrostatic.ts";

export interface PresetOption {
  readonly id: PresetId;
  readonly label: string;
  readonly hint: string;
}

export interface PresetCategory {
  readonly id: "fundamentals";
  readonly label: string;
  readonly presets: readonly PresetOption[];
}

/** Explicit, compact IA: future categories can be added without changing preset physics. */
export const PRESET_CATEGORIES: readonly PresetCategory[] = [
  {
    id: "fundamentals",
    label: "基礎",
    presets: [
      { id: "single-positive", label: "單一正電荷", hint: "單一點電荷的基本配置" },
      { id: "like-pair", label: "同號雙電荷", hint: "兩顆同號、對稱放置的電荷" },
      { id: "dipole", label: "電偶極", hint: "一正一負、大小相同的雙電荷" },
    ],
  },
];
