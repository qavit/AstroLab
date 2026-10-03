import test from "node:test";
import assert from "node:assert/strict";
import { PROJECTILE_PRESETS, initialProjectileState, deriveProjectileModel, deriveCursor } from "../models/projectile.ts";
import { decodeProjectileShare, encodeProjectileShare } from "../models/projectile-serialization.ts";
const layers = { trajectory: true, velocity: false, components: true, guides: false, grid: true, labels: true, markers: false };
test("Projectile share round-trips launch setup, visibility, comparisons and preset, excludes runtime/activities", () => {
  const state = { ...initialProjectileState(), ...PROJECTILE_PRESETS.elevated, playing: true, direction: -1 };
  const encoded = encodeProjectileShare(state, layers, "elevated");
  const result = decodeProjectileShare(encoded);
  assert.equal(result.error, null);
  assert.equal(result.state.height, 25);
  assert.equal(result.state.angle, 30);
  assert.equal(result.state.playing, false);
  assert.equal(result.state.direction, 1);
  assert.equal(result.preset, "elevated");
  assert.deepEqual(result.layers, layers);
  assert.ok(!encoded.includes("playing"));
  assert.ok(!encoded.includes("prediction"));
  assert.equal(JSON.parse(encoded).launch.x, 0);
});
test("malformed, repeated, unsupported version, oversized and invalid numerical inputs fail closed", () => {
  const data = JSON.parse(encodeProjectileShare(initialProjectileState(), layers));
  const cases = ["", "{}", "null", ["a", "b"], "x".repeat(2001), JSON.stringify({ ...data, v: 2 }), JSON.stringify({ ...data, mode: "guided" })];
  for (const [key, value] of [["speed", 100], ["speed", null], ["angle", 91], ["height", -1], ["gravity", 0], ["dragFactor", 1], ["x", 2]]) cases.push(JSON.stringify({ ...data, launch: { ...data.launch, [key]: value } }));
  cases.push(JSON.stringify({ ...data, layers: { ...data.layers, trajectory: "true" } }));
  cases.push(JSON.stringify({ ...data, stairs: { ...data.stairs, count: 100000 } }));
  for (const encoded of cases) {
    const result = decodeProjectileShare(encoded);
    assert.ok(result.error, String(encoded));
    assert.equal(result.state.speed, 24);
    assert.equal(result.state.playing, false);
  }
});
test("every learning preset can be shared and computes a finite trajectory", () => {
  for (const [id, preset] of Object.entries(PROJECTILE_PRESETS)) {
    const state = { ...initialProjectileState(), ...preset };
    assert.equal(decodeProjectileShare(encodeProjectileShare(state, layers, id)).error, null);
    const model = deriveProjectileModel(state);
    assert.ok(model.duration > 0);
    assert.ok(Number.isFinite(model.groundRange));
  }
  assert.equal(PROJECTILE_PRESETS.horizontal.angle, 0);
  assert.ok(PROJECTILE_PRESETS.horizontal.height > 0);
  assert.equal(PROJECTILE_PRESETS.oblique.angle, 30);
  assert.equal(PROJECTILE_PRESETS.sameSpeed.showEnvelope, true);
});
test("cursor readout remains the vacuum main trajectory when drag comparison is enabled", () => {
  const base = initialProjectileState();
  const vacuum = deriveProjectileModel(base);
  const drag = deriveProjectileModel({ ...base, showDrag: true, dragFactor: .1 });
  const cursor = deriveCursor(vacuum, base.gravity, 0.5);
  const compared = deriveCursor(drag, base.gravity, cursor.t / drag.clockDuration);
  assert.deepEqual(compared.point, cursor.point);
  assert.deepEqual(compared.velocity, cursor.velocity);
  assert.equal(cursor.velocity.x, vacuum.velocity.x);
  assert.ok(Math.abs(cursor.velocity.y) < 1e-10);
});
