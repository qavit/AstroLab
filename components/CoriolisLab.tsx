"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { Compass, Eye, EyeOff, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { inertialPosition, type PlanarPoint } from "@/lib/science/coriolis";
import { arrowGroup, clearGroup, makeLine, textSprite } from "@/lib/render/primitives";
import { createRenderLoop, createViewport } from "@/lib/render/viewport";
import {
  CORIOLIS_PRESETS,
  deriveCoriolisModel,
  initialCoriolisState,
  type CoriolisReadout,
  type CoriolisState,
} from "@/models/coriolis";

const GHOST_COLOR = 0xf2c66d;
const TRACE_COLOR = 0x5ed8c3;
const DISC_COLOR = 0x173e59;
const GRID_COLOR = 0x4a7692;

function vec3(p: PlanarPoint, z = 0) {
  return new THREE.Vector3(p.x, p.y, z);
}

function discRimGeometry(radius: number, color: number, opacity: number) {
  const group = new THREE.Group();
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i += 1) {
    const angle = (i / 96) * Math.PI * 2;
    rim.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  group.add(makeLine(rim, color, opacity));
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    group.add(
      makeLine(
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)],
        color,
        opacity * 0.4,
      ),
    );
  }
  return group;
}

type SceneApi = { update: (state: CoriolisState, readout: CoriolisReadout) => void; dispose: () => void };

function setupCoriolisScene(host: HTMLDivElement): SceneApi {
  const viewport = createViewport({ host, fov: 38, position: [0, -5.6, 4], up: [0, 0, 1] });
  viewport.controls.minDistance = 2.6;
  viewport.controls.maxDistance = 11;
  const { scene } = viewport;

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  const discGroup = new THREE.Group();
  scene.add(discGroup);

  const backdrop = new THREE.Group();
  for (let i = -4; i <= 4; i += 1) {
    backdrop.add(makeLine([new THREE.Vector3(i, -4, -0.02), new THREE.Vector3(i, 4, -0.02)], 0x1c3f56, 0.1));
    backdrop.add(makeLine([new THREE.Vector3(-4, i, -0.02), new THREE.Vector3(4, i, -0.02)], 0x1c3f56, 0.1));
  }
  worldGroup.add(backdrop);
  const worldLabel = textSprite("慣性系（固定於外部）", "#c9dae2", 0.13);
  worldLabel.position.set(-3.1, 3.4, 0.05);
  worldGroup.add(worldLabel);

  const groundMesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshBasicMaterial({ color: DISC_COLOR, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  discGroup.add(groundMesh);
  const discStatic = new THREE.Group();
  discGroup.add(discStatic);
  const discLabel = textSprite("旋轉系（平台／地面）", "#dcae5f", 0.13);
  discGroup.add(discLabel);

  const ballMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xf4f1e8 }),
  );
  worldGroup.add(ballMarker);

  const dynamicWorld = new THREE.Group();
  worldGroup.add(dynamicWorld);
  const dynamicDisc = new THREE.Group();
  discGroup.add(dynamicDisc);

  let playing = true;
  let animationSpeed = 1;
  let origin: PlanarPoint = { x: 0, y: 0 };
  let velocity: PlanarPoint = { x: 0, y: 0 };
  let duration = 0;
  let visualOmega = 0;
  let flightElapsed = 0;
  let lastFrame = performance.now();

  const stopLoop = createRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (playing && duration > 0) {
      discGroup.rotation.z = (discGroup.rotation.z + visualOmega * dt * animationSpeed) % (Math.PI * 2);
      flightElapsed += dt * animationSpeed;
      if (flightElapsed > duration) flightElapsed -= duration;
      const position = inertialPosition(origin, velocity, flightElapsed);
      ballMarker.position.set(position.x, position.y, 0.04);
    }
    ballMarker.visible = duration > 0;
    viewport.tick();
  });

  const update = (state: CoriolisState, readout: CoriolisReadout) => {
    playing = state.playing;
    animationSpeed = Number.isFinite(state.animationSpeed) ? state.animationSpeed : 1;
    origin = readout.origin;
    velocity = readout.velocity;
    duration = readout.duration;
    visualOmega = readout.visualOmega;
    flightElapsed = 0;

    groundMesh.scale.setScalar(state.planeRadius);
    clearGroup(discStatic);
    discStatic.add(discRimGeometry(state.planeRadius, GRID_COLOR, 0.55));
    const compass: Array<[string, number, number]> = [
      ["北", 0, 1],
      ["東", 1, 0],
      ["南", 0, -1],
      ["西", -1, 0],
    ];
    for (const [label, x, y] of compass) {
      const sprite = textSprite(label, "#bcd4de", 0.13);
      sprite.position.set(x * state.planeRadius * 1.16, y * state.planeRadius * 1.16, 0.05);
      discStatic.add(sprite);
    }
    discLabel.position.set(-state.planeRadius * 0.92, -state.planeRadius * 1.28, 0.05);

    clearGroup(dynamicDisc);
    if (state.showTargetRing && duration > 0) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.09, 0.135, 24),
        new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
      );
      ring.position.set(readout.targetPoint.x, readout.targetPoint.y, 0.045);
      dynamicDisc.add(ring);
      const label = textSprite("目標", "#f2c66d", 0.11);
      label.position.set(readout.targetPoint.x, readout.targetPoint.y, 0.16);
      dynamicDisc.add(label);
    }
    if (duration > 0) {
      dynamicDisc.add(
        makeLine(readout.trajectory.map((sample) => vec3(sample.rotating, 0.035)), TRACE_COLOR, 0.92),
      );
    }

    clearGroup(dynamicWorld);
    if (state.showInertialGhost && duration > 0) {
      dynamicWorld.add(makeLine([vec3(origin, 0.02), vec3(readout.targetPoint, 0.02)], GHOST_COLOR, 0.55, true));
    }
    if (duration > 0) {
      dynamicWorld.add(arrowGroup(vec3(origin, 0.02), vec3(velocity), 0.34, 0xf4f1e8, 0.85, 0.08, 0.014));
      ballMarker.position.set(origin.x, origin.y, 0.04);
    }
    ballMarker.visible = duration > 0;

    viewport.render();
  };

  return {
    update,
    dispose: () => {
      stopLoop();
      clearGroup(worldGroup);
      clearGroup(discGroup);
      viewport.dispose();
    },
  };
}

