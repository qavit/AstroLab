"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { Compass, RotateCcw, Scissors, Sparkles } from "lucide-react";
import {
  crossV,
  formatField,
  normalizeV,
  vec,
  wireGeometry,
  type Vec3,
  type Wire,
} from "@/lib/science/magnetism";
import { arrowGroup, clearGroup, makeLine, textSprite } from "@/lib/render/primitives";
import { createRenderLoop, createViewport } from "@/lib/render/viewport";
import {
  deriveMagnetismModel,
  initialMagnetismState,
  type MagnetismReadout,
  type MagnetismState,
} from "@/models/magnetism";

const WIRE_COLORS: Record<string, { hex: number; css: string }> = {
  I1: { hex: 0xef6c57, css: "#ef6c57" },
  I2: { hex: 0x4fb0c9, css: "#4fb0c9" },
  I3: { hex: 0x7fbf6a, css: "#7fbf6a" },
  I4: { hex: 0xc98fe0, css: "#c98fe0" },
};

const HALF_LENGTH = 2.3;
const SVG_SCALE = 58;
const SVG_HALF = 2.7 * SVG_SCALE;

/** Visual length (meters, model space) for a field-strength arrow, clamped so tiny/huge values stay legible. */
/** sqrt scaling keeps small teaching-range values (well under 1 μT) visually distinct
 * while still capping extreme values, instead of a linear scale that saturates at either end. */
function arrowLength(microTesla: number) {
  return Math.min(1.6, Math.max(0.22, 0.22 + 0.55 * Math.sqrt(Math.abs(microTesla))));
}

function fieldRing(wire: Wire, color: number, radius: number, ticks = 8, opacity = 0.4) {
  const group = new THREE.Group();
  const { point, direction } = wireGeometry(wire);
  const uv: Vec3 = wire.orientation === "vertical" ? vec(1, 0, 0) : vec(0, 1, 0);
  const w = vec(0, 0, 1);
  const circlePoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
    const radial = { x: uv.x * Math.cos(angle) + w.x * Math.sin(angle), y: uv.y * Math.cos(angle) + w.y * Math.sin(angle), z: uv.z * Math.cos(angle) + w.z * Math.sin(angle) };
    circlePoints.push(new THREE.Vector3(point.x + radial.x * radius, point.y + radial.y * radius, point.z + radial.z * radius));
  }
  group.add(makeLine(circlePoints, color, opacity * 0.6));
  for (let i = 0; i < ticks; i += 1) {
    const angle = (i / ticks) * Math.PI * 2;
    const radial = normalizeV({ x: uv.x * Math.cos(angle) + w.x * Math.sin(angle), y: uv.y * Math.cos(angle) + w.y * Math.sin(angle), z: uv.z * Math.cos(angle) + w.z * Math.sin(angle) });
    const at = { x: point.x + radial.x * radius, y: point.y + radial.y * radius, z: point.z + radial.z * radius };
    const tangent = crossV(direction, radial);
    group.add(arrowGroup(at, tangent, 0.16, color, opacity, 0.045, 0.009));
  }
  return group;
}

type SceneApi = { update: (state: MagnetismState, readout: MagnetismReadout) => void; dispose: () => void };

