import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { guidedFocusFor } from "../components/electrostatic/guidedFocus.ts";

const A = (step, extra = {}) => ({ activity: "A", step, ...extra });
const pred = { direction: "N", reason: "other" };

test("focus target moves with the guided step: canvas first, then readout", () => {
  assert.equal(guidedFocusFor(A("observe", { prediction: pred, reveal: 1 })).target, "probe-on-canvas");
  assert.equal(guidedFocusFor(A("observe", { prediction: pred, reveal: 2 })).target, "probe-on-canvas");
  assert.equal(guidedFocusFor(A("observe", { prediction: pred, reveal: 3 })).target, "probe-readout");
  assert.equal(guidedFocusFor({ activity: "C", step: "observe", stage: "c1", predictions: {} }).target, "particle-readout");
  assert.equal(guidedFocusFor({ activity: "C", step: "observe", stage: "c4", predictions: {} }).target, "time-controls");
});

test("focus key changes only when the observation step changes", () => {
  const one = guidedFocusFor({ activity: "B", step: "observe", prediction: "zero", reveal: 1 });
  const two = guidedFocusFor({ activity: "B", step: "observe", prediction: "zero", reveal: 2 });
  assert.notEqual(one.key, two.key);
  assert.equal(one.key, guidedFocusFor({ activity: "B", step: "observe", prediction: "zero", reveal: 1 }).key);
  assert.match(one.instruction, /各自造成的電場方向/);
  assert.match(two.instruction, /相加後/);
});

test("Activity B manipulation names the goal and the live |E| quantity", () => {
  const focus = guidedFocusFor({ activity: "B", step: "manipulate", prediction: "zero" });
  assert.equal(focus.target, "probe-on-canvas");
  assert.equal(focus.canvasAnchor, "probe");
  assert.match(focus.instruction, /拖曳測量點/);
  assert.match(focus.instruction, /\|E\|/);
});

test("prediction-step instructions never leak the answer", () => {
  const states = [
    A("predict"), A("transfer-predict", { prediction: pred, explanation: {} }),
    { activity: "B", step: "predict" }, { activity: "B", step: "transfer-predict", prediction: "zero", explanation: "stays-midpoint" },
    { activity: "C", step: "predict", stage: "c1", predictions: {} }, { activity: "C", step: "predict", stage: "c2", predictions: {} },
    { activity: "C", step: "predict", stage: "c3", predictions: {} }, { activity: "C", step: "predict", stage: "c4", predictions: {} },
  ];
  for (const state of states) {
    const { instruction, target } = guidedFocusFor(state);
    assert.equal(target, "task");
    assert.doesNotMatch(instruction, /零場|抵消|相加|向左|向右|反向|不變|減半|加倍/, instruction);
  }
});

test("persistent focus markers and the live |E| hero are wired into the views", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [canvas, guided, lab] = await Promise.all([
    read("../components/electrostatic/FieldCanvas.tsx"),
    read("../components/electrostatic/GuidedActivities.tsx"),
    read("../components/ElectrostaticFieldLab.tsx"),
  ]);
  assert.match(canvas, /guided-focus-halo/);
  assert.match(guided, /data-testid="guided-focus"/);
  assert.match(guided, /guided-live-e/);
  assert.match(lab, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.doesNotMatch(lab, /schema v1/);
});
