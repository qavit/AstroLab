import test from "node:test";
import assert from "node:assert/strict";
import {
  directionFromDegrees,
  resolveKnownForces,
} from "../lib/science/fbd.ts";
import {
  addFbdAgent,
  addFbdForce,
  addFbdInteraction,
  createFbdAgent,
  createFbdForce,
  createFbdInteraction,
  deriveFbdModel,
  forceContext,
  initialFbdState,
  removeFbdForce,
  updateFbdForce,
} from "../models/fbd.ts";

const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function addAgentAndInteraction(state, {
  agentId,
  agentLabel,
  interactionId,
  kind,
  label,
}) {
  state = addFbdAgent(state, createFbdAgent({ id: agentId, label: agentLabel }));
  return addFbdInteraction(state, createFbdInteraction({
    id: interactionId,
    kind,
    sourceAgentId: agentId,
    targetSystemId: state.diagram.system.id,
    label,
  }));
}

test("qualitative forces remain valid and traceable without a magnitude", () => {
  let state = addAgentAndInteraction(initialFbdState(), {
    agentId: "earth",
    agentLabel: "地球",
    interactionId: "gravity",
    kind: "gravitational",
    label: "地球與物體的重力交互作用",
  });
  const force = createFbdForce({
    id: "weight",
    interactionId: "gravity",
    kind: "weight",
    label: "重力",
    direction: { x: 0, y: -5 },
  });
  state = addFbdForce(state, force);

  assert.equal(force.magnitudeN, null);
  closeTo(force.direction.x, 0);
  closeTo(force.direction.y, -1);
  const context = forceContext(state, "weight");
  assert.equal(context.sourceAgent.label, "地球");
  assert.equal(context.targetSystem.id, state.diagram.system.id);
  assert.equal(context.interaction.kind, "gravitational");
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
      system: { ...state.diagram.system, massKg: 2 },
    },
  };
  state = addAgentAndInteraction(state, {
    agentId: "table",
    agentLabel: "桌面",
    interactionId: "table-contact",
    kind: "contact",
    label: "桌面接觸",
  });
  state = addAgentAndInteraction(state, {
    agentId: "earth",
    agentLabel: "地球",
    interactionId: "gravity",
    kind: "gravitational",
    label: "重力交互作用",
  });
  state = addFbdForce(state, createFbdForce({
    id: "normal",
    interactionId: "table-contact",
    kind: "normal",
    label: "正向力",
    magnitudeN: 20,
    direction: directionFromDegrees(90),
  }));
  state = addFbdForce(state, createFbdForce({
    id: "weight",
    interactionId: "gravity",
    kind: "weight",
    label: "重力",
    magnitudeN: 20,
    direction: directionFromDegrees(-90),
  }));

  const model = deriveFbdModel(state);
  assert.deepEqual(model.structureIssues, []);
  assert.equal(model.resolution.isComplete, true);
  closeTo(model.netForceN.x, 0);
  closeTo(model.netForceN.y, 0);
  closeTo(model.acceleration.x, 0);
  closeTo(model.acceleration.y, 0);
});

test("force edits and deletion preserve FBD-local selection semantics", () => {
  let state = addAgentAndInteraction(initialFbdState(), {
    agentId: "person",
    agentLabel: "手",
    interactionId: "push-contact",
    kind: "applied",
    label: "手推物體",
  });
  state = addFbdForce(state, createFbdForce({
    id: "push",
    interactionId: "push-contact",
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

test("interactions enforce explicit agent and selected-system identity", () => {
  const state = initialFbdState();
  const unknownAgentInteraction = createFbdInteraction({
    id: "contact",
    kind: "contact",
    sourceAgentId: "table",
    targetSystemId: state.diagram.system.id,
    label: "桌面接觸",
  });
  assert.throws(
    () => addFbdInteraction(state, unknownAgentInteraction),
    /Unknown FBD source agent/,
  );

  const withAgent = addFbdAgent(state, createFbdAgent({ id: "table", label: "桌面" }));
  const wrongTarget = createFbdInteraction({
    ...unknownAgentInteraction,
    targetSystemId: "other-body",
  });
  assert.throws(
    () => addFbdInteraction(withAgent, wrongTarget),
    /must target the selected system/,
  );
});

test("forces cannot exist as anonymous arrows without a known interaction", () => {
  const force = createFbdForce({
    id: "mystery",
    interactionId: "missing-interaction",
    kind: "other",
    label: "未知力",
  });
  assert.throws(
    () => addFbdForce(initialFbdState(), force),
    /Unknown FBD interaction/,
  );
});

test("learner lab state contains no canonical/reference answer set", () => {
  const state = initialFbdState();
  assert.equal("canonicalInteractions" in state, false);
  assert.equal("canonicalForces" in state, false);
  assert.equal("reference" in state, false);
  assert.deepEqual(state.diagram.interactions, []);
  assert.deepEqual(state.diagram.forces, []);
});
