import type { ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { LearningState } from "../../models/electrostatic-learning.ts";

export interface CanvasSemanticLabel {
  readonly target: "source" | "particle";
  readonly sourceId?: string;
  readonly text: "+Q" | "-Q" | "m" | "2m";
  readonly role: "charge" | "mass";
}

export interface GuidedCanvasSemantics {
  readonly labels: readonly CanvasSemanticLabel[];
}

const EMPTY_SEMANTICS: GuidedCanvasSemantics = { labels: [] };
const BASELINE_TEST_MASS_KG = 1e-8;

/**
 * Learner-facing Canvas labels are presentation derived from the already-visible guided setup.
 * They never inspect readouts, calculate a field, or expose a result before EvidencePolicy does.
 */
export function guidedCanvasSemantics(
  learning: LearningState | null,
  setup: ElectrostaticSetup,
): GuidedCanvasSemantics {
  if (learning === null) return EMPTY_SEMANTICS;

  const sourceLabels: CanvasSemanticLabel[] = setup.sources.map((source) => ({
    target: "source",
    sourceId: source.id,
    text: source.q_C > 0 ? "+Q" : "-Q",
    role: "charge",
  }));
  if (learning.activity !== "C") return { labels: sourceLabels };

  const massMultiplier = setup.testParticle.mass_kg / BASELINE_TEST_MASS_KG;
  return {
    labels: [
      ...sourceLabels,
      { target: "particle", text: setup.testParticle.q_C > 0 ? "+Q" : "-Q", role: "charge" },
      { target: "particle", text: Math.abs(massMultiplier - 2) < 1e-9 ? "2m" : "m", role: "mass" },
    ],
  };
}
