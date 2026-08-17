"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Compass, ExternalLink, Layers3, RotateCcw } from "lucide-react";
import {
  OZONE_LAYER,
  STANDARD_ATMOSPHERE_SOURCE,
  quantityValue,
  type AtmosphereSample,
  type PhysicalQuantity,
} from "@/lib/science/standardAtmosphere";
import {
  ALTITUDE_PRESETS,
  QUANTITY_META,
  deriveStandardAtmosphereModel,
  initialStandardAtmosphereState,
  type AxisScale,
  type StandardAtmosphereReadout,
  type StandardAtmosphereState,
} from "@/models/standardAtmosphere";
import AtmosphereLayerDrawer from "@/components/atmosphere/AtmosphereLayerDrawer";

const CHART_W = 760;
const CHART_H = 560;

type Plot = { left: number; right: number; top: number; bottom: number };
type Domain = { min: number; max: number };

const SUPERSCRIPT_DIGITS: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const toSuperscript = (n: number) => String(n).split("").map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");

function formatScientific(value: number, digits: number) {
  if (value === 0) return "0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log10(abs));
  let mantissa = Number((abs / 10 ** exp).toFixed(digits));
  let finalExp = exp;
  if (mantissa >= 10) { mantissa /= 10; finalExp += 1; }
  return `${sign}${mantissa.toFixed(digits)} × 10${toSuperscript(finalExp)}`;
}

/** Uses scientific notation once magnitude leaves a comfortable fixed-point range. */
function formatQuantityValue(value: number, quantity: PhysicalQuantity, digits = 2) {
  if (quantity === "temperature") return value.toFixed(digits >= 2 ? 1 : 0);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-2 || abs >= 1e5)) return formatScientific(value, digits);
  return abs >= 100 ? value.toFixed(0) : value.toPrecision(3);
}

function linearTicks(min: number, max: number, count = 5) {
  if (max <= min) return [min];
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}

function logTicks(min: number, max: number) {
  const lo = Math.floor(Math.log10(Math.max(min, 1e-300)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1e-300)));
  const ticks: number[] = [];
  for (let power = lo; power <= hi; power += 1) ticks.push(10 ** power);
  return ticks;
}

function altitudeTicks(maxAltitude: number) {
  const rough = maxAltitude / 5;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-6)));
  const residual = rough / magnitude;
  const step = residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= maxAltitude + 1e-6; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < maxAltitude - step * 0.4) ticks.push(Math.round(maxAltitude * 100) / 100);
  return ticks;
}

function computeDomain(profile: AtmosphereSample[], quantity: PhysicalQuantity, scale: AxisScale): Domain {
  const values = profile.map((sample) => quantityValue(sample, quantity));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (scale === "linear") {
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.08 || 1;
    min -= pad;
    max += pad;
    if (quantity !== "temperature") min = Math.max(min, 0);
  }
  if (min === max) { min -= 1; max += 1; }
  return { min, max };
}

function normalize(value: number, domain: Domain, scale: AxisScale) {
  if (scale === "log") {
    const l0 = Math.log10(Math.max(domain.min, 1e-300));
    const l1 = Math.log10(Math.max(domain.max, 1e-300));
    return (Math.log10(Math.max(value, 1e-300)) - l0) / (l1 - l0);
  }
  return (value - domain.min) / (domain.max - domain.min);
}

function axisPixel(t: number, vertical: boolean, plot: Plot) {
  return vertical ? plot.bottom - t * (plot.bottom - plot.top) : plot.left + t * (plot.right - plot.left);
}

