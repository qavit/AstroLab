"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Layers, RotateCcw, Thermometer } from "lucide-react";
import type { AtmosphereSample } from "@/lib/science/standardAtmosphere";
import { STANDARD_ATMOSPHERE_SOURCE } from "@/lib/science/standardAtmosphere";
import {
  ALTITUDE_PRESETS,
  deriveStandardAtmosphereModel,
  initialStandardAtmosphereState,
  type StandardAtmosphereReadout,
  type StandardAtmosphereState,
} from "@/models/standardAtmosphere";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 380;
const PAD = { top: 14, right: 16, bottom: 30, left: 46 };
const PLOT_W = CHART_WIDTH - PAD.left - PAD.right;
const PLOT_H = CHART_HEIGHT - PAD.top - PAD.bottom;

const LAYER_COLORS = ["#5ed8c3", "#f2c66d", "#9eb8f2", "#ef817b", "#c792ea", "#6fb6e0", "#e79a6f"];

type Scale = "linear" | "log";

function makeScale(kind: Scale, domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (kind === "log") {
    const l0 = Math.log10(Math.max(d0, 1e-6));
    const l1 = Math.log10(Math.max(d1, 1e-6));
    return (value: number) => r0 + ((Math.log10(Math.max(value, 1e-6)) - l0) / (l1 - l0)) * (r1 - r0);
  }
  return (value: number) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

function niceLogTicks(min: number, max: number) {
  const lo = Math.floor(Math.log10(Math.max(min, 1e-6)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1e-6)));
  const ticks: number[] = [];
  for (let power = lo; power <= hi; power += 1) ticks.push(10 ** power);
  return ticks;
}

