import assert from "node:assert/strict";
import test from "node:test";

import { MACRO_DT_S, stepMacro } from "../lib/science/electrostatics/integrator.ts";
import {
  advancePlayback,
  applySetupEdit,
  ELECTROSTATIC_PRESETS,
  initialRuntime,
  MAX_CATCHUP_MACRO_STEPS,
  particlePropertiesOf,
  pauseRuntime,
  playRuntime,
  stepRuntime,
  systemOf,
} from "../models/electrostatic.ts";
import { decodeSetup } from "../models/electrostatic-serialization.ts";
import { createShareUrl } from "../components/electrostatic/share.ts";
import { TRAIL_LIMIT, trailPoint } from "../models/electrostatic-trail.ts";

const single = ELECTROSTATIC_PRESETS["single-positive"];
const dipole = ELECTROSTATIC_PRESETS.dipole;

/** Direct pure-model reference: N calls of the M1 stepMacro contract. */
function pureSteps(setup, n) {
  let state = initialRuntime(setup).particle;
  for (let i = 0; i < n; i += 1) {
    const result = stepMacro(state, particlePropertiesOf(setup), systemOf(setup), MACRO_DT_S);
    state = result.state;
    if (result.status !== "advanced") break;
  }
  return state;
}

function run(setup, frames, frameSeconds) {
  let runtime = playRuntime(initialRuntime(setup));
  for (const elapsed of frames) runtime = advancePlayback(setup, runtime, elapsed ?? frameSeconds);
  return runtime;
}

test("play clock executes whole fixed macro steps only and carries the remainder", () => {
  let runtime = playRuntime(initialRuntime(single));
  runtime = advancePlayback(single, runtime, 0);
  assert.equal(runtime.macroSteps, 0);
  runtime = advancePlayback(single, runtime, 2.5 * MACRO_DT_S);
  assert.equal(runtime.macroSteps, 2);
  assert.ok(Math.abs(runtime.accumulator_s - 0.5 * MACRO_DT_S) < 1e-15);
  runtime = advancePlayback(single, runtime, 0.5 * MACRO_DT_S);
  assert.equal(runtime.macroSteps, 3, "remainder carries into the next tick");
  assert.equal(runtime.status, "running");
  assert.deepEqual(runtime.particle, pureSteps(single, 3));
});

test("controller playback equals N direct stepMacro calls for 30, 60 and 120 Hz schedules", () => {
  const n = 480;
  const reference = pureSteps(dipole, n);
  for (const hz of [30, 60, 120]) {
    // 30 Hz owes 32 steps per tick: 16 run, 16 carried as backlog, so it stays within the ceiling
    // only for a single tick. Drive whole-step elapsed values so every schedule reaches exactly n.
    const perTick = Math.min(MAX_CATCHUP_MACRO_STEPS, 960 / hz);
    let runtime = playRuntime(initialRuntime(dipole));
    while (runtime.macroSteps < n) runtime = advancePlayback(dipole, runtime, perTick * MACRO_DT_S);
    assert.equal(runtime.macroSteps, n);
    assert.deepEqual(runtime.particle, reference, `${hz} Hz schedule matches the pure model bitwise`);
  }
});

test("a single step is exactly one 1/960 s macro step and leaves the clock paused", () => {
  const stepped = stepRuntime(single, initialRuntime(single));
  assert.equal(stepped.particle.t_s, MACRO_DT_S);
  assert.equal(stepped.macroSteps, 1);
  assert.equal(stepped.status, "paused");
  assert.deepEqual(stepped.particle, pureSteps(single, 1));
  const fromRunning = stepRuntime(single, pauseRuntime(playRuntime(stepped)));
  assert.equal(fromRunning.particle.t_s, pureSteps(single, 2).t_s);
});

test("pause freezes the state regardless of elapsed wall time", () => {
  const paused = pauseRuntime(run(single, [0, 16 * MACRO_DT_S]));
  const before = paused.particle;
  const after = advancePlayback(single, paused, 10);
  assert.equal(after, paused);
  assert.equal(after.particle, before);
  assert.equal(paused.accumulator_s, 0);
});

test("reset rebuilds the canonical initial condition, t = 0, paused, clear trail", () => {
  const moved = run(dipole, [0, 0.01, 0.01, 0.01]);
  assert.ok(moved.particle.t_s > 0);
  const reset = initialRuntime(dipole);
  assert.deepEqual(reset.particle, {
    x_m: dipole.testParticle.x_m, y_m: dipole.testParticle.y_m,
    vx_mps: dipole.testParticle.vx_mps, vy_mps: dipole.testParticle.vy_mps, t_s: 0,
  });
  assert.equal(reset.status, "paused");
  assert.equal(reset.stop, null);
  assert.equal(reset.error, null);
  assert.equal(reset.trail.count, 1);
});

