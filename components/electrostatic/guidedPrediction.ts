import type { Vec2 } from "../../lib/science/electrostatics/types.ts";
import type { Compass, LearningState } from "../../models/electrostatic-learning.ts";

export type PredictionAnchor = "probe" | "particle";

/**
 * A compass overlay used by a guided prompt. It normally reflects the learner's own guess; C4
 * also includes its stated upward initial velocity so the known v and predicted a stay visually
 * distinct. It never uses the Gate 5 physical vector scale or enters setup/schema/share state.
 */
export interface PredictionMarker {
  readonly anchor: PredictionAnchor;
  readonly compass: Compass;
  /** e.g. "v" / "a" for Activity C4, to tell two simultaneous guesses apart. */
  readonly label?: string;
}

export interface PredictionGlyphLayout {
  readonly anchor: Vec2;
  readonly displacement: Vec2 | null;
  readonly label?: string;
  readonly colour: string;
  /** Offset is measured from the arrow tip (or zero marker) in screen pixels. */
  readonly labelOffset: Vec2;
}

export const DIRECTION_PREDICTION_COLOUR = "#b38bf5";
export const VELOCITY_PREDICTION_COLOUR = "#f1b95d";
export const ACCELERATION_PREDICTION_COLOUR = "#68c9dc";

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

function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }

function staggeredAnchor(anchor: Vec2, displacement: Vec2 | null, side: -1 | 1): Vec2 {
  if (displacement === null) return { x: anchor.x, y: anchor.y + side * 5 };
  const length = Math.hypot(displacement.x, displacement.y);
  if (length < 1e-9) return anchor;
  // A small perpendicular stagger keeps collinear v/a arrows separately legible without
  // changing the direction each learner selected.
  return add(anchor, { x: (-displacement.y / length) * side * 5, y: (displacement.x / length) * side * 5 });
}

function motionLabelOffset(displacement: Vec2 | null, side: -1 | 1): Vec2 {
  if (displacement === null) return { x: 18, y: side * 13 };
  const length = Math.hypot(displacement.x, displacement.y);
  if (length < 1e-9) return { x: 18, y: side * 13 };
  const tangent = { x: displacement.x / length, y: displacement.y / length };
  const normal = { x: -tangent.y, y: tangent.x };
  // Put the symbol beyond the arrowhead, then stagger it across the arrow axis. A fixed +x
  // offset moved a west-pointing label back onto its own arrow, which is the overlap this avoids.
  return { x: tangent.x * 14 + normal.x * side * 13, y: tangent.y * 14 + normal.y * side * 13 };
}

export function predictionLabelPoint(glyph: PredictionGlyphLayout): Vec2 {
  const end = glyph.displacement === null ? glyph.anchor : add(glyph.anchor, glyph.displacement);
  return add(end, glyph.labelOffset);
}

/**
 * Direction-only learner predictions remain distinct from model evidence. When C4 has both v
 * and a, their arrow tails are staggered and their labels get opposite vertical anchors, so even
 * identical, opposite, or near-collinear choices do not collapse into one label.
 */
export function layoutPredictionMarkers(
  markers: readonly PredictionMarker[],
  anchors: readonly Vec2[],
  length_px: number,
): readonly PredictionGlyphLayout[] {
  const pairedMotion = markers.length === 2 && markers.some((marker) => marker.label === "v") && markers.some((marker) => marker.label === "a");
  return markers.map((marker, index) => {
    const displacement = predictionDisplacement(marker.compass, length_px);
    const isVelocity = marker.label === "v";
    const isAcceleration = marker.label === "a";
    return {
      anchor: pairedMotion && (isVelocity || isAcceleration) ? staggeredAnchor(anchors[index], displacement, isVelocity ? -1 : 1) : anchors[index],
      displacement,
      label: marker.label,
      colour: isVelocity ? VELOCITY_PREDICTION_COLOUR : isAcceleration ? ACCELERATION_PREDICTION_COLOUR : DIRECTION_PREDICTION_COLOUR,
      labelOffset: isVelocity ? motionLabelOffset(displacement, -1)
        : isAcceleration ? motionLabelOffset(displacement, 1)
          : { x: 7, y: 0 },
    };
  });
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
        { anchor: "particle", compass: "N", label: "v" },
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
