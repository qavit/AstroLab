import test from "node:test";
import assert from "node:assert/strict";
import { directionFromDegrees } from "../lib/science/fbd.ts";
import { addFbdForce, addFbdInteraction, createFbdForce, updateFbdForce } from "../models/fbd.ts";
import { TABLE_REFERENCE, initialTableState, compareTableDiagram, initialTableLearning, commitTable, compareTable, reviseTable } from "../models/fbd-table.ts";

function correct() {
  let state = initialTableState();
  for (const interaction of TABLE_REFERENCE.canonicalInteractions) state = addFbdInteraction(state, structuredClone(interaction));
  for (const force of TABLE_REFERENCE.canonicalForces) state = addFbdForce(state, createFbdForce(force));
  return state;
}
const codes = (diagram, assumption, reference) => compareTableDiagram(diagram, assumption, reference).diagnostics.map((item) => item.code);
test("table scene passes with three interaction-backed qualitative forces", () => {
  const diagram = correct().diagram;
  assert.equal(compareTableDiagram(diagram).pass, true);
  assert.equal(codes(diagram).filter((code) => code === "indeterminate-magnitude").length, 3);
  assert.equal(compareTableDiagram(diagram, "vertical-balance").pass, true);
});
test("missing gravity and normal are diagnosed independently", () => {
  for (const kind of ["weight", "normal"]) {
    const diagram = correct().diagram;
    assert.ok(codes({ ...diagram, forces: diagram.forces.filter((force) => force.kind !== kind) }).includes("missing-force"));
    const id = TABLE_REFERENCE.canonicalForces.find((force) => force.kind === kind).interactionId;
    const omitted = { ...diagram, forces: diagram.forces.filter((force) => force.interactionId !== id), interactions: diagram.interactions.filter((interaction) => interaction.id !== id) };
    assert.ok(codes(omitted).includes("missing-interaction"));
  }
});
test("motion is not an interaction force, nor are vector components", () => {
  const state = addFbdForce(correct(), createFbdForce({ id: "motion", interactionId: "hand-block", kind: "other", label: "向右運動力" }));
  assert.ok(codes(state.diagram).includes("extra-force"));
});
test("reverse applied force has correct identity but wrong direction", () => {
  const state = updateFbdForce(correct(), "pull", { direction: directionFromDegrees(180) });
  assert.ok(codes(state.diagram).includes("wrong-direction"));
  assert.ok(!codes(state.diagram).includes("missing-force"));
});
test("wrong agent/interaction is diagnosed, not accepted by vector equality", () => {
  const state = updateFbdForce(correct(), "weight", { interactionId: "hand-block" });
  assert.ok(codes(state.diagram).includes("wrong-agent"));
  assert.ok(codes(state.diagram).includes("missing-force"));
});
test("Newton III partner targets the other body and cannot be on the block FBD", () => {
  const diagram = correct().diagram;
  const partner = { id: "partner", kind: "contact", sourceAgentId: "block", targetSystemId: "table", label: "木塊對桌面" };
  const invalid = { ...diagram, agents: [...diagram.agents, { id: "block", label: "木塊" }], interactions: [...diagram.interactions, partner], forces: [...diagram.forces, createFbdForce({ id: "partner-force", interactionId: "partner", kind: "normal", label: "伙伴力", direction: directionFromDegrees(270) })] };
  assert.ok(codes(invalid).includes("wrong-target"));
  assert.equal(compareTableDiagram(invalid).pass, false);
  assert.ok(codes({ ...diagram, system: { ...diagram.system, id: "table" } }).includes("wrong-target"));
});
test("normal equals mg only under stated vertical balance assumptions", () => {
  assert.ok(codes(correct().diagram, "always-mg").includes("invalid-assumption"));
  assert.ok(!codes(correct().diagram, "vertical-balance").includes("invalid-assumption"));
});
test("detached hand has no remaining applied force", () => {
  const detachedReference = { canonicalInteractions: TABLE_REFERENCE.canonicalInteractions.filter((item) => item.sourceAgentId !== "hand"), canonicalForces: TABLE_REFERENCE.canonicalForces.filter((item) => item.kind !== "applied") };
  assert.ok(codes(correct().diagram, "unknown", detachedReference).includes("extra-interaction"));
  assert.ok(codes(correct().diagram, "unknown", detachedReference).includes("extra-force"));
});
test("anonymous and duplicate forces, wrong agent and extra air interaction are diagnosed", () => {
  const diagram = correct().diagram;
  assert.ok(codes({ ...diagram, forces: [...diagram.forces, { ...diagram.forces[0], id: "copy" }] }).includes("extra-force"));
  assert.ok(codes({ ...diagram, forces: [{ ...diagram.forces[0], interactionId: "absent" }] }).includes("unknown-interaction"));
  assert.ok(codes({ ...diagram, interactions: diagram.interactions.map((item) => ({ ...item, sourceAgentId: "absent" })) }).includes("wrong-agent"));
  assert.ok(codes({ ...diagram, interactions: [...diagram.interactions, { id: "air-block", kind: "drag", sourceAgentId: "air", targetSystemId: "block", label: "空氣 ↔ 木塊" }] }).includes("extra-interaction"));
});
test("interaction matching is independent of labels and learner-chosen IDs", () => {
  const diagram = correct().diagram;
  const renamed = { ...diagram, interactions: diagram.interactions.map((item) => ({ ...item, id: `learner-${item.id}`, label: "我選的作用" })), forces: diagram.forces.map((force) => ({ ...force, interactionId: `learner-${force.interactionId}`, label: "我的箭頭" })) };
  assert.equal(compareTableDiagram(renamed).pass, true);
});
test("commit freezes a snapshot, compare requires commit, revise preserves learner work without answers", () => {
  const initial = initialTableLearning();
  assert.deepEqual(compareTable(initial), initial);
  assert.equal(initial.learner.diagram.forces.length, 0);
  assert.ok(!JSON.stringify(initial).includes("canonical"));
  const built = { ...initial, phase: "forces", learner: correct() };
  const committed = commitTable(built);
  assert.notEqual(committed.submission.diagram, built.learner.diagram);
  const compared = compareTable(committed);
  assert.equal(compared.phase, "compared");
  const revised = reviseTable(compared);
  assert.equal(revised.phase, "forces");
  assert.equal(revised.submission, null);
  assert.deepEqual(revised.learner, built.learner);
  assert.ok(!JSON.stringify(revised).includes("canonical"));
});
