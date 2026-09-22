import type { FieldResult, Vec2 } from "../lib/science/electrostatics/types.ts";
import { ELECTROSTATIC_PRESETS, type ElectrostaticSetup, type ParticleReadout } from "./electrostatic.ts";

/**
 * Electrostatic Field Studio guided learning orchestration (M4). Electrostatic-specific: each
 * activity owns its full canonical setups and an explicit state; there is no generic activity
 * engine or universal phase enum. The learning layer only decides what evidence is visible and
 * reads model outputs (`probeReadout`, `particleReadout`) to give feedback; it never computes
 * physics. Learning state is local-session only and never enters schema v1 or the URL.
 */

export type ActivityId = "A" | "B" | "C";

/** Compass bins for a 2D direction, plus an explicit zero field. */
export type Compass = "E" | "NE" | "N" | "NW" | "W" | "SW" | "S" | "SE" | "zero";
export const COMPASS_8: readonly Compass[] = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
export const COMPASS_4_ZERO: readonly Compass[] = ["W", "E", "N", "S", "zero"];

export type ReasonTag = "symmetry" | "components" | "nearest" | "sign" | "other";

export interface DirectionPrediction {
  readonly direction: Compass;
  readonly reason: ReasonTag;
}

// ---- Activity A｜合場方向 -------------------------------------------------------------

export type ComponentVerdict = "cancel" | "add";

export interface AExplanation {
  readonly x: ComponentVerdict;
  readonly y: ComponentVerdict;
  readonly revise: "kept" | "revised";
}

/** reveal: 1 contributions → 2 total vector → 3 Ex/Ey and numeric direction. */
export type ARevealLevel = 1 | 2 | 3;

export type ActivityAState =
  | { readonly activity: "A"; readonly step: "predict" }
  | { readonly activity: "A"; readonly step: "observe"; readonly prediction: DirectionPrediction; readonly reveal: ARevealLevel }
  | { readonly activity: "A"; readonly step: "explain"; readonly prediction: DirectionPrediction }
  | { readonly activity: "A"; readonly step: "transfer-predict"; readonly prediction: DirectionPrediction; readonly explanation: AExplanation }
  | {
      readonly activity: "A"; readonly step: "transfer-observe"; readonly prediction: DirectionPrediction;
      readonly explanation: AExplanation; readonly transferPrediction: DirectionPrediction; readonly reveal: ARevealLevel;
    }
  | { readonly activity: "A"; readonly step: "complete"; readonly prediction: DirectionPrediction; readonly transferPrediction: DirectionPrediction };

// ---- Activity B｜對稱與零場 -----------------------------------------------------------

export type BExplanation = "toward-smaller" | "toward-larger" | "stays-midpoint";

/** reveal: 1 two contributions → 2 total with zero marker and undefined direction. */
export type BRevealLevel = 1 | 2;

export type ActivityBState =
  | { readonly activity: "B"; readonly step: "predict" }
  | { readonly activity: "B"; readonly step: "observe"; readonly prediction: Compass; readonly reveal: BRevealLevel }
  | { readonly activity: "B"; readonly step: "manipulate"; readonly prediction: Compass }
  | { readonly activity: "B"; readonly step: "transfer-predict"; readonly prediction: Compass; readonly explanation: BExplanation }
  | {
      readonly activity: "B"; readonly step: "transfer-observe"; readonly prediction: Compass;
      readonly explanation: BExplanation; readonly transferPrediction: Compass; readonly reveal: BRevealLevel;
    }
  | { readonly activity: "B"; readonly step: "complete"; readonly prediction: Compass; readonly transferPrediction: Compass };

// ---- Activity C｜E、F、a -------------------------------------------------------------

export type Change = "same" | "reverse" | "double" | "half";

export interface CFlipPrediction { readonly E: Change; readonly F: Change; readonly a: Change }
export interface CVelocityPrediction { readonly velocity: Compass; readonly acceleration: Compass }

export type CStage = "c1" | "c2" | "c3" | "c4";

export interface CPredictions {
  readonly c1?: Compass;
  readonly c2?: CFlipPrediction;
  readonly c3?: CFlipPrediction;
  readonly c4?: CVelocityPrediction;
}

export type ActivityCState =
  | { readonly activity: "C"; readonly step: "predict"; readonly stage: CStage; readonly predictions: CPredictions }
  | { readonly activity: "C"; readonly step: "observe"; readonly stage: CStage; readonly predictions: CPredictions }
  | { readonly activity: "C"; readonly step: "complete"; readonly predictions: CPredictions };

