import assert from "node:assert/strict";
import test from "node:test";

import { guidedProgress } from "../components/electrostatic/guidedProgress.ts";

const direction = { direction: "S", reason: "components" };
const explanationA = { x: "cancel", y: "add", revise: "kept" };

test("Task A progress groups every evidence reveal inside one learner stage", () => {
  const states = [
    [{ activity: "A", step: "predict" }, 1],
    [{ activity: "A", step: "observe", prediction: direction, reveal: 1 }, 2],
    [{ activity: "A", step: "observe", prediction: direction, reveal: 2 }, 2],
    [{ activity: "A", step: "observe", prediction: direction, reveal: 3 }, 2],
    [{ activity: "A", step: "explain", prediction: direction }, 3],
    [{ activity: "A", step: "transfer-predict", prediction: direction, explanation: explanationA }, 4],
    [{ activity: "A", step: "transfer-observe", prediction: direction, explanation: explanationA, transferPrediction: direction, reveal: 1 }, 4],
    [{ activity: "A", step: "complete", prediction: direction, transferPrediction: direction }, 4],
  ];
  for (const [state, expected] of states) assert.equal(guidedProgress(state).current, expected, state.step);
  assert.deepEqual(guidedProgress(states[0][0]), {
    current: 1,
    total: 4,
    stages: ["先預測", "看證據", "解釋原因", "換個情境再試"],
  });
});

test("Task B progress keeps result feedback in the transfer learning stage", () => {
  const states = [
    [{ activity: "B", step: "predict" }, 1],
    [{ activity: "B", step: "observe", prediction: "zero", reveal: 1 }, 2],
    [{ activity: "B", step: "observe", prediction: "zero", reveal: 2 }, 2],
    [{ activity: "B", step: "manipulate", prediction: "zero" }, 3],
    [{ activity: "B", step: "transfer-predict", prediction: "zero", explanation: "toward-smaller" }, 4],
    [{ activity: "B", step: "transfer-observe", prediction: "zero", explanation: "toward-smaller", transferPrediction: "zero", reveal: 1 }, 4],
    [{ activity: "B", step: "complete", prediction: "zero", transferPrediction: "zero" }, 4],
  ];
  for (const [state, expected] of states) assert.equal(guidedProgress(state).current, expected, state.step);
  const progress = guidedProgress(states[0][0]);
  assert.equal(progress.total, 4);
  assert.deepEqual(progress.stages, ["先預測", "看證據", "動手找規律", "換個情境再試"]);
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
    stages: ["初始加速度", "反轉 q", "質量加倍", "加入初速度"],
  });
});