function AxisGroup({ vertical, side, fixedCoord, spanFrom, spanTo, ticks, posOf, formatTick, title, color }: {
  vertical: boolean;
  side: "left" | "right" | "top" | "bottom";
  fixedCoord: number;
  spanFrom: number;
  spanTo: number;
  ticks: number[];
  posOf: (tick: number) => number;
  formatTick: (tick: number) => string;
  title: string;
  color?: string;
}) {
  const tickLen = 5;
  const isLeft = side === "left";
  const isTop = side === "top";
  return (
    <g className="atmos-axis" style={color ? { color } : undefined}>
      <line
        x1={vertical ? fixedCoord : spanFrom} y1={vertical ? spanFrom : fixedCoord}
        x2={vertical ? fixedCoord : spanTo} y2={vertical ? spanTo : fixedCoord}
        className="atmos-axis-line"
      />
      {ticks.map((tick) => {
        const pos = posOf(tick);
        const x1 = vertical ? fixedCoord + (isLeft ? -tickLen : tickLen) : pos;
        const x2 = vertical ? fixedCoord : pos;
        const y1 = vertical ? pos : fixedCoord + (isTop ? -tickLen : tickLen);
        const y2 = vertical ? pos : fixedCoord;
        const labelX = vertical ? fixedCoord + (isLeft ? -9 : 9) : pos;
        const labelY = vertical ? pos + 3 : fixedCoord + (isTop ? -9 : 15);
        return (
          <g key={tick}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="atmos-tick" />
            <text x={labelX} y={labelY} textAnchor={vertical ? (isLeft ? "end" : "start") : "middle"} className="atmos-tick-label">{formatTick(tick)}</text>
          </g>
        );
      })}
      {vertical ? (
        <text
          x={fixedCoord + (isLeft ? -42 : 42)} y={(spanFrom + spanTo) / 2}
          textAnchor="middle"
          transform={`rotate(${isLeft ? -90 : 90} ${fixedCoord + (isLeft ? -42 : 42)} ${(spanFrom + spanTo) / 2})`}
          className="atmos-axis-title"
        >{title}</text>
      ) : (
        <text x={(spanFrom + spanTo) / 2} y={fixedCoord + (isTop ? -36 : 38)} textAnchor="middle" className="atmos-axis-title">{title}</text>
      )}
    </g>
  );
}