test("source and test-initial edits reset the runtime; probe-only edits keep it, even with presetId cleared", () => {
  const runtime = run(dipole, [0, 0.01, 0.01]);
  assert.equal(runtime.status, "running");
  const probe = applySetupEdit(dipole, runtime, { ...dipole, probe: { ...dipole.probe, x_m: 0.3 }, presetId: null });
  assert.equal(probe.runtime, runtime, "probe move keeps the running particle");
  const source = applySetupEdit(dipole, runtime, { ...dipole, sources: [{ ...dipole.sources[0], y_m: 0.1 }, dipole.sources[1]], presetId: null });
  assert.deepEqual(source.runtime, initialRuntime(source.setup));
  assert.equal(source.runtime.status, "paused", "a source edit during playback pauses and does not resume");
  const particle = applySetupEdit(dipole, runtime, { ...dipole, testParticle: { ...dipole.testParticle, mass_kg: 2e-8 }, presetId: null });
  assert.deepEqual(particle.runtime, initialRuntime(particle.setup));
  const invalid = applySetupEdit(dipole, runtime, { ...dipole, testParticle: { ...dipole.testParticle, mass_kg: Number.NaN } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.runtime, runtime, "rejected edit keeps the previous runtime");
});

test("particle edits are validated, never clamped: q/m, speed, source clearance, NaN", () => {
  const rt = initialRuntime(single);
  const edit = (patch) => applySetupEdit(single, rt, { ...single, testParticle: { ...single.testParticle, ...patch } });
  assert.equal(edit({ q_C: 5e-10, mass_kg: 5e-9 }).ok, false, "q/m 0.1 C/kg rejected");
  assert.equal(edit({ vx_mps: 2.5 }).ok, false);
  assert.equal(edit({ x_m: 0.2, y_m: 0 }).ok, false, "inside 0.24 m of a source");
  assert.equal(edit({ x_m: Number.POSITIVE_INFINITY }).ok, false);
  assert.equal(edit({ x_m: 2.5 }).ok, false, "outside domain");
  const ok = edit({ q_C: -2.5e-10 });
  assert.equal(ok.ok, true);
  assert.equal(ok.setup.testParticle.q_C, -2.5e-10);
});

test("oversized elapsed time auto-pauses behind-realtime with no step and no time jump", () => {
  const warm = run(single, [0, 16 * MACRO_DT_S]);
  const before = warm.particle;
  for (const elapsed of [33 * MACRO_DT_S, 5, 3600, Number.POSITIVE_INFINITY, Number.NaN, -1]) {
    const next = advancePlayback(single, warm, elapsed);
    assert.equal(next.status, "paused");
    assert.equal(next.autoPause, "behind-realtime");
    assert.equal(next.particle, before, `no physics for elapsed ${elapsed}`);
    assert.equal(next.macroSteps, warm.macroSteps);
    assert.equal(next.accumulator_s, 0);
    assert.ok(Object.values(next.particle).every(Number.isFinite));
  }
  // Up to 16 steps of backlog is tolerated: 32 owed runs 16 and carries 16.
  const tolerated = advancePlayback(single, warm, 32 * MACRO_DT_S);
  assert.equal(tolerated.status, "running");
  assert.equal(tolerated.macroSteps, warm.macroSteps + MAX_CATCHUP_MACRO_STEPS);
  // Sustained 30 Hz grows the backlog and pauses deterministically on the second tick.
  const slow = advancePlayback(single, tolerated, 32 * MACRO_DT_S);
  assert.equal(slow.autoPause, "behind-realtime");
  assert.equal(slow.particle, tolerated.particle);
  // Play restarts from a fresh wall-clock baseline.
  const resumed = playRuntime(slow);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.autoPause, null);
  assert.equal(resumed.accumulator_s, 0);
});

test("core stop: stopped at first intersection, stop point in trail, cannot continue without reset", () => {
  // Negative particle aimed straight at the positive source core.
  const setup = { ...single, testParticle: { ...single.testParticle, x_m: -0.5, y_m: 0, vx_mps: 1, vy_mps: 0, q_C: -2.5e-10 } };
  let runtime = playRuntime(initialRuntime(setup));
  for (let i = 0; i < 400 && runtime.status === "running"; i += 1) runtime = advancePlayback(setup, runtime, 16 * MACRO_DT_S);
  assert.equal(runtime.status, "stopped");
  assert.equal(runtime.stop.reason, "entered-source-core");
  assert.equal(runtime.stop.sourceId, "s1");
  assert.equal(runtime.stop.t_s, runtime.particle.t_s);
  assert.ok(Math.abs(Math.hypot(runtime.particle.x_m, runtime.particle.y_m) - 0.12) < 1e-12);
  const last = trailPoint(runtime.trail, runtime.trail.count - 1);
  assert.deepEqual(last, { x: runtime.particle.x_m, y: runtime.particle.y_m });
  for (let i = 0; i < runtime.trail.count; i += 1) {
    const p = trailPoint(runtime.trail, i);
    assert.ok(Math.hypot(p.x, p.y) >= 0.12 - 1e-12, "no trail point inside the core");
  }
  assert.equal(stepRuntime(setup, runtime), runtime);
  assert.equal(playRuntime(runtime), runtime);
  assert.equal(advancePlayback(setup, runtime, MACRO_DT_S), runtime);
  const reset = initialRuntime(setup);
  assert.equal(playRuntime(reset).status, "running");
});

