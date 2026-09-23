import type { PresetId } from "../../models/electrostatic.ts";

export interface PresetOption {
  readonly id: PresetId;
  readonly label: string;
  readonly hint: string;
}

export const PRESETS: readonly PresetOption[] = [
  { id: "single-positive", label: "單一正電荷", hint: "先看一顆電荷如何建立電場" },
  { id: "like-pair", label: "同號雙電荷", hint: "找出互相抵消的位置" },
  { id: "dipole", label: "一正一負", hint: "比較兩個方向如何疊加" },
];