export type LearningState = ActivityAState | ActivityBState | ActivityCState;

// ---- Canonical activity setups (Kakau-owned, validated by the same validator) --------

function base(): ElectrostaticSetup {
  return structuredClone(ELECTROSTATIC_PRESETS["single-positive"]);
}

function withScene(
  sources: ElectrostaticSetup["sources"],
  probe: Vec2,
  particle: Partial<ElectrostaticSetup["testParticle"]> = {},
): ElectrostaticSetup {
  const b = base();
  return {
    ...b,
    sources,
    probe: { x_m: probe.x, y_m: probe.y, visible: true },
    testParticle: { ...b.testParticle, x_m: -1.2, y_m: -0.9, vx_mps: 0, vy_mps: 0, ...particle },
    presetId: null,
  };
}

/** A: two unequal positive sources above the target; x partly cancels, y adds. */
const A_SETUP = withScene(
  [{ id: "s1", x_m: -0.6, y_m: 0.45, q_C: 3e-9 }, { id: "s2", x_m: 0.6, y_m: 0.45, q_C: 2e-9 }],
  { x: 0, y: 0 },
);
/** A transfer: the same geometry with s2 reversed. */
const A_TRANSFER_SETUP = withScene(
  [{ id: "s1", x_m: -0.6, y_m: 0.45, q_C: 3e-9 }, { id: "s2", x_m: 0.6, y_m: 0.45, q_C: -2e-9 }],
  { x: 0, y: 0 },
);
/** B: equal like pair, probe at the midpoint (the like-pair preset geometry). */
const B_SETUP: ElectrostaticSetup = { ...structuredClone(ELECTROSTATIC_PRESETS["like-pair"]), presetId: null };
/** B transfer: four equal positive charges at rectangle corners, probe at the centre. */
const B_TRANSFER_SETUP = withScene(
  [
    { id: "s1", x_m: -0.6, y_m: 0.45, q_C: 3e-9 },
    { id: "s2", x_m: 0.6, y_m: 0.45, q_C: 3e-9 },
    { id: "s3", x_m: -0.6, y_m: -0.45, q_C: 3e-9 },
    { id: "s4", x_m: 0.6, y_m: -0.45, q_C: 3e-9 },
  ],
  { x: 0, y: 0 },
);

const C_SOURCE = [{ id: "s1", x_m: 0, y_m: 0, q_C: 3e-9 }] as const;
const C_PROBE = { x: 0.6, y: 0.9 };
const C_SETUPS: Readonly<Record<CStage, ElectrostaticSetup>> = {
  c1: withScene([...C_SOURCE], C_PROBE, { x_m: -0.8, y_m: 0, q_C: 2.5e-10, mass_kg: 1e-8 }),
  c2: withScene([...C_SOURCE], C_PROBE, { x_m: -0.8, y_m: 0, q_C: -2.5e-10, mass_kg: 1e-8 }),
  c3: withScene([...C_SOURCE], C_PROBE, { x_m: -0.8, y_m: 0, q_C: 2.5e-10, mass_kg: 2e-8 }),
  c4: withScene([...C_SOURCE], C_PROBE, { x_m: -0.8, y_m: 0, vy_mps: 1, q_C: 2.5e-10, mass_kg: 1e-8 }),
};

export const ACTIVITY_SETUPS = {
  A: A_SETUP,
  "A-transfer": A_TRANSFER_SETUP,
  B: B_SETUP,
  "B-transfer": B_TRANSFER_SETUP,
  ...C_SETUPS,
} as const;

export function startActivity(activity: ActivityId): LearningState {
  if (activity === "A") return { activity: "A", step: "predict" };
  if (activity === "B") return { activity: "B", step: "predict" };
  return { activity: "C", step: "predict", stage: "c1", predictions: {} };
}

/** The canonical setup the activity requires in its current step. */
export function activitySetup(state: LearningState): ElectrostaticSetup {
  if (state.activity === "A") {
    return state.step === "transfer-predict" || state.step === "transfer-observe" || state.step === "complete"
      ? A_TRANSFER_SETUP : A_SETUP;
  }
  if (state.activity === "B") {
    return state.step === "transfer-predict" || state.step === "transfer-observe" || state.step === "complete"
      ? B_TRANSFER_SETUP : B_SETUP;
  }
  return C_SETUPS[state.step === "complete" ? "c4" : state.stage];
}

/** The C stage whose setup the current stage is compared against. */
export function comparisonStage(state: LearningState): CStage | null {
  if (state.activity !== "C" || state.step === "complete") return null;
  return state.stage === "c2" || state.stage === "c3" ? "c1" : null;
}

