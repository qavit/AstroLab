import type { Vec2 } from "../../lib/science/electrostatics/types.ts";
import type { Compass, LearningState } from "../../models/electrostatic-learning.ts";

export type PredictionAnchor = "probe" | "particle";

/**
 * A learner's own compass guess, ready to draw. Direction only — never derived from
 * `probeReadout()`/`particleReadout()`, never the Gate 5 shared physical vector scale, and never
 * part of physical setup, runtime, schema v1 or the share URL. Presentation state only.
 */
export interface PredictionMarker {
  readonly anchor: PredictionAnchor;
  readonly compass: Compass;
  /** e.g. "v" / "a" for Activity C4, to tell two simultaneous guesses apart. */
  readonly label?: string;
}

const COMPASS_ANGLE_RAD: Partial<Record<Compass, number>> = {
  E: 0, NE: Math.PI / 4, N: Math.PI / 2, NW: (3 * Math.PI) / 4,
  W: Math.PI, SW: (5 * Math.PI) / 4, S: (3 * Math.PI) / 2, SE: (7 * Math.PI) / 4,
};

/**
 * Fixed-length, direction-only screen displacement for a compass guess. `null` for "zero": the
 * caller must render a dedicated zero marker, never a degenerate zero-length arrow.
 */
export function predictionDisplacement(compass: Compass, length_px: number): Vec2 | null {
  const angle = COMPASS_ANGLE_RAD[compass];
  if (angle === undefined) return null;
  // Physics angle convention (E=0, N=90deg, y up); screen y is down, flipped once here.
  return { x: Math.cos(angle) * length_px, y: -Math.sin(angle) * length_px };
}

/**
 * The learner's already-committed guess(es), kept visible through the compare/observe steps so
 * the prediction and the revealed model evidence can sit side by side. Reads only the learner's
 * own prediction fields already stored on `LearningState` — never a model-derived value.
 */
export function committedPredictionMarkers(learning: LearningState): readonly PredictionMarker[] {
  if (learning.activity === "A") {
    if (learning.step === "observe") return [{ anchor: "probe", compass: learning.prediction.direction }];
    if (learning.step === "transfer-observe") return [{ anchor: "probe", compass: learning.transferPrediction.direction }];
    return [];
  }
  if (learning.activity === "B") {
    if (learning.step === "observe") return [{ anchor: "probe", compass: learning.prediction }];
    if (learning.step === "transfer-observe") return [{ anchor: "probe", compass: learning.transferPrediction }];
    return [];
  }
  if (learning.step === "observe") {
    if (learning.stage === "c1" && learning.predictions.c1) {
      return [{ anchor: "particle", compass: learning.predictions.c1 }];
    }
    if (learning.stage === "c4" && learning.predictions.c4) {
      return [
        { anchor: "particle", compass: learning.predictions.c4.velocity, label: "v" },
        { anchor: "particle", compass: learning.predictions.c4.acceleration, label: "a" },
      ];
    }
  }
  return [];
}

/**
 * A one-shot attention cue: which anchor just gained new evidence, and a key that changes only
 * when that happens (reveal level advancing, or a C stage entering its observe step). The Canvas
 * remounts a short, non-looping pulse whenever this key changes; `prefers-reduced-motion` skips
 * the animation entirely without hiding anything.
 */
export function attentionCueFor(learning: LearningState): { readonly anchor: PredictionAnchor; readonly key: string } | null {
  if (learning.activity === "A" && (learning.step === "observe" || learning.step === "transfer-observe")) {
    return { anchor: "probe", key: `A-${learning.step}-${learning.reveal}` };
  }
  if (learning.activity === "B" && (learning.step === "observe" || learning.step === "transfer-observe")) {
    return { anchor: "probe", key: `B-${learning.step}-${learning.reveal}` };
  }
  if (learning.activity === "C" && learning.step === "observe" && (learning.stage === "c1" || learning.stage === "c4")) {
    return { anchor: "particle", key: `C-${learning.stage}-observe` };
  }
  return null;
}
