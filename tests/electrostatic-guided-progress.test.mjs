import assert from "node:assert/strict";
import test from "node:test";

import { guidedProgress } from "../components/electrostatic/guidedProgress.ts";

const direction = { direction: "S", reason: "components" };
const explanationA = { x: "cancel", y: "add", revise: "kept" };

test("Task A progress treats workflow and evidence reveals as part of the same scenario", () => {
  const states = [
    [{ activity: "A", step: "predict" }, 1],
    [{ activity: "A", step: "observe", prediction: direction, reveal: 1 }, 1],
    [{ activity: "A", step: "observe", prediction: direction, reveal: 2 }, 1],
    [{ activity: "A", step: "observe", prediction: direction, reveal: 3 }, 1],
    [{ activity: "A", step: "explain", prediction: direction }, 1],
    [{ activity: "A", step: "transfer-predict", prediction: direction, explanation: explanationA }, 2],
    [{ activity: "A", step: "transfer-observe", prediction: direction, explanation: explanationA, transferPrediction: direction, reveal: 1 }, 2],
    [{ activity: "A", step: "complete", prediction: direction, transferPrediction: direction }, 2],
  ];
  for (const [state, expected] of states) assert.equal(guidedProgress(state).current, expected, state.step);
  assert.deepEqual(guidedProgress(states[0][0]), {
    current: 1,
    total: 2,
    stages: ["同號雙電荷", "一正一負"],
  });
});

test("Task B progress exposes three neutral learner scenarios without leaking the result", () => {
  const states = [
    [{ activity: "B", step: "predict" }, 1],
    [{ activity: "B", step: "observe", prediction: "zero", reveal: 1 }, 1],
    [{ activity: "B", step: "observe", prediction: "zero", reveal: 2 }, 1],
    [{ activity: "B", step: "manipulate", prediction: "zero" }, 2],
    [{ activity: "B", step: "transfer-predict", prediction: "zero", explanation: "toward-smaller" }, 3],
    [{ activity: "B", step: "transfer-observe", prediction: "zero", explanation: "toward-smaller", transferPrediction: "zero", reveal: 1 }, 3],
    [{ activity: "B", step: "complete", prediction: "zero", transferPrediction: "zero" }, 3],
  ];
  for (const [state, expected] of states) assert.equal(guidedProgress(state).current, expected, state.step);
  const progress = guidedProgress(states[0][0]);
  assert.equal(progress.total, 3);
  assert.deepEqual(progress.stages, ["對稱中點", "改變電量", "四電荷情境"]);
  assert.equal(progress.stages.join(" ").includes("零場"), false);
});

test("Task C prediction and result remain in the same four mini-problem stages", () => {
  for (let index = 1; index <= 4; index += 1) {
    const stage = `c${index}`;
    assert.equal(guidedProgress({ activity: "C", step: "predict", stage, predictions: {} }).current, index);
    assert.equal(guidedProgress({ activity: "C", step: "observe", stage, predictions: {} }).current, index);
  }
  assert.deepEqual(guidedProgress({ activity: "C", step: "complete", predictions: {} }), {
    current: 4,
    total: 4,
    stages: ["初始加速度", "反轉測試電荷", "質量加倍", "加入初速度"],
  });
});