function setupScene(host: HTMLDivElement): SceneApi {
  const viewport = createViewport({ host, fov: 42, position: [4.5, -4.2, 1.25] });
  const { scene } = viewport;

  const gridSize = 4.6;
  const grid = new THREE.Group();
  for (let i = -gridSize / 2; i <= gridSize / 2 + 0.01; i += 0.5) {
    const opacity = Math.abs(i) < 0.01 ? 0.55 : 0.16;
    grid.add(makeLine([new THREE.Vector3(i, -gridSize / 2, 0), new THREE.Vector3(i, gridSize / 2, 0)], 0x2c5a76, opacity));
    grid.add(makeLine([new THREE.Vector3(-gridSize / 2, i, 0), new THREE.Vector3(gridSize / 2, i, 0)], 0x2c5a76, opacity));
  }
  scene.add(grid);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(gridSize, gridSize), new THREE.MeshBasicMaterial({ color: 0x0d2b41, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  plane.renderOrder = -1;
  scene.add(plane);

  const zLabel = textSprite("z（出紙面）", "#9fd3e8", 0.13);
  zLabel.position.set(0, 0, 1.55);
  scene.add(zLabel);
  scene.add(makeLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.4)], 0x6fa8c0, 0.5));

  const dynamic = new THREE.Group();
  scene.add(dynamic);

  const stopLoop = createRenderLoop(() => viewport.tick());

  const update = ({ wires, point }: MagnetismState, readout: MagnetismReadout) => {
    clearGroup(dynamic);
    for (const wire of wires) {
      const info = WIRE_COLORS[wire.id] ?? { hex: 0xffffff, css: "#ffffff" };
      const { point: base, direction } = wireGeometry(wire);
      const start = new THREE.Vector3(base.x - direction.x * HALF_LENGTH, base.y - direction.y * HALF_LENGTH, base.z - direction.z * HALF_LENGTH);
      const end = new THREE.Vector3(base.x + direction.x * HALF_LENGTH, base.y + direction.y * HALF_LENGTH, base.z + direction.z * HALF_LENGTH);
      const opacity = wire.active ? 0.95 : 0.28;
      const line = wire.active
        ? makeLine([start, end], info.hex, opacity)
        : new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([start, end]),
            new THREE.LineDashedMaterial({ color: 0x5b6b76, transparent: true, opacity, dashSize: 0.08, gapSize: 0.06 }),
          );
      if (!wire.active) line.computeLineDistances();
      dynamic.add(line);
      if (wire.active) {
        dynamic.add(arrowGroup(base, direction, HALF_LENGTH * 0.62, info.hex, 1, 0.1));
        dynamic.add(fieldRing(wire, info.hex, 0.38));
      }
      const label = textSprite(`${wire.label}${wire.active ? "" : "（已剪斷）"}`, info.css, 0.15);
      label.position.set(end.x + direction.x * 0.28, end.y + direction.y * 0.28, end.z + direction.z * 0.28 + 0.05);
      dynamic.add(label);
    }

    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf4f1e8 }));
    marker.position.set(point.x, point.y, point.z);
    dynamic.add(marker);
    const oLabel = textSprite("O", "#f4f1e8", 0.14);
    oLabel.position.set(point.x + 0.1, point.y + 0.1, point.z + 0.14);
    dynamic.add(oLabel);

    if (readout.defined && readout.sign !== "none") {
      const zDir = readout.sign === "out" ? vec(0, 0, 1) : vec(0, 0, -1);
      dynamic.add(arrowGroup(point, zDir, arrowLength(readout.baselineMicroTesla), 0xffd166, 1, 0.14, 0.03));
    }

    viewport.render();
  };

  return {
    update,
    dispose: () => {
      stopLoop();
      clearGroup(dynamic);
      viewport.dispose();
    },
  };
}

function toSvg(x: number, y: number): [number, number] {
  return [x * SVG_SCALE, -y * SVG_SCALE];
}

function DiagramView({ wires, point, readout }: { wires: Wire[]; point: Vec3; readout: MagnetismReadout }) {
  const { defined: fieldDefined, sign, baselineMicroTesla: microTesla } = readout;
  const [ox, oy] = toSvg(point.x, point.y);
  const resultRadius = Math.min(26, Math.max(9, microTesla * 1.4));

  return (
    <svg viewBox={`${-SVG_HALF} ${-SVG_HALF} ${SVG_HALF * 2} ${SVG_HALF * 2}`} width="100%" height="100%" role="img" aria-label="磁場二維示意圖">
      {wires.map((wire) => {
        const info = WIRE_COLORS[wire.id] ?? { hex: 0xffffff, css: "#ffffff" };
        const { point: base, direction } = wireGeometry(wire);
        const start = { x: base.x - direction.x * HALF_LENGTH, y: base.y - direction.y * HALF_LENGTH };
        const end = { x: base.x + direction.x * HALF_LENGTH, y: base.y + direction.y * HALF_LENGTH };
        const [sx, sy] = toSvg(start.x, start.y);
        const [ex, ey] = toSvg(end.x, end.y);
        const headBack = { x: end.x - direction.x * 0.22, y: end.y - direction.y * 0.22 };
        const perp = wire.orientation === "vertical" ? { x: 0.08, y: 0 } : { x: 0, y: 0.08 };
        const [hbx, hby] = toSvg(headBack.x + perp.x, headBack.y + perp.y);
        const [hbx2, hby2] = toSvg(headBack.x - perp.x, headBack.y - perp.y);
        const [labelX, labelY] = toSvg(end.x + direction.x * 0.32, end.y + direction.y * 0.32);
        return (
          <g key={wire.id} opacity={wire.active ? 1 : 0.35}>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={info.css} strokeWidth={3} strokeDasharray={wire.active ? undefined : "6 5"} strokeLinecap="round" />
            {wire.active && <polygon points={`${ex},${ey} ${hbx},${hby} ${hbx2},${hby2}`} fill={info.css} />}
            <text x={labelX} y={labelY} fill={info.css} fontSize={15} fontWeight={700} textAnchor="middle">{wire.label}</text>
          </g>
        );
      })}

      {fieldDefined && sign !== "none" && (
        <g>
          <circle cx={ox} cy={oy} r={resultRadius} fill="none" stroke="#ffd166" strokeWidth={2.5} />
          {sign === "out" ? (
            <circle cx={ox} cy={oy} r={Math.max(2.5, resultRadius * 0.32)} fill="#ffd166" />
          ) : (
            <>
              <line x1={ox - resultRadius * 0.6} y1={oy - resultRadius * 0.6} x2={ox + resultRadius * 0.6} y2={oy + resultRadius * 0.6} stroke="#ffd166" strokeWidth={2.5} />
              <line x1={ox - resultRadius * 0.6} y1={oy + resultRadius * 0.6} x2={ox + resultRadius * 0.6} y2={oy - resultRadius * 0.6} stroke="#ffd166" strokeWidth={2.5} />
            </>
          )}
        </g>
      )}
      <circle cx={ox} cy={oy} r={3.5} fill="#f4f1e8" />
      <text x={ox + 10} y={oy - 10} fill="#f4f1e8" fontSize={14} fontWeight={700}>O</text>
      {!fieldDefined && <text x={0} y={SVG_HALF - 18} fill="#ffd166" fontSize={13} fontWeight={700} textAnchor="middle">O 點位於導線上：理想模型不適用</text>}
    </svg>
  );
}

