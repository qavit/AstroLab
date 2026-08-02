"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { Eye, EyeOff, Pause, Play, RotateCcw, Wind } from "lucide-react";
import { surfaceWindAt, type PressureBand } from "@/lib/science/atmosphere";
import { arrowGroup, clearGroup, makeLine, textSprite } from "@/lib/render/primitives";
import { createRenderLoop, createViewport } from "@/lib/render/viewport";
import {
  ATMOSPHERE_PRESETS,
  PARTICLE_DENSITIES,
  deriveAtmosphereModel,
  initialAtmosphereState,
  type AtmosphereReadout,
  type AtmosphereState,
} from "@/models/atmosphere";

const WIND_COLORS = {
  hadley: { hex: 0x5ed8c3, css: "#5ed8c3" },
  ferrel: { hex: 0xf2c66d, css: "#f2c66d" },
  polar: { hex: 0x9eb8f2, css: "#9eb8f2" },
};
const PRESSURE_COLORS = { low: 0xef817b, high: 0x72aee6 };
const DEG = Math.PI / 180;

function globePoint(latitude: number, longitude: number, radius = 1) {
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lon),
    radius * cosLat * Math.sin(lon),
    radius * Math.sin(lat),
  );
}

function latitudeCircle(latitude: number, radius = 1.01, segments = 144) {
  return Array.from({ length: segments + 1 }, (_, index) =>
    globePoint(latitude, (index / segments) * 360, radius),
  );
}

function longitudeLine(longitude: number, radius = 1.01, segments = 90) {
  return Array.from({ length: segments + 1 }, (_, index) =>
    globePoint(-90 + (index / segments) * 180, longitude, radius),
  );
}

function tangentDirection(latitude: number, longitude: number, east: number, north: number) {
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  const eastBasis = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0);
  const northBasis = new THREE.Vector3(
    -Math.sin(lat) * Math.cos(lon),
    -Math.sin(lat) * Math.sin(lon),
    Math.cos(lat),
  );
  return eastBasis.multiplyScalar(east).addScaledVector(northBasis, north).normalize();
}

type Tracer = {
  latitude: number;
  longitude: number;
  sourceLatitude: number;
  targetLatitude: number;
  speedJitter: number;
};
type SceneApi = { update: (state: AtmosphereState, readout: AtmosphereReadout) => void; dispose: () => void };

