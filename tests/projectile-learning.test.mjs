import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonVisible,
  isNearApex,
  isRaisedHeightReady,
  newGuidedSession,
  projectileLearningActivities,
  recordManipulation,
  revealNextHint,
  revealObservation,
  submitPrediction,
} from "../models/projectile-learning.ts";

const activities = projectileLearningActivities(9.80665);
const REQUIRED_STATE_KEYS = [
  "scenario", "speed", "angle", "height", "gravity", "dragFactor", "stairs",
  "showComplementary", "showEnvelope", "showAcceleration", "showDrag", "playing",
  "direction", "animationSpeed",
];

test("projectile guided activities have unique IDs and complete initial states", () => {
  assert.deepEqual(activities.map((activity) => activity.id), ["apex", "complementary", "elevated"]);
  assert.equal(new Set(activities.map((activity) => activity.id)).size, activities.length);
  for (const activity of activities) {
    assert.deepEqual(Object.keys(activity.initialState).sort(), [...REQUIRED_STATE_KEYS].sort());
    assert.equal(activity.initialState.scenario, "field");
    assert.equal(activity.initialState.dragFactor, 0);
    assert.equal(activity.initialState.playing, false);
  }
});

test("Activity 2 masks its comparison until the prediction is submitted", () => {
  const activity = activities.find(({ id }) => id === "complementary");
  const prediction = newGuidedSession("complementary");
  assert.equal(activity.initialState.showComplementary, false);
  assert.equal(comparisonVisible(prediction), false);

  const observation = submitPrediction(prediction, "same-range");
  assert.equal(observation.phase, "observe");
  assert.equal(comparisonVisible(observation), true);
});

test("Activity 3 changes only the raised-height assumption through the live model state", () => {
  const activity = activities.find(({ id }) => id === "elevated");
  assert.equal(activity.initialState.height, 0);
  assert.equal(activity.initialState.speed, 20);
  assert.equal(activity.initialState.angle, 30);
  assert.equal(activity.initialState.showComplementary, true);
  assert.equal(activity.initialState.dragFactor, 0);
  assert.equal(activity.targetHeight, 25);
  assert.equal(isRaisedHeightReady(24.5, activity.targetHeight), true);
  assert.equal(isRaisedHeightReady(24, activity.targetHeight), false);
});

test("restart and progressive helpers return predictable activity-local state", () => {
  const start = newGuidedSession("apex");
  const predicted = submitPrediction(start, "vertical-only");
  const attempted = recordManipulation(predicted);
  const hinted = revealNextHint(revealNextHint(attempted), 3);
  const observed = revealObservation(hinted);

  assert.equal(predicted.phase, "manipulate");
  assert.equal(attempted.hasManipulated, true);
  assert.equal(hinted.hintLevel, 2);
  assert.equal(observed.phase, "observe");
  assert.deepEqual(newGuidedSession("apex"), start);
});

test("apex detection is forgiving without accepting an unrelated point in the flight", () => {
  assert.equal(isNearApex(1.73, 1.68, 0.45, 3.46), true);
  assert.equal(isNearApex(1.73, 0.4, 13.0, 3.46), false);
});
