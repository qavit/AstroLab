import {
  accelerationFromField,
  fieldAt,
  forceFromField,
} from "../lib/science/electrostatics/field.ts";
import { MACRO_DT_S, stepMacro } from "../lib/science/electrostatics/integrator.ts";
import type {
  ElectrostaticSystem,
  FieldInvalidReason,
  FieldResult,
  ParticleState,
  StepInvalidReason,
  StopEvent,
  Vec2,
} from "../lib/science/electrostatics/types.ts";
import { beginTrail, createTrail, finishTrail, pushTrail, type ParticleTrail } from "./electrostatic-trail.ts";
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

export type ClockStatus = "paused" | "running" | "stopped";

/** Why the clock paused itself; `null` for a user pause or a fresh runtime. */
export type AutoPauseReason = "behind-realtime" | "hidden";

/**
 * Runtime particle state; never serialized, never shared. Rebuilt from the validated initial
 * setup by `initialRuntime`. `particle.t_s` only ever grows by executed fixed physics steps.
 */
export interface ElectrostaticRuntime {
  readonly status: ClockStatus;
  readonly particle: ParticleState;
  readonly stop: StopEvent | null;
  readonly error: StepInvalidReason | null;
  /** Wall time owed to the fixed clock but not yet executed (s); 0 ≤ remainder < one macro step after a tick. */
  readonly accumulator_s: number;
  /** Executed macro steps since reset. */
  readonly macroSteps: number;
  readonly autoPause: AutoPauseReason | null;
  readonly trail: ParticleTrail;
}

/**
 * D-08 browser catch-up budget (Owner resolved 2026-09-22). Physics stays 1/960 s (D-02); a
 * playback tick executes every whole due macro step when due ≤ 64 (two 30 Hz frames of 32
 * steps). When due > 64 the tick executes zero steps and auto-pauses as behind-realtime, so
 * simulation time never jumps, no step is enlarged and no catch-up spiral starts.
 */
export const MAX_CATCHUP_MACRO_STEPS = 64;

/** Accumulator slack so exact multiples of dt are not lost to floating-point division. */
const ACCUMULATOR_EPSILON = 1e-9;

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
  return {
    status: "paused",
    particle: { x_m, y_m, vx_mps, vy_mps, t_s: 0 },
    stop: null,
    error: null,
    accumulator_s: 0,
    macroSteps: 0,
    autoPause: null,
    trail: createTrail(x_m, y_m),
  };
}

export type SetupEdit =
  | { readonly ok: true; readonly setup: ElectrostaticSetup; readonly runtime: ElectrostaticRuntime; readonly warnings: readonly ValidationIssue[] }
  | { readonly ok: false; readonly setup: ElectrostaticSetup; readonly runtime: ElectrostaticRuntime; readonly issues: readonly ValidationIssue[] };

/**
 * Atomic setup transition. The whole candidate is validated; on failure the previous setup and
 * runtime are returned untouched. Source and test-initial changes pause and reset the runtime;
 * a probe-only change keeps the particle runtime (spec 3.2, 3.3). `presetId` is provenance only
 * and does not decide a reset; applying a preset resets explicitly via `initialRuntime`.
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
    runtime: sameParticleScene(current, next) ? runtime : initialRuntime(next),
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

/**
 * Execute up to `count` fixed macro steps with the M1 `stepMacro` contract. Stops early at a
 * stop event (recorded in the trail) or a numerical error (paused, last finite state kept).
 * A stopped or errored runtime does not advance. The trail is copied once per call.
 */
export type MacroStepObserver = (runtime: ElectrostaticRuntime) => void;

