"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RotateCcw, Scissors, Sparkles } from "lucide-react";
import {
  crossV,
  distanceToWire,
  examplePoint,
  exampleWires,
  fieldFromWire,
  formatField,
  hasWireSingularity,
  normalizeV,
  pageComponent,
  totalField,
  vec,
  wireGeometry,
  type Vec3,
  type Wire,
} from "@/lib/science/magnetism";

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

function textSprite(text: string, color = "#eaf3f7", scale = 0.17) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.font = "600 48px 'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif";
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }),
  );
  sprite.scale.set(scale * 4, scale, 1);
  return sprite;
}

function arrowGroup(from: Vec3, direction: Vec3, length: number, color: number, opacity = 1, headSize = 0.09, shaftRadius = 0.016) {
  const group = new THREE.Group();
  const dir = normalizeV(direction);
  const to = { x: from.x + dir.x * length, y: from.y + dir.y * length, z: from.z + dir.z * length };
  const shaftEnd = { x: from.x + dir.x * (length - headSize * 1.7), y: from.y + dir.y * (length - headSize * 1.7), z: from.z + dir.z * (length - headSize * 1.7) };
  const shaftLength = Math.hypot(shaftEnd.x - from.x, shaftEnd.y - from.y, shaftEnd.z - from.z);
  const shaftMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  if (shaftLength > 0.001) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 10), shaftMaterial);
    shaft.position.set((from.x + shaftEnd.x) / 2, (from.y + shaftEnd.y) / 2, (from.z + shaftEnd.z) / 2);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir.x, dir.y, dir.z));
    group.add(shaft);
  }
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(headSize * 0.55, headSize * 1.7, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
  );
  cone.position.set((shaftEnd.x + to.x) / 2, (shaftEnd.y + to.y) / 2, (shaftEnd.z + to.z) / 2);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir.x, dir.y, dir.z));
  group.add(cone);
  return group;
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
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints), new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacity * 0.6 })));
  for (let i = 0; i < ticks; i += 1) {
    const angle = (i / ticks) * Math.PI * 2;
    const radial = normalizeV({ x: uv.x * Math.cos(angle) + w.x * Math.sin(angle), y: uv.y * Math.cos(angle) + w.y * Math.sin(angle), z: uv.z * Math.cos(angle) + w.z * Math.sin(angle) });
    const at = { x: point.x + radial.x * radius, y: point.y + radial.y * radius, z: point.z + radial.z * radius };
    const tangent = crossV(direction, radial);
    group.add(arrowGroup(at, tangent, 0.16, color, opacity, 0.045, 0.009));
  }
  return group;
}

function clearGroup(group: THREE.Group) {
  for (const item of [...group.children]) {
    group.remove(item);
    item.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }
}

type SceneApi = { update: (wires: Wire[], point: Vec3) => void; dispose: () => void };

function setupScene(host: HTMLDivElement): SceneApi {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  camera.position.set(4.5, -4.2, 1.25);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  const gridSize = 4.6;
  const grid = new THREE.Group();
  for (let i = -gridSize / 2; i <= gridSize / 2 + 0.01; i += 0.5) {
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i, -gridSize / 2, 0), new THREE.Vector3(i, gridSize / 2, 0)]), new THREE.LineBasicMaterial({ color: 0x2c5a76, transparent: true, opacity: Math.abs(i) < 0.01 ? 0.55 : 0.16 })));
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-gridSize / 2, i, 0), new THREE.Vector3(gridSize / 2, i, 0)]), new THREE.LineBasicMaterial({ color: 0x2c5a76, transparent: true, opacity: Math.abs(i) < 0.01 ? 0.55 : 0.16 })));
  }
  scene.add(grid);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(gridSize, gridSize), new THREE.MeshBasicMaterial({ color: 0x0d2b41, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  plane.renderOrder = -1;
  scene.add(plane);

  const zLabel = textSprite("z（出紙面）", "#9fd3e8", 0.13);
  zLabel.position.set(0, 0, 1.55);
  scene.add(zLabel);
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.4)]), new THREE.LineBasicMaterial({ color: 0x6fa8c0, transparent: true, opacity: 0.5 })));

  const dynamic = new THREE.Group();
  scene.add(dynamic);

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  let frame = 0;
  const animate = () => {
    frame = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const update = (wires: Wire[], point: Vec3) => {
    clearGroup(dynamic);
    for (const wire of wires) {
      const info = WIRE_COLORS[wire.id] ?? { hex: 0xffffff, css: "#ffffff" };
      const { point: base, direction } = wireGeometry(wire);
      const start = { x: base.x - direction.x * HALF_LENGTH, y: base.y - direction.y * HALF_LENGTH, z: base.z - direction.z * HALF_LENGTH };
      const end = { x: base.x + direction.x * HALF_LENGTH, y: base.y + direction.y * HALF_LENGTH, z: base.z + direction.z * HALF_LENGTH };
      const opacity = wire.active ? 0.95 : 0.28;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)]),
        wire.active
          ? new THREE.LineBasicMaterial({ color: info.hex, transparent: true, opacity })
          : new THREE.LineDashedMaterial({ color: 0x5b6b76, transparent: true, opacity, dashSize: 0.08, gapSize: 0.06 }),
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

    const field = totalField(wires, point);
    const fieldDefined = !hasWireSingularity(wires, point);
    const { magnitude, sign } = pageComponent(field);
    if (fieldDefined && sign !== "none") {
      const microTesla = magnitude * 1e6;
      const zDir = sign === "out" ? vec(0, 0, 1) : vec(0, 0, -1);
      dynamic.add(arrowGroup(point, zDir, arrowLength(microTesla), 0xffd166, 1, 0.14, 0.03));
    }

    renderer.render(scene, camera);
  };

  return {
    update,
    dispose: () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      controls.dispose();
      clearGroup(dynamic);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    },
  };
}

