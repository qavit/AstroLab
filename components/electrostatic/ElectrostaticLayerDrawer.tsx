"use client";

import type { RefObject } from "react";
import { LabLayerDrawer, LayerGroup, LayerToggle } from "../layers/LabLayerDrawer";
import styles from "./ElectrostaticFieldLab.module.css";
import type { ElectrostaticLayerState } from "./layers.ts";
export type { ElectrostaticLayerState } from "./layers.ts";

interface Props {
  readonly open: boolean;
  readonly layers: ElectrostaticLayerState;
  readonly available: Partial<Record<keyof ElectrostaticLayerState, boolean>>;
  readonly onClose: () => void;
  readonly onToggle: (key: keyof ElectrostaticLayerState) => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

/** Presentation consumes the shared drawer; evidence availability remains model-owned. */
export default function ElectrostaticLayerDrawer({ open, layers, available, onClose, onToggle, returnFocusRef }: Props) {
  const toggle = (key: keyof ElectrostaticLayerState, label: string) => available[key]
    ? <LayerToggle checked={layers[key]} label={label} onChange={() => onToggle(key)} testId={`layer-${key}`} />
    : null;
  return (
    <LabLayerDrawer open={open} id="electrostatic-layer-drawer" title="視圖圖層" onClose={onClose} returnFocusRef={returnFocusRef} className={styles.layerDrawerOffset}>
      <LayerGroup title="畫布顯示">
        <div className="layer-list">
          {toggle("field", "電場箭頭")}
          {toggle("fieldStrengthMap", "場強色圖")}
          {toggle("fieldLines", "電場線")}
          {toggle("probe", "測量點")}
          {toggle("particle", "測試電荷")}
          {toggle("trail", "軌跡")}
          {toggle("contributions", "個別電場貢獻")}
        </div>
      </LayerGroup>
    </LabLayerDrawer>
  );
}
