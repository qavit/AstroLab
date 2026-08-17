"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { Compass, Eye, EyeOff, RotateCcw, ScanSearch } from "lucide-react";
import {
  GEOLOGY_BOUNDS,
  contourSegments,
  isLayerOutcrop,
  layerElevation,
  terrainElevation,
  type Segment2,
} from "@/lib/science/geology";
import { arrowGroup, clearGroup, textSprite } from "@/lib/render/primitives";
import { createRenderLoop, createViewport } from "@/lib/render/viewport";
import {
  deriveGeologyModel,
  initialGeologyState,
  type GeologyReadout,
  type GeologyState,
} from "@/models/geology";

const SURFACE_COLOR = new THREE.Color(0xd9d2be);
const LAYER_COLOR = new THREE.Color(0x37434b);
const WALL_COLOR = new THREE.Color(0xb9b09a);
const BASE_Z = -1.08;
const CONTOUR_LEVELS = [-0.4, -0.15, 0.1, 0.35, 0.6, 0.85, 1.1, 1.35];

function terrainMesh(state: GeologyState) {
  const columns = 72;
  const rows = 60;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const { xMin, xMax, yMin, yMax } = GEOLOGY_BOUNDS;
  for (let row = 0; row <= rows; row += 1) {
    const y = yMin + (row / rows) * (yMax - yMin);
    for (let column = 0; column <= columns; column += 1) {
      const x = xMin + (column / columns) * (xMax - xMin);
      const z = terrainElevation(x, y, state);
      positions.push(x, y, z);
      const color = isLayerOutcrop(x, y, state, state) ? LAYER_COLOR : SURFACE_COLOR;
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
}

function wallMesh(state: GeologyState, side: "east" | "west" | "north" | "south") {
  const alongSteps = 64;
  const verticalSteps = 28;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const { xMin, xMax, yMin, yMax } = GEOLOGY_BOUNDS;
  for (let along = 0; along <= alongSteps; along += 1) {
    const fraction = along / alongSteps;
    const x = side === "east" ? xMax : side === "west" ? xMin : xMin + fraction * (xMax - xMin);
    const y = side === "north" ? yMax : side === "south" ? yMin : yMin + fraction * (yMax - yMin);
    const top = terrainElevation(x, y, state);
    for (let vertical = 0; vertical <= verticalSteps; vertical += 1) {
      const z = BASE_Z + (vertical / verticalSteps) * (top - BASE_Z);
      positions.push(x, y, z);
      const onLayer = Math.abs(z - layerElevation(x, y, state)) <= state.layerThickness / 2;
      const shade = onLayer ? LAYER_COLOR : WALL_COLOR;
      colors.push(shade.r, shade.g, shade.b);
    }
  }
  const stride = verticalSteps + 1;
  for (let along = 0; along < alongSteps; along += 1) {
    for (let vertical = 0; vertical < verticalSteps; vertical += 1) {
      const a = along * stride + vertical;
      const b = a + stride;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function contourLines3D(state: GeologyState) {
  const points: number[] = [];
  for (const level of CONTOUR_LEVELS) {
    for (const segment of contourSegments(level, (x, y) => terrainElevation(x, y, state))) {
      points.push(segment.start.x, segment.start.y, level + 0.012);
      points.push(segment.end.x, segment.end.y, level + 0.012);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineDashedMaterial({ color: 0x775f48, transparent: true, opacity: 0.62, dashSize: 0.06, gapSize: 0.04 }),
  );
}

function teachingPlane(state: GeologyState) {
  const { xMin, xMax, yMin, yMax } = GEOLOGY_BOUNDS;
  const points = [
    [xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax],
  ].map(([x, y]) => new THREE.Vector3(x, y, layerElevation(x, y, state)));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x33414a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
}

type SceneApi = { update: (state: GeologyState) => void; dispose: () => void };

function setupScene(host: HTMLDivElement): SceneApi {
  const viewport = createViewport({ host, fov: 38, position: [5.2, -6.2, 4.35], target: [0, 0, 0.1], near: 0.01, far: 40 });
  viewport.controls.minDistance = 4;
  viewport.controls.maxDistance = 11;
  const dynamic = new THREE.Group();
  viewport.scene.add(dynamic);
  const stopLoop = createRenderLoop(() => viewport.tick());

  const update = (state: GeologyState) => {
    clearGroup(dynamic);
    dynamic.add(terrainMesh(state));
    dynamic.add(wallMesh(state, "east"), wallMesh(state, "south"), wallMesh(state, "west"), wallMesh(state, "north"));
    const bottom = new THREE.Mesh(
      new THREE.PlaneGeometry(GEOLOGY_BOUNDS.xMax - GEOLOGY_BOUNDS.xMin, GEOLOGY_BOUNDS.yMax - GEOLOGY_BOUNDS.yMin),
      new THREE.MeshBasicMaterial({ color: 0x8f897a, side: THREE.DoubleSide }),
    );
    bottom.position.z = BASE_Z;
    dynamic.add(bottom);
    if (state.showContours) {
      const contours = contourLines3D(state);
      contours.computeLineDistances();
      dynamic.add(contours);
    }
    if (state.showLayerPlane) dynamic.add(teachingPlane(state));
    if (state.showDipArrow) {
      const azimuth = state.dipDirection * Math.PI / 180;
      const horizontal = new THREE.Vector3(Math.sin(azimuth), Math.cos(azimuth), -Math.tan(state.dipAngle * Math.PI / 180)).normalize();
      const center = new THREE.Vector3(0, 0.1, layerElevation(0, 0.1, state) + 0.04);
      dynamic.add(arrowGroup(center, horizontal, 0.9, 0xe66d62, 1, 0.13, 0.025));
      const label = textSprite("傾向", "#f08b7f", 0.14);
      label.position.copy(center).addScaledVector(horizontal, 1.08);
      dynamic.add(label);
    }
    const north = textSprite("上游／北", "#e9d59b", 0.14);
    north.position.set(0, GEOLOGY_BOUNDS.yMax + 0.3, terrainElevation(0, GEOLOGY_BOUNDS.yMax, state) + 0.25);
    dynamic.add(north);
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

function drawMap(canvas: HTMLCanvasElement, state: GeologyState, readout: GeologyReadout) {
  const width = 900;
  const height = 650;
  const margin = 52;
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.width = width * 2;
  canvas.height = height * 2;
  context.scale(2, 2);
  const { xMin, xMax, yMin, yMax } = GEOLOGY_BOUNDS;
  const mapX = (x: number) => margin + ((x - xMin) / (xMax - xMin)) * (width - margin * 2);
  const mapY = (y: number) => margin + ((yMax - y) / (yMax - yMin)) * (height - margin * 2);
  context.fillStyle = "#f1ead8";
  context.fillRect(0, 0, width, height);

  const columns = 128;
  const rows = 108;
  const dx = (xMax - xMin) / columns;
  const dy = (yMax - yMin) / rows;
  context.fillStyle = "#3b454b";
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = xMin + (column + 0.5) * dx;
      const y = yMin + (row + 0.5) * dy;
      if (!isLayerOutcrop(x, y, state, state)) continue;
      context.fillRect(mapX(x - dx / 2) - 0.5, mapY(y + dy / 2) - 0.5, mapX(x + dx / 2) - mapX(x - dx / 2) + 1, mapY(y - dy / 2) - mapY(y + dy / 2) + 1);
    }
  }

  if (state.showContours) {
    context.setLineDash([7, 6]);
    context.lineWidth = 1.35;
    context.strokeStyle = "rgba(100,84,68,.72)";
    for (const level of CONTOUR_LEVELS) {
      const segments = contourSegments(level, (x, y) => terrainElevation(x, y, state));
      drawSegments(context, segments, mapX, mapY);
    }
    context.setLineDash([]);
  }

  context.strokeStyle = "rgba(57,126,148,.8)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(mapX(0), mapY(yMin));
  context.quadraticCurveTo(mapX(-0.09), mapY(0), mapX(0), mapY(yMax));
  context.stroke();
  context.fillStyle = "#397e94";
  context.font = "600 17px 'PingFang TC',sans-serif";
  context.textAlign = "left";
  context.fillText("河谷", mapX(0) + 10, mapY(0.2));

  context.strokeStyle = "#c25750";
  context.fillStyle = "#c25750";
  context.lineWidth = 3;
  const arrowX = width - 76;
  context.beginPath();
  context.moveTo(arrowX, 112);
  context.lineTo(arrowX, 62);
  context.stroke();
  context.beginPath();
  context.moveTo(arrowX, 62);
  context.lineTo(arrowX - 8, 76);
  context.lineTo(arrowX + 8, 76);
  context.closePath();
  context.fill();
  context.font = "700 18px ui-monospace,monospace";
  context.textAlign = "center";
  context.fillText("N", arrowX, 48);
  context.font = "600 14px 'PingFang TC',sans-serif";
  context.fillText("上游", arrowX, 134);

  context.strokeStyle = "#122d3e";
  context.lineWidth = 2;
  context.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
  context.fillStyle = "#17384c";
  context.font = "700 15px 'PingFang TC',sans-serif";
  context.textAlign = "left";
  context.fillText(`走向：${readout.strikeLabel}`, 68, height - 20);
  context.textAlign = "right";
  context.fillText(`傾向：${readout.dipDirectionLabel}　傾角：${state.dipAngle.toFixed(0)}°`, width - 68, height - 20);
}

function drawSegments(
  context: CanvasRenderingContext2D,
  segments: Segment2[],
  mapX: (value: number) => number,
  mapY: (value: number) => number,
) {
  context.beginPath();
  for (const segment of segments) {
    context.moveTo(mapX(segment.start.x), mapY(segment.start.y));
    context.lineTo(mapX(segment.end.x), mapY(segment.end.y));
  }
  context.stroke();
}

function TopographicMap({ state, readout }: { state: GeologyState; readout: GeologyReadout }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMap(ref.current, state, readout);
  }, [state, readout]);
  return <canvas ref={ref} className="geology-map" role="img" aria-label="岩層露頭與河谷等高線俯視圖" />;
}

export default function ValleyBeddingLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const [state, setState] = useState<GeologyState>(initialGeologyState);
  const [showAnswer, setShowAnswer] = useState(false);
  const readout = useMemo(() => deriveGeologyModel(state), [state]);

  useEffect(() => {
    if (!hostRef.current) return;
    sceneRef.current = setupScene(hostRef.current);
    return () => sceneRef.current?.dispose();
  }, []);
  useEffect(() => sceneRef.current?.update(state), [state]);

  const patchState = useCallback((patch: Partial<GeologyState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);
  const reset = useCallback(() => {
    setState(initialGeologyState());
    setShowAnswer(false);
  }, []);

  return (
    <main className="lab-shell geology-lab">
      <div className="topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow">Earth Science · Model 04</div>
          <h1><span className="live-dot" />岩層位態 × 河谷地形</h1>
        </div>
        <div className="header-actions">
          <Link className="model-index-link" href="/">模型目錄</Link>
          <button onClick={reset}><RotateCcw size={14} /> 題目預設</button>
        </div>
      </div>

      <div className="geology-stage-grid">
        <section className="viewport-card geology-map-card">
          <div className="card-label dark-label">
            <span>MAP</span>
            <div><strong>地質圖俯視</strong><small>深色為岩層露頭；虛線為等高線</small></div>
          </div>
          <div className="geology-map-wrap"><TopographicMap state={state} readout={readout} /></div>
          <div className="legend geology-legend">
            <span><i style={{ background: "#3b454b" }} />深色岩層露頭</span>
            <span><i style={{ borderTop: "2px dashed #876f59", background: "transparent" }} />等高線</span>
            <span><i style={{ background: "#397e94" }} />河谷軸</span>
          </div>
        </section>

        <section className="viewport-card geology-block-card">
          <div className="card-label">
            <span>3D</span>
            <div><strong>立體地質塊體</strong><small>拖曳旋轉，對照頂面露頭與側面岩層</small></div>
          </div>
          <div className="canvas-host" ref={hostRef} />
          <div className="geology-orientation-pill">走向 {readout.strikeLabel} · 傾向 {readout.dipDirectionLabel} · {state.dipAngle.toFixed(0)}°</div>
        </section>
      </div>

      <section className="geology-reasoning" aria-label="題目判讀步驟">
        <div><span>01</span><strong>先看地形</strong><p>等高線進入河谷時，V 尖端指向圖上方，所以圖上方是上游。</p></div>
        <div><span>02</span><strong>再看露頭 V</strong><p>深色露頭尖端指向下游，和等高線相反：岩層向下游傾，而且比谷底坡度更陡。</p></div>
        <div><span>03</span><strong>找同高程點</strong><p>同一岩層界線與相同等高線的交點連起來，是東西向的構造等高線，也就是走向。</p></div>
        <button className={showAnswer ? "active" : "primary-action"} onClick={() => setShowAnswer((value) => !value)}>
          <ScanSearch size={15} /> {showAnswer ? "隱藏答案" : "揭示答案"}
        </button>
      </section>

      {showAnswer && (
        <section className="geology-answer" aria-live="polite">
          <div><span>第 15 題</span><strong>{readout.answer15}</strong><p>岩層向南（下游）傾，右側剖面呈向上游升高的斜層。</p></div>
          <div><span>第 16 題</span><strong>{readout.answer16}</strong><p>傾向為南北方向時，走向與傾向垂直，因此為東西向。</p></div>
        </section>
      )}

      <section className="control-panel geology-controls">
        <div className="control-panel-heading"><div><Compass size={14} /> 改變條件，驗證 V 字法則</div></div>
        <div className="geology-control-grid">
          <div className="geology-control-block">
            <label><span>岩層傾向 <b>{state.dipDirection.toFixed(0)}° · {readout.dipDirectionLabel}</b></span><input type="range" min="0" max="359" step="1" value={state.dipDirection} onChange={(event) => patchState({ dipDirection: Number(event.target.value) })} /></label>
            <div className="preset-row">
              {[{ label: "北", value: 0 }, { label: "東", value: 90 }, { label: "南（題目）", value: 180 }, { label: "西", value: 270 }].map((preset) => <button key={preset.value} className={Math.abs(state.dipDirection - preset.value) < 1 ? "selected" : ""} onClick={() => patchState({ dipDirection: preset.value })}>{preset.label}</button>)}
            </div>
          </div>
          <div className="geology-control-block">
            <label><span>岩層傾角 <b>{state.dipAngle.toFixed(0)}°</b></span><input type="range" min="0" max="70" step="1" value={state.dipAngle} onChange={(event) => patchState({ dipAngle: Number(event.target.value) })} /></label>
            <small>目前岩層沿河谷方向的坡度：{Math.abs(readout.trace.layerGradient).toFixed(2)}</small>
          </div>
          <div className="geology-control-block">
            <label><span>谷底上游坡度 <b>{readout.valleySlopeAngle.toFixed(1)}°</b></span><input type="range" min="0.08" max="0.65" step="0.01" value={state.valleyGradient} onChange={(event) => patchState({ valleyGradient: Number(event.target.value) })} /></label>
            <small>改變谷底坡度，露頭 V 可能翻轉方向。</small>
          </div>
          <div className="geology-layer-buttons" aria-label="圖層顯示">
            {([
              ["showContours", "等高線"],
              ["showLayerPlane", "岩層面"],
              ["showDipArrow", "傾向箭頭"],
            ] as const).map(([key, label]) => (
              <button key={key} className={state[key] ? "active" : ""} onClick={() => patchState({ [key]: !state[key] })}>
                {state[key] ? <Eye size={13} /> : <EyeOff size={13} />} {label}
              </button>
            ))}
          </div>
        </div>
        <div className={`geology-live-rule ${readout.matchesQuestion ? "question-match" : ""}`}>
          <span>目前露頭判讀</span>
          <strong>{readout.trace.opens === "downstream" ? "V 尖端朝下游" : readout.trace.opens === "upstream" ? "V 尖端朝上游" : "岩層面近似平行谷底"}</strong>
          <p>{readout.trace.opens === "downstream" ? "岩層向下游傾，且沿谷方向比谷底更陡。" : readout.trace.opens === "upstream" ? "露頭與等高線同向；需再比較 V 的開合程度判斷傾向。" : "岩層與谷底坡度相近，露頭會被拉長。"}</p>
        </div>
      </section>

      <p className="wind-model-note">理想化假設：地形沿河谷方向等坡、橫向為拋物線谷地，岩層為厚度固定的平面；用來隔離並說明地質圖的 V 字法則。</p>
    </main>
  );
}