function pseudoRandom(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function particleBelts(readout: AtmosphereReadout) {
  const b = readout.boundaries;
  return [
    { source: -86, target: b.southSubpolar },
    { source: b.southSubtropical, target: b.southSubpolar },
    { source: b.southSubtropical, target: b.itcz },
    { source: b.northSubtropical, target: b.itcz },
    { source: b.northSubtropical, target: b.northSubpolar },
    { source: 86, target: b.northSubpolar },
  ];
}

function writeSpherePoint(array: Float32Array, offset: number, latitude: number, longitude: number, radius: number) {
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  const cosLat = Math.cos(lat);
  array[offset] = radius * cosLat * Math.cos(lon);
  array[offset + 1] = radius * cosLat * Math.sin(lon);
  array[offset + 2] = radius * Math.sin(lat);
}

function setupWindScene(host: HTMLDivElement): SceneApi {
  const viewport = createViewport({ host, fov: 36, position: [3.25, -3.8, 2.15], near: 0.01, far: 30 });
  viewport.controls.minDistance = 2.1;
  viewport.controls.maxDistance = 7;
  const { scene } = viewport;

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 72, 48),
    new THREE.MeshBasicMaterial({ color: 0x153e59, transparent: true, opacity: 0.96 }),
  );
  scene.add(globe);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.075, 56, 36),
    new THREE.MeshBasicMaterial({ color: 0x79cfe0, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false }),
  );
  scene.add(shell);

  const grid = new THREE.Group();
  for (let latitude = -75; latitude <= 75; latitude += 15) {
    const equator = latitude === 0;
    grid.add(makeLine(latitudeCircle(latitude), equator ? 0xd86c6c : 0x75a1b8, equator ? 0.72 : 0.2));
  }
  for (let longitude = 0; longitude < 360; longitude += 15) {
    grid.add(makeLine(longitudeLine(longitude), 0x75a1b8, longitude % 45 === 0 ? 0.24 : 0.12));
  }
  scene.add(grid);

  const axis = makeLine([new THREE.Vector3(0, 0, -1.38), new THREE.Vector3(0, 0, 1.46)], 0xc7d8e0, 0.52);
  scene.add(axis);
  const northLabel = textSprite("北極", "#dce8ed", 0.13);
  northLabel.position.set(0, 0, 1.58);
  scene.add(northLabel);

  const dynamic = new THREE.Group();
  scene.add(dynamic);
  let tracers: Tracer[] = [];
  let pointsGeometry: THREE.BufferGeometry | null = null;
  let trailsGeometry: THREE.BufferGeometry | null = null;
  let particleState: AtmosphereState | null = null;
  let playing = true;
  let animationSpeed = 1;
  let last = performance.now();

  const refreshParticleBuffers = () => {
    if (!pointsGeometry || !trailsGeometry || !particleState) return;
    const pointPositions = pointsGeometry.getAttribute("position") as THREE.BufferAttribute;
    const trailPositions = trailsGeometry.getAttribute("position") as THREE.BufferAttribute;
    const points = pointPositions.array as Float32Array;
    const trails = trailPositions.array as Float32Array;
    for (let index = 0; index < tracers.length; index += 1) {
      const tracer = tracers[index];
      const pointOffset = index * 3;
      const trailOffset = index * 6;
      const wind = surfaceWindAt(tracer.latitude, particleState);
      const trailScale = 0.012 + wind.speed * 0.0016;
      const cosLatitude = Math.max(0.2, Math.cos(tracer.latitude * DEG));
      const tailLatitude = tracer.latitude - wind.north * trailScale;
      const tailLongitude = tracer.longitude - (wind.east * trailScale) / cosLatitude;
      writeSpherePoint(points, pointOffset, tracer.latitude, tracer.longitude, 1.071);
      writeSpherePoint(trails, trailOffset, tailLatitude, tailLongitude, 1.069);
      writeSpherePoint(trails, trailOffset + 3, tracer.latitude, tracer.longitude, 1.071);
    }
    pointPositions.needsUpdate = true;
    trailPositions.needsUpdate = true;
  };

  const stopLoop = createRenderLoop(() => {
    const now = performance.now();
    const seconds = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing && particleState) {
      for (const tracer of tracers) {
        const wind = surfaceWindAt(tracer.latitude, particleState);
        const scale = seconds * animationSpeed * tracer.speedJitter;
        const cosLatitude = Math.max(0.2, Math.cos(tracer.latitude * DEG));
        tracer.latitude += wind.north * 0.075 * scale;
        tracer.longitude += (wind.east * 0.09 * scale) / cosLatitude;
        const northward = tracer.targetLatitude > tracer.sourceLatitude;
        if ((northward && tracer.latitude >= tracer.targetLatitude) || (!northward && tracer.latitude <= tracer.targetLatitude)) {
          tracer.latitude = tracer.sourceLatitude;
          tracer.longitude = (tracer.longitude + 137.5) % 360;
        }
      }
      refreshParticleBuffers();
    }
    viewport.tick();
  });

  const update = (state: AtmosphereState, readout: AtmosphereReadout) => {
    playing = state.playing;
    animationSpeed = Number.isFinite(state.animationSpeed) ? state.animationSpeed : 1;
    particleState = state;
    clearGroup(dynamic);
    tracers = [];
    pointsGeometry = null;
    trailsGeometry = null;

    if (state.showPressureBelts) {
      for (const band of readout.bands) {
        dynamic.add(makeLine(latitudeCircle(band.latitude, 1.025), PRESSURE_COLORS[band.kind], band.latitude === readout.thermalEquator ? 0.92 : 0.66));
      }
    }

    const sampleLatitudes = [-78, -68, -52, -42, -24, -13, 13, 24, 42, 52, 68, 78]
      .map((latitude) => Math.max(-84, Math.min(84, latitude + readout.thermalEquator * 0.45)));
    for (const latitude of sampleLatitudes) {
      const wind = surfaceWindAt(latitude, state);
      const style = WIND_COLORS[wind.cell];
      for (let longitude = 0; longitude < 360; longitude += 30) {
        if (state.showWindArrows) {
          const start = globePoint(latitude, longitude, 1.045);
          const direction = tangentDirection(latitude, longitude, wind.east, wind.north);
          dynamic.add(arrowGroup(start, direction, 0.135 + wind.speed * 0.004, style.hex, 0.88, 0.045, 0.007));
        }
      }
    }

    if (state.showTracers) {
      const densityKey = state.particleDensity ?? "standard";
      const count = PARTICLE_DENSITIES[densityKey].count;
      const belts = particleBelts(readout);
      const positions = new Float32Array(count * 3);
      const pointColors = new Float32Array(count * 3);
      const trailPositions = new Float32Array(count * 6);
      const trailColors = new Float32Array(count * 6);
      for (let index = 0; index < count; index += 1) {
        const belt = belts[index % belts.length];
        const progress = pseudoRandom(index, 1);
        const latitude = belt.source + (belt.target - belt.source) * progress;
        const longitude = pseudoRandom(index, 2) * 360;
        const wind = surfaceWindAt(latitude, state);
        const color = new THREE.Color(WIND_COLORS[wind.cell].hex);
        tracers.push({ latitude, longitude, sourceLatitude: belt.source, targetLatitude: belt.target, speedJitter: 0.72 + pseudoRandom(index, 3) * 0.56 });
        pointColors.set([color.r, color.g, color.b], index * 3);
        trailColors.set([color.r, color.g, color.b, color.r, color.g, color.b], index * 6);
      }
      pointsGeometry = new THREE.BufferGeometry();
      pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      pointsGeometry.setAttribute("color", new THREE.BufferAttribute(pointColors, 3));
      trailsGeometry = new THREE.BufferGeometry();
      trailsGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
      trailsGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
      const pointSize = densityKey === "light" ? 0.024 : densityKey === "standard" ? 0.019 : 0.014;
      dynamic.add(new THREE.LineSegments(trailsGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.58, depthWrite: false })));
      dynamic.add(new THREE.Points(pointsGeometry, new THREE.PointsMaterial({ size: pointSize, vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false, sizeAttenuation: true })));
      refreshParticleBuffers();
    }

    const itczLabel = textSprite(`ITCZ ${readout.thermalEquator >= 0 ? "+" : ""}${readout.thermalEquator.toFixed(1)}°`, "#ffaaa0", 0.12);
    itczLabel.position.copy(globePoint(readout.thermalEquator, -64, 1.22));
    dynamic.add(itczLabel);
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

