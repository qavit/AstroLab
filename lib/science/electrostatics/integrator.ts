import { COULOMB_K, accelerationFromField, fieldAt, orderSources } from "./field.ts";
import { firstSegmentEvent, pointOnSegment } from "./events.ts";
import type {
  ElectrostaticSystem,
  ParticleProperties,
  ParticleState,
  StepInvalidReason,
  StopEvent,
  Vec2,
} from "./types.ts";

/** Fixed macro timestep (D-02). One learner "step" is exactly one macro step. */
export const MACRO_DT_S = 1 / 960;

/** Deterministic bounded substep counts, tried smallest first (D-02). */
export const SUBSTEP_OPTIONS = [1, 2, 4] as const;
export type SubstepCount = (typeof SUBSTEP_OPTIONS)[number];

/** Target of (|v|h + ½|a|h²) / core clearance for one substep (D-02). */
export const STEP_CLEARANCE_TARGET = 0.02;

/** Floor on the clearance denominator; only reachable on the core boundary itself. */
const MIN_CLEARANCE_M = 1e-12;

export type MacroStepResult =
  | {
      readonly status: "advanced";
      readonly state: ParticleState;
      readonly substeps: SubstepCount;
    }
  | {
      readonly status: "stopped";
      /** State at the first intersection; the particle never enters the core. */
      readonly state: ParticleState;
      readonly substeps: SubstepCount;
      readonly event: StopEvent;
    }
  | {
      readonly status: "invalid";
      /** The last finite state, unchanged. */
      readonly state: ParticleState;
      readonly reason: StepInvalidReason;
    };

function isFiniteState(state: ParticleState): boolean {
  return (
    Number.isFinite(state.x_m) &&
    Number.isFinite(state.y_m) &&
    Number.isFinite(state.vx_mps) &&
    Number.isFinite(state.vy_mps) &&
    Number.isFinite(state.t_s)
  );
}

function inDomain(point: Vec2, system: ElectrostaticSystem): boolean {
  const { domain } = system;
  return point.x >= domain.xmin && point.x <= domain.xmax && point.y >= domain.ymin && point.y <= domain.ymax;
}

/** Acceleration at `point`, or the reason the model is undefined there. */
export function particleAcceleration(
  point: Vec2,
  particle: ParticleProperties,
  system: ElectrostaticSystem,
): { ok: true; a: Vec2 } | { ok: false; reason: StepInvalidReason } {
  const field = fieldAt(point, system.sources, system.rCore_m);
  if (!field.valid) return { ok: false, reason: field.reason };
  const a = accelerationFromField(field.Ex_N_per_C, field.Ey_N_per_C, particle.q_C, particle.mass_kg);
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: "numerical-error" };
  return { ok: true, a };
}

/** Clearance from `point` to the nearest excluded-core boundary. */
export function coreClearance(point: Vec2, system: ElectrostaticSystem): number {
  let nearest = Infinity;
  for (const source of system.sources) {
    nearest = Math.min(nearest, Math.hypot(point.x - source.x_m, point.y - source.y_m));
  }
  return nearest - system.rCore_m;
}

/** Smallest n ∈ {1, 2, 4} with (|v|h + ½|a|h²)/clearance ≤ 0.02, h = macroDt/n; otherwise 4. */
export function chooseSubsteps(
  state: ParticleState,
  a: Vec2,
  system: ElectrostaticSystem,
  macroDt_s: number = MACRO_DT_S,
): SubstepCount {
  const clearance = Math.max(coreClearance({ x: state.x_m, y: state.y_m }, system), MIN_CLEARANCE_M);
  const speed = Math.hypot(state.vx_mps, state.vy_mps);
  const accel = Math.hypot(a.x, a.y);
  for (const n of SUBSTEP_OPTIONS) {
    const h = macroDt_s / n;
    if ((speed * h + 0.5 * accel * h * h) / clearance <= STEP_CLEARANCE_TARGET) return n;
  }
  return 4;
}

