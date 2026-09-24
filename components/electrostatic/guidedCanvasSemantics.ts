import type { ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { LearningState } from "../../models/electrostatic-learning.ts";

export interface CanvasSemanticLabel {
  readonly target: "source" | "particle";
  readonly sourceId?: string;
  /** TeX rendered by the shared MathJax overlay. */
  readonly text: string;
  readonly role: "charge" | "mass";
}

export interface GuidedCanvasSemantics {
  readonly labels: readonly CanvasSemanticLabel[];
}

const EMPTY_SEMANTICS: GuidedCanvasSemantics = { labels: [] };
const BASELINE_TEST_MASS_KG = 1e-8;

function equalMagnitude(sources: ElectrostaticSetup["sources"]): boolean {
  if (sources.length < 2) return true;
  const reference = Math.abs(sources[0].q_C);
  return sources.every((source) => Math.abs(Math.abs(source.q_C) - reference) <= 1e-15);
}

function signedNanoCoulombs(q_C: number): string {
  const value = q_C * 1e9;
  const magnitude = Number(Math.abs(value).toPrecision(3)).toString();
  return `${value < 0 ? "-" : "+"}${magnitude}\\,\\mathrm{nC}`;
}

/**
 * Learner-facing Canvas labels are presentation derived from the already-visible guided setup.
 * They never inspect readouts, calculate a field, or expose a result before EvidencePolicy does.
 */
export function guidedCanvasSemantics(
  learning: LearningState | null,
  setup: ElectrostaticSetup,
): GuidedCanvasSemantics {
  if (learning === null) return EMPTY_SEMANTICS;

  const showActualBMagnitudes = learning.activity === "B" && learning.step === "manipulate" && !equalMagnitude(setup.sources);
  const sourceLabels: CanvasSemanticLabel[] = setup.sources.map((source) => ({
    target: "source",
    sourceId: source.id,
    text: showActualBMagnitudes ? signedNanoCoulombs(source.q_C) : source.q_C > 0 ? "+Q" : "-Q",
    role: "charge",
  }));
  if (learning.activity !== "C") return { labels: sourceLabels };

  const massMultiplier = setup.testParticle.mass_kg / BASELINE_TEST_MASS_KG;
  return {
    labels: [
      ...sourceLabels,
      { target: "particle", text: setup.testParticle.q_C > 0 ? "+q" : "-q", role: "charge" },
      { target: "particle", text: Math.abs(massMultiplier - 2) < 1e-9 ? "2m" : "m", role: "mass" },
    ],
  };
}