function AtmosphereChart({ state, readout }: { state: StandardAtmosphereState; readout: StandardAtmosphereReadout }) {
  const { profile, layers, boundaries, cursor } = readout;
  const maxAltitude = state.maxAltitudeKm;
  const swap = state.swapAxes;

  const plot: Plot = swap
    ? { left: 76, right: CHART_W - 76, top: 22, bottom: CHART_H - 60 }
    : { left: 76, right: CHART_W - 24, top: 60, bottom: CHART_H - 76 };

  const altPixel = useCallback((altitudeKm: number) => axisPixel(altitudeKm / maxAltitude, !swap, plot), [maxAltitude, swap, plot]);

  const domainA = useMemo(() => computeDomain(profile, state.quantityA, state.scaleByQuantity[state.quantityA]), [profile, state.quantityA, state.scaleByQuantity]);
  const domainB = useMemo(() => computeDomain(profile, state.quantityB, state.scaleByQuantity[state.quantityB]), [profile, state.quantityB, state.scaleByQuantity]);

  const valPixel = useCallback((quantity: PhysicalQuantity, value: number, domain: Domain) =>
    axisPixel(normalize(value, domain, state.scaleByQuantity[quantity]), swap, plot), [swap, plot, state.scaleByQuantity]);

  const point = useCallback((altitudeKm: number, quantity: PhysicalQuantity, value: number, domain: Domain) => {
    const a = altPixel(altitudeKm);
    const v = valPixel(quantity, value, domain);
    return swap ? { x: a, y: v } : { x: v, y: a };
  }, [altPixel, valPixel, swap]);

  const pathFor = (quantity: PhysicalQuantity, domain: Domain) => profile
    .map((sample, index) => {
      const p = point(sample.altitudeKm, quantity, quantityValue(sample, quantity), domain);
      return `${index === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    })
    .join(" ");

  const altTicks = altitudeTicks(maxAltitude);
  const ticksA = state.scaleByQuantity[state.quantityA] === "log" ? logTicks(domainA.min, domainA.max) : linearTicks(domainA.min, domainA.max);
  const ticksB = state.scaleByQuantity[state.quantityB] === "log" ? logTicks(domainB.min, domainB.max) : linearTicks(domainB.min, domainB.max);

  const boundaryLine = (altitudeKm: number) => {
    const a = altPixel(altitudeKm);
    return swap ? { x1: a, y1: plot.top, x2: a, y2: plot.bottom } : { x1: plot.left, y1: a, x2: plot.right, y2: a };
  };

  const ozoneRect = () => {
    const a1 = altPixel(OZONE_LAYER.from);
    const a2 = altPixel(OZONE_LAYER.to);
    if (swap) {
      const x = Math.min(a1, a2);
      return { x, y: plot.top, width: Math.abs(a2 - a1), height: plot.bottom - plot.top };
    }
    const y = Math.min(a1, a2);
    return { x: plot.left, y, width: plot.right - plot.left, height: Math.abs(a2 - a1) };
  };

  const layerLabelPos = (mid: number) => {
    const a = altPixel(mid);
    return swap ? { x: a, y: (plot.top + plot.bottom) / 2 } : { x: (plot.left + plot.right) / 2, y: a };
  };

  const cursorPointA = point(cursor.altitudeKm, state.quantityA, quantityValue(cursor, state.quantityA), domainA);
  const cursorPointB = point(cursor.altitudeKm, state.quantityB, quantityValue(cursor, state.quantityB), domainB);
  const cursorLine = boundaryLine(cursor.altitudeKm);
  const ozone = ozoneRect();

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="大氣垂直結構剖面圖" className="atmos-svg">
      {state.showOzoneLayer && ozone.width > 0 && ozone.height > 0 && (
        <g>
          <rect x={ozone.x} y={ozone.y} width={ozone.width} height={ozone.height} className="atmos-ozone-band" />
          <text
            x={swap ? ozone.x + ozone.width / 2 : plot.right - 8}
            y={swap ? plot.top + 27 : ozone.y + ozone.height / 2 + 3}
            textAnchor={swap ? "middle" : "end"}
            className="atmos-ozone-label"
          >{OZONE_LAYER.label}（{OZONE_LAYER.from}–{OZONE_LAYER.to} km）</text>
        </g>
      )}

      {state.showLayerLabels && layers.map((layer) => {
        const mid = (layer.from + layer.to) / 2;
        const pos = layerLabelPos(mid);
        return <text key={layer.name} x={pos.x} y={pos.y} textAnchor="middle" className="atmos-layer-label">{layer.name}</text>;
      })}

      {state.showBoundaries && boundaries.map((boundary) => {
        const line = boundaryLine(boundary.altitudeKm);
        const labelPos = swap
          ? { x: line.x1 + 4, y: plot.top + 12, anchor: "start" as const }
          : { x: plot.right - 6, y: line.y1 - 5, anchor: "end" as const };
        return (
          <g key={boundary.key}>
            <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="atmos-boundary-line" />
            <text x={labelPos.x} y={labelPos.y} textAnchor={labelPos.anchor} className="atmos-boundary-label">{boundary.label} {boundary.altitudeKm} km</text>
          </g>
        );
      })}

      <AxisGroup
        vertical={!swap} side={swap ? "bottom" : "left"}
        fixedCoord={swap ? plot.bottom : plot.left}
        spanFrom={swap ? plot.left : plot.top} spanTo={swap ? plot.right : plot.bottom}
        ticks={altTicks} posOf={altPixel} formatTick={(t) => t.toLocaleString()}
        title="高度（km）"
      />
      <AxisGroup
        vertical={swap} side={swap ? "left" : "bottom"}
        fixedCoord={swap ? plot.left : plot.bottom}
        spanFrom={swap ? plot.top : plot.left} spanTo={swap ? plot.bottom : plot.right}
        ticks={ticksA} posOf={(t) => valPixel(state.quantityA, t, domainA)} formatTick={(t) => formatQuantityValue(t, state.quantityA, 0)}
        title={`${QUANTITY_META[state.quantityA].label}（${QUANTITY_META[state.quantityA].unit}）`}
        color={QUANTITY_META[state.quantityA].color}
      />
      <AxisGroup
        vertical={swap} side={swap ? "right" : "top"}
        fixedCoord={swap ? plot.right : plot.top}
        spanFrom={swap ? plot.top : plot.left} spanTo={swap ? plot.bottom : plot.right}
        ticks={ticksB} posOf={(t) => valPixel(state.quantityB, t, domainB)} formatTick={(t) => formatQuantityValue(t, state.quantityB, 0)}
        title={`${QUANTITY_META[state.quantityB].label}（${QUANTITY_META[state.quantityB].unit}）`}
        color={QUANTITY_META[state.quantityB].color}
      />

      <path d={pathFor(state.quantityA, domainA)} fill="none" stroke={QUANTITY_META[state.quantityA].color} strokeWidth="2.6" />
      <path d={pathFor(state.quantityB, domainB)} fill="none" stroke={QUANTITY_META[state.quantityB].color} strokeWidth="2.6" strokeDasharray="1 5" strokeLinecap="round" />

      <line x1={cursorLine.x1} y1={cursorLine.y1} x2={cursorLine.x2} y2={cursorLine.y2} className="atmos-cursor-line" />
      <circle cx={cursorPointA.x} cy={cursorPointA.y} r="4.5" fill={QUANTITY_META[state.quantityA].color} stroke="#0d2b41" strokeWidth="1.5" />
      <circle cx={cursorPointB.x} cy={cursorPointB.y} r="4.5" fill={QUANTITY_META[state.quantityB].color} stroke="#0d2b41" strokeWidth="1.5" />
    </svg>
  );
}

export default function StandardAtmosphereLab() {
  const [state, setState] = useState<StandardAtmosphereState>(initialStandardAtmosphereState);
  const [showLayers, setShowLayers] = useState(false);
  const readout = useMemo(() => deriveStandardAtmosphereModel(state), [state]);

  const patchState = useCallback((patch: Partial<StandardAtmosphereState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const setQuantityA = (quantity: PhysicalQuantity) => {
    patchState(quantity === state.quantityB ? { quantityA: quantity, quantityB: state.quantityA } : { quantityA: quantity });
  };
  const setQuantityB = (quantity: PhysicalQuantity) => {
    patchState(quantity === state.quantityA ? { quantityB: quantity, quantityA: state.quantityB } : { quantityB: quantity });
  };

  return (
    <main className="lab-shell atmosphere-profile-lab">
      <div className="topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow">Model 05</div>
          <h1><span className="live-dot" />大氣垂直結構</h1>
        </div>
        <div className="header-actions">
          <button className={state.swapAxes ? "active" : ""} onClick={() => patchState({ swapAxes: !state.swapAxes })}><ArrowLeftRight size={14} /> 對調座標軸</button>
          <button className={showLayers ? "active" : ""} onClick={() => setShowLayers((v) => !v)}><Layers3 size={14} /> 圖層</button>
          <Link className="model-index-link" href="/">模型目錄</Link>
          <button onClick={() => setState(initialStandardAtmosphereState())}><RotateCcw size={14} /> 重設</button>
        </div>
      </div>

      <p className="profile-intro">
        依 1976 年美國標準大氣模式（US Standard Atmosphere, 1976）之官方數據表，呈現溫度、氣壓、密度隨高度的變化。
      </p>

      <section className="viewport-card atmos-chart-card">
        <div className="card-label">
          <span>2D</span>
          <div><strong>{QUANTITY_META[state.quantityA].label} × {QUANTITY_META[state.quantityB].label}</strong><small>虛線為第二物理量；灰色游標線為目前讀值高度</small></div>
        </div>
        <div className="atmos-chart-wrap"><AtmosphereChart state={state} readout={readout} /></div>
      </section>

      <div className="wind-metrics atmos-metrics">
        <div><span>游標高度</span><strong>{readout.cursor.altitudeKm.toFixed(1)} km</strong></div>
        <div><span>{QUANTITY_META[state.quantityA].label}</span><strong style={{ color: QUANTITY_META[state.quantityA].color }}>{formatQuantityValue(quantityValue(readout.cursor, state.quantityA), state.quantityA, 3)} {QUANTITY_META[state.quantityA].unit}</strong></div>
        <div><span>{QUANTITY_META[state.quantityB].label}</span><strong style={{ color: QUANTITY_META[state.quantityB].color }}>{formatQuantityValue(quantityValue(readout.cursor, state.quantityB), state.quantityB, 3)} {QUANTITY_META[state.quantityB].unit}</strong></div>
        <div><span>顯示高度上限</span><strong>{state.maxAltitudeKm.toLocaleString()} km</strong></div>
      </div>

      <section className="control-panel profile-controls">
        <div className="control-panel-heading"><div>剖面控制台</div></div>
        <div className="profile-control-grid">
          <div className="wind-control-block">
            <label><span>顯示高度上限 <b>{state.maxAltitudeKm.toLocaleString()} km</b></span>
              <input type="range" min="10" max="1000" step="1" value={state.maxAltitudeKm} onChange={(event) => patchState({ maxAltitudeKm: Number(event.target.value) })} />
            </label>
            <div className="preset-row">
              {Object.entries(ALTITUDE_PRESETS).map(([key, preset]) => (
                <button key={key} className={state.maxAltitudeKm === preset.maxAltitudeKm ? "selected" : ""} onClick={() => patchState({ maxAltitudeKm: preset.maxAltitudeKm })}>{preset.label}</button>
              ))}
            </div>
          </div>
          <div className="wind-control-block">
            <label><span>讀值游標高度 <b>{readout.cursor.altitudeKm.toFixed(1)} km</b></span>
              <input type="range" min="0" max={state.maxAltitudeKm} step={state.maxAltitudeKm / 500} value={Math.min(state.cursorAltitudeKm, state.maxAltitudeKm)} onChange={(event) => patchState({ cursorAltitudeKm: Number(event.target.value) })} />
            </label>
            <small>T = {readout.cursor.temperatureK.toFixed(1)} K（{readout.cursor.temperatureC.toFixed(1)} °C）</small>
          </div>
          <div className="wind-control-block">
            <label><span>物理量 A（實線）</span>
              <select value={state.quantityA} onChange={(event) => setQuantityA(event.target.value as PhysicalQuantity)}>
                {(["temperature", "pressure", "density"] as const).map((q) => <option key={q} value={q}>{QUANTITY_META[q].label}</option>)}
              </select>
            </label>
          </div>
          <div className="wind-control-block">
            <label><span>物理量 B（虛線）</span>
              <select value={state.quantityB} onChange={(event) => setQuantityB(event.target.value as PhysicalQuantity)}>
                {(["temperature", "pressure", "density"] as const).map((q) => <option key={q} value={q}>{QUANTITY_META[q].label}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <p className="wind-model-note profile-source">
        資料依據：
        <a href={STANDARD_ATMOSPHERE_SOURCE.url} target="_blank" rel="noreferrer noopener">
          {STANDARD_ATMOSPHERE_SOURCE.label} <ExternalLink size={11} />
        </a>
        （0–1000 km，每 5 km 一筆；格點間以線性〔溫度〕與對數線性〔氣壓、密度〕內插）。理想化水平分層模式：忽略緯度、季節、天氣系統造成的實際大氣變化，僅代表全球年平均概況。
      </p>

      <AtmosphereLayerDrawer open={showLayers} state={state} onClose={() => setShowLayers(false)} onPatch={patchState} />
    </main>
  );
}
