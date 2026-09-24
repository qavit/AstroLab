import type { ActivityId, LearningState } from "../../models/electrostatic-learning.ts";

export interface GuidedProgress {
  readonly current: number;
  readonly total: number;
  readonly stages: readonly string[];
}

const STAGES: Readonly<Record<ActivityId, readonly string[]>> = {
  A: ["同號雙電荷", "一正一負"],
  B: ["對稱中點", "改變電量", "四電荷情境"],
  C: ["初始加速度", "反轉測試電荷", "質量加倍", "加入初速度"],
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
    current = state.step === "transfer-predict" || state.step === "transfer-observe" || state.step === "complete" ? 2 : 1;
  } else {
    current = state.step === "predict" || state.step === "observe" ? 1
      : state.step === "manipulate" ? 2
        : 3;
  }
  const stages = STAGES[state.activity];
  return { current, total: stages.length, stages };
}

/** Explicit "n-m｜name" subtask numbering shown as the guided heading. */
export function subtaskHeading(state: LearningState): string {
  const { current, stages } = guidedProgress(state);
  const number = { A: 1, B: 2, C: 3 }[state.activity];
  return `${number}-${current}｜${stages[current - 1]}`;
}
