import { normalizedStrength, type FieldGrid, type GlyphClass } from "../../lib/science/electrostatics/sampling.ts";
import type { StrengthRaster } from "../../lib/science/electrostatics/strengthRaster.ts";
import type { SourceCharge, Vec2 } from "../../lib/science/electrostatics/types.ts";
import type { CameraTransform } from "./viewport.ts";
import { worldToScreen } from "./viewport.ts";
import type { VectorSegment } from "./vectorConstruction.ts";
import type { FieldLineScene } from "./fieldLineDisplay.ts";

/** One already-scaled contribution arrow (screen px, relative to the probe point). */
export interface ProbeVectorItem {
  readonly sourceId: string | null;
  readonly displacement: Vec2;
  /** Same sign convention as the source glyph (red = positive, teal = negative). */
  readonly positive: boolean;
  readonly emphasized: boolean;
  /** Another contribution is emphasized; this one recedes rather than competing with it. */
  readonly quiet: boolean;
}

/**
 * Everything needed to draw the vector-addition evidence at the probe point, already built
 * through one shared linear scale (see vectorConstruction.ts) — the renderer only draws what
 * it is given, it never re-scales or re-normalizes anything here.
 */
export interface ProbeVectorScene {
  readonly contributions: readonly ProbeVectorItem[];
  /** Parallelogram construction segments; only for exactly two contributions (see vectorConstruction.ts). */
  readonly chain: readonly VectorSegment[];
  /** null when the resultant isn't shown yet (gated) or is (numerically) zero. */
  readonly resultant: Vec2 | null;
}

/**
 * One learner compass guess, already resolved to a screen anchor. `displacement` is fixed-length
 * and direction-only (see guidedPrediction.ts) — never the Gate 5 physical vector scale, and
 * `null` only for a dedicated "zero" marker, never a degenerate zero-length arrow.
 */
export interface PredictionGlyph {
  readonly anchor: Vec2;
  readonly displacement: Vec2 | null;
  readonly label?: string;
  readonly colour: string;
  readonly labelOffset: Vec2;
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

const MAP_LOW = [17, 57, 75] as const;
const MAP_HIGH = [212, 164, 77] as const;

/** Restrained sequential scale: lightness rises with |E|, so it remains ordered in grayscale. */
export function fieldStrengthMapColour(magnitude_N_per_C: number): string {
  const strength = normalizedStrength(magnitude_N_per_C);
  return `rgb(${mixChannel(MAP_LOW[0], MAP_HIGH[0], strength)} ${mixChannel(MAP_LOW[1], MAP_HIGH[1], strength)} ${mixChannel(MAP_LOW[2], MAP_HIGH[2], strength)})`;
}

/**
 * Renderer padding, never data: each invalid (in-core) texel takes the mean colour of its already
 * coloured 8-neighbours, ring by ring inward. Without this, bilinear upscaling would blend the
 * transparent core texels into a dark halo around the core. The exact circular core mask in
 * `drawCore` completely covers every padded texel, and nothing here reaches readouts or the model.
 */
function padInvalidTexels(rgb: Float32Array, valid: Uint8Array, cols: number, rows: number): void {
  let remaining = 0;
  for (let index = 0; index < valid.length; index += 1) if (!valid[index]) remaining += 1;
  while (remaining > 0) {
    const filled: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        if (valid[index]) continue;
        let n = 0, r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nc = col + dx, nr = row + dy;
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
            const other = nr * cols + nc;
            if (!valid[other]) continue;
            n += 1; r += rgb[3 * other]; g += rgb[3 * other + 1]; b += rgb[3 * other + 2];
          }
        }
        if (n > 0) { rgb[3 * index] = r / n; rgb[3 * index + 1] = g / n; rgb[3 * index + 2] = b / n; filled.push(index); }
      }
    }
    if (filled.length === 0) break; // no valid texel at all (only possible for a fully-core raster)
    for (const index of filled) valid[index] = 1;
    remaining -= filled.length;
  }
}