/** Checks everything a step needs before it may evaluate the field. */
function preflight(
  state: ParticleState,
  particle: ParticleProperties,
  system: ElectrostaticSystem,
): StepInvalidReason | null {
  if (!isFiniteState(state)) return "non-finite-input";
  if (
    !Number.isFinite(particle.q_C) ||
    !Number.isFinite(particle.mass_kg) ||
    particle.mass_kg <= 0
  ) {
    return "invalid-particle";
  }
  if (system.sources.length === 0) return "no-sources";
  if (!inDomain({ x: state.x_m, y: state.y_m }, system)) return "outside-domain";
  return null;
}

type SubstepOutcome =
  | { kind: "advanced"; state: ParticleState; a: Vec2 }
  | { kind: "stopped"; state: ParticleState; event: StopEvent }
  | { kind: "invalid"; reason: StepInvalidReason };

/**
 * One velocity Verlet substep of length h with continuous first-intersection detection:
 *   r' = r + v h + ½ a h²; if r → r' crosses a core or the domain edge, stop at the crossing;
 *   otherwise a' = (q/m) E(r'), v' = v + ½ (a + a') h.
 * At a stop the velocity is advanced linearly with the start acceleration to the crossing.
 */
function verletSubstep(
  state: ParticleState,
  a0: Vec2,
  h: number,
  particle: ParticleProperties,
  system: ElectrostaticSystem,
): SubstepOutcome {
  const start = { x: state.x_m, y: state.y_m };
  const trial = {
    x: state.x_m + state.vx_mps * h + 0.5 * a0.x * h * h,
    y: state.y_m + state.vy_mps * h + 0.5 * a0.y * h * h,
  };
  if (!Number.isFinite(trial.x) || !Number.isFinite(trial.y)) return { kind: "invalid", reason: "numerical-error" };
  const event = firstSegmentEvent(start, trial, system.sources, system.domain, system.rCore_m);
  if (event !== null) {
    const hit = pointOnSegment(start, trial, event.fraction);
    const t = state.t_s + event.fraction * h;
    const stopped: ParticleState = {
      x_m: hit.x,
      y_m: hit.y,
      vx_mps: state.vx_mps + event.fraction * h * a0.x,
      vy_mps: state.vy_mps + event.fraction * h * a0.y,
      t_s: t,
    };
    if (!isFiniteState(stopped)) return { kind: "invalid", reason: "numerical-error" };
    return {
      kind: "stopped",
      state: stopped,
      event: event.sourceId === undefined
        ? { reason: event.reason, t_s: t }
        : { reason: event.reason, t_s: t, sourceId: event.sourceId },
    };
  }
  const next = particleAcceleration(trial, particle, system);
  if (!next.ok) return { kind: "invalid", reason: "numerical-error" };
  const advanced: ParticleState = {
    x_m: trial.x,
    y_m: trial.y,
    vx_mps: state.vx_mps + 0.5 * (a0.x + next.a.x) * h,
    vy_mps: state.vy_mps + 0.5 * (a0.y + next.a.y) * h,
    t_s: state.t_s + h,
  };
  if (!isFiniteState(advanced)) return { kind: "invalid", reason: "numerical-error" };
  return { kind: "advanced", state: advanced, a: next.a };
}

/**
 * Advance one fixed macro step (default 1/960 s) as 1, 2 or 4 equal Verlet substeps.
 * The substep count is chosen once from the state at the start of the macro step, so it is a
 * pure function of that finite state. `onSubstep` observes every accepted substep state.
 */
