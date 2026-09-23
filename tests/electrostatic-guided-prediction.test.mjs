import assert from "node:assert/strict";
import test from "node:test";

import { predictionDisplacement, committedPredictionMarkers } from "../components/electrostatic/guidedPrediction.ts";

test("compass directions map to a fixed-length, screen-oriented displacement", () => {
  const e = predictionDisplacement("E", 40);
  assert.ok(Math.abs(e.x - 40) < 1e-9 && Math.abs(e.y) < 1e-9);
  const n = predictionDisplacement("N", 40);
  // physics N is +y (up); screen y is down, so it must be negative here.
  assert.ok(Math.abs(n.x) < 1e-9 && Math.abs(n.y + 40) < 1e-9);
  assert.ok(Math.abs(Math.hypot(e.x, e.y) - 40) < 1e-9);
});

test("every compass length is identical regardless of direction (direction-only, no magnitude encoding)", () => {
  const lengths = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"].map((c) => Math.hypot(...Object.values(predictionDisplacement(c, 40))));
  for (const length of lengths) assert.ok(Math.abs(length - 40) < 1e-9);
});

test("zero has no displacement: the caller must draw a dedicated zero marker", () => {
  assert.equal(predictionDisplacement("zero", 40), null);
});

test("committed markers stay empty during predict (nothing committed yet)", () => {
  assert.deepEqual(committedPredictionMarkers({ activity: "A", step: "predict" }), []);
  assert.deepEqual(committedPredictionMarkers({ activity: "B", step: "predict" }), []);
  assert.deepEqual(committedPredictionMarkers({ activity: "C", step: "predict", stage: "c1", predictions: {} }), []);
});

test("A observe/transfer-observe surface the learner's own committed prediction at the probe", () => {
  const observe = { activity: "A", step: "observe", prediction: { direction: "N", reason: "other" }, reveal: 1 };
  assert.deepEqual(committedPredictionMarkers(observe), [{ anchor: "probe", compass: "N" }]);
  const transfer = {
    activity: "A", step: "transfer-observe", prediction: { direction: "N", reason: "other" },
    explanation: { x: "add", y: "add", revise: "kept" }, transferPrediction: { direction: "E", reason: "other" }, reveal: 1,
  };
  assert.deepEqual(committedPredictionMarkers(transfer), [{ anchor: "probe", compass: "E" }]);
});

test("B observe surfaces the learner's own committed compass at the probe, including zero", () => {
  const observe = { activity: "B", step: "observe", prediction: "zero", reveal: 1 };
  assert.deepEqual(committedPredictionMarkers(observe), [{ anchor: "probe", compass: "zero" }]);
});

test("C c1 observe anchors at the particle", () => {
  const observe = { activity: "C", step: "observe", stage: "c1", predictions: { c1: "W" } };
  assert.deepEqual(committedPredictionMarkers(observe), [{ anchor: "particle", compass: "W" }]);
});

test("C c4 observe surfaces both velocity and acceleration, distinctly labelled, both at the particle", () => {
  const observe = { activity: "C", step: "observe", stage: "c4", predictions: { c4: { velocity: "N", acceleration: "W" } } };
  assert.deepEqual(committedPredictionMarkers(observe), [
    { anchor: "particle", compass: "N", label: "v" },
    { anchor: "particle", compass: "W", label: "a" },
  ]);
});
