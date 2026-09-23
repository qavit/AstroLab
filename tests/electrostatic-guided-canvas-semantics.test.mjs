import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVITY_SETUPS, startActivity } from "../models/electrostatic-learning.ts";
import { guidedCanvasSemantics } from "../components/electrostatic/guidedCanvasSemantics.ts";

const labels = (state, setup) => guidedCanvasSemantics(state, setup).labels.map((label) => `${label.target}:${label.text}`);

test("guided source labels expose only the visible charge sign for Tasks A and B", () => {
  assert.deepEqual(labels(startActivity("A"), ACTIVITY_SETUPS.A), ["source:+Q", "source:+Q"]);
  assert.deepEqual(labels({ activity: "A", step: "transfer-predict", prediction: { direction: "S", reason: "symmetry" }, explanation: { x: "cancel", y: "add", revise: "kept" } }, ACTIVITY_SETUPS["A-transfer"]), ["source:+Q", "source:-Q"]);
  assert.deepEqual(labels(startActivity("B"), ACTIVITY_SETUPS.B), ["source:+Q", "source:+Q"]);
});

test("Task C Canvas labels follow its canonical charge and mass variations", () => {
  assert.deepEqual(labels(startActivity("C"), ACTIVITY_SETUPS.c1), ["source:+Q", "particle:+q", "particle:m"]);
  assert.deepEqual(labels({ activity: "C", step: "predict", stage: "c2", predictions: {} }, ACTIVITY_SETUPS.c2), ["source:+Q", "particle:-q", "particle:m"]);
  assert.deepEqual(labels({ activity: "C", step: "predict", stage: "c3", predictions: {} }, ACTIVITY_SETUPS.c3), ["source:+Q", "particle:+q", "particle:2m"]);
  assert.deepEqual(labels({ activity: "C", step: "predict", stage: "c4", predictions: {} }, ACTIVITY_SETUPS.c4), ["source:+Q", "particle:+q", "particle:m"]);
});

test("Task B uses symbolic Q only while manipulate-stage source magnitudes remain equal", () => {
  const state = { activity: "B", step: "manipulate", prediction: "zero" };
  assert.deepEqual(labels(state, ACTIVITY_SETUPS.B), ["source:+Q", "source:+Q"]);
  const unequal = {
    ...ACTIVITY_SETUPS.B,
    sources: [ACTIVITY_SETUPS.B.sources[0], { ...ACTIVITY_SETUPS.B.sources[1], q_C: 5e-9 }],
  };
  assert.deepEqual(labels(state, unequal), ["source:+3\\,\\mathrm{nC}", "source:+5\\,\\mathrm{nC}"]);
});