test("boundary stop: left-domain at the rectangle, no bounce, trail inside domain", () => {
  const setup = { ...single, testParticle: { ...single.testParticle, x_m: 1.7, y_m: 1.2, vx_mps: 2, vy_mps: 0 } };
  let runtime = playRuntime(initialRuntime(setup));
  for (let i = 0; i < 400 && runtime.status === "running"; i += 1) runtime = advancePlayback(setup, runtime, 16 * MACRO_DT_S);
  assert.equal(runtime.stop.reason, "left-domain");
  assert.ok(Math.abs(runtime.particle.x_m - 2) < 1e-12);
  for (let i = 0; i < runtime.trail.count; i += 1) {
    const p = trailPoint(runtime.trail, i);
    assert.ok(p.x <= 2 + 1e-12 && p.x >= -2 && p.y <= 1.5 && p.y >= -1.5);
  }
});

test("visual trail stays bounded at 5000 points while physics steps are never skipped", () => {
  // Like-pair particle oscillates along the midline, never stopping for a long run.
  const setup = { ...ELECTROSTATIC_PRESETS["like-pair"], testParticle: { ...ELECTROSTATIC_PRESETS["like-pair"].testParticle, x_m: 0, y_m: -0.8, vy_mps: 0, q_C: -2.5e-10 } };
  let runtime = playRuntime(initialRuntime(setup));
  const ticks = 1200;
  for (let i = 0; i < ticks && runtime.status === "running"; i += 1) runtime = advancePlayback(setup, runtime, 16 * MACRO_DT_S);
  assert.equal(runtime.macroSteps, ticks * 16, "every owed macro step executed");
  assert.ok(runtime.trail.count <= TRAIL_LIMIT);
  assert.ok(runtime.trail.count > TRAIL_LIMIT / 4, "decimation keeps a representative path");
  assert.ok(runtime.trail.stride > 1);
  assert.deepEqual(runtime.particle, pureSteps(setup, ticks * 16));
});

test("share ignores runtime: encoding while running or stopped yields the initial setup only", () => {
  const runtime = run(dipole, [0, 0.01, 0.01]);
  assert.ok(runtime.particle.t_s > 0);
  const shared = createShareUrl(dipole, "https://lab.kakau.tw/electrostatic-field?panel=x#t");
  assert.ok(shared.ok);
  const url = new URL(shared.url);
  assert.deepEqual([...url.searchParams.keys()], ["s"]);
  const decoded = decodeSetup(url.searchParams.get("s"));
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.setup, dipole);
  const json = Buffer.from(url.searchParams.get("s"), "base64url").toString("utf8");
  for (const key of ["t_s", "trail", "accumulator_s", "status", "stop", "macroSteps", "autoPause"]) {
    assert.equal(json.includes(`"${key}"`), false, key);
  }
  const reloaded = initialRuntime(decoded.setup);
  assert.equal(reloaded.status, "paused");
  assert.equal(reloaded.particle.t_s, 0);
  assert.equal(reloaded.trail.count, 1);
  assert.equal(reloaded.stop, null);
});

test("reversing test charge flips F and a but not E; doubling mass halves a", async () => {
  const { particleReadout } = await import("../models/electrostatic.ts");
  const neg = { ...single, testParticle: { ...single.testParticle, q_C: -single.testParticle.q_C } };
  const heavy = { ...single, testParticle: { ...single.testParticle, mass_kg: 2 * single.testParticle.mass_kg } };
  const a = particleReadout(single, initialRuntime(single));
  const b = particleReadout(neg, initialRuntime(neg));
  const c = particleReadout(heavy, initialRuntime(heavy));
  assert.deepEqual(a.field, b.field);
  assert.equal(b.force_N.x, -a.force_N.x);
  assert.equal(b.acceleration_mps2.y, -a.acceleration_mps2.y);
  assert.deepEqual(c.force_N, a.force_N);
  assert.ok(Math.abs(c.acceleration_mps2.x - a.acceleration_mps2.x / 2) <= 1e-12 * Math.abs(a.acceleration_mps2.x));
});
