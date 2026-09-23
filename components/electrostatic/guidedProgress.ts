import type { ActivityId, LearningState } from "../../models/electrostatic-learning.ts";

export interface GuidedProgress {
  readonly current: number;
  readonly total: number;
  readonly stages: readonly string[];
}

const STAGES: Readonly<Record<ActivityId, readonly string[]>> = {
  A: ["先預測", "看證據", "解釋原因", "換個情境再試"],
  B: ["先預測", "看證據", "動手找規律", "換個情境再試"],
  C: ["初始加速度", "反轉 q", "質量加倍", "加入初速度"],
};

/**
 * The learner's conceptual place in an activity. Reveal levels and predict/observe boundaries
 * stay inside the stage that owns them; this deliberately does not mirror the reducer shape.
 */
export function guidedProgress(state: LearningState): GuidedProgress {
  let current: number;
  if (state.activity === "C") {
    current = state.step === "complete" ? 4 : Number(state.stage.slice(1));
  } else if (state.activity === "A") {
    current = state.step === "predict" ? 1
      : state.step === "observe" ? 2
        : state.step === "explain" ? 3
          : 4;
  } else {
    current = state.step === "predict" ? 1
      : state.step === "observe" ? 2
        : state.step === "manipulate" ? 3
          : 4;
  }
  const stages = STAGES[state.activity];
  return { current, total: stages.length, stages };
}