export default function MagneticFieldLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const [{ wires, point }, setState] = useState<MagnetismState>(initialMagnetismState);

  const readout = useMemo(() => deriveMagnetismModel({ wires, point }), [wires, point]);

  useEffect(() => {
    if (!hostRef.current) return;
    sceneRef.current = setupScene(hostRef.current);
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(() => sceneRef.current?.update({ wires, point }, readout), [wires, point, readout]);

  const updateWire = useCallback((id: string, patch: Partial<Wire>) => {
    setState((current) => ({
      ...current,
      wires: current.wires.map((wire) => (wire.id === id ? { ...wire, ...patch } : wire)),
    }));
  }, []);

  const reset = useCallback(() => setState(initialMagnetismState()), []);

  const { defined: fieldDefined, magnitude, sign, contributions, cutComparison, baselineMicroTesla, strongestCut, activeCount } = readout;

  return (
    <main className="lab-shell">
      <div className="topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow">Model 02</div>
          <h1 style={{ margin: 0, fontFamily: "Georgia,'Noto Serif TC',serif", fontWeight: 500, fontSize: 22 }}>
            <span className="live-dot" />
            多導線磁場疊加
          </h1>
        </div>
        <div className="header-actions">
          <Link className="model-index-link" href="/">模型目錄</Link>
          <button onClick={reset}><RotateCcw size={14} /> 重設為範例題</button>
        </div>
      </div>

      <div className="stage-grid">
        <section className="viewport-card global-card">
          <div className="card-label">
            <span>3D</span>
            <div><strong>空間視角</strong><small>拖曳旋轉，觀察磁場如何垂直於導線環繞</small></div>
          </div>
          <div className="canvas-host" ref={hostRef} />
          <div className="legend">
            {wires.map((wire) => (
              <span key={wire.id}><i style={{ background: WIRE_COLORS[wire.id]?.css }} />{wire.label}</span>
            ))}
            <span><i className="sun" style={{ background: "#ffd166" }} />O 點合成磁場</span>
          </div>
        </section>

        <div className="right-column">
          <section className="viewport-card local-card">
            <div className="card-label">
              <span>2D</span>
              <div><strong>俯視示意圖</strong><small>對照課本 ⊙／⊗ 符號</small></div>
            </div>
            <div className="canvas-host"><DiagramView wires={wires} point={point} readout={readout} /></div>
          </section>

          <div className="metrics">
            <div>
              <span>O 點合成磁場</span>
              <strong>{fieldDefined ? formatField(magnitude) : "不適用"}</strong>
            </div>
            <div>
              <span>方向</span>
              <strong>{fieldDefined ? (sign === "out" ? "射出紙面 ⊙" : sign === "in" ? "射入紙面 ⊗" : "—") : "O 點在導線上"}</strong>
            </div>
            <div>
              <span>啟用導線數</span>
              <strong>{activeCount} / {wires.length}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="control-panel">
        <div className="control-panel-heading">
          <div><Sparkles size={14} /> 導線參數</div>
        </div>
        <div className="magnet-wire-grid">
          {wires.map((wire) => {
            const info = WIRE_COLORS[wire.id];
            const directionText = wire.orientation === "vertical" ? (wire.current >= 0 ? "↑ 向上" : "↓ 向下") : wire.current >= 0 ? "→ 向右" : "← 向左";
            return (
              <div className="magnet-wire-row" key={wire.id}>
                <div className="magnet-wire-title">
                  <i style={{ background: info?.css }} />
                  <strong>{wire.label}</strong>
                  <span>{wire.orientation === "vertical" ? "垂直導線" : "水平導線"}</span>
                </div>
                <label>
                  <span>位置偏移<b>{wire.offset.toFixed(1)} m</b></span>
                  <input type="range" min={-2.2} max={2.2} step={0.1} value={wire.offset} onChange={(event) => updateWire(wire.id, { offset: Number(event.target.value) })} />
                </label>
                <label>
                  <span>電流大小<b>{Math.abs(wire.current).toFixed(1)} A</b></span>
                  <input type="range" min={0.5} max={6} step={0.5} value={Math.abs(wire.current)} onChange={(event) => updateWire(wire.id, { current: Math.sign(wire.current || 1) * Number(event.target.value) })} />
                </label>
                <div className="magnet-wire-actions">
                  <button onClick={() => updateWire(wire.id, { current: -wire.current })}>{directionText}</button>
                  <button className={wire.active ? "" : "active"} onClick={() => updateWire(wire.id, { active: !wire.active })}>
                    <Scissors size={13} /> {wire.active ? "剪斷" : "接回"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="magnet-o-controls">
          <label>
            <span>O 點 x<b>{point.x.toFixed(2)} m</b></span>
            <input type="range" min={-2.2} max={2.2} step={0.05} value={point.x} onChange={(event) => setState((current) => ({ ...current, point: { ...current.point, x: Number(event.target.value) } }))} />
          </label>
          <label>
            <span>O 點 y<b>{point.y.toFixed(2)} m</b></span>
            <input type="range" min={-2.2} max={2.2} step={0.05} value={point.y} onChange={(event) => setState((current) => ({ ...current, point: { ...current.point, y: Number(event.target.value) } }))} />
          </label>
        </div>
      </div>

      <div className="control-panel">
        <div className="control-panel-heading">
          <div>各導線在 O 點的分量</div>
        </div>
        <div className="magnet-table">
          <div className="magnet-table-row magnet-table-head">
            <span>導線</span><span>距離</span><span>方向</span><span>大小</span>
          </div>
          {contributions.map(({ wire, component, distance, singular }) => (
            <div className="magnet-table-row" key={wire.id} style={{ opacity: wire.active ? 1 : 0.4 }}>
              <span><i style={{ background: WIRE_COLORS[wire.id]?.css }} />{wire.label}</span>
              <span>{distance.toFixed(2)} m</span>
              <span>{singular ? "不適用" : component.sign === "out" ? "⊙ 出" : component.sign === "in" ? "⊗ 入" : "—"}</span>
              <span>{singular ? "不適用" : formatField(component.magnitude)}</span>
            </div>
          ))}
          <div className="magnet-table-row magnet-table-total">
            <span>合成</span><span></span>
            <span>{fieldDefined ? (sign === "out" ? "⊙ 出" : sign === "in" ? "⊗ 入" : "—") : "不適用"}</span>
            <span>{fieldDefined ? formatField(magnitude) : "不適用"}</span>
          </div>
        </div>
      </div>

      <div className="control-panel">
        <div className="control-panel-heading">
          <div>剪斷比較：哪一根導線最能增強 O 點磁場？</div>
        </div>
        <div className="magnet-table">
          <div className="magnet-table-row magnet-table-head">
            <span>剪斷</span><span>剩餘方向</span><span>剩餘大小</span><span>相較目前</span>
          </div>
          {cutComparison.map(({ wire, magnitude: trialMicro, sign: trialSign }) => (
            <div className="magnet-table-row" key={wire.id}>
              <span><i style={{ background: WIRE_COLORS[wire.id]?.css }} />{wire.label}{strongestCut?.wire.id === wire.id && trialMicro > baselineMicroTesla ? " ▲" : ""}</span>
              <span>{trialSign === "out" ? "⊙ 出" : trialSign === "in" ? "⊗ 入" : "—"}</span>
              <span>{trialMicro.toFixed(3)} μT</span>
              <span>{fieldDefined ? (trialMicro > baselineMicroTesla ? "增強" : trialMicro < baselineMicroTesla ? "減弱" : "不變") : "—"}</span>
            </div>
          ))}
        </div>
        <p className="magnet-hint">{fieldDefined ? `目前（全部導線）：${formatField(magnitude)}。▲ 標記代表剪斷後 O 點磁場最強的一根導線。` : "O 點位於理想零半徑導線上；此處磁場無定義。請移動 O 點或導線後再比較。"}</p>
      </div>

      <div className="lab-footer">
        <span>AMPERE&apos;S LAW · Σ B = μ₀I / 2πr</span>
        <span>AstroLab</span>
      </div>
    </main>
  );
}
