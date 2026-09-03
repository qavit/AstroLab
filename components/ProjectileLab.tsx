"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Compass, Eye, EyeOff, Pause, Play, RotateCcw, Target } from "lucide-react";
import type { TrajectorySample, Vec2 } from "@/lib/science/projectile";
import { DRAG_PRESETS, GRAVITY_PRESETS } from "@/lib/science/projectile";
import {
  PROJECTILE_PRESETS,
  SCENARIO_DEFAULTS,
  SPEED_RANGE,
  deriveCursor,
  deriveProjectileModel,
  initialProjectileState,
  type CursorReadout,
  type ProjectileReadout,
  type ProjectileState,
} from "@/models/projectile";

const TRAJ_W = 780;
const TRAJ_H = 452;
const TRAJ_PAD = { left: 56, right: 26, top: 24, bottom: 44 };
const MINI_W = 336;
const MINI_H = 146;
const MINI_PAD = { left: 48, right: 14, top: 16, bottom: 36 };

const TRAJ = "#5ed8c3";
const COMP = "#f2c66d";
const ENVELOPE = "#b78ce0";
const FAN = "#41708e";
const DRAG = "#ef8f6a";
const VX = "#8ad6ff";
const VY = "#ffd280";
const TANGENTIAL = "#ff9d76";
const NORMAL = "#7fb4ff";
const GRID = "#22485f";
const AXIS = "#3d6482";
const LABEL = "#9fc2d3";
const INK = "#f4f1e8";

/** Round-number ticks (1/2/5 × 10ⁿ) spanning the domain. */
function niceTicks(min: number, max: number, targetCount = 5) {
  if (!(max > min)) return [min];
  const rough = (max - min) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(Number(v.toFixed(decimals)));
  return ticks.length > 0 ? ticks : [min, max];
}

type Domain = { xMin: number; xMax: number; yMin: number; yMax: number };

/**
 * Grows the shorter domain until the two axes share one scale. A trajectory drawn on stretched
 * axes is no longer the shape the projectile actually flew, and the whole point of the main view
 * is that the shape is a parabola — so distortion is corrected here rather than tolerated.
 */
function fitEqualAspect(domain: Domain, plotW: number, plotH: number, growY: "up" | "down"): Domain {
  const xRange = Math.max(1e-6, domain.xMax - domain.xMin);
  const yRange = Math.max(1e-6, domain.yMax - domain.yMin);
  const target = plotW / plotH;
  if (xRange / yRange < target) return { ...domain, xMax: domain.xMin + yRange * target };
  const needed = xRange / target;
  return growY === "up"
    ? { ...domain, yMax: domain.yMin + needed }
    : { ...domain, yMin: domain.yMax - needed };
}

type Frame = {
  domain: Domain;
  px: (x: number) => number;
  py: (y: number) => number;
  plot: { left: number; right: number; top: number; bottom: number };
};

function makeFrame(domain: Domain, width: number, height: number, pad: typeof TRAJ_PAD): Frame {
  const plot = { left: pad.left, right: width - pad.right, top: pad.top, bottom: height - pad.bottom };
  const w = plot.right - plot.left;
  const h = plot.bottom - plot.top;
  return {
    domain,
    plot,
    px: (x) => plot.left + ((x - domain.xMin) / (domain.xMax - domain.xMin || 1)) * w,
    py: (y) => plot.bottom - ((y - domain.yMin) / (domain.yMax - domain.yMin || 1)) * h,
  };
}

const pathFrom = (points: readonly Vec2[], frame: Frame) =>
  points.map((p, index) => `${index === 0 ? "M" : "L"}${frame.px(p.x).toFixed(2)} ${frame.py(p.y).toFixed(2)}`).join(" ");

const samplePath = (samples: readonly TrajectorySample[], frame: Frame) =>
  pathFrom(samples.map((sample) => sample.point), frame);

