import type { FieldGrid, GlyphClass } from "../../lib/science/electrostatics/sampling.ts";
import type { SourceCharge, Vec2 } from "../../lib/science/electrostatics/types.ts";
import type { CameraTransform } from "./viewport.ts";
import { worldToScreen } from "./viewport.ts";

export interface ProbeVectorGlyph {
  readonly sourceId: string | null;
  readonly ux: number;
  readonly uy: number;
  readonly strength: number;
  readonly kind: "contribution" | "total";
}

export type SelectedObject =
  | { readonly kind: "source"; readonly id: string }
  | { readonly kind: "probe" }
  | { readonly kind: "particle" }
  | null;

/** Renderer-neutral particle snapshot: runtime state and trail only, no physics. */
export interface ParticleGlyph {
  readonly initial: Vec2;
  readonly current: Vec2;
  readonly velocity: Vec2;
  readonly positive: boolean;
  readonly stopped: boolean;
  /** Interleaved world x, y of accepted states. */
  readonly trail: Float64Array;
  readonly trailCount: number;
  /** Trajectory is evidence; guided steps may hide it. */
  readonly showTrail: boolean;
}

/** What the dynamic layer may draw; answer gating is decided upstream by the learning policy. */
export interface DynamicLayerOptions {
  readonly showProbe: boolean;
  /** Draw the probe's zero-field marker (only once the total is revealed and the model says zero). */
  readonly probeZero: boolean;
}

const FIELD_BACKGROUND = "#071a27";
const WORLD_BACKGROUND = "#0b2434";
const FIELD_NORMAL_DARK = [80, 121, 139] as const;
const FIELD_NORMAL_LIGHT = [225, 239, 241] as const;

function mixChannel(a: number, b: number, amount: number): number {
  return Math.round(a + (b - a) * amount);
}

function fieldColour(strength: number): string {
  const t = 0.18 + 0.82 * strength;
  return `rgb(${mixChannel(FIELD_NORMAL_DARK[0], FIELD_NORMAL_LIGHT[0], t)} ${mixChannel(FIELD_NORMAL_DARK[1], FIELD_NORMAL_LIGHT[1], t)} ${mixChannel(FIELD_NORMAL_DARK[2], FIELD_NORMAL_LIGHT[2], t)})`;
}

function arrowLength(glyph: GlyphClass): number {
  if (glyph.kind === "low-clip") return 6;
  if (glyph.kind === "high-clip") return 19;
  if (glyph.kind === "normal") return 7 + 11 * glyph.strength;
  return 0;
}

function drawArrow(
  context: CanvasRenderingContext2D,
  origin: Vec2,
  ux: number,
  uyScreen: number,
  length: number,
  colour: string,
  options: { outline?: boolean; cap?: boolean; width?: number } = {},
): void {
  const half = length / 2;
  const x1 = origin.x - ux * half;
  const y1 = origin.y - uyScreen * half;
  const x2 = origin.x + ux * half;
  const y2 = origin.y + uyScreen * half;
  const head = Math.max(3, Math.min(6, length * 0.34));
  const nx = -uyScreen;
  const ny = ux;
  context.save();
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.lineWidth = options.width ?? 1.45;
  context.lineCap = "round";
  context.setLineDash(options.outline ? [2.5, 2.5] : []);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(x2, y2);
  context.lineTo(x2 - ux * head + nx * head * 0.58, y2 - uyScreen * head + ny * head * 0.58);
  context.lineTo(x2 - ux * head - nx * head * 0.58, y2 - uyScreen * head - ny * head * 0.58);
  context.closePath();
  if (options.outline) context.stroke();
  else context.fill();
  if (options.cap) {
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(x2 + nx * 4, y2 + ny * 4);
    context.lineTo(x2 - nx * 4, y2 - ny * 4);
    context.stroke();
  }
  context.restore();
}

function drawZero(context: CanvasRenderingContext2D, point: Vec2): void {
  context.save();
  context.strokeStyle = "#d9e4e8";
  context.lineWidth = 1.35;
  context.beginPath();
  context.arc(point.x, point.y, 3.2, 0, 2 * Math.PI);
  context.moveTo(point.x - 4.5, point.y);
  context.lineTo(point.x + 4.5, point.y);
  context.moveTo(point.x, point.y - 4.5);
  context.lineTo(point.x, point.y + 4.5);
  context.stroke();
  context.restore();
}