const crossX = (latitude: number) => 45 + ((latitude + 90) / 180) * 810;
const crossY = (height: number) => 310 - (height / 16) * 244;

function cellPath(startLatitude: number, endLatitude: number, topHeight: number, clockwise: boolean) {
  const x1 = crossX(startLatitude);
  const x2 = crossX(endLatitude);
  const y0 = crossY(0.7);
  const yt = crossY(topHeight);
  const middle = (x1 + x2) / 2;
  const path = `M ${x1} ${y0} C ${x1} ${yt}, ${middle - 28} ${yt}, ${middle} ${yt} C ${middle + 28} ${yt}, ${x2} ${yt}, ${x2} ${y0}`;
  return clockwise ? path : `M ${x2} ${y0} C ${x2} ${yt}, ${middle + 28} ${yt}, ${middle} ${yt} C ${middle - 28} ${yt}, ${x1} ${yt}, ${x1} ${y0}`;
}

function CrossSection({ readout }: { readout: AtmosphereReadout }) {
  const b = readout.boundaries;
  const cells = [
    { start: b.southPole, end: b.southSubpolar, kind: "polar" as const, name: "Polar", clockwise: false, height: 7 },
    { start: b.southSubpolar, end: b.southSubtropical, kind: "ferrel" as const, name: "Ferrel", clockwise: true, height: 10 },
    { start: b.southSubtropical, end: b.itcz, kind: "hadley" as const, name: "Hadley", clockwise: false, height: 15 },
    { start: b.itcz, end: b.northSubtropical, kind: "hadley" as const, name: "Hadley", clockwise: true, height: 15 },
    { start: b.northSubtropical, end: b.northSubpolar, kind: "ferrel" as const, name: "Ferrel", clockwise: false, height: 10 },
    { start: b.northSubpolar, end: b.northPole, kind: "polar" as const, name: "Polar", clockwise: true, height: 7 },
  ];
  return (
    <svg className="wind-cross-section" viewBox="0 0 900 350" role="img" aria-label="三圈環流緯度高度剖面">
      <defs>
        {Object.entries(WIND_COLORS).map(([key, color]) => (
          <marker key={key} id={`arrow-${key}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={color.css} />
          </marker>
        ))}
      </defs>
      {[0, 5, 10, 15].map((height) => (
        <g key={height}>
          <line x1="45" y1={crossY(height)} x2="855" y2={crossY(height)} className="cross-grid" />
          <text x="12" y={crossY(height) + 4} className="cross-axis">{height} km</text>
        </g>
      ))}
      {[-90, -60, -30, 0, 30, 60, 90].map((latitude) => (
        <g key={latitude}>
          <line x1={crossX(latitude)} y1="55" x2={crossX(latitude)} y2="312" className="cross-grid cross-grid-v" />
          <text x={crossX(latitude)} y="334" className="cross-axis cross-lat">{Math.abs(latitude)}°{latitude < 0 ? "S" : latitude > 0 ? "N" : ""}</text>
        </g>
      ))}
      <path d="M45 312 Q450 298 855 312" className="earth-arc" />
      {cells.map((cell, index) => {
        const color = WIND_COLORS[cell.kind];
        return (
          <g key={`${cell.kind}-${index}`}>
            <path d={cellPath(cell.start, cell.end, cell.height, cell.clockwise)} fill="none" stroke={color.css} strokeWidth="3" opacity=".9" markerEnd={`url(#arrow-${cell.kind})`} />
            <text x={crossX((cell.start + cell.end) / 2)} y={crossY(cell.height) - 9} fill={color.css} className="cell-name">{cell.name}</text>
          </g>
        );
      })}
      {readout.bands.map((band, index) => (
        <PressureMarker band={band} key={`${band.label}-${index}`} />
      ))}
      <text x={crossX(readout.thermalEquator)} y="28" className="itcz-note">太陽直射帶牽引 ITCZ</text>
      <line x1={crossX(readout.thermalEquator)} y1="34" x2={crossX(readout.thermalEquator)} y2="294" className="itcz-line" />
    </svg>
  );
}

function PressureMarker({ band }: { band: PressureBand }) {
  const x = crossX(band.latitude);
  const isEdge = Math.abs(band.latitude) > 86;
  return (
    <g>
      <circle cx={x} cy="309" r="8" fill={band.kind === "low" ? "#ef817b" : "#72aee6"} />
      <text x={x} y="313" textAnchor="middle" className="pressure-letter">{band.kind === "low" ? "L" : "H"}</text>
      {!isEdge && <text x={x} y="292" textAnchor="middle" className="pressure-name">{band.label.replace("／ITCZ", "")}</text>}
    </g>
  );
}

export default function PlanetaryWindLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const [state, setState] = useState<AtmosphereState>(initialAtmosphereState);
  const readout = useMemo(() => deriveAtmosphereModel(state), [state]);
  const densityKey = state.particleDensity ?? "standard";
  const density = PARTICLE_DENSITIES[densityKey];
  const playbackSpeed = Number.isFinite(state.animationSpeed) ? state.animationSpeed : 1;

  useEffect(() => {
    if (!hostRef.current) return;
    sceneRef.current = setupWindScene(hostRef.current);
    return () => sceneRef.current?.dispose();
  }, []);
  useEffect(() => sceneRef.current?.update(state, readout), [state, readout]);

  const patchState = useCallback((patch: Partial<AtmosphereState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  return (
    <main className="lab-shell wind-lab">
      <div className="topbar">
        <div>
          <div className="eyebrow">AstroLab · Model 03</div>
          <h1><span className="live-dot" />全球行星風系</h1>
        </div>
        <div className="header-actions">
          <Link className="model-index-link" href="/">模型目錄</Link>
          <button onClick={() => setState(initialAtmosphereState())}><RotateCcw size={14} /> 重設</button>
        </div>
      </div>

      <div className="wind-stage-grid">
        <section className="viewport-card wind-globe-card">
          <div className="card-label">
            <span>3D</span>
            <div><strong>全球近地面風帶</strong><small>拖曳旋轉；流動粒子沿完整近地面風向移動</small></div>
          </div>
          <div className="canvas-host" ref={hostRef} />
          <div className="legend wind-legend">
            <span><i style={{ background: WIND_COLORS.hadley.css }} />信風／Hadley</span>
            <span><i style={{ background: WIND_COLORS.ferrel.css }} />西風／Ferrel</span>
            <span><i style={{ background: WIND_COLORS.polar.css }} />極地東風</span>
            <span><i style={{ background: "#ef817b" }} />低壓</span>
            <span><i style={{ background: "#72aee6" }} />高壓</span>
          </div>
        </section>

        <section className="viewport-card wind-section-card">
          <div className="card-label">
            <span>2D</span>
            <div><strong>緯度—高度環流剖面</strong><small>箭頭表示六個環流圈中的空氣運動</small></div>
          </div>
          <div className="wind-section-wrap"><CrossSection readout={readout} /></div>
        </section>
      </div>

      <div className="wind-metrics">
        <div><span>熱赤道／ITCZ</span><strong>{Math.abs(readout.thermalEquator).toFixed(1)}° {readout.thermalEquator >= 0 ? "N" : "S"}</strong></div>
        <div><span>15°N 近地面風</span><strong>{surfaceWindAt(15, state).name}</strong></div>
        <div><span>45°N 近地面風</span><strong>{surfaceWindAt(45, state).name}</strong></div>
        <div><span>代表風速</span><strong>{readout.maxSampleSpeed.toFixed(1)} m/s</strong></div>
        <div><span>動畫粒子</span><strong>{state.showTracers ? `${density.count.toLocaleString()} · ${playbackSpeed.toFixed(1)}×` : "已隱藏"}</strong></div>
      </div>

      <section className="control-panel wind-controls">
        <div className="control-panel-heading">
          <div><Wind size={14} /> 同步控制台</div>
          <button className={state.playing ? "active" : ""} onClick={() => patchState({ playing: !state.playing })} aria-label={state.playing ? "暫停風場動畫" : "播放風場動畫"}>
            {state.playing ? <Pause size={14} /> : <Play size={14} />} {state.playing ? "暫停" : "播放"}
          </button>
        </div>
        <div className="wind-control-grid">
          <div className="wind-control-block">
            <label><span>太陽赤緯 <b>{state.solarDeclination.toFixed(1)}°</b></span><input type="range" min="-23.44" max="23.44" step="0.2" value={state.solarDeclination} onChange={(event) => patchState({ solarDeclination: Number(event.target.value) })} /></label>
            <div className="preset-row">
              {Object.entries(ATMOSPHERE_PRESETS).map(([key, preset]) => <button key={key} className={Math.abs(state.solarDeclination - preset.solarDeclination) < 0.1 ? "selected" : ""} onClick={() => patchState({ solarDeclination: preset.solarDeclination })}>{preset.label}</button>)}
            </div>
          </div>
          <div className="wind-control-block">
            <label><span>行星自轉速率 <b>{state.rotationRate.toFixed(2)} × 地球</b></span><input type="range" min="0" max="2" step="0.05" value={state.rotationRate} onChange={(event) => patchState({ rotationRate: Number(event.target.value) })} /></label>
            <small>轉得越快，科氏偏轉與東西向風分量越強。</small>
          </div>
          <div className="wind-control-block">
            <label><span>近地面摩擦 <b>{Math.round(state.surfaceDrag * 100)}%</b></span><input type="range" min="0.08" max="0.9" step="0.02" value={state.surfaceDrag} onChange={(event) => patchState({ surfaceDrag: Number(event.target.value) })} /></label>
            <small>摩擦越強，風越直接穿越等壓帶、流向低壓。</small>
          </div>
          <div className="wind-control-block">
            <label><span>粒子密度 <b>{density.count.toLocaleString()} 個</b></span></label>
            <div className="particle-density-row">
              {Object.entries(PARTICLE_DENSITIES).map(([key, density]) => (
                <button key={key} className={densityKey === key ? "selected" : ""} onClick={() => patchState({ particleDensity: key as AtmosphereState["particleDensity"], showTracers: true })}>{density.label}</button>
              ))}
            </div>
          </div>
          <div className="wind-control-block">
            <label><span>動畫播放速度 <b>{playbackSpeed.toFixed(1)}×</b></span><input type="range" min="0.1" max="4" step="0.1" value={playbackSpeed} onChange={(event) => patchState({ animationSpeed: Number(event.target.value) })} /></label>
            <div className="preset-row animation-speed-row">
              {[0.25, 0.5, 1, 2, 4].map((speed) => <button key={speed} className={Math.abs(playbackSpeed - speed) < 0.01 ? "selected" : ""} onClick={() => patchState({ animationSpeed: speed })}>{speed}×</button>)}
            </div>
          </div>
          <div className="wind-layer-buttons" aria-label="圖層顯示">
            {([
              ["showWindArrows", "風向箭頭"],
              ["showPressureBelts", "氣壓帶"],
              ["showTracers", "流動粒子"],
            ] as const).map(([key, label]) => (
              <button key={key} className={state[key] ? "active" : ""} onClick={() => patchState({ [key]: !state[key] })}>
                {state[key] ? <Eye size={13} /> : <EyeOff size={13} />} {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="wind-model-note">理想化三圈環流：忽略海陸分布、地形、季風與瞬時天氣；用來建立緯向平均的全球環流概念。</p>
    </main>
  );
}