/** A straight arrow with a solid head, in screen coordinates. */
function Arrow({ x1, y1, x2, y2, color, width = 2, dash }: {
  x1: number; y1: number; x2: number; y2: number; color: string; width?: number; dash?: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 4) return null;
  const head = Math.min(9, length * 0.4);
  const ux = dx / length;
  const uy = dy / length;
  const baseX = x2 - ux * head;
  const baseY = y2 - uy * head;
  return (
    <g>
      <line x1={x1} y1={y1} x2={baseX} y2={baseY} stroke={color} strokeWidth={width} strokeDasharray={dash} />
      <polygon
        points={`${x2},${y2} ${baseX - uy * head * 0.4},${baseY + ux * head * 0.4} ${baseX + uy * head * 0.4},${baseY - ux * head * 0.4}`}
        fill={color}
      />
    </g>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Main view: the trajectory itself
 * ------------------------------------------------------------------------------------------ */

function TrajectoryView({ state, model, cursor }: {
  state: ProjectileState;
  model: ProjectileReadout;
  cursor: CursorReadout;
}) {
  const isStairs = state.scenario === "staircase";
  const { stairs } = state;

  const rawDomain: Domain = isStairs
    ? {
        xMin: 0,
        xMax: Math.max(stairs.width * ((model.landing?.step ?? stairs.count) + 1.5), stairs.width * 3),
        yMin: -stairs.rise * ((model.landing?.step ?? stairs.count) + 1.5),
        yMax: Math.max(model.apex.point.y, stairs.rise),
      }
    : {
        xMin: 0,
        xMax:
          Math.max(
            model.groundRange,
            state.showEnvelope ? model.maxRange : 0,
            model.dragLanding?.point.x ?? 0,
            1,
          ) * 1.06,
        yMin: 0,
        yMax: Math.max(model.apex.point.y, state.showEnvelope ? model.envelope[0]?.y ?? 0 : 0, state.height, 1) * 1.14,
      };

  const domain = fitEqualAspect(
    rawDomain,
    TRAJ_W - TRAJ_PAD.left - TRAJ_PAD.right,
    TRAJ_H - TRAJ_PAD.top - TRAJ_PAD.bottom,
    isStairs ? "down" : "up",
  );
  const frame = makeFrame(domain, TRAJ_W, TRAJ_H, TRAJ_PAD);
  const { plot } = frame;

  const xTicks = niceTicks(domain.xMin, domain.xMax, 7);
  const yTicks = niceTicks(domain.yMin, domain.yMax, 5);

  /* One world-unit-per-metre-per-second scale for velocity and one for acceleration, so the two
   * arrow families stay comparable to themselves across parameter changes. */
  const span = domain.xMax - domain.xMin;
  const velocityScale = state.speed > 0 ? (0.16 * span) / state.speed : 0;
  const accelScale = state.gravity > 0 ? (0.11 * span) / state.gravity : 0;

  const cx = frame.px(cursor.point.x);
  const cy = frame.py(cursor.point.y);
  const arrowTip = (dx: number, dy: number, scale: number) => ({
    x: frame.px(cursor.point.x + dx * scale),
    y: frame.py(cursor.point.y + dy * scale),
  });

  const speed = cursor.acceleration.speed;
  const tip = arrowTip(cursor.velocity.x, cursor.velocity.y, velocityScale);
  const tipX = arrowTip(cursor.velocity.x, 0, velocityScale);
  const tipY = arrowTip(0, cursor.velocity.y, velocityScale);

  /* Gravity split along and across the path. The unit normal points to the concave side, which is
   * (v_y, −vₓ)/|v| for rightward motion — the direction the path is actually bending toward. */
  const unit = speed > 1e-6 ? { x: cursor.velocity.x / speed, y: cursor.velocity.y / speed } : { x: 1, y: 0 };
  const sign = cursor.velocity.x >= 0 ? 1 : -1;
  const normalDir = { x: (sign * cursor.velocity.y) / (speed || 1), y: (-sign * cursor.velocity.x) / (speed || 1) };
  const tipT = arrowTip(unit.x * cursor.acceleration.tangential, unit.y * cursor.acceleration.tangential, accelScale);
  const tipN = arrowTip(normalDir.x * cursor.acceleration.normal, normalDir.y * cursor.acceleration.normal, accelScale);

  const radius = cursor.acceleration.radiusOfCurvature;
  const showCircle = state.showAcceleration && Number.isFinite(radius) && radius < span * 2.2 && model.duration > 0;
  const centre = { x: cursor.point.x + normalDir.x * radius, y: cursor.point.y + normalDir.y * radius };

  const stairPoints: Vec2[] = [];
  for (let step = 0; step <= stairs.count; step += 1) {
    stairPoints.push({ x: step * stairs.width, y: -step * stairs.rise });
    stairPoints.push({ x: step * stairs.width, y: -(step + 1) * stairs.rise });
  }

  return (
    <svg viewBox={`0 0 ${TRAJ_W} ${TRAJ_H}`} width="100%" height="100%" role="img" aria-label="拋體運動軌跡圖">
      <defs>
        {/* The osculating circle and the envelope fan can both run far outside the framed
            region; clipping keeps them from being read as part of the flight. */}
        <clipPath id="projectile-plot-clip">
          <rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} />
        </clipPath>
      </defs>
      {xTicks.map((tick) => (
        <line key={`gx${tick}`} x1={frame.px(tick)} y1={plot.top} x2={frame.px(tick)} y2={plot.bottom} stroke={GRID} strokeWidth={1} />
      ))}
      {yTicks.map((tick) => (
        <line key={`gy${tick}`} x1={plot.left} y1={frame.py(tick)} x2={plot.right} y2={frame.py(tick)} stroke={GRID} strokeWidth={1} />
      ))}

      {isStairs ? (
        <path d={pathFrom(stairPoints, frame)} fill="none" stroke="#6f9cba" strokeWidth={2.2} />
      ) : (
        <line x1={plot.left} y1={frame.py(0)} x2={plot.right} y2={frame.py(0)} stroke={AXIS} strokeWidth={2} />
      )}
      <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} stroke={AXIS} strokeWidth={1.4} />

      {xTicks.map((tick) => (
        <text key={`tx${tick}`} x={frame.px(tick)} y={plot.bottom + 16} textAnchor="middle" fill={LABEL} fontSize={10}>{tick}</text>
      ))}
      {yTicks.map((tick) => (
        <text key={`ty${tick}`} x={plot.left - 8} y={frame.py(tick) + 3.5} textAnchor="end" fill={LABEL} fontSize={10}>{tick}</text>
      ))}
      <text x={plot.right} y={plot.bottom + 33} textAnchor="end" fill={LABEL} fontSize={11}>水平距離 x (m)</text>
      <text x={plot.left - 8} y={plot.top - 9} textAnchor="end" fill={LABEL} fontSize={11}>高度 y (m)</text>

      <g clipPath="url(#projectile-plot-clip)">
      {model.envelope.length > 0 && (
        <>
          {model.envelopeFan.map((fan) => (
            <path key={fan.angle} d={samplePath(fan.samples, frame)} fill="none" stroke={FAN} strokeWidth={1.2} opacity={0.75} />
          ))}
          <path d={pathFrom(model.envelope, frame)} fill="none" stroke={ENVELOPE} strokeWidth={2.4} strokeDasharray="7 4" />
          <text x={frame.px(model.envelope[0]?.x ?? 0) + 8} y={frame.py(model.envelope[0]?.y ?? 0) - 6} fill={ENVELOPE} fontSize={10}>
            安全拋物線（此速度的可及邊界）
          </text>
        </>
      )}

      {model.complementary && (
        <>
          <path d={samplePath(model.complementary.samples, frame)} fill="none" stroke={COMP} strokeWidth={2.2} strokeDasharray="8 5" />
          <circle cx={frame.px(model.complementary.range)} cy={frame.py(0)} r={5} fill="none" stroke={COMP} strokeWidth={2} />
        </>
      )}

      {model.dragSamples.length > 0 && (
        <>
          <path d={samplePath(model.dragSamples, frame)} fill="none" stroke={DRAG} strokeWidth={2.6} />
          <circle cx={frame.px(model.dragLanding?.point.x ?? 0)} cy={frame.py(0)} r={4.5} fill={DRAG} />
        </>
      )}

      {model.duration > 0 && (
        <path d={samplePath(model.trajectory, frame)} fill="none" stroke={TRAJ} strokeWidth={3} strokeLinecap="round" />
      )}

      {!isStairs && model.apex.t > 0 && (
        <>
          <line x1={frame.px(model.apex.point.x)} y1={frame.py(model.apex.point.y)} x2={frame.px(model.apex.point.x)} y2={frame.py(0)} stroke={TRAJ} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
          <text x={frame.px(model.apex.point.x)} y={frame.py(model.apex.point.y) - 9} textAnchor="middle" fill={TRAJ} fontSize={10}>
            最高點 {model.apex.point.y.toFixed(1)} m
          </text>
        </>
      )}

      {isStairs && model.landing && (
        <>
          <circle cx={frame.px(model.landing.point.x)} cy={frame.py(model.landing.point.y)} r={6} fill="none" stroke={COMP} strokeWidth={2.4} />
          <text x={frame.px(model.landing.point.x) + 10} y={frame.py(model.landing.point.y) + 14} fill={COMP} fontSize={11} fontWeight={700}>
            落在第 {model.landing.step} 階
          </text>
        </>
      )}

      {showCircle && (
        <circle cx={frame.px(centre.x)} cy={frame.py(centre.y)} r={Math.abs(frame.px(radius) - frame.px(0))} fill="none" stroke={NORMAL} strokeWidth={1} strokeDasharray="3 5" opacity={0.5} />
      )}

      {model.duration > 0 && (
        <>
          <Arrow x1={cx} y1={cy} x2={tipX.x} y2={tipX.y} color={VX} width={1.6} dash="5 3" />
          <Arrow x1={cx} y1={cy} x2={tipY.x} y2={tipY.y} color={VY} width={1.6} dash="5 3" />
          <Arrow x1={cx} y1={cy} x2={tip.x} y2={tip.y} color={INK} width={2.4} />
          {state.showAcceleration && (
            <>
              <Arrow x1={cx} y1={cy} x2={tipT.x} y2={tipT.y} color={TANGENTIAL} width={2} />
              <Arrow x1={cx} y1={cy} x2={tipN.x} y2={tipN.y} color={NORMAL} width={2} />
            </>
          )}
          <circle cx={cx} cy={cy} r={4.5} fill={INK} />
        </>
      )}
      </g>

      {model.duration <= 0 && (
        <text x={TRAJ_W / 2} y={TRAJ_H / 2} textAnchor="middle" fill={COMP} fontSize={12}>此設定下沒有飛行（重力為零或未離開地面）</text>
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Companion view: the components against time
 *
 * These three charts are the model's actual claim. x–t is straight, y–t is a parabola, and the
 * two velocity components are a flat line and a sloped one — the independence of horizontal and
 * vertical motion is not asserted in prose anywhere, it is just visible here.
 * ------------------------------------------------------------------------------------------ */

type Series = { label: string; color: string; points: Vec2[] };

function MiniChart({ title, note, series, duration, cursorT, yLabel }: {
  title: string;
  note: string;
  series: Series[];
  duration: number;
  cursorT: number;
  yLabel: string;
}) {
  const values = series.flatMap((line) => line.points.map((point) => point.y));
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(...values, rawMin + 1e-6);
  const padding = (rawMax - rawMin) * 0.12 || 1;
  const frame = makeFrame(
    { xMin: 0, xMax: Math.max(duration, 1e-6), yMin: rawMin - padding, yMax: rawMax + padding },
    MINI_W,
    MINI_H,
    MINI_PAD,
  );
  const { plot } = frame;
  const yTicks = niceTicks(frame.domain.yMin, frame.domain.yMax, 3);
  const xTicks = niceTicks(0, Math.max(duration, 1e-6), 4);
  const cursorX = frame.px(Math.min(cursorT, duration));

  return (
    <div className="projectile-mini">
      <div className="projectile-mini-head"><strong>{title}</strong><small>{note}</small></div>
      <svg viewBox={`0 0 ${MINI_W} ${MINI_H}`} width="100%" height="100%" role="img" aria-label={title}>
        {yTicks.map((tick) => (
          <line key={tick} x1={plot.left} y1={frame.py(tick)} x2={plot.right} y2={frame.py(tick)} stroke={GRID} strokeWidth={1} />
        ))}
        {yTicks.map((tick) => (
          <text key={`l${tick}`} x={plot.left - 6} y={frame.py(tick) + 3.5} textAnchor="end" fill={LABEL} fontSize={9}>{tick}</text>
        ))}
        {xTicks.map((tick) => (
          <text key={`x${tick}`} x={frame.px(tick)} y={plot.bottom + 13} textAnchor="middle" fill={LABEL} fontSize={9}>{tick}</text>
        ))}
        {frame.domain.yMin < 0 && frame.domain.yMax > 0 && (
          <line x1={plot.left} y1={frame.py(0)} x2={plot.right} y2={frame.py(0)} stroke={AXIS} strokeWidth={1.4} />
        )}
        <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} stroke={AXIS} strokeWidth={1.2} />
        <text x={plot.left - 6} y={plot.top - 5} textAnchor="end" fill={LABEL} fontSize={9}>{yLabel}</text>
        <text x={plot.right} y={plot.bottom + 26} textAnchor="end" fill={LABEL} fontSize={9}>t (s)</text>

        {series.map((line) => (
          <path key={line.label} d={pathFrom(line.points, frame)} fill="none" stroke={line.color} strokeWidth={2.2} />
        ))}

        {duration > 0 && (
          <>
            <line x1={cursorX} y1={plot.top} x2={cursorX} y2={plot.bottom} stroke={INK} strokeWidth={1} opacity={0.45} />
            {series.map((line) => {
              const index = Math.min(line.points.length - 1, Math.round((cursorT / duration) * (line.points.length - 1)));
              const point = line.points[Math.max(0, index)];
              return point ? <circle key={`d${line.label}`} cx={cursorX} cy={frame.py(point.y)} r={3.4} fill={line.color} /> : null;
            })}
          </>
        )}
      </svg>
    </div>
  );
}

/** The three time series the companion charts draw, all read off the same trajectory sampling. */
function componentSeries(model: ProjectileReadout) {
  const { trajectory, duration } = model;
  const horizontal: Series[] = [{ label: "x", color: VX, points: trajectory.map((s) => ({ x: s.t, y: s.point.x })) }];
  const vertical: Series[] = [{ label: "y", color: VY, points: trajectory.map((s) => ({ x: s.t, y: s.point.y })) }];
  const velocity: Series[] = [
    { label: "vx", color: VX, points: trajectory.map((s) => ({ x: s.t, y: s.velocity.x })) },
    { label: "vy", color: VY, points: trajectory.map((s) => ({ x: s.t, y: s.velocity.y })) },
  ];
  return { horizontal, vertical, velocity, duration };
}

/* ---------------------------------------------------------------------------------------------
 * Lab
 * ------------------------------------------------------------------------------------------ */

function formatMetres(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(2)} m`;
}

export default function ProjectileLab() {
  const [state, setState] = useState<ProjectileState>(initialProjectileState);
  const [cursorFraction, setCursorFraction] = useState(0.45);

  const model = useMemo(() => deriveProjectileModel(state), [state]);
  const cursor = useMemo(() => deriveCursor(model, state.gravity, cursorFraction), [model, state.gravity, cursorFraction]);
  const charts = useMemo(() => componentSeries(model), [model]);

  const patchState = useCallback((patch: Partial<ProjectileState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  /* The cursor is animated outside the model so a moving marker never re-samples the flight. */
  const durationRef = useRef(model.duration);
  const speedRef = useRef(state.animationSpeed);
  useEffect(() => { durationRef.current = model.duration; }, [model.duration]);
  useEffect(() => { speedRef.current = state.animationSpeed; }, [state.animationSpeed]);

  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const duration = durationRef.current;
      if (duration > 0) {
        setCursorFraction((value) => (value + (dt * speedRef.current) / duration) % 1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.playing]);

  const isStairs = state.scenario === "staircase";
  const dragActive = model.dragSamples.length > 0;

  return (
    <main className="lab-shell projectile-lab">
      <div className="topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow">Model 07</div>
          <h1><span className="live-dot" />拋體運動</h1>
        </div>
        <div className="header-actions">
          <Link className="model-index-link" href="/">模型目錄</Link>
          <button onClick={() => { setState(initialProjectileState()); setCursorFraction(0.45); }}><RotateCcw size={14} /> 重設</button>
        </div>
      </div>

      <div className="projectile-stage-grid">
        <section className="viewport-card projectile-path-card">
          <div className="card-label">
            <span>軌跡</span>
            <div>
              <strong>{isStairs ? "階梯落點" : "水平距離 × 高度"}</strong>
              <small>兩軸同尺度，所以畫面上的形狀就是真實的拋物線</small>
            </div>
          </div>
          <div className="canvas-host"><TrajectoryView state={state} model={model} cursor={cursor} /></div>
          <div className="legend">
            <span><i style={{ background: TRAJ }} />真空軌跡</span>
            {model.complementary && <span><i style={{ background: COMP }} />互補角 {model.complementary.angle.toFixed(0)}°</span>}
            {model.envelope.length > 0 && <span><i style={{ background: ENVELOPE }} />安全拋物線</span>}
            {dragActive && <span><i style={{ background: DRAG }} />含空氣阻力（數值解）</span>}
            <span><i style={{ background: VX }} />vₓ</span>
            <span><i style={{ background: VY }} />v_y</span>
            {state.showAcceleration && <span><i style={{ background: TANGENTIAL }} />切向 a∥</span>}
            {state.showAcceleration && <span><i style={{ background: NORMAL }} />法向 a⊥</span>}
          </div>
        </section>

        <section className="viewport-card projectile-component-card">
          <div className="card-label">
            <span>分量</span>
            <div><strong>水平與垂直各自對時間</strong><small>同一個時間游標；x–t 是直線，y–t 是拋物線</small></div>
          </div>
          <div className="projectile-mini-stack">
            <MiniChart title="水平位置 x–t" note="等速：斜率固定為 vₓ" series={charts.horizontal} duration={charts.duration} cursorT={cursor.t} yLabel="x (m)" />
            <MiniChart title="垂直位置 y–t" note="等加速：二次曲線" series={charts.vertical} duration={charts.duration} cursorT={cursor.t} yLabel="y (m)" />
            <MiniChart title="速度分量 v–t" note="vₓ 水平不變，v_y 斜率 = −g" series={charts.velocity} duration={charts.duration} cursorT={cursor.t} yLabel="v (m/s)" />
          </div>
        </section>
      </div>

      <div className="projectile-metrics">
        <div><span>飛行時間</span><strong>{model.duration > 0 ? `${model.duration.toFixed(2)} s` : "—"}</strong></div>
        <div><span>{isStairs ? "落點水平距離" : "水平射程"}</span><strong>{formatMetres(isStairs ? model.landing?.point.x : model.groundRange)}</strong></div>
        <div><span>最高點</span><strong>{formatMetres(model.apex.point.y)}</strong></div>
        <div><span>最佳發射角</span><strong>{model.optimalAngle.toFixed(1)}°</strong></div>
        <div><span>當下速率</span><strong>{cursor.acceleration.speed.toFixed(2)} m/s</strong></div>
        <div><span>曲率半徑</span><strong>{Number.isFinite(cursor.acceleration.radiusOfCurvature) ? `${cursor.acceleration.radiusOfCurvature.toFixed(1)} m` : "∞"}</strong></div>
      </div>

      <section className="control-panel projectile-controls">
        <div className="control-panel-heading">
          <div><Target size={14} /> 同步控制台</div>
          <button className={state.playing ? "active" : ""} onClick={() => patchState({ playing: !state.playing })} aria-label={state.playing ? "暫停動畫" : "播放動畫"}>
            {state.playing ? <Pause size={14} /> : <Play size={14} />} {state.playing ? "暫停" : "播放"}
          </button>
        </div>

        <div className="projectile-row">
          <button className={!isStairs ? "active" : ""} onClick={() => patchState({ scenario: "field", ...SCENARIO_DEFAULTS.field })}>平地拋射</button>
          <button className={isStairs ? "active" : ""} onClick={() => patchState({ scenario: "staircase", ...SCENARIO_DEFAULTS.staircase })}>階梯落點</button>
        </div>

        <div className="projectile-control-grid">
          <div className="projectile-block">
            <label><span>發射速度 <b>{state.speed.toFixed(1)} m/s</b></span>
              <input type="range" min={SPEED_RANGE[state.scenario].min} max={SPEED_RANGE[state.scenario].max} step={SPEED_RANGE[state.scenario].step} value={state.speed} onChange={(event) => patchState({ speed: Number(event.target.value) })} /></label>
          </div>
          <div className="projectile-block">
            <label><span>發射角 <b>{state.angle.toFixed(0)}°</b></span>
              <input type="range" min="-20" max="90" step="1" value={state.angle} onChange={(event) => patchState({ angle: Number(event.target.value) })} /></label>
            <small>最佳角 {model.optimalAngle.toFixed(1)}°；只有發射與落地同高時才是 45°。</small>
          </div>
          {isStairs ? (
            <>
              <div className="projectile-block">
                <label><span>階梯深度 <b>{state.stairs.width.toFixed(2)} m</b></span>
                  <input type="range" min="0.15" max="0.6" step="0.01" value={state.stairs.width} onChange={(event) => patchState({ stairs: { ...state.stairs, width: Number(event.target.value) } })} /></label>
              </div>
              <div className="projectile-block">
                <label><span>階梯高度 <b>{state.stairs.rise.toFixed(2)} m</b></span>
                  <input type="range" min="0.08" max="0.35" step="0.01" value={state.stairs.rise} onChange={(event) => patchState({ stairs: { ...state.stairs, rise: Number(event.target.value) } })} /></label>
              </div>
            </>
          ) : (
            <>
              <div className="projectile-block">
                <label><span>發射高度 <b>{state.height.toFixed(1)} m</b></span>
                  <input type="range" min="0" max="60" step="0.5" value={state.height} onChange={(event) => patchState({ height: Number(event.target.value) })} /></label>
              </div>
              <div className="projectile-block">
                <label><span>空氣阻力 k <b>{state.dragFactor.toFixed(3)} m⁻¹</b></span>
                  <input type="range" min="0" max="0.2" step="0.005" value={state.dragFactor} onChange={(event) => patchState({ dragFactor: Number(event.target.value), showDrag: Number(event.target.value) > 0 })} /></label>
                <small>阻力軌跡為數值積分結果，其餘曲線皆為解析解。</small>
              </div>
            </>
          )}
          <div className="projectile-layer-buttons" aria-label="圖層顯示">
            {([
              ["showComplementary", "互補角"],
              ["showEnvelope", "安全拋物線"],
              ["showAcceleration", "加速度分量"],
              ["showDrag", "阻力對照"],
            ] as const).map(([key, label]) => (
              <button key={key} className={state[key] ? "active" : ""} onClick={() => patchState({ [key]: !state[key] })}>
                {state[key] ? <Eye size={13} /> : <EyeOff size={13} />} {label}
              </button>
            ))}
          </div>
        </div>

        <div className="projectile-row">
          <label className="projectile-scrub">
            <span>時間游標 <b>{cursor.t.toFixed(2)} s</b></span>
            <input type="range" min="0" max="1" step="0.001" value={cursorFraction}
              onChange={(event) => { setCursorFraction(Number(event.target.value)); patchState({ playing: false }); }} />
          </label>
        </div>

        <div className="projectile-row">
          {Object.entries(GRAVITY_PRESETS).map(([key, preset]) => (
            <button key={key} className={Math.abs(state.gravity - preset.value) < 1e-6 ? "selected" : ""} onClick={() => patchState({ gravity: preset.value })}>
              {preset.label} {preset.value.toFixed(2)}
            </button>
          ))}
          {Object.entries(DRAG_PRESETS).map(([key, preset]) => (
            <button key={key} className={Math.abs(state.dragFactor - preset.value) < 1e-9 ? "selected" : ""} onClick={() => patchState({ dragFactor: preset.value, showDrag: preset.value > 0 })}>
              {preset.label}
            </button>
          ))}
        </div>

        <div className="projectile-row">
          {Object.entries(PROJECTILE_PRESETS).map(([key, preset]) => {
            const { label, ...patch } = preset;
            return <button key={key} onClick={() => patchState(patch)}>{label}</button>;
          })}
        </div>

        <div className="projectile-row">
          {[0.25, 0.5, 1, 2].map((speed) => (
            <button key={speed} className={Math.abs(state.animationSpeed - speed) < 0.01 ? "selected" : ""} onClick={() => patchState({ animationSpeed: speed })}>{speed}×</button>
          ))}
        </div>
      </section>

      <p className="projectile-note">
        {isStairs
          ? model.landing
            ? `以 ${state.speed.toFixed(1)} m/s ${Math.abs(state.angle) < 1e-6 ? "水平" : `${state.angle.toFixed(0)}° 斜向`}離開階梯頂端，落在第 ${model.landing.step} 階。${model.horizontalStep ? `水平拋出可直接用 n = ⌈2v²·rise / (g·width²)⌉ = ${model.horizontalStep} 驗算；n 與 v² 成正比，所以射速加倍時落點大約往下移四倍的階數。` : ""}`
            : `以 ${state.speed.toFixed(1)} m/s 拋出會越過這 ${state.stairs.count} 階全部，落在樓梯之外；降低速度或加深階面即可讓落點回到梯面上。`
          : model.complementary
            ? model.rangesMatch
              ? `${state.angle.toFixed(0)}° 與 ${model.complementary.angle.toFixed(0)}° 射程相同（皆為 ${model.groundRange.toFixed(2)} m）：發射與落地同高時，互補角必定落在同一點，只是滯空時間不同。`
              : `發射高度為 ${state.height.toFixed(1)} m，互補角已不再等射程：${state.angle.toFixed(0)}° 為 ${model.groundRange.toFixed(2)} m，${model.complementary.angle.toFixed(0)}° 為 ${model.complementary.range.toFixed(2)} m。等射程只是 h = 0 的特例。`
            : dragActive
              ? `空氣阻力使射程從真空的 ${model.groundRange.toFixed(2)} m 減為 ${(model.dragLanding?.point.x ?? 0).toFixed(2)} m，減少約 ${((model.dragLoss ?? 0) / (model.groundRange || 1) * 100).toFixed(0)}%；此曲線由 RK4 數值積分求得，與其餘解析曲線性質不同。`
              : `此速度下的可及邊界為安全拋物線，最遠射程 ${model.maxRange.toFixed(2)} m，發生在 ${model.optimalAngle.toFixed(1)}°。`}
      </p>

      <div className="lab-footer">
        <span>PROJECTILE MOTION · x = vₓt, y = h + v_yt − ½gt²</span>
        <span>AstroLab</span>
      </div>
    </main>
  );
}