function drawCore(
  context: CanvasRenderingContext2D,
  source: SourceCharge,
  camera: CameraTransform,
  rCore_m: number,
): void {
  const centre = worldToScreen({ x: source.x_m, y: source.y_m }, camera);
  const radius = rCore_m * camera.scale_px_per_m;
  context.save();
  context.beginPath();
  context.arc(centre.x, centre.y, radius, 0, 2 * Math.PI);
  context.clip();
  context.fillStyle = "rgba(233, 238, 239, 0.09)";
  context.fillRect(centre.x - radius, centre.y - radius, 2 * radius, 2 * radius);
  context.strokeStyle = "rgba(226, 235, 238, 0.38)";
  context.lineWidth = 1;
  for (let offset = -2 * radius; offset <= 2 * radius; offset += 7) {
    context.beginPath();
    context.moveTo(centre.x - radius + offset, centre.y + radius);
    context.lineTo(centre.x + radius + offset, centre.y - radius);
    context.stroke();
  }
  context.restore();
  context.save();
  context.strokeStyle = "rgba(233, 241, 243, 0.74)";
  context.lineWidth = 1.4;
  context.beginPath();
  context.arc(centre.x, centre.y, radius, 0, 2 * Math.PI);
  context.stroke();
  context.restore();
}

export function prepareCanvas(canvas: HTMLCanvasElement, size: Vec2, devicePixelRatio: number): CanvasRenderingContext2D | null {
  const ratio = Math.max(1, devicePixelRatio);
  const width = Math.max(1, Math.round(size.x * ratio));
  const height = Math.max(1, Math.round(size.y * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${size.x}px`;
  canvas.style.height = `${size.y}px`;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.x, size.y);
  return context;
}

/** Draw only renderer-neutral field samples and explicit source-core geometry. */
export function drawStaticField(
  context: CanvasRenderingContext2D,
  camera: CameraTransform,
  grid: FieldGrid,
  sources: readonly SourceCharge[],
  rCore_m: number,
): void {
  context.fillStyle = FIELD_BACKGROUND;
  context.fillRect(0, 0, camera.width, camera.height);
  context.fillStyle = WORLD_BACKGROUND;
  context.fillRect(camera.worldLeft_px, camera.worldTop_px, camera.worldWidth_px, camera.worldHeight_px);
  context.save();
  context.strokeStyle = "rgba(165, 190, 201, 0.12)";
  context.lineWidth = 1;
  for (let x = -2; x <= 2; x += 0.5) {
    const a = worldToScreen({ x, y: -1.5 }, camera);
    const b = worldToScreen({ x, y: 1.5 }, camera);
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
  }
  for (let y = -1.5; y <= 1.5; y += 0.5) {
    const a = worldToScreen({ x: -2, y }, camera);
    const b = worldToScreen({ x: 2, y }, camera);
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
  }
  context.restore();

  if (grid.ok) {
    for (const sample of grid.samples) {
      const point = worldToScreen({ x: sample.x_m, y: sample.y_m }, camera);
      if (sample.glyph.kind === "core") continue;
      if (sample.glyph.kind === "zero") {
        drawZero(context, point);
        continue;
      }
      if (sample.ux === null || sample.uy === null) continue;
      const strength = sample.glyph.strength;
      drawArrow(context, point, sample.ux, -sample.uy, arrowLength(sample.glyph), fieldColour(strength), {
        outline: sample.glyph.kind === "low-clip",
        cap: sample.glyph.kind === "high-clip",
      });
    }
  }
  for (const source of sources) drawCore(context, source, camera, rCore_m);
  context.save();
  context.strokeStyle = "rgba(221, 234, 238, 0.55)";
  context.lineWidth = 1.2;
  context.strokeRect(camera.worldLeft_px, camera.worldTop_px, camera.worldWidth_px, camera.worldHeight_px);
  context.restore();
}

function drawSource(context: CanvasRenderingContext2D, source: SourceCharge, camera: CameraTransform, selected: boolean): void {
  const point = worldToScreen({ x: source.x_m, y: source.y_m }, camera);
  const positive = source.q_C > 0;
  context.save();
  context.translate(point.x, point.y);
  context.fillStyle = positive ? "#f6c85f" : "#76c8d5";
  context.strokeStyle = selected ? "#ffffff" : "#092232";
  context.lineWidth = selected ? 3 : 1.5;
  context.beginPath();
  if (positive) {
    context.arc(0, 0, 11, 0, 2 * Math.PI);
  } else {
    context.moveTo(0, -12); context.lineTo(12, 0); context.lineTo(0, 12); context.lineTo(-12, 0); context.closePath();
  }
  context.fill(); context.stroke();
  context.strokeStyle = "#102631";
  context.lineWidth = 2;
  context.beginPath(); context.moveTo(-5, 0); context.lineTo(5, 0);
  if (positive) { context.moveTo(0, -5); context.lineTo(0, 5); }
  context.stroke();
  context.restore();
}

export function drawDynamicField(
  context: CanvasRenderingContext2D,
  camera: CameraTransform,
  sources: readonly SourceCharge[],
  probe: Vec2,
  probeVectors: readonly ProbeVectorGlyph[],
  selected: SelectedObject,
  particle: ParticleGlyph | null = null,
  options: DynamicLayerOptions = { showProbe: true, probeZero: false },
): void {
  if (particle?.showTrail) drawTrail(context, camera, particle);
  for (const source of sources) {
    drawSource(context, source, camera, selected?.kind === "source" && selected.id === source.id);
  }
  if (!options.showProbe) {
    if (particle) drawParticle(context, camera, particle, selected?.kind === "particle");
    return;
  }
  const probePoint = worldToScreen(probe, camera);
  for (const vector of probeVectors) {
    const length = vector.kind === "total" ? 28 + 40 * vector.strength : 18 + 22 * vector.strength;
    drawArrow(
      context,
      probePoint,
      vector.ux,
      -vector.uy,
      length,
      vector.kind === "total" ? "#ffffff" : "rgba(180, 213, 222, 0.68)",
      { outline: vector.kind === "contribution", width: vector.kind === "total" ? 2.5 : 1.25 },
    );
  }
  context.save();
  context.translate(probePoint.x, probePoint.y);
  context.strokeStyle = selected?.kind === "probe" ? "#ffffff" : "#ffdf8b";
  context.fillStyle = "rgba(8, 29, 42, 0.92)";
  context.lineWidth = selected?.kind === "probe" ? 3 : 2;
  context.beginPath(); context.arc(0, 0, 8, 0, 2 * Math.PI); context.fill(); context.stroke();
  context.beginPath(); context.moveTo(-12, 0); context.lineTo(12, 0); context.moveTo(0, -12); context.lineTo(0, 12); context.stroke();
  context.restore();  if (particle) drawParticle(context, camera, particle, selected?.kind === "particle");
}

function drawTrail(context: CanvasRenderingContext2D, camera: CameraTransform, particle: ParticleGlyph): void {
  if (particle.trailCount < 2) return;
  context.save();
  context.strokeStyle = "rgba(255, 176, 120, 0.85)";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.beginPath();
  for (let i = 0; i < particle.trailCount; i += 1) {
    const point = worldToScreen({ x: particle.trail[2 * i], y: particle.trail[2 * i + 1] }, camera);
    if (i === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  const current = worldToScreen(particle.current, camera);
  context.lineTo(current.x, current.y);
  context.stroke();
  context.restore();
}

/** Initial-position ghost, current particle with sign glyph and outline, velocity arrow. */
export function drawParticle(
  context: CanvasRenderingContext2D,
  camera: CameraTransform,
  particle: ParticleGlyph,
  selected: boolean,
): void {
  const initial = worldToScreen(particle.initial, camera);
  context.save();
  context.setLineDash([3, 3]);
  context.strokeStyle = selected ? "#ffffff" : "rgba(255, 176, 120, 0.9)";
  context.lineWidth = selected ? 2.5 : 1.5;
  context.beginPath(); context.arc(initial.x, initial.y, 9, 0, 2 * Math.PI); context.stroke();
  context.restore();

  const point = worldToScreen(particle.current, camera);
  const speed = Math.hypot(particle.velocity.x, particle.velocity.y);
  if (speed > 0 && !particle.stopped) {
    const length = 14 + 14 * Math.min(speed / 2, 1);
    const ux = particle.velocity.x / speed;
    const uy = -particle.velocity.y / speed;
    drawArrow(context, { x: point.x + ux * (length / 2 + 8), y: point.y + uy * (length / 2 + 8) }, ux, uy, length, "#ffb078", { width: 2 });
  }
  context.save();
  context.translate(point.x, point.y);
  context.fillStyle = "#ffb078";
  context.strokeStyle = particle.stopped ? "#ff5d5d" : "#102631";
  context.lineWidth = particle.stopped ? 2.5 : 1.5;
  context.beginPath();
  if (particle.positive) {
    context.arc(0, 0, 7, 0, 2 * Math.PI);
  } else {
    context.rect(-7, -7, 14, 14);
  }
  context.fill(); context.stroke();
  context.strokeStyle = "#102631";
  context.lineWidth = 1.8;
  context.beginPath(); context.moveTo(-3.5, 0); context.lineTo(3.5, 0);
  if (particle.positive) { context.moveTo(0, -3.5); context.lineTo(0, 3.5); }
  context.stroke();
  context.restore();
}