function linearTicks(min: number, max: number, count = 5) {
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function ProfileChart({
  title,
  unit,
  accessor,
  scale,
  color,
  readout,
  cursor,
  formatValue,
}: {
  title: string;
  unit: string;
  accessor: (sample: AtmosphereSample) => number;
  scale: Scale;
  color: string;
  readout: StandardAtmosphereReadout;
  cursor: AtmosphereSample;
  formatValue: (value: number) => string;
}) {
  const values = readout.profile.map(accessor);
  const domainMin = scale === "log" ? Math.max(Math.min(...values), 1e-6) : Math.min(...values);
  const domainMax = Math.max(...values);
  const maxAltitude = readout.profile[readout.profile.length - 1]?.altitudeKm ?? 1;

  const x = makeScale(scale, [domainMin, domainMax], [PAD.left, PAD.left + PLOT_W]);
  const y = makeScale("linear", [0, maxAltitude], [PAD.top + PLOT_H, PAD.top]);

  const path = readout.profile
    .map((sample, index) => `${index === 0 ? "M" : "L"} ${x(accessor(sample)).toFixed(2)} ${y(sample.altitudeKm).toFixed(2)}`)
    .join(" ");

  const xTicks = scale === "log" ? niceLogTicks(domainMin, domainMax) : linearTicks(domainMin, domainMax, 5);
  const yTicks = linearTicks(0, maxAltitude, 6);
  const cursorValue = accessor(cursor);

  return (
    <div className="profile-chart-card">
      <div className="profile-chart-heading">
        <strong>{title}</strong>
        <span>{unit}{scale === "log" ? "（對數刻度）" : ""}</span>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${title}隨高度變化圖`}>
        {readout.layers.map((layer, index) => {
          const nextBase = readout.layers[index + 1]?.baseHeight ?? maxAltitude;
          if (layer.baseHeight >= maxAltitude) return null;
          const yTop = y(Math.min(nextBase, maxAltitude));
          const yBottom = y(layer.baseHeight);
          return (
            <rect
              key={layer.name}
              x={PAD.left}
              y={yTop}
              width={PLOT_W}
              height={Math.max(0, yBottom - yTop)}
              fill={LAYER_COLORS[index % LAYER_COLORS.length]}
              opacity={0.07}
            />
          );
        })}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line x1={PAD.left} y1={y(tick)} x2={CHART_WIDTH - PAD.right} y2={y(tick)} className="profile-grid" />
            <text x={PAD.left - 8} y={y(tick) + 3} textAnchor="end" className="profile-axis">{Math.round(tick)}</text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line x1={x(tick)} y1={PAD.top} x2={x(tick)} y2={PAD.top + PLOT_H} className="profile-grid profile-grid-v" />
            <text x={x(tick)} y={CHART_HEIGHT - PAD.bottom + 14} textAnchor="middle" className="profile-axis">{formatValue(tick)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth="2.4" />
        <line x1={PAD.left} y1={y(cursor.altitudeKm)} x2={CHART_WIDTH - PAD.right} y2={y(cursor.altitudeKm)} className="profile-cursor-line" />
        <circle cx={x(cursorValue)} cy={y(cursor.altitudeKm)} r="4.5" fill={color} stroke="#0d2b41" strokeWidth="1.5" />
        <text x={PAD.left} y={PAD.top - 3} className="profile-axis-label">高度 (km)</text>
      </svg>
      <div className="profile-chart-readout">
        <span>{cursor.altitudeKm.toFixed(1)} km</span>
        <strong style={{ color }}>{formatValue(cursorValue)}{unit}</strong>
      </div>
    </div>
  );
}

export default function StandardAtmosphereLab() {
  const [state, setState] = useState<StandardAtmosphereState>(initialStandardAtmosphereState);
  const readout = useMemo(() => deriveStandardAtmosphereModel(state), [state]);

  const patchState = useCallback((patch: Partial<StandardAtmosphereState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  return (
    <main className="lab-shell atmosphere-profile-lab">
      <div className="topbar">
        <div>
          <div className="eyebrow">AstroLab · Model 05</div>
          <h1><span className="live-dot" />大氣垂直結構</h1>
        </div>
        <div className="header-actions">
          <Link className="model-index-link" href="/">模型目錄</Link>
          <button onClick={() => setState(initialStandardAtmosphereState())}><RotateCcw size={14} /> 重設</button>
        </div>
      </div>

      <p className="profile-intro">
        依 1976 年美國標準大氣模式（US Standard Atmosphere, 1976）逐層溫度遞減率計算，呈現溫度、氣壓、密度隨高度的變化。
      </p>

      <div className="profile-chart-grid">
        <ProfileChart
          title="溫度"
          unit=" °C"
          accessor={(sample) => sample.temperatureC}
          scale="linear"
          color="#f2c66d"
          readout={readout}
          cursor={readout.cursor}
          formatValue={(value) => value.toFixed(0)}
        />
        <ProfileChart
          title="氣壓"
          unit=" hPa"
          accessor={(sample) => sample.pressureHPa}
          scale="log"
          color="#72aee6"
          readout={readout}
          cursor={readout.cursor}
          formatValue={(value) => (value >= 1 ? value.toFixed(0) : value.toExponential(0))}
        />
        <ProfileChart
          title="密度"
          unit=" kg/m³"
          accessor={(sample) => sample.densityKgM3}
          scale="log"
          color="#5ed8c3"
          readout={readout}
          cursor={readout.cursor}
          formatValue={(value) => (value >= 0.001 ? value.toFixed(3) : value.toExponential(1))}
        />
      </div>

      <section className="control-panel profile-controls">
        <div className="control-panel-heading">
          <div><Layers size={14} /> 剖面控制台</div>
        </div>
        <div className="profile-control-grid">
          <div className="wind-control-block">
            <label><span>顯示高度上限 <b>{state.maxAltitudeKm.toFixed(1)} km</b></span>
              <input
                type="range"
                min="5"
                max="84.852"
                step="0.1"
                value={state.maxAltitudeKm}
                onChange={(event) => patchState({ maxAltitudeKm: Number(event.target.value) })}
              />
            </label>
            <div className="preset-row">
              {Object.entries(ALTITUDE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  className={Math.abs(state.maxAltitudeKm - preset.maxAltitudeKm) < 0.1 ? "selected" : ""}
                  onClick={() => patchState({ maxAltitudeKm: preset.maxAltitudeKm })}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="wind-control-block">
            <label><span><Thermometer size={12} /> 讀值游標高度 <b>{readout.cursor.altitudeKm.toFixed(1)} km</b></span>
              <input
                type="range"
                min="0"
                max={state.maxAltitudeKm}
                step="0.1"
                value={Math.min(state.cursorAltitudeKm, state.maxAltitudeKm)}
                onChange={(event) => patchState({ cursorAltitudeKm: Number(event.target.value) })}
              />
            </label>
            <small>T = {readout.cursor.temperatureK.toFixed(1)} K（{readout.cursor.temperatureC.toFixed(1)} °C）／P = {readout.cursor.pressureHPa.toFixed(2)} hPa／ρ = {readout.cursor.densityKgM3.toExponential(3)} kg/m³</small>
          </div>
        </div>
      </section>

      <section className="profile-layer-table">
        <table>
          <thead>
            <tr><th>大氣層</th><th>底部高度 (km)</th><th>底部溫度 (K)</th><th>遞減率 (K/km)</th><th>底部氣壓 (hPa)</th></tr>
          </thead>
          <tbody>
            {readout.layers.map((layer, index) => (
              <tr key={layer.name}>
                <td><i style={{ background: LAYER_COLORS[index % LAYER_COLORS.length] }} />{layer.name}</td>
                <td>{layer.baseHeight}</td>
                <td>{layer.baseTemp.toFixed(2)}</td>
                <td>{layer.lapseRate.toFixed(1)}</td>
                <td>{layer.sample.pressureHPa.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="wind-model-note profile-source">
        資料依據：
        <a href={STANDARD_ATMOSPHERE_SOURCE.url} target="_blank" rel="noreferrer noopener">
          {STANDARD_ATMOSPHERE_SOURCE.label} <ExternalLink size={11} />
        </a>
        。理想化水平分層模式：忽略緯度、季節、天氣系統造成的實際大氣變化，僅代表全球年平均概況。
      </p>
    </main>
  );
}
