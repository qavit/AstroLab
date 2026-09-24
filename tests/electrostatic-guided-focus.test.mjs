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

/* Gate 9.2: hierarchy and evidence flow. */
import { subtaskHeading } from "../components/electrostatic/guidedProgress.ts";
import { ACTIVITY_SETUPS, activitySetup, evidencePolicy } from "../models/electrostatic-learning.ts";
import { probeReadout } from "../models/electrostatic.ts";

test("guided heading names the current subtask as n-m｜name", () => {
  assert.equal(subtaskHeading({ activity: "A", step: "predict" }), "1-1｜同號雙電荷");
  assert.equal(subtaskHeading({ activity: "A", step: "transfer-predict", prediction: pred, explanation: {} }), "1-2｜一正一負");
  assert.equal(subtaskHeading({ activity: "B", step: "manipulate", prediction: "zero" }), "2-2｜改變電量");
  assert.equal(subtaskHeading({ activity: "B", step: "transfer-observe", prediction: "zero", explanation: "x", transferPrediction: "zero", reveal: 1 }), "2-3｜四電荷情境");
  assert.equal(subtaskHeading({ activity: "C", step: "predict", stage: "c2", predictions: {} }), "3-2｜反轉測試電荷");
  assert.equal(subtaskHeading({ activity: "C", step: "observe", stage: "c4", predictions: {} }), "3-4｜加入初速度");
});

test("Task 1 component reveal never turns on the background field", () => {
  for (const step of ["observe", "transfer-observe"]) {
    for (const reveal of [1, 2, 3]) {
      const policy = evidencePolicy(A(step, { reveal }));
      assert.equal(policy.globalField, false, `${step} reveal ${reveal}`);
      assert.equal(policy.probeComponents, reveal >= 3);
    }
  }
  const explain = evidencePolicy(A("explain"));
  assert.equal(explain.globalField, false);
  assert.equal(explain.probeComponents, true);
});

test("Task 2-2 starts with broken symmetry: nonzero midpoint field", () => {
  const setup = activitySetup({ activity: "B", step: "manipulate", prediction: "zero" });
  assert.equal(setup, ACTIVITY_SETUPS["B-manipulate"]);
  assert.deepEqual(setup.sources.map((s) => s.q_C), [3e-9, 5e-9]);
  assert.deepEqual([setup.probe.x_m, setup.probe.y_m], [0, 0]);
  const field = probeReadout(setup);
  assert.equal(field.valid, true);
  assert.equal(field.isZero, false);
  assert.equal(evidencePolicy({ activity: "B", step: "manipulate", prediction: "zero" }).sourceMagnitudeId, "s2");
});

test("two-option groups use two columns and Task 3-4 avoids the generic E/F/a prompt", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [css, guided] = await Promise.all([
    read("../components/electrostatic/ElectrostaticFieldLab.module.css"),
    read("../components/electrostatic/GuidedActivities.tsx"),
  ]);
  assert.match(css, /\.choiceGrid\[data-count="2"\] \{ grid-template-columns: repeat\(2/);
  assert.match(guided, /data-count=\{props\.options\.length\}/);
  const c4 = guided.slice(guided.indexOf('if (stage === "c4") {'), guided.indexOf("const CObservePrompt") > 0 ? guided.length : undefined);
  assert.doesNotMatch(c4.split("return (")[1] ?? "", /比較 E、F、a|ParticleReadoutLink/);
});
