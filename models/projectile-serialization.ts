import { initialProjectileState, PROJECTILE_PRESETS, SPEED_RANGE, type ProjectileState } from "./projectile.ts";

// Local contract; no dependency on Electrostatics setup/runtime ontology or React.
export type ProjectileVisibility = { trajectory: boolean; velocity: boolean; components: boolean; guides: boolean; grid: boolean; labels: boolean; markers: boolean };
export type ProjectileShareInput = string | readonly string[] | undefined;
const DEFAULT_LAYERS: ProjectileVisibility = { trajectory: true, velocity: true, components: true, guides: true, grid: true, labels: true, markers: true };
const FLAGS = ["showComplementary", "showEnvelope", "showAcceleration", "showDrag"] as const;
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function inRange(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
export function decodeProjectileShare(encoded: ProjectileShareInput) {
  const fallback = { state: initialProjectileState(), layers: { ...DEFAULT_LAYERS }, preset: null as string | null, error: null as string | null };
  if (encoded === undefined) return fallback;
  const fail = () => ({ ...fallback, state: { ...fallback.state, playing: false }, error: "分享設定無法讀取，已載入預設拋射。" });
  if (typeof encoded !== "string" || encoded.length > 2000) return fail();
  try {
    const data: unknown = JSON.parse(encoded);
    if (!record(data) || data.v !== 1 || data.mode !== "free" || !record(data.launch) || !record(data.layers) || !record(data.comparisons) || !record(data.stairs)) return fail();
    const launch = data.launch;
    if (launch.scenario !== "field" && launch.scenario !== "staircase") return fail();
    const bounds = SPEED_RANGE[launch.scenario];
    if (launch.x !== 0 || !inRange(launch.height, 0, 60) || !inRange(launch.speed, bounds.min, bounds.max) || !inRange(launch.angle, -20, 90) || !inRange(launch.gravity, 0.1, 30) || !inRange(launch.dragFactor, 0, 0.2)) return fail();
    const stairs = data.stairs;
    if (!inRange(stairs.width, 0.15, 0.6) || !inRange(stairs.rise, 0.08, 0.35) || stairs.count !== 24) return fail();
    const layers = { ...DEFAULT_LAYERS };
    for (const key of Object.keys(layers) as (keyof ProjectileVisibility)[]) {
      if (typeof data.layers[key] !== "boolean") return fail();
      layers[key] = data.layers[key];
    }
    const state = { ...initialProjectileState(), scenario: launch.scenario, height: launch.height, speed: launch.speed, angle: launch.angle, gravity: launch.gravity, dragFactor: launch.dragFactor, stairs: { width: stairs.width, rise: stairs.rise, count: 24 }, playing: false };
    for (const key of FLAGS) {
      if (typeof data.comparisons[key] !== "boolean") return fail();
      state[key] = data.comparisons[key];
    }
    const preset = typeof data.preset === "string" && Object.hasOwn(PROJECTILE_PRESETS, data.preset) ? data.preset : null;
    return { state: state as ProjectileState, layers, preset, error: null };
  } catch { return fail(); }
}
export function encodeProjectileShare(state: ProjectileState, layers: ProjectileVisibility, preset: string | null = null): string {
  const encoded = JSON.stringify({ v: 1, mode: "free", launch: { x: 0, height: state.height, speed: state.speed, angle: state.angle, gravity: state.gravity, dragFactor: state.dragFactor, scenario: state.scenario }, stairs: state.stairs, comparisons: Object.fromEntries(FLAGS.map((key) => [key, state[key]])), layers, preset });
  if (decodeProjectileShare(encoded).error) throw new Error("目前設定無法分享。");
  return encoded;
}