// ---- Transitions (pure; illegal transitions return the same state) ------------------

/** Commit the learner's prediction for the current predict step. A commitment is never overwritten. */
export function commitDirection(state: LearningState, prediction: DirectionPrediction): LearningState {
  if (state.activity === "A") {
    if (state.step === "predict") return { activity: "A", step: "observe", prediction, reveal: 1 };
    if (state.step === "transfer-predict") {
      return { ...state, step: "transfer-observe", transferPrediction: prediction, reveal: 1 };
    }
    return state;
  }
  if (state.activity === "B") {
    if (state.step === "predict") return { activity: "B", step: "observe", prediction: prediction.direction, reveal: 1 };
    if (state.step === "transfer-predict") {
      return { ...state, step: "transfer-observe", transferPrediction: prediction.direction, reveal: 1 };
    }
    return state;
  }
  if (state.step === "predict" && state.stage === "c1") {
    return { ...state, step: "observe", predictions: { ...state.predictions, c1: prediction.direction } };
  }
  return state;
}

export function commitChange(state: LearningState, prediction: CFlipPrediction): LearningState {
  if (state.activity !== "C" || state.step !== "predict" || (state.stage !== "c2" && state.stage !== "c3")) return state;
  if (state.predictions[state.stage] !== undefined) return state;
  return { ...state, step: "observe", predictions: { ...state.predictions, [state.stage]: prediction } };
}

export function commitVelocity(state: LearningState, prediction: CVelocityPrediction): LearningState {
  if (state.activity !== "C" || state.step !== "predict" || state.stage !== "c4") return state;
  return { ...state, step: "observe", predictions: { ...state.predictions, c4: prediction } };
}

/** Reveal the next evidence layer of an observe step. */
export function revealNext(state: LearningState): LearningState {
  if (state.activity === "A" && (state.step === "observe" || state.step === "transfer-observe") && state.reveal < 3) {
    return { ...state, reveal: (state.reveal + 1) as ARevealLevel };
  }
  if (state.activity === "B" && (state.step === "observe" || state.step === "transfer-observe") && state.reveal < 2) {
    return { ...state, reveal: 2 };
  }
  return state;
}

/** Advance past a fully revealed observe step. */
export function advance(state: LearningState): LearningState {
  if (state.activity === "A") {
    if (state.step === "observe" && state.reveal === 3) return { activity: "A", step: "explain", prediction: state.prediction };
    if (state.step === "transfer-observe" && state.reveal === 3) {
      return { activity: "A", step: "complete", prediction: state.prediction, transferPrediction: state.transferPrediction };
    }
    return state;
  }
  if (state.activity === "B") {
    if (state.step === "observe" && state.reveal === 2) return { activity: "B", step: "manipulate", prediction: state.prediction };
    if (state.step === "transfer-observe" && state.reveal === 2) {
      return { activity: "B", step: "complete", prediction: state.prediction, transferPrediction: state.transferPrediction };
    }
    return state;
  }
  if (state.step !== "observe") return state;
  const next: Record<CStage, CStage | null> = { c1: "c2", c2: "c3", c3: "c4", c4: null };
  const stage = next[state.stage];
  return stage === null
    ? { activity: "C", step: "complete", predictions: state.predictions }
    : { activity: "C", step: "predict", stage, predictions: state.predictions };
}

export function explainA(state: LearningState, explanation: AExplanation): LearningState {
  if (state.activity !== "A" || state.step !== "explain") return state;
  return { activity: "A", step: "transfer-predict", prediction: state.prediction, explanation };
}

export function explainB(state: LearningState, explanation: BExplanation): LearningState {
  if (state.activity !== "B" || state.step !== "manipulate") return state;
  return { activity: "B", step: "transfer-predict", prediction: state.prediction, explanation };
}

// ---- Evidence policy ------------------------------------------------------------------

export interface EvidencePolicy {
  readonly globalField: boolean;
  readonly probe: boolean;
  readonly probeMovable: boolean;
  readonly probeContributions: boolean;
  readonly probeTotal: boolean;
  readonly probeComponents: boolean;
  readonly sourcesMovable: boolean;
  /** Only B's manipulate step may change one source magnitude. */
  readonly sourceMagnitudeId: string | null;
  readonly particle: boolean;
  readonly particleField: boolean;
  readonly particleForce: boolean;
  readonly particleAcceleration: boolean;
  readonly trajectory: boolean;
  readonly timeControls: boolean;
  readonly setupControls: boolean;
}

