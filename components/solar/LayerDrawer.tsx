"use client";

import { Layers3, X } from "lucide-react";
import type { AppearanceState, LayerState } from "@/models/solar";

type Props = {
  open: boolean;
  layers: LayerState;
  appearance: AppearanceState;
  onClose: () => void;
  onToggleLayer: (key: keyof LayerState) => void;
  onAppearanceChange: (patch: Partial<AppearanceState>) => void;
};

export default function LayerDrawer({ open, layers, appearance, onClose, onToggleLayer, onAppearanceChange }: Props) {
  const check = (key: keyof LayerState, label: string) => (
    <label><input type="checkbox" checked={layers[key]} onChange={() => onToggleLayer(key)} />{label}</label>
  );
  const coordinateRow = (label: string, lines: keyof LayerState, labels: keyof LayerState) => (
    <div className="coordinate-row">
      <strong>{label}</strong>
      <label><input type="checkbox" checked={layers[lines]} onChange={() => onToggleLayer(lines)} />線</label>
      <label><input type="checkbox" checked={layers[labels]} onChange={() => onToggleLayer(labels)} />標籤</label>
    </div>
  );
  const observerSelect = (key: "globalObserver" | "localObserver") => (
    <select
      disabled={!layers.observer}
      value={appearance[key]}
      onChange={(event) => onAppearanceChange({ [key]: event.target.value as AppearanceState["globalObserver"] })}
    >
      <option value="person">人形</option>
      <option value="dot">圓形點</option>
      <option value="gnomon">竿與影</option>
    </select>
  );

  return (
    <aside className={`layer-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <header>
        <div><Layers3 size={18} /><strong>視圖圖層</strong></div>
        <button onClick={onClose} aria-label="關閉圖層"><X size={17} /></button>
      </header>
      <div className="drawer-scroll">
        <details open><summary>天球與赤道坐標</summary><div className="layer-list coordinate-controls">
          {check("celestialSphere", "天球外框")}
          {coordinateRow("赤經", "rightAscensionLines", "rightAscensionLabels")}
          {coordinateRow("赤緯", "declinationLines", "declinationLabels")}
          {check("celestialEquator", "天赤道")}
          {check("celestialAxis", "天軸")}
        </div></details>

        <details open><summary>黃道坐標與節氣</summary><div className="layer-list coordinate-controls">
          {check("ecliptic", "黃道")}
          {coordinateRow("黃經", "eclipticLongitudeLines", "eclipticLongitudeLabels")}
          {coordinateRow("黃緯", "eclipticLatitudeLines", "eclipticLatitudeLabels")}
          {check("seasonalMarkers", "分至點")}
          {check("solarTermLabels", "節氣")}
          {check("apsides", "近日點／遠日點")}
        </div></details>

        <details open><summary>地球與觀察者</summary><div className="layer-list">
          <span className="field-label">地球外觀</span>
          <select value={appearance.earthOpaque ? "opaque" : "transparent"} onChange={(event) => onAppearanceChange({ earthOpaque: event.target.value === "opaque" })}>
            <option value="opaque">不透明</option>
            <option value="transparent">透明</option>
          </select>
          {check("geographicGrid", "一般經緯線")}
          {check("observerLatitude", "觀察者緯線")}
          {check("observerMeridian", "觀察者經線")}
          {check("subsolarPoint", "日下點")}
          {check("timeLabels", "時間標籤")}
          {check("observer", "觀察者")}
          {check("tangentPlane", "切平面")}
          <span className="field-label">地心模型觀察者</span>
          {observerSelect("globalObserver")}
        </div></details>

        <details open><summary>地平坐標與觀察者天空</summary><div className="layer-list coordinate-controls">
          {check("compassLabels", "方位")}
          <select
            aria-label="方位數量"
            disabled={!layers.compassLabels}
            value={appearance.compassPoints}
            onChange={(event) => onAppearanceChange({ compassPoints: Number(event.target.value) as 4 | 8 | 16 })}
          >
            <option value="4">4 方位</option>
            <option value="8">8 方位</option>
            <option value="16">16 方位</option>
          </select>
          {coordinateRow("高度角", "horizontalAltitudeLines", "horizontalAltitudeLabels")}
          {coordinateRow("方位角", "horizontalAzimuthLines", "horizontalAzimuthLabels")}
          {check("nadir", "天底")}
          {check("meridianCircle", "子午圈")}
          {check("primeVertical", "酉卯圈")}
          {check("currentPath", "當日太陽週日運動軌跡")}
          {check("seasonalPaths", "二分二至太陽週日運動軌跡")}
          {check("seasonalPathLabels", "二分二至軌跡標籤")}
          {check("belowHorizon", "地平面以下")}
          {check("shadow", "竿與影線")}
          <span className="field-label">觀察者模型中心</span>
          {observerSelect("localObserver")}
        </div></details>
      </div>
    </aside>
  );
}