function toSvg(x: number, y: number): [number, number] {
  return [x * SVG_SCALE, -y * SVG_SCALE];
}

function DiagramView({ wires, point }: { wires: Wire[]; point: Vec3 }) {
  const field = totalField(wires, point);
  const fieldDefined = !hasWireSingularity(wires, point);
  const { magnitude, sign } = pageComponent(field);
  const microTesla = magnitude * 1e6;
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

const defaultWires = exampleWires.map((wire) => ({ ...wire }));

export default function MagneticFieldLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const [wires, setWires] = useState<Wire[]>(defaultWires);
  const [point, setPoint] = useState<Vec3>({ ...examplePoint });

  useEffect(() => {
    if (!hostRef.current) return;
    sceneRef.current = setupScene(hostRef.current);
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(() => sceneRef.current?.update(wires, point), [wires, point]);

  const updateWire = useCallback((id: string, patch: Partial<Wire>) => {
    setWires((current) => current.map((wire) => (wire.id === id ? { ...wire, ...patch } : wire)));
  }, []);

  const reset = useCallback(() => {
    setWires(exampleWires.map((wire) => ({ ...wire })));
    setPoint({ ...examplePoint });
  }, []);

  const field = totalField(wires, point);
  const fieldDefined = !hasWireSingularity(wires, point);
  const { magnitude, sign } = pageComponent(field);

  const contributions = useMemo(
    () =>
      wires.map((wire) => {
        const contribution = fieldFromWire(wire, point);
        const component = pageComponent(contribution);
        const distance = distanceToWire(wire, point);
        return { wire, component, distance, singular: wire.active && distance < 1e-6 };
      }),
    [wires, point],
  );

  const cutComparison = useMemo(
    () =>
      wires
        .filter((wire) => wire.active)
        .map((wire) => {
          const trial = wires.map((candidate) => (candidate.id === wire.id ? { ...candidate, active: false } : candidate));
          const trialField = totalField(trial, point);
          const trialComponent = pageComponent(trialField);
          return { wire, magnitude: trialComponent.magnitude * 1e6, sign: trialComponent.sign };
        })
        .sort((a, b) => b.magnitude - a.magnitude),
    [wires, point],
  );

  const baselineMicroTesla = magnitude * 1e6;
  const strongestCut = fieldDefined ? cutComparison[0] : undefined;

  return (
    <main className="lab-shell">
      <div className="topbar">
        <div>
          <div className="eyebrow">AstroLab · Model 02</div>
          <h1 style={{ margin: 0, fontFamily: "Georgia,'Noto Serif TC',serif", fontWeight: 500, fontSize: 22 }}>
            <span className="live-dot" />
            多導線磁場疊加
          </h1>
        </div>
        <div className="header-actions">
          <Link className="toolbar-link" href="/">← 太陽模型</Link>
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
            <div className="canvas-host"><DiagramView wires={wires} point={point} /></div>
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
              <strong>{wires.filter((wire) => wire.active).length} / {wires.length}</strong>
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
            <input type="range" min={-2.2} max={2.2} step={0.05} value={point.x} onChange={(event) => setPoint((current) => ({ ...current, x: Number(event.target.value) }))} />
          </label>
          <label>
            <span>O 點 y<b>{point.y.toFixed(2)} m</b></span>
            <input type="range" min={-2.2} max={2.2} step={0.05} value={point.y} onChange={(event) => setPoint((current) => ({ ...current, y: Number(event.target.value) }))} />
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
