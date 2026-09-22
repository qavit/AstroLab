import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_SETUPS,
  activitySetup,
  advance,
  accelerationCompass,
  changeOf,
  commitChange,
  commitDirection,
  commitVelocity,
  componentVerdicts,
  evidencePolicy,
  explainA,
  explainB,
  probeCompass,
  revealNext,
  SANDBOX_POLICY,
  startActivity,
} from "../models/electrostatic-learning.ts";
import { applySetupEdit, initialRuntime, particleReadout, probeReadout } from "../models/electrostatic.ts";
import { validateSetup } from "../models/electrostatic-validation.ts";
import { encodeSetup } from "../models/electrostatic-serialization.ts";

const gatedKeys = ["globalField", "probeContributions", "probeTotal", "probeComponents", "particleField", "particleForce", "particleAcceleration", "trajectory"];

function assertAllHidden(state, label) {
  const policy = evidencePolicy(state);
  for (const key of gatedKeys) assert.equal(policy[key], false, `${label}: ${key} hidden before commitment`);
  assert.equal(policy.timeControls, false);
  assert.equal(policy.setupControls, false);
}

test("every activity setup is a complete schema-v1 setup accepted by the same validator", () => {
  for (const [id, setup] of Object.entries(ACTIVITY_SETUPS)) {
    const result = validateSetup(setup);
    assert.equal(result.ok, true, `${id}: ${JSON.stringify(result.issues ?? [])}`);
    assert.equal(setup.schemaVersion, 1);
    assert.ok(encodeSetup(setup).ok, `${id} encodes as a v1 permalink`);
  }
});

test("sandbox policy reveals every instrument", () => {
  assert.equal(evidencePolicy(null), SANDBOX_POLICY);
  for (const value of Object.values(SANDBOX_POLICY)) assert.ok(value === true || value === null);
});

// ---- Activity A --------------------------------------------------------------------

test("A: initial state is uncommitted with the target evidence hidden", () => {
  const a = startActivity("A");
  assert.equal(a.step, "predict");
  assertAllHidden(a, "A predict");
  assert.equal(evidencePolicy(a).probeMovable, false, "sources and probe locked while predicting");
  assert.equal(evidencePolicy(a).sourcesMovable, false);
});

test("A: commit reveals contributions → total → components, never all at once", () => {
  const committed = commitDirection(startActivity("A"), { direction: "S", reason: "components" });
  assert.equal(committed.step, "observe");
  let policy = evidencePolicy(committed);
  assert.deepEqual([policy.probeContributions, policy.probeTotal, policy.probeComponents, policy.globalField], [true, false, false, false]);
  const r2 = revealNext(committed);
  policy = evidencePolicy(r2);
  assert.deepEqual([policy.probeContributions, policy.probeTotal, policy.probeComponents], [true, true, false]);
  const r3 = revealNext(r2);
  assert.equal(evidencePolicy(r3).probeComponents, true);
  assert.equal(revealNext(r3), r3, "no reveal beyond the last layer");
  assert.equal(advance(committed), committed, "cannot skip observation before full reveal");
});

test("A: a committed prediction cannot be silently overwritten", () => {
  const committed = commitDirection(startActivity("A"), { direction: "S", reason: "components" });
  assert.equal(commitDirection(committed, { direction: "N", reason: "other" }), committed);
  assert.equal(committed.prediction.direction, "S");
});