export function stepMacro(
  state: ParticleState,
  particle: ParticleProperties,
  system: ElectrostaticSystem,
  macroDt_s: number = MACRO_DT_S,
  onSubstep?: (state: ParticleState) => void,
): MacroStepResult {
  const ordered: ElectrostaticSystem = { ...system, sources: orderSources(system.sources) };
  if (!Number.isFinite(macroDt_s) || macroDt_s <= 0) return { status: "invalid", state, reason: "non-finite-input" };
  const problem = preflight(state, particle, ordered);
  if (problem !== null) return { status: "invalid", state, reason: problem };
  const start = particleAcceleration({ x: state.x_m, y: state.y_m }, particle, ordered);
  if (!start.ok) return { status: "invalid", state, reason: start.reason };

  const substeps = chooseSubsteps(state, start.a, ordered, macroDt_s);
  const h = macroDt_s / substeps;
  let current = state;
  let a = start.a;
  for (let i = 0; i < substeps; i += 1) {
    const outcome = verletSubstep(current, a, h, particle, ordered);
    if (outcome.kind === "invalid") return { status: "invalid", state, reason: outcome.reason };
    onSubstep?.(outcome.state);
    if (outcome.kind === "stopped") return { status: "stopped", state: outcome.state, substeps, event: outcome.event };
    current = outcome.state;
    a = outcome.a;
  }
  return { status: "advanced", state: current, substeps };
}

export interface IntegrationRun {
  readonly state: ParticleState;
  readonly stop: StopEvent | null;
  readonly invalid: StepInvalidReason | null;
  readonly macroSteps: number;
  readonly substepHistogram: Readonly<Record<SubstepCount, number>>;
}

/**
 * Run fixed macro steps until `duration_s` has elapsed or a stop event occurs. The last macro
 * step is shortened only when the duration is not a whole number of macro steps, matching the
 * reference harness. Runtime playback (M3) drives `stepMacro` from a fixed accumulator instead.
 */
export function integrateFor(
  initial: ParticleState,
  particle: ParticleProperties,
  system: ElectrostaticSystem,
  duration_s: number,
  onSubstep?: (state: ParticleState) => void,
): IntegrationRun {
  const histogram: Record<SubstepCount, number> = { 1: 0, 2: 0, 4: 0 };
  const tEnd = initial.t_s + duration_s;
  let state = initial;
  let macroSteps = 0;
  if (!Number.isFinite(duration_s) || duration_s < 0) {
    return { state, stop: null, invalid: "non-finite-input", macroSteps, substepHistogram: histogram };
  }
  while (state.t_s < tEnd - 1e-15) {
    const result = stepMacro(state, particle, system, Math.min(MACRO_DT_S, tEnd - state.t_s), onSubstep);
    if (result.status === "invalid") {
      return { state, stop: null, invalid: result.reason, macroSteps, substepHistogram: histogram };
    }
    macroSteps += 1;
    histogram[result.substeps] += 1;
    state = result.state;
    if (result.status === "stopped") {
      return { state, stop: result.event, invalid: null, macroSteps, substepHistogram: histogram };
    }
  }
  return { state, stop: null, invalid: null, macroSteps, substepHistogram: histogram };
}

/**
 * Diagnostic mechanical energy H = ½ m v² + Σ k q q_i / r_i and its normalisation scale
 * max(|H|, K, Σ|U_i|, 1e-30 J), used only to measure integrator drift. Not a v0.1 readout.
 */
export function mechanicalEnergy(
  state: ParticleState,
  particle: ParticleProperties,
  system: ElectrostaticSystem,
): { total_J: number; scale_J: number } {
  const kinetic = 0.5 * particle.mass_kg * (state.vx_mps ** 2 + state.vy_mps ** 2);
  let potential = 0;
  let absolute = 0;
  for (const source of orderSources(system.sources)) {
    const r = Math.hypot(state.x_m - source.x_m, state.y_m - source.y_m);
    const term = (COULOMB_K * particle.q_C * source.q_C) / r;
    potential += term;
    absolute += Math.abs(term);
  }
  const total = kinetic + potential;
  return { total_J: total, scale_J: Math.max(Math.abs(total), kinetic, absolute, 1e-30) };
}