/**
 * Colour a magnitude raster into a small offscreen canvas (one pixel per texel, Canvas row order).
 * The caller scales it to the world rectangle with smoothing; see `padInvalidTexels` for how
 * excluded-core texels are kept from haloing.
 */
export function createStrengthMapImage(raster: StrengthRaster): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const { cols, rows, magnitude_N_per_C } = raster;
  const rgb = new Float32Array(cols * rows * 3);
  const valid = new Uint8Array(cols * rows);
  for (let index = 0; index < magnitude_N_per_C.length; index += 1) {
    const magnitude = magnitude_N_per_C[index];
    if (Number.isNaN(magnitude)) continue;
    const strength = normalizedStrength(magnitude);
    for (let c = 0; c < 3; c += 1) rgb[3 * index + c] = MAP_LOW[c] + (MAP_HIGH[c] - MAP_LOW[c]) * strength;
    valid[index] = 1;
  }
  padInvalidTexels(rgb, valid, cols, rows);
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(cols, rows);
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = rows - 1 - row; // physics y is up, Canvas y is down
    for (let col = 0; col < cols; col += 1) {
      const from = sourceRow * cols + col;
      const to = (row * cols + col) * 4;
      image.data[to] = Math.round(rgb[3 * from]);
      image.data[to + 1] = Math.round(rgb[3 * from + 1]);
      image.data[to + 2] = Math.round(rgb[3 * from + 2]);
      image.data[to + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Exact screen radius of the excluded core; the renderer never derives it from raster cells. */
export function coreScreenRadius(rCore_m: number, camera: CameraTransform): number {
  return rCore_m * camera.scale_px_per_m;
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

/**
 * A true tail-to-head arrow between two screen points (unlike `drawArrow`, which centers on
 * `origin`). Used for the probe's vector-addition evidence, where each arrow's actual start and
 * end point is the thing being demonstrated.
 *
 * `casing`: contrast against the background field arrows is arrow-local (a wider dark casing
 * drawn first, the real colour on top of it), not a large dimmed circular patch behind everything.
 */
function drawArrowBetween(
  context: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  colour: string,
  options: { outline?: boolean; width?: number; headScale?: number; casing?: boolean } = {},
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.75) return;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const baseWidth = options.width ?? 1.6;
  const baseHeadScale = options.headScale ?? 0.24;
  const passes = options.casing
    ? [
        { colour: "rgba(4, 13, 20, 0.88)", width: baseWidth + 2.6, headScale: baseHeadScale * 1.2 },
        { colour, width: baseWidth, headScale: baseHeadScale },
      ]
    : [{ colour, width: baseWidth, headScale: baseHeadScale }];
  for (const pass of passes) {
    const head = Math.max(3, Math.min(8, length * pass.headScale));
    context.save();
    context.strokeStyle = pass.colour;
    context.fillStyle = pass.colour;
    context.lineWidth = pass.width;
    context.lineCap = "round";
    context.setLineDash(options.outline ? [4, 3] : []);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(to.x, to.y);
    context.lineTo(to.x - ux * head + nx * head * 0.58, to.y - uy * head + ny * head * 0.58);
    context.lineTo(to.x - ux * head - nx * head * 0.58, to.y - uy * head - ny * head * 0.58);
    context.closePath();
    if (options.outline) context.stroke();
    else context.fill();
    context.restore();
  }
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
  const radius = coreScreenRadius(rCore_m, camera);
  context.save();
  context.beginPath();
  context.arc(centre.x, centre.y, radius, 0, 2 * Math.PI);
  context.clip();
  // Opaque world background first: the exact r_core circle is the only invalid region, so no map
  // colour (or raster padding beneath it) may show through, whatever the raster resolution.
  context.fillStyle = WORLD_BACKGROUND;
  context.fillRect(centre.x - radius, centre.y - radius, 2 * radius, 2 * radius);
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

/**
 * One restrained neutral style for every field line: stroke never encodes |E| (the map and the
 * arrows do). A thin dark casing keeps it legible over the bright end of the strength map.
 */
const FIELD_LINE_STROKE = "rgba(214, 236, 244, 0.72)";
const FIELD_LINE_CASING = "rgba(6, 24, 36, 0.42)";

function drawFieldLines(context: CanvasRenderingContext2D, camera: CameraTransform, scene: FieldLineScene): void {
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const [style, width] of [[FIELD_LINE_CASING, 3], [FIELD_LINE_STROKE, 1.25]] as const) {
    context.strokeStyle = style;
    context.lineWidth = width;
    for (const line of scene.lines) {
      context.beginPath();
      line.points.forEach((point, index) => {
        const screen = worldToScreen(point, camera);
        if (index === 0) context.moveTo(screen.x, screen.y);
        else context.lineTo(screen.x, screen.y);
      });
      context.stroke();
    }
  }
  // Arrowheads follow the +E ordering of the line; physics y is up, screen y is down.
  for (const line of scene.lines) {
    for (const head of line.arrowheads) {
      const tip = worldToScreen(head.point, camera);
      const ux = head.direction.x;
      const uy = -head.direction.y;
      const length = 7;
      const half = 3.6;
      context.beginPath();
      context.moveTo(tip.x + ux * length * 0.5, tip.y + uy * length * 0.5);
      context.lineTo(tip.x - ux * length * 0.5 - uy * half, tip.y - uy * length * 0.5 + ux * half);
      context.lineTo(tip.x - ux * length * 0.5 + uy * half, tip.y - uy * length * 0.5 - ux * half);
      context.closePath();
      context.fillStyle = FIELD_LINE_STROKE;
      context.strokeStyle = FIELD_LINE_CASING;
      context.lineWidth = 1;
      context.fill();
      context.stroke();
    }
  }
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
  options: { readonly showArrows?: boolean; readonly strengthMap?: CanvasImageSource | null; readonly fieldLines?: FieldLineScene | null } = {},
): void {
  const showArrows = options.showArrows ?? true;
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

  if (options.strengthMap) {
    // Smoothed scalar raster over the world rectangle; core circles are masked exactly below.
    context.save();
    context.beginPath();
    context.rect(camera.worldLeft_px, camera.worldTop_px, camera.worldWidth_px, camera.worldHeight_px);
    context.clip();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(options.strengthMap, camera.worldLeft_px, camera.worldTop_px, camera.worldWidth_px, camera.worldHeight_px);
    context.restore();
  }

  if (options.fieldLines) {
    context.save();
    context.beginPath();
    context.rect(camera.worldLeft_px, camera.worldTop_px, camera.worldWidth_px, camera.worldHeight_px);
    context.clip();
    drawFieldLines(context, camera, options.fieldLines);
    context.restore();
  }

  if (grid.ok && showArrows) {
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

/** Source charge envelope (Gate 4A, unchanged here): magnitude is validated to 1-5 nC. */
const SOURCE_MIN_NC = 1;
const SOURCE_MAX_NC = 5;
/** Sign colour convention shared by the source glyph and its field-contribution vector. */
const POSITIVE_COLOUR = "#ef6a64";
const NEGATIVE_COLOUR = "#76c8d5";

/**
 * Magnitude reads as ring weight, never as core radius: the core stays a fixed-size circle or
 * diamond (its real hit target and on-screen position), so a bigger halo never reads as "this
 * charge is physically bigger" the way a scaled radius would.
 */
function drawSource(context: CanvasRenderingContext2D, source: SourceCharge, camera: CameraTransform, selected: boolean): void {
  const point = worldToScreen({ x: source.x_m, y: source.y_m }, camera);
  const positive = source.q_C > 0;
  const magnitude_nC = Math.abs(source.q_C) * 1e9;
  const t = Math.min(1, Math.max(0, (magnitude_nC - SOURCE_MIN_NC) / (SOURCE_MAX_NC - SOURCE_MIN_NC)));
  context.save();
  context.translate(point.x, point.y);
  context.strokeStyle = positive ? "rgba(239, 106, 100, 0.85)" : "rgba(118, 200, 213, 0.85)";
  context.lineWidth = 1 + 2.5 * t;
  context.beginPath();
  context.arc(0, 0, 16.5 + 1.5 * t, 0, 2 * Math.PI);
  context.stroke();
  context.fillStyle = positive ? POSITIVE_COLOUR : NEGATIVE_COLOUR;
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

/** Contribution vectors read by the same sign colour as their source, not one generic hue. */
function contributionColour(item: ProbeVectorItem): string {
  const [r, g, b] = item.positive ? [239, 106, 100] : [118, 200, 213];
  if (item.emphasized) return item.positive ? "#ffd4d0" : "#c9edf2";
  const alpha = item.quiet ? 0.35 : 0.95;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function drawDynamicField(
  context: CanvasRenderingContext2D,
  camera: CameraTransform,
  sources: readonly SourceCharge[],
  probe: Vec2,
  probeScene: ProbeVectorScene,
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
  const add = (delta: Vec2): Vec2 => ({ x: probePoint.x + delta.x, y: probePoint.y + delta.y });
  // Construction first, underneath the real vectors: visually secondary, dashed and translucent.
  for (const segment of probeScene.chain) {
    drawArrowBetween(context, add(segment.from), add(segment.to), "rgba(196, 226, 235, 0.4)", { outline: true, width: 1.3, headScale: 0.3 });
  }
  for (const item of probeScene.contributions) {
    const colour = contributionColour(item);
    drawArrowBetween(context, probePoint, add(item.displacement), colour, { width: item.emphasized ? 2.6 : 1.9, casing: true });
  }
  if (probeScene.resultant) {
    // Always its own colour/weight so it never reads as "the emphasized source's vector".
    drawArrowBetween(context, probePoint, add(probeScene.resultant), "#ffffff", { width: 3, casing: true });
  }
  context.save();
  context.translate(probePoint.x, probePoint.y);
  context.strokeStyle = selected?.kind === "probe" ? "#ffffff" : "#ffdf8b";
  context.fillStyle = "rgba(8, 29, 42, 0.92)";
  context.lineWidth = selected?.kind === "probe" ? 3 : 2;
  context.beginPath(); context.arc(0, 0, 8, 0, 2 * Math.PI); context.fill(); context.stroke();
  context.beginPath(); context.moveTo(-12, 0); context.lineTo(12, 0); context.moveTo(0, -12); context.lineTo(0, 12); context.stroke();
  context.restore();
  if (particle) drawParticle(context, camera, particle, selected?.kind === "particle");
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
    // Same sign grammar as source charges (circle = positive, diamond = negative); the distinct
    // orange fill (vs. source gold/teal) still reads as a different role, the test charge.
    context.moveTo(0, -8); context.lineTo(8, 0); context.lineTo(0, 8); context.lineTo(-8, 0); context.closePath();
  }
  context.fill(); context.stroke();
  context.strokeStyle = "#102631";
  context.lineWidth = 1.8;
  context.beginPath(); context.moveTo(-3.5, 0); context.lineTo(3.5, 0);
  if (particle.positive) { context.moveTo(0, -3.5); context.lineTo(0, 3.5); }
  context.stroke();
  context.restore();
}

/** Dashed learner markers stay visually separate from solid model evidence. C4 gives v and a
 * stable individual hues, while all other direction guesses retain the violet grammar. */
function drawPredictionZero(context: CanvasRenderingContext2D, point: Vec2, colour: string): void {
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = 2;
  context.setLineDash([3, 3]);
  context.beginPath();
  context.arc(point.x, point.y, 13, 0, 2 * Math.PI);
  context.stroke();
  context.restore();
}

/** Draws every learner compass guess: a dashed violet arrow (direction only), or a dedicated
 * dashed ring for "zero" — never a degenerate zero-length arrow, never model evidence styling. */
export function drawPredictionMarkers(context: CanvasRenderingContext2D, markers: readonly PredictionGlyph[]): void {
  for (const marker of markers) {
    if (marker.displacement === null) {
      drawPredictionZero(context, marker.anchor, marker.colour);
      continue;
    }
    const to = { x: marker.anchor.x + marker.displacement.x, y: marker.anchor.y + marker.displacement.y };
    drawArrowBetween(context, marker.anchor, to, marker.colour, { outline: true, width: 2.2, headScale: 0.3 });
  }
}
