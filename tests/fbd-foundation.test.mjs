import test from "node:test";
import assert from "node:assert/strict";
import {
  directionFromDegrees,
  resolveKnownForces,
} from "../lib/science/fbd.ts";
import {
  addFbdForce,
  createFbdForce,
  deriveFbdModel,
  initialFbdState,
  removeFbdForce,
  updateFbdForce,
} from "../models/fbd.ts";

const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("qualitative forces remain valid without a magnitude", () => {
  const force = createFbdForce({
    id: "weight",
    kind: "weight",
    label: "重力",
    agent: "地球",
    direction: { x: 0, y: -5 },
  });
  assert.equal(force.magnitudeN, null);
  closeTo(force.direction.x, 0);
  closeTo(force.direction.y, -1);
});

test("partial force sums are never reported as a complete net force", () => {
  const result = resolveKnownForces([
    { magnitudeN: 10, direction: directionFromDegrees(0) },
    { magnitudeN: null, direction: directionFromDegrees(90) },
  ]);
  assert.equal(result.knownCount, 1);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.isComplete, false);
  closeTo(result.knownResultantN.x, 10);
});

test("equal and opposite known forces produce zero net force", () => {
  let state = initialFbdState();
  state = {
    ...state,
    diagram: {
      ...state.diagram,
      body: { ...state.diagram.body, massKg: 2 },
    },
  };
  state = addFbdForce(state, createFbdForce({
    id: "normal",
    kind: "normal",
    label: "正向力",
    agent: "桌面",
    magnitudeN: 20,
    direction: directionFromDegrees(90),
  }));
  state = addFbdForce(state, createFbdForce({
    id: "weight",
    kind: "weight",
    label: "重力",
    agent: "地球",
    magnitudeN: 20,
    direction: directionFromDegrees(-90),
  }));

  const model = deriveFbdModel(state);
  assert.equal(model.resolution.isComplete, true);
  closeTo(model.netForceN.x, 0);
  closeTo(model.netForceN.y, 0);
  closeTo(model.acceleration.x, 0);
  closeTo(model.acceleration.y, 0);
});

test("force edits and deletion preserve FBD-local selection semantics", () => {
  let state = addFbdForce(initialFbdState(), createFbdForce({
    id: "push",
    kind: "applied",
    label: "外力",
  }));
  assert.equal(state.selectedForceId, "push");

  state = updateFbdForce(state, "push", {
    magnitudeN: 5,
    direction: { x: 3, y: 4 },
  });
  const force = state.diagram.forces[0];
  assert.equal(force.magnitudeN, 5);
  closeTo(force.direction.x, 0.6);
  closeTo(force.direction.y, 0.8);

  state = removeFbdForce(state, "push");
  assert.equal(state.diagram.forces.length, 0);
  assert.equal(state.selectedForceId, null);
});
