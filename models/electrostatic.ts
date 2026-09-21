import {
  accelerationFromField,
  fieldAt,
  forceFromField,
} from "../lib/science/electrostatics/field.ts";
import { MACRO_DT_S, stepMacro } from "../lib/science/electrostatics/integrator.ts";
import type {
  ElectrostaticSystem,
  FieldResult,
  ParticleState,
  StepInvalidReason,
  StopEvent,
  Vec2,
} from "../lib/science/electrostatics/types.ts";
import { validateSetup } from "./electrostatic-validation.ts";
import type { ValidationIssue } from "./electrostatic-validation.ts";

/**
 * Electrostatic Field Studio model layer: canonical persisted setup (schema v1), runtime
 * particle state, preset fixtures and derived selectors. Imports `lib/science` only.
 */

export type PresetId = "single-positive" | "like-pair" | "dipole";

/** Persisted, shareable initial setup (schema v1). Canonical SI; derived values never stored. */
export interface ElectrostaticSetup {
  readonly schemaVersion: 1;
  readonly modelVersion: "electrostatic-point-charge-1";
  readonly domain: { readonly xmin: number; readonly xmax: number; readonly ymin: number; readonly ymax: number };
  readonly sources: readonly { readonly id: string; readonly x_m: number; readonly y_m: number; readonly q_C: number }[];
  readonly probe: { readonly x_m: number; readonly y_m: number; readonly visible: boolean };
  readonly testParticle: {
    readonly x_m: number;
    readonly y_m: number;
    readonly vx_mps: number;
    readonly vy_mps: number;
    readonly q_C: number;
    readonly mass_kg: number;
  };
  readonly singularity: { readonly policy: "excluded-core"; readonly rCore_m: number };
  readonly integrator: { readonly kind: "velocity-verlet-bounded"; readonly dt_s: number; readonly maxSubsteps: number };
  readonly fieldStyle: { readonly Emin_N_per_C: number; readonly Emax_N_per_C: number; readonly gridDensity: "standard" };
  readonly presetId: PresetId | null;
}

export type ClockStatus = "paused" | "stopped";

/** Runtime particle state; never serialized. Playback clock and trail arrive in M3. */
export interface ElectrostaticRuntime {
  readonly status: ClockStatus;
  readonly particle: ParticleState;
  readonly stop: StopEvent | null;
  readonly error: StepInvalidReason | null;
}

function baseSetup(): Omit<ElectrostaticSetup, "sources" | "probe" | "testParticle" | "presetId"> {
  return {
    schemaVersion: 1,
    modelVersion: "electrostatic-point-charge-1",
    domain: { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 },
    singularity: { policy: "excluded-core", rCore_m: 0.12 },
    integrator: { kind: "velocity-verlet-bounded", dt_s: MACRO_DT_S, maxSubsteps: 4 },
    fieldStyle: { Emin_N_per_C: 1, Emax_N_per_C: 5000, gridDensity: "standard" },
  };
}

/** Default test particle: 0.25 nC, 10 µg, q/m = 0.025 C/kg (D-01 recommended default). */
const DEFAULT_TEST_CHARGE_C = 2.5e-10;
const DEFAULT_TEST_MASS_KG = 1e-8;
/** Default source magnitude, 3 nC. Written as SI literals: 3 * 1e-9 is not exactly 3e-9. */
const DEFAULT_SOURCE_CHARGE_C = 3e-9;

/**
 * Preset fixtures: complete setups accepted by the same validator as any user state.
 * Geometry is Kakau's own.
 */
export const ELECTROSTATIC_PRESETS: Readonly<Record<PresetId, ElectrostaticSetup>> = {
  "single-positive": {
    ...baseSetup(),
    sources: [{ id: "s1", x_m: 0, y_m: 0, q_C: DEFAULT_SOURCE_CHARGE_C }],
    probe: { x_m: 0.6, y_m: 0.3, visible: true },
    testParticle: { x_m: -1.2, y_m: 0.4, vx_mps: 0.8, vy_mps: 0, q_C: DEFAULT_TEST_CHARGE_C, mass_kg: DEFAULT_TEST_MASS_KG },
    presetId: "single-positive",
  },
  "like-pair": {
    ...baseSetup(),
    sources: [
      { id: "s1", x_m: -0.6, y_m: 0, q_C: DEFAULT_SOURCE_CHARGE_C },
      { id: "s2", x_m: 0.6, y_m: 0, q_C: DEFAULT_SOURCE_CHARGE_C },
    ],
    probe: { x_m: 0, y_m: 0, visible: true },
    testParticle: { x_m: 0.1, y_m: -0.8, vx_mps: 0, vy_mps: 0.6, q_C: DEFAULT_TEST_CHARGE_C, mass_kg: DEFAULT_TEST_MASS_KG },
    presetId: "like-pair",
  },
  dipole: {
    ...baseSetup(),
    sources: [
      { id: "s1", x_m: -0.6, y_m: 0, q_C: DEFAULT_SOURCE_CHARGE_C },
      { id: "s2", x_m: 0.6, y_m: 0, q_C: -DEFAULT_SOURCE_CHARGE_C },
    ],
    probe: { x_m: 0, y_m: 0, visible: true },
    testParticle: { x_m: -0.4, y_m: -0.9, vx_mps: 0.5, vy_mps: 0, q_C: DEFAULT_TEST_CHARGE_C, mass_kg: DEFAULT_TEST_MASS_KG },
    presetId: "dipole",
  },
};