test("A: model answer is S with x cancelling and y adding; transfer flips to E with a fresh prediction", () => {
  const field = probeReadout(ACTIVITY_SETUPS.A);
  assert.equal(probeCompass(field), "S");
  assert.deepEqual(componentVerdicts(field), { x: "cancel", y: "add" });

  let state = commitDirection(startActivity("A"), { direction: "SE", reason: "nearest" });
  state = advance(revealNext(revealNext(state)));
  assert.equal(state.step, "explain");
  state = explainA(state, { x: "cancel", y: "add", revise: "revised" });
  assert.equal(state.step, "transfer-predict");
  assert.equal(activitySetup(state), ACTIVITY_SETUPS["A-transfer"]);
  assertAllHidden(state, "A transfer-predict");
  assert.equal("transferPrediction" in state, false, "transfer starts without an answer");
  assert.equal(probeCompass(probeReadout(activitySetup(state))), "E");

  state = commitDirection(state, { direction: "E", reason: "sign" });
  assert.equal(state.transferPrediction.direction, "E");
  assert.equal(state.prediction.direction, "SE", "the first commitment is preserved");
  state = advance(revealNext(revealNext(state)));
  assert.equal(state.step, "complete");
});

test("A: restart clears the learning state", () => {
  const restarted = startActivity("A");
  assert.deepEqual(restarted, { activity: "A", step: "predict" });
});

test("explore keeps science unchanged: activity setups produce the same model output as sandbox", () => {
  const setup = ACTIVITY_SETUPS.A;
  const result = applySetupEdit(setup, initialRuntime(setup), structuredClone(setup));
  assert.ok(result.ok);
  assert.deepEqual(probeReadout(result.setup), probeReadout(setup));
});

// ---- Activity B --------------------------------------------------------------------

test("B: zero answer hidden before commit; contributions then zero total after", () => {
  const b = startActivity("B");
  assertAllHidden(b, "B predict");
  const field = probeReadout(ACTIVITY_SETUPS.B);
  assert.equal(field.valid && field.isZero, true);
  assert.equal(field.direction_rad, null, "zero direction is undefined, not 0°");

  let state = commitDirection(b, { direction: "zero", reason: "symmetry" });
  let policy = evidencePolicy(state);
  assert.deepEqual([policy.probeContributions, policy.probeTotal], [true, false]);
  state = revealNext(state);
  policy = evidencePolicy(state);
  assert.deepEqual([policy.probeContributions, policy.probeTotal, policy.globalField], [true, true, true]);
  state = advance(state);
  assert.equal(state.step, "manipulate");
  assert.equal(evidencePolicy(state).sourceMagnitudeId, "s2");
});

test("B: manipulation uses true model evidence; transfer is the four-charge centre", () => {
  const setup = ACTIVITY_SETUPS.B;
  const edited = applySetupEdit(setup, initialRuntime(setup), {
    ...setup, sources: [setup.sources[0], { ...setup.sources[1], q_C: 5e-9 }],
  });
  assert.ok(edited.ok);
  const field = probeReadout(edited.setup);
  assert.equal(field.isZero, false, "a larger s2 moves the zero off the midpoint");
  assert.equal(probeCompass(field), "W", "the stronger s2 pushes the midpoint field toward s1");

  let state = advance(revealNext(commitDirection(startActivity("B"), { direction: "zero", reason: "symmetry" })));
  state = explainB(state, "toward-smaller");
  assert.equal(state.step, "transfer-predict");
  assertAllHidden(state, "B transfer-predict");
  const transfer = activitySetup(state);
  assert.equal(transfer.sources.length, 4);
  const centre = probeReadout(transfer);
  assert.equal(centre.valid && centre.isZero, true);
  assert.equal(centre.direction_rad, null);
  state = advance(revealNext(commitDirection(state, { direction: "zero", reason: "symmetry" })));
  assert.equal(state.step, "complete");
});

// ---- Activity C --------------------------------------------------------------------

function readout(stage) {
  const setup = ACTIVITY_SETUPS[stage];
  return particleReadout(setup, initialRuntime(setup));
}

test("C: E/F/a and trajectory hidden before commit; positive charge prediction reveals them", () => {
  const c = startActivity("C");
  assertAllHidden(c, "C c1 predict");
  assert.equal(evidencePolicy(c).particle, true, "the particle itself is setup, not an answer");
  assert.equal(evidencePolicy(c).probe, false, "probe hidden in C so it cannot leak the field");
  assert.equal(accelerationCompass(readout("c1")), "W");
  const observed = commitDirection(c, { direction: "W", reason: "sign" });
  const policy = evidencePolicy(observed);
  assert.deepEqual([policy.particleField, policy.particleForce, policy.particleAcceleration, policy.trajectory], [true, true, true, false]);
});