export const SANDBOX_POLICY: EvidencePolicy = {
  globalField: true, probe: true, probeMovable: true, probeContributions: true, probeTotal: true,
  probeComponents: true, sourcesMovable: true, sourceMagnitudeId: null, particle: true, particleField: true,
  particleForce: true, particleAcceleration: true, trajectory: true, timeControls: true, setupControls: true,
};

const HIDDEN: EvidencePolicy = {
  globalField: false, probe: true, probeMovable: false, probeContributions: false, probeTotal: false,
  probeComponents: false, sourcesMovable: false, sourceMagnitudeId: null, particle: false, particleField: false,
  particleForce: false, particleAcceleration: false, trajectory: false, timeControls: false, setupControls: false,
};

/** Visibility only; never values. `null` learning state means sandbox. */
export function evidencePolicy(state: LearningState | null): EvidencePolicy {
  if (state === null) return SANDBOX_POLICY;
  if (state.activity === "A") {
    if (state.step === "observe" || state.step === "transfer-observe") {
      return {
        ...HIDDEN, probeMovable: true, probeContributions: true, probeTotal: state.reveal >= 2,
        probeComponents: state.reveal >= 3, globalField: state.reveal >= 3,
      };
    }
    if (state.step === "explain" || state.step === "complete") {
      return { ...HIDDEN, probeMovable: true, probeContributions: true, probeTotal: true, probeComponents: true, globalField: true };
    }
    return HIDDEN;
  }
  if (state.activity === "B") {
    if (state.step === "observe" || state.step === "transfer-observe") {
      return { ...HIDDEN, probeContributions: true, probeTotal: state.reveal >= 2, probeComponents: state.reveal >= 2, globalField: state.reveal >= 2 };
    }
    if (state.step === "manipulate") {
      return {
        ...HIDDEN, probeMovable: true, probeContributions: true, probeTotal: true, probeComponents: true,
        globalField: true, sourcesMovable: true, sourceMagnitudeId: "s2",
      };
    }
    if (state.step === "complete") {
      return { ...HIDDEN, probeMovable: true, probeContributions: true, probeTotal: true, probeComponents: true, globalField: true };
    }
    return HIDDEN;
  }
  const particleOnly = { ...HIDDEN, probe: false, particle: true };
  if (state.step === "predict") return particleOnly;
  const revealed = { ...particleOnly, particleField: true, particleForce: true, particleAcceleration: true, globalField: true };
  if (state.step === "complete" || state.stage === "c4") return { ...revealed, trajectory: true, timeControls: true };
  return revealed;
}

// ---- Feedback: classification of model outputs (no physics) ---------------------------

/** Bin a model-derived vector into eight 45° sectors; `zero` only for the model's zero field. */
export function compassOf(vector: Vec2, isZero: boolean): Compass {
  if (isZero || (vector.x === 0 && vector.y === 0)) return "zero";
  const angle = Math.atan2(vector.y, vector.x);
  const index = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS_8[index];
}

export function probeCompass(field: FieldResult): Compass | null {
  if (!field.valid) return null;
  return compassOf({ x: field.Ex_N_per_C, y: field.Ey_N_per_C }, field.isZero);
}

export function accelerationCompass(readout: ParticleReadout): Compass | null {
  if (!readout.valid) return null;
  return compassOf(readout.acceleration_mps2, false);
}

/** Per-axis verdict from the model's own contributions: opposite signs cancel, same signs add. */
export function componentVerdicts(field: FieldResult): { x: ComponentVerdict; y: ComponentVerdict } | null {
  if (!field.valid) return null;
  const verdict = (values: number[]): ComponentVerdict =>
    values.some((v) => v > 0) && values.some((v) => v < 0) ? "cancel" : "add";
  return {
    x: verdict(field.contributions.map((c) => c.Ex_N_per_C)),
    y: verdict(field.contributions.map((c) => c.Ey_N_per_C)),
  };
}

/** How a model-derived vector changed between two readouts (sign and magnitude ratio only). */
export function changeOf(before: Vec2, after: Vec2): Change | "other" {
  const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  if (eq(before.x, after.x) && eq(before.y, after.y)) return "same";
  if (eq(before.x, -after.x) && eq(before.y, -after.y)) return "reverse";
  if (eq(2 * before.x, after.x) && eq(2 * before.y, after.y)) return "double";
  if (eq(before.x, 2 * after.x) && eq(before.y, 2 * after.y)) return "half";
  return "other";
}
