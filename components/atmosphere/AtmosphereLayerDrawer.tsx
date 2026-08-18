"use client";

import { Layers3, X } from "lucide-react";
import { QUANTITY_META, type AxisScale, type StandardAtmosphereState } from "@/models/standardAtmosphere";
import type { PhysicalQuantity } from "@/lib/science/standardAtmosphere";

type Props = {
  open: boolean;
  state: StandardAtmosphereState;
  onClose: () => void;
  onPatch: (patch: Partial<StandardAtmosphereState>) => void;
};

const QUANTITIES: PhysicalQuantity[] = ["temperature", "pressure", "density"];

export default function AtmosphereLayerDrawer({ open, state, onClose, onPatch }: Props) {
  const check = (key: "showLayerLabels" | "showBoundaries" | "showOzoneLayer" | "showTooltip", label: string) => (
    <label><input type="checkbox" checked={state[key]} onChange={() => onPatch({ [key]: !state[key] })} />{label}</label>
  );
  const setScale = (quantity: PhysicalQuantity, scale: AxisScale) => {
    onPatch({ scaleByQuantity: { ...state.scaleByQuantity, [quantity]: scale } });
  };

  return (
    <aside className={`layer-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <header>
        <div><Layers3 size={18} /><strong>視圖圖層</strong></div>
        <button onClick={onClose} aria-label="關閉圖層"><X size={17} /></button>
      </header>
      <div className="drawer-scroll">
        <details open><summary>大氣分層</summary><div className="layer-list">
          {check("showLayerLabels", "分層文字標籤")}
          {check("showBoundaries", "分層界線與標籤")}
          {check("showOzoneLayer", "臭氧層帶狀區域")}
        </div></details>

        <details open><summary>讀值游標</summary><div className="layer-list">
          {check("showTooltip", "數值卡片")}
        </div></details>

        <details open><summary>物理量座標軸</summary><div className="layer-list quantity-scale-list">
          {QUANTITIES.map((quantity) => (
            <div className="coordinate-row" key={quantity}>
              <strong style={{ borderLeftColor: QUANTITY_META[quantity].color }}>{QUANTITY_META[quantity].label}</strong>
              <label className={state.scaleByQuantity[quantity] === "linear" ? "selected-inline" : ""}>
                <input
                  type="radio"
                  name={`scale-${quantity}`}
                  checked={state.scaleByQuantity[quantity] === "linear"}
                  onChange={() => setScale(quantity, "linear")}
                />
                線性
              </label>
              <label className={state.scaleByQuantity[quantity] === "log" ? "selected-inline" : ""}>
                <input
                  type="radio"
                  name={`scale-${quantity}`}
                  checked={state.scaleByQuantity[quantity] === "log"}
                  onChange={() => setScale(quantity, "log")}
                />
                對數
              </label>
            </div>
          ))}
        </div></details>
      </div>
    </aside>
  );
}
