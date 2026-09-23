import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVITY_SETUPS, startActivity } from "../models/electrostatic-learning.ts";
import { guidedCanvasSemantics } from "../components/electrostatic/guidedCanvasSemantics.ts";

const labels = (state, setup) => guidedCanvasSemantics(state, setup).labels.map((label) => `${label.target}:${label.text}`);

test("guided source labels expose only the visible charge sign for Tasks A and B", () => {
  assert.deepEqual(labels(startActivity("A"), ACTIVITY_SETUPS.A), ["source:+Q", "source:+Q"]);
  assert.deepEqual(labels(startActivity("B"), ACTIVITY_SETUPS.B), ["source:+Q", "source:+Q"]);
});

test("Task C Canvas labels follow its canonical charge and mass variations", () => {
  assert.deepEqual(labels(startActivity("C"), ACTIVITY_SETUPS.c1), ["source:+Q", "particle:+Q", "particle:m"]);
  assert.deepEqual(labels({ activity: "C", step: "predict", stage: "c2", predictions: {} }, ACTIVITY_SETUPS.c2), ["source:+Q", "particle:-Q", "particle:m"]);
  assert.deepEqual(labels({ activity: "C", step: "predict", stage: "c3", predictions: {} }, ACTIVITY_SETUPS.c3), ["source:+Q", "particle:+Q", "particle:2m"]);
});
