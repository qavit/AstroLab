"use client";

import { Layers3, X } from "lucide-react";
import { QUANTITY_META, type AxisScale, type StandardAtmosphereState } from "@/models/standardAtmosphere";
import type { PhysicalQuantity } from "@/lib/science/standardAtmosphere";
import type { AtmosphereProfileCopy } from "@/lib/i18n";

type Props = {
  open: boolean;
  state: StandardAtmosphereState;
  onClose: () => void;
  onPatch: (patch: Partial<StandardAtmosphereState>) => void;
  copy: AtmosphereProfileCopy;
};

const QUANTITIES: PhysicalQuantity[] = ["temperature", "pressure", "density"];

export default function AtmosphereLayerDrawer({ open, state, onClose, onPatch, copy }: Props) {
  const check = (key: "showLayerLabels" | "showBoundaries" | "showOzoneLayer" | "showTooltip", label: string) => (
    <label><input type="checkbox" checked={state[key]} onChange={() => onPatch({ [key]: !state[key] })} />{label}</label>
  );
  const setScale = (quantity: PhysicalQuantity, scale: AxisScale) => {
    onPatch({ scaleByQuantity: { ...state.scaleByQuantity, [quantity]: scale } });
  };

  return (
    <aside className={`layer-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <header>
        <div><Layers3 size={18} /><strong>{copy.drawer.title}</strong></div>
        <button onClick={onClose} aria-label={copy.drawer.close}><X size={17} /></button>
      </header>
      <div className="drawer-scroll">
        <details open><summary>{copy.drawer.layers}</summary><div className="layer-list">
          {check("showLayerLabels", copy.drawer.layerLabels)}
          {check("showBoundaries", copy.drawer.boundaries)}
          {check("showOzoneLayer", copy.drawer.ozone)}
        </div></details>

        <details open><summary>{copy.drawer.cursor}</summary><div className="layer-list">
          {check("showTooltip", copy.drawer.tooltip)}
        </div></details>

        <details open><summary>{copy.drawer.axes}</summary><div className="layer-list quantity-scale-list">
          {QUANTITIES.map((quantity) => (
            <div className="coordinate-row" key={quantity}>
              <strong style={{ borderLeftColor: QUANTITY_META[quantity].color }}>{copy.quantities[quantity]}</strong>
              <label className={state.scaleByQuantity[quantity] === "linear" ? "selected-inline" : ""}>
                <input
                  type="radio"
                  name={`scale-${quantity}`}
                  checked={state.scaleByQuantity[quantity] === "linear"}
                  onChange={() => setScale(quantity, "linear")}
                />
                {copy.drawer.linear}
              </label>
              <label className={state.scaleByQuantity[quantity] === "log" ? "selected-inline" : ""}>
                <input
                  type="radio"
                  name={`scale-${quantity}`}
                  checked={state.scaleByQuantity[quantity] === "log"}
                  onChange={() => setScale(quantity, "log")}
                />
                {copy.drawer.logarithmic}
              </label>
            </div>
          ))}
        </div></details>
      </div>
    </aside>
  );
}