function toDiagramPoint(p: PlanarPoint, scale: number): [number, number] {
  return [p.x * scale, -p.y * scale];
}

function DiagramView({ state, readout }: { state: CoriolisState; readout: CoriolisReadout }) {
  const scale = 68;
  const half = state.planeRadius * scale * 1.32;
  const [originX, originY] = toDiagramPoint(readout.origin, scale);
  const [targetX, targetY] = toDiagramPoint(readout.targetPoint, scale);
  const [endX, endY] = toDiagramPoint(readout.endpoint.rotating, scale);
  const rim = state.planeRadius * scale;
  const pathD = readout.trajectory
    .map((sample, index) => {
      const [x, y] = toDiagramPoint(sample.rotating, scale);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="旋轉系（平台或地面觀察者）視角下的偏轉路徑"
    >
      <circle cx={0} cy={0} r={rim} fill="none" stroke="#3d6482" strokeWidth={1.4} />
      {[0, 45, 90, 135].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x = Math.sin(rad) * rim;
        const y = -Math.cos(rad) * rim;
        return <line key={deg} x1={-x} y1={-y} x2={x} y2={y} stroke="#2c4d64" strokeWidth={1} />;
      })}
      <text x={0} y={-rim - 12} textAnchor="middle" fill="#9fc2d3" fontSize={13} fontWeight={700}>北</text>
      <text x={rim + 16} y={5} textAnchor="middle" fill="#9fc2d3" fontSize={13} fontWeight={700}>東</text>

      {readout.duration > 0 ? (
        <>
          <line x1={originX} y1={originY} x2={targetX} y2={targetY} stroke="#f2c66d" strokeWidth={2} strokeDasharray="6 5" />
          <path d={pathD} fill="none" stroke="#5ed8c3" strokeWidth={3} strokeLinecap="round" />
          <circle cx={targetX} cy={targetY} r={6} fill="none" stroke="#f2c66d" strokeWidth={2.4} />
          <circle cx={endX} cy={endY} r={4.5} fill="#5ed8c3" />
          <circle cx={originX} cy={originY} r={4} fill="#f4f1e8" />
        </>
      ) : (
        <text x={0} y={0} textAnchor="middle" fill="#f2c66d" fontSize={12}>發射速度過小，未離開顯示範圍</text>
      )}
    </svg>
  );
}