test("C: charge flip keeps E and reverses F and a; mass doubling keeps E, F and halves a", () => {
  const c1 = readout("c1");
  const c2 = readout("c2");
  const c3 = readout("c3");
  assert.equal(changeOf(c1.field, c2.field), "same");
  assert.equal(changeOf(c1.force_N, c2.force_N), "reverse");
  assert.equal(changeOf(c1.acceleration_mps2, c2.acceleration_mps2), "reverse");
  assert.equal(changeOf(c1.field, c3.field), "same");
  assert.equal(changeOf(c1.force_N, c3.force_N), "same");
  assert.equal(changeOf(c1.acceleration_mps2, c3.acceleration_mps2), "half");

  let state = advance(commitDirection(startActivity("C"), { direction: "W", reason: "sign" }));
  assert.deepEqual([state.step, state.stage], ["predict", "c2"]);
  assertAllHidden(state, "C c2 predict");
  assert.equal(activitySetup(state), ACTIVITY_SETUPS.c2);
  state = commitChange(state, { E: "same", F: "reverse", a: "reverse" });
  assert.equal(state.step, "observe");
  assert.equal(commitChange(state, { E: "reverse", F: "same", a: "same" }), state, "no overwrite");
  state = commitChange(advance(state), { E: "same", F: "same", a: "half" });
  assert.equal(state.stage, "c3");
  assert.equal(state.predictions.c2.F, "reverse");
});

test("C: initial velocity does not change E/F/a; velocity and acceleration directions differ", () => {
  const c1 = readout("c1");
  const c4 = readout("c4");
  assert.deepEqual(c4.field, c1.field);
  assert.deepEqual(c4.force_N, c1.force_N);
  assert.deepEqual(c4.acceleration_mps2, c1.acceleration_mps2);
  assert.equal(accelerationCompass(c4), "W");
  assert.equal(ACTIVITY_SETUPS.c4.testParticle.vy_mps, 1, "velocity points N");

  let state = startActivity("C");
  state = advance(commitDirection(state, { direction: "W", reason: "sign" }));
  state = advance(commitChange(state, { E: "same", F: "reverse", a: "reverse" }));
  state = advance(commitChange(state, { E: "same", F: "same", a: "half" }));
  assert.equal(state.stage, "c4");
  assertAllHidden(state, "C c4 predict");
  state = commitVelocity(state, { velocity: "N", acceleration: "W" });
  const policy = evidencePolicy(state);
  assert.equal(policy.trajectory, true);
  assert.equal(policy.timeControls, true);
  assert.equal(advance(state).step, "complete");
});

test("C: restart resets the runtime to the canonical c1 setup", () => {
  const state = startActivity("C");
  const runtime = initialRuntime(activitySetup(state));
  assert.equal(runtime.particle.t_s, 0);
  assert.equal(runtime.status, "paused");
  assert.equal(runtime.trail.count, 1);
  assert.equal(activitySetup(state), ACTIVITY_SETUPS.c1);
});

test("learning state never reaches the schema-v1 payload", () => {
  const encoded = encodeSetup(ACTIVITY_SETUPS.A);
  const json = Buffer.from(encoded.encoded, "base64url").toString("utf8");
  for (const key of ["activity", "prediction", "reveal", "explanation", "step", "learning"]) {
    assert.equal(json.includes(`"${key}"`), false, key);
  }
  assert.deepEqual(Object.keys(JSON.parse(json)).sort(), [
    "domain", "fieldStyle", "integrator", "modelVersion", "presetId", "probe", "schemaVersion", "singularity", "sources", "testParticle",
  ]);
});