export function executeMacroSteps(
  setup: ElectrostaticSetup,
  runtime: ElectrostaticRuntime,
  count: number,
  status: "paused" | "running",
  onStep?: MacroStepObserver,
): ElectrostaticRuntime {
  if (runtime.status === "stopped" || runtime.error !== null) return runtime;
  if (count <= 0) return runtime.status === status ? runtime : { ...runtime, status };
  const particle = particlePropertiesOf(setup);
  const system = systemOf(setup);
  const trail = beginTrail(runtime.trail);
  let state = runtime.particle;
  let steps = runtime.macroSteps;
  for (let i = 0; i < count; i += 1) {
    const result = stepMacro(state, particle, system, setup.integrator.dt_s);
    if (result.status === "invalid") {
      return {
        ...runtime, status: "paused", particle: state, macroSteps: steps, error: result.reason,
        accumulator_s: 0, trail: finishTrail(trail),
      };
    }
    steps += 1;
    state = result.state;
    if (result.status === "stopped") {
      pushTrail(trail, state.x_m, state.y_m, true);
      const stopped: ElectrostaticRuntime = {
        ...runtime, status: "stopped", particle: state, macroSteps: steps, stop: result.event,
        accumulator_s: 0, autoPause: null, trail: finishTrail(trail),
      };
      onStep?.(stopped);
      return stopped;
    }
    pushTrail(trail, state.x_m, state.y_m);
    onStep?.({ ...runtime, status, particle: state, macroSteps: steps, trail: finishTrail(trail) });
  }
  return { ...runtime, status, particle: state, macroSteps: steps, trail: finishTrail(trail) };
}

/**
 * One learner step = exactly one 1/960 s macro step (or less, when a continuous stop event
 * ends it early). Stepping always leaves the clock paused.
 */
export function stepRuntime(setup: ElectrostaticSetup, runtime: ElectrostaticRuntime): ElectrostaticRuntime {
  if (runtime.status === "stopped" || runtime.error !== null) return runtime;
  return executeMacroSteps(setup, { ...runtime, accumulator_s: 0, autoPause: null }, 1, "paused");
}

/** Start playback. A stopped or errored runtime must be reset first. */
export function playRuntime(runtime: ElectrostaticRuntime): ElectrostaticRuntime {
  if (runtime.status !== "paused" || runtime.error !== null) return runtime;
  return { ...runtime, status: "running", accumulator_s: 0, autoPause: null };
}

/** Pause keeps the current state; owed wall time is discarded, never converted to physics. */
export function pauseRuntime(runtime: ElectrostaticRuntime, reason: AutoPauseReason | null = null): ElectrostaticRuntime {
  if (runtime.status !== "running") return runtime;
  return { ...runtime, status: "paused", accumulator_s: 0, autoPause: reason };
}

/**
 * Pure fixed-clock transition (D-08). The browser supplies only wall-clock elapsed seconds since
 * its previous tick. due = floor((accumulator + elapsed) / dt): due ≤ 64 executes all due macro
 * steps and keeps only the sub-step remainder; due > 64, or a non-finite / negative elapsed time,
 * auto-pauses as behind-realtime with zero steps, unchanged particle state and accumulator 0.
 */
export function advancePlayback(
  setup: ElectrostaticSetup,
  runtime: ElectrostaticRuntime,
  elapsed_s: number,
  onStep?: MacroStepObserver,
): ElectrostaticRuntime {
  if (runtime.status !== "running") return runtime;
  if (!Number.isFinite(elapsed_s) || elapsed_s < 0) return pauseRuntime(runtime, "behind-realtime");
  const dt = setup.integrator.dt_s;
  const owed = runtime.accumulator_s + elapsed_s;
  const due = Math.floor(owed / dt + ACCUMULATOR_EPSILON);
  if (due > MAX_CATCHUP_MACRO_STEPS) return pauseRuntime(runtime, "behind-realtime");
  const next = executeMacroSteps(setup, runtime, due, "running", onStep);
  if (next.status !== "running") return next;
  return { ...next, accumulator_s: Math.max(0, owed - due * dt) };
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
  | { readonly valid: false; readonly reason: FieldInvalidReason; readonly sourceId?: string };

/** E, F = qE and a = qE/m at the particle's current position. */
export function particleReadout(setup: ElectrostaticSetup, runtime: ElectrostaticRuntime): ParticleReadout {
  const { particle } = runtime;
  const field = fieldAt({ x: particle.x_m, y: particle.y_m }, setup.sources, setup.singularity.rCore_m);
  if (!field.valid) return field.sourceId === undefined
    ? { valid: false, reason: field.reason }
    : { valid: false, reason: field.reason, sourceId: field.sourceId };
  const { q_C, mass_kg } = setup.testParticle;
  return {
    valid: true,
    field: { x: field.Ex_N_per_C, y: field.Ey_N_per_C },
    force_N: forceFromField(field.Ex_N_per_C, field.Ey_N_per_C, q_C),
    acceleration_mps2: accelerationFromField(field.Ex_N_per_C, field.Ey_N_per_C, q_C, mass_kg),
    speed_mps: Math.hypot(particle.vx_mps, particle.vy_mps),
  };
}