function formatOmega(omega: number) {
  if (!Number.isFinite(omega) || Math.abs(omega) < 1e-4) return "0 rad/s";
  return `${omega.toFixed(2)} rad/s`;
}

function formatSide(side: "right" | "left" | "none") {
  return side === "right" ? "向右偏" : side === "left" ? "向左偏" : "無偏轉";
}

export default function CoriolisLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const [state, setState] = useState<CoriolisState>(initialCoriolisState);
  const readout = useMemo(() => deriveCoriolisModel(state), [state]);
  const playbackSpeed = Number.isFinite(state.animationSpeed) ? state.animationSpeed : 1;

  useEffect(() => {
    if (!hostRef.current) return;
    sceneRef.current = setupCoriolisScene(hostRef.current);
    return () => sceneRef.current?.dispose();
  }, []);
  useEffect(() => sceneRef.current?.update(state, readout), [state, readout]);

  const patchState = useCallback((patch: Partial<CoriolisState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const isEarth = state.scenario === "earth";

  return (
    <main className="lab-shell coriolis-lab">
      <div className="topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow">Model 06</div>
          <h1><span className="live-dot" />科氏力效應</h1>
        </div>
        <div className="header-actions">
          <Link className="model-index-link" href="/">模型目錄</Link>
          <button onClick={() => setState(initialCoriolisState())}><RotateCcw size={14} /> 重設</button>
        </div>
      </div>

      <div className="coriolis-stage-grid">
        <section className="viewport-card coriolis-scene-card">
          <div className="card-label">
            <span>3D</span>
            <div><strong>慣性系與旋轉系同框</strong><small>拖曳旋轉；虛線為真實直線路徑，實線為平台上留下的偏轉軌跡</small></div>
          </div>
          <div className="canvas-host" ref={hostRef} />
          <div className="legend">
            <span><i style={{ background: "#f2c66d" }} />慣性系直線（虛線）</span>
            <span><i style={{ background: "#5ed8c3" }} />旋轉系偏轉軌跡</span>
            <span><i className="sun" style={{ background: "#f4f1e8" }} />實際位置</span>
          </div>
        </section>

        <section className="viewport-card coriolis-diagram-card">
          <div className="card-label">
            <span>2D</span>
            <div><strong>平台觀察者視角</strong><small>金色虛線為瞄準方向，青色為實際偏轉路徑</small></div>
          </div>
          <div className="canvas-host"><DiagramView state={state} readout={readout} /></div>
        </section>
      </div>

      <div className="coriolis-metrics">
        <div><span>情境</span><strong>{isEarth ? `地球 · ${state.latitude >= 0 ? "北緯" : "南緯"}${Math.abs(state.latitude).toFixed(0)}°` : "旋轉平台"}</strong></div>
        <div><span>局部角速度</span><strong>{formatOmega(readout.visualOmega)}</strong></div>
        <div><span>偏轉方向</span><strong>{formatSide(readout.side)}</strong></div>
        <div><span>飛行時間</span><strong>{readout.duration > 0 ? `${readout.duration.toFixed(2)} s` : "—"}</strong></div>
        <div><span>落點偏移量</span><strong>{readout.duration > 0 ? readout.deflection.toFixed(2) : "—"}</strong></div>
      </div>

      <section className="control-panel coriolis-controls">
        <div className="control-panel-heading">
          <div><RotateCw size={14} /> 同步控制台</div>
          <button className={state.playing ? "active" : ""} onClick={() => patchState({ playing: !state.playing })} aria-label={state.playing ? "暫停動畫" : "播放動畫"}>
            {state.playing ? <Pause size={14} /> : <Play size={14} />} {state.playing ? "暫停" : "播放"}
          </button>
        </div>

        <div className="coriolis-scenario-row">
          <button className={state.scenario === "turntable" ? "active" : ""} onClick={() => patchState({ scenario: "turntable" })}>旋轉平台</button>
          <button className={state.scenario === "earth" ? "active" : ""} onClick={() => patchState({ scenario: "earth" })}>地球緯度</button>
        </div>

        <div className="coriolis-control-grid">
          {isEarth ? (
            <>
              <div className="coriolis-control-block">
                <label><span>緯度 <b>{state.latitude >= 0 ? "北緯" : "南緯"} {Math.abs(state.latitude).toFixed(0)}°</b></span><input type="range" min="-89" max="89" step="1" value={state.latitude} onChange={(event) => patchState({ latitude: Number(event.target.value) })} /></label>
                <small>局部角速度 = Ω sinφ；赤道處為 0，兩極最強。</small>
              </div>
              <div className="coriolis-control-block">
                <label><span>自轉速率 <b>{state.rotationRate.toFixed(2)} × 地球</b></span><input type="range" min="0" max="3" step="0.1" value={state.rotationRate} onChange={(event) => patchState({ rotationRate: Number(event.target.value) })} /></label>
              </div>
            </>
          ) : (
            <div className="coriolis-control-block">
              <label><span>平台角速度 <b>{state.angularVelocity.toFixed(2)} rad/s</b></span><input type="range" min="-3.2" max="3.2" step="0.1" value={state.angularVelocity} onChange={(event) => patchState({ angularVelocity: Number(event.target.value) })} /></label>
              <small>正值逆時針（對應北半球方向），負值順時針（對應南半球方向）。</small>
            </div>
          )}
          <div className="coriolis-control-block">
            <label><span>發射速度 <b>{state.launchSpeed.toFixed(2)}</b></span><input type="range" min="0.4" max="3" step="0.1" value={state.launchSpeed} onChange={(event) => patchState({ launchSpeed: Number(event.target.value) })} /></label>
          </div>
          <div className="coriolis-control-block">
            <label><span>發射方位角 <b>{state.launchAzimuth.toFixed(0)}°</b></span><input type="range" min="0" max="359" step="5" value={state.launchAzimuth} onChange={(event) => patchState({ launchAzimuth: Number(event.target.value) })} /></label>
          </div>
          <div className="coriolis-control-block">
            <label><span>顯示範圍半徑 <b>{state.planeRadius.toFixed(1)}</b></span><input type="range" min="1.6" max="3.2" step="0.1" value={state.planeRadius} onChange={(event) => patchState({ planeRadius: Number(event.target.value) })} /></label>
          </div>
          <div className="coriolis-layer-buttons" aria-label="圖層顯示">
            {([
              ["showInertialGhost", "慣性系虛線"],
              ["showTargetRing", "瞄準目標"],
            ] as const).map(([key, label]) => (
              <button key={key} className={state[key] ? "active" : ""} onClick={() => patchState({ [key]: !state[key] })}>
                {state[key] ? <Eye size={13} /> : <EyeOff size={13} />} {label}
              </button>
            ))}
          </div>
        </div>

        <div className="coriolis-scenario-row">
          {Object.entries(CORIOLIS_PRESETS).map(([key, preset]) => {
            const { label, ...patch } = preset;
            return <button key={key} onClick={() => patchState(patch)}>{label}</button>;
          })}
        </div>

        <div className="coriolis-scenario-row">
          {[0.25, 0.5, 1, 2, 4].map((speed) => (
            <button key={speed} className={Math.abs(playbackSpeed - speed) < 0.01 ? "selected" : ""} onClick={() => patchState({ animationSpeed: speed })}>{speed}×</button>
          ))}
        </div>
      </section>

      <p className="coriolis-note">
        {isEarth
          ? `真實地球：緯度 ${state.latitude.toFixed(0)}° 的科氏參數 f ≈ ${readout.realCoriolisParameter.toExponential(2)} s⁻¹；傅科擺原地擺動一圈約需 ${Number.isFinite(readout.foucaultHours ?? Infinity) ? `${(readout.foucaultHours ?? 0).toFixed(1)} 小時` : "無限久（赤道）"}。`
          : "旋轉平台情境為抽象教學模型，動畫角速度即平台真實轉速；地球情境的動畫角速度已放大以利觀察，上方讀數為真實地球數值。"}
      </p>

      <div className="lab-footer">
        <span>CORIOLIS EFFECT · a = −2Ω × v</span>
        <span>AstroLab</span>
      </div>
    </main>
  );
}