export const DEFAULT_PRESET: PresetId = "single-positive";

/** Science-layer view of a setup. */
export function systemOf(setup: ElectrostaticSetup): ElectrostaticSystem {
  return { sources: setup.sources, domain: setup.domain, rCore_m: setup.singularity.rCore_m };
}

export function particlePropertiesOf(setup: ElectrostaticSetup): { q_C: number; mass_kg: number } {
  return { q_C: setup.testParticle.q_C, mass_kg: setup.testParticle.mass_kg };
}

/** Runtime rebuilt from the validated initial condition: paused, t = 0, no stop reason. */
export function initialRuntime(setup: ElectrostaticSetup): ElectrostaticRuntime {
  const { x_m, y_m, vx_mps, vy_mps } = setup.testParticle;
  return { status: "paused", particle: { x_m, y_m, vx_mps, vy_mps, t_s: 0 }, stop: null, error: null };
}

export type SetupEdit =
  | { readonly ok: true; readonly setup: ElectrostaticSetup; readonly runtime: ElectrostaticRuntime; readonly warnings: readonly ValidationIssue[] }
  | { readonly ok: false; readonly setup: ElectrostaticSetup; readonly runtime: ElectrostaticRuntime; readonly issues: readonly ValidationIssue[] };

/**
 * Atomic setup transition. The whole candidate is validated; on failure the previous setup and
 * runtime are returned untouched. Source, test-initial and preset changes pause and reset the
 * runtime; a probe-only change keeps the particle runtime (spec 3.2, 3.3).
 */
export function applySetupEdit(
  current: ElectrostaticSetup,
  runtime: ElectrostaticRuntime,
  candidate: unknown,
): SetupEdit {
  const result = validateSetup(candidate);
  if (!result.ok) return { ok: false, setup: current, runtime, issues: result.issues };
  const next = result.setup;
  return {
    ok: true,
    setup: next,
    runtime: sameParticleScene(current, next) && current.presetId === next.presetId ? runtime : initialRuntime(next),
    warnings: result.warnings,
  };
}

/** True when sources and the test initial condition are unchanged (e.g. a probe-only edit). */
function sameParticleScene(a: ElectrostaticSetup, b: ElectrostaticSetup): boolean {
  const byId = (setup: ElectrostaticSetup) => new Map(setup.sources.map((s) => [s.id, s]));
  const left = byId(a);
  const right = byId(b);
  if (left.size !== right.size) return false;
  for (const [id, s] of left) {
    const t = right.get(id);
    if (!t || t.x_m !== s.x_m || t.y_m !== s.y_m || t.q_C !== s.q_C) return false;
  }
  const p = a.testParticle;
  const q = b.testParticle;
  return p.x_m === q.x_m && p.y_m === q.y_m && p.vx_mps === q.vx_mps && p.vy_mps === q.vy_mps &&
    p.q_C === q.q_C && p.mass_kg === q.mass_kg;
}

/** One learner step = one 1/960 s macro step. A stopped or errored runtime does not advance. */
export function stepRuntime(setup: ElectrostaticSetup, runtime: ElectrostaticRuntime): ElectrostaticRuntime {
  if (runtime.status === "stopped" || runtime.error !== null) return runtime;
  const result = stepMacro(runtime.particle, particlePropertiesOf(setup), systemOf(setup), setup.integrator.dt_s);
  if (result.status === "invalid") return { ...runtime, status: "paused", error: result.reason };
  if (result.status === "stopped") return { status: "stopped", particle: result.state, stop: result.event, error: null };
  return { ...runtime, particle: result.state };
}

/** Probe readout: per-source contributions, sum, components, magnitude and direction. */
export function probeReadout(setup: ElectrostaticSetup): FieldResult {
  return fieldAt({ x: setup.probe.x_m, y: setup.probe.y_m }, setup.sources, setup.singularity.rCore_m);
}

export type ParticleReadout =
  | {
      readonly valid: true;
      readonly field: Vec2;
      readonly force_N: Vec2;
      readonly acceleration_mps2: Vec2;
      readonly speed_mps: number;
    }
  | { readonly valid: false; readonly reason: string };

/** E, F = qE and a = qE/m at the particle's current position. */
export function particleReadout(setup: ElectrostaticSetup, runtime: ElectrostaticRuntime): ParticleReadout {
  const { particle } = runtime;
  const field = fieldAt({ x: particle.x_m, y: particle.y_m }, setup.sources, setup.singularity.rCore_m);
  if (!field.valid) return { valid: false, reason: field.reason };
  const { q_C, mass_kg } = setup.testParticle;
  return {
    valid: true,
    field: { x: field.Ex_N_per_C, y: field.Ey_N_per_C },
    force_N: forceFromField(field.Ex_N_per_C, field.Ey_N_per_C, q_C),
    acceleration_mps2: accelerationFromField(field.Ex_N_per_C, field.Ey_N_per_C, q_C, mass_kg),
    speed_mps: Math.hypot(particle.vx_mps, particle.vy_mps),
  };
}
