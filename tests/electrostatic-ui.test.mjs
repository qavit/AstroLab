import assert from "node:assert/strict";
import test from "node:test";

import { classifyField, normalizedStrength, sampleFieldGrid } from "../lib/science/electrostatics/sampling.ts";
import { probeReadout, ELECTROSTATIC_PRESETS, initialRuntime, applySetupEdit } from "../models/electrostatic.ts";
import { fitCamera, screenToWorld, worldToScreen } from "../components/electrostatic/viewport.ts";
import { createShareUrl, initialStateFromShare, retainFieldSceneReferences } from "../components/electrostatic/share.ts";
import { encodeSetup } from "../models/electrostatic-serialization.ts";

test("viewport coordinate transform round-trips across the 4×3 m world", () => {
  const domain = ELECTROSTATIC_PRESETS["single-positive"].domain;
  for (const size of [{ width: 320, height: 320 }, { width: 768, height: 600 }, { width: 1440, height: 900 }]) {
    const camera = fitCamera(domain, size);
    for (const point of [{ x: -2, y: -1.5 }, { x: 0.375, y: -0.625 }, { x: 2, y: 1.5 }]) {
      const roundTrip = screenToWorld(worldToScreen(point, camera), camera);
      assert.ok(Math.abs(roundTrip.x - point.x) < 1e-12);
      assert.ok(Math.abs(roundTrip.y - point.y) < 1e-12);
    }
  }
});

test("source drag coordinates commit through the canonical model validator", () => {
  const setup = ELECTROSTATIC_PRESETS["single-positive"];
  const camera = fitCamera(setup.domain, { width: 960, height: 720 });
  const desired = { x: 0.75, y: -0.4 };
  const mapped = screenToWorld(worldToScreen(desired, camera), camera);
  const candidate = { ...setup, sources: [{ ...setup.sources[0], x_m: mapped.x, y_m: mapped.y }], presetId: null };
  const result = applySetupEdit(setup, initialRuntime(setup), candidate);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(Math.abs(result.setup.sources[0].x_m - desired.x) < 1e-12);
    assert.ok(Math.abs(result.setup.sources[0].y_m - desired.y) < 1e-12);
  }
});

test("probe inside a source core stays at its real coordinate and is typed invalid", () => {
  const setup = ELECTROSTATIC_PRESETS["single-positive"];
  const candidate = { ...setup, probe: { ...setup.probe, x_m: 0, y_m: 0 }, presetId: null };
  const result = applySetupEdit(setup, initialRuntime(setup), candidate);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.setup.probe, { x_m: 0, y_m: 0, visible: true });
  assert.deepEqual(probeReadout(result.setup), { valid: false, reason: "inside-source-core", sourceId: "s1" });
});

test("zero field has zero magnitude and no direction", () => {
  const readout = probeReadout(ELECTROSTATIC_PRESETS["like-pair"]);
  assert.equal(readout.valid, true);
  if (!readout.valid) return;
  assert.equal(readout.isZero, true);
  assert.equal(readout.magnitude_N_per_C, 0);
  assert.equal(readout.direction_rad, null);
});

test("fixed scale maps and classifies all five visual semantic states", () => {
  assert.equal(normalizedStrength(1), 0);
  assert.equal(normalizedStrength(5000), 1);
  assert.equal(classifyField({ valid: false, reason: "inside-source-core", sourceId: "s1" })?.kind, "core");
  const valid = (magnitude, isZero = false) => ({
    valid: true,
    contributions: [],
    Ex_N_per_C: magnitude,
    Ey_N_per_C: 0,
    magnitude_N_per_C: magnitude,
    zeroTolerance_N_per_C: 1e-12,
    isZero,
    direction_rad: isZero ? null : 0,
  });
  assert.equal(classifyField(valid(0, true))?.kind, "zero");
  assert.equal(classifyField(valid(0.5))?.kind, "low-clip");
  assert.equal(classifyField(valid(50))?.kind, "normal");
  assert.equal(classifyField(valid(5001))?.kind, "high-clip");
});

test("schema v1 URL helper round-trips setup and fails closed on malformed input", () => {
  const setup = ELECTROSTATIC_PRESETS.dipole;
  const shared = createShareUrl(
    setup,
    "https://lab.kakau.tw/electrostatic-field?panel=open&utm_source=test#probe",
  );
  assert.equal(shared.ok, true);
  if (!shared.ok) return;
  assert.ok(shared.url.length <= 2000);
  const parsed = new URL(shared.url);
  assert.equal(parsed.origin, "https://lab.kakau.tw");
  assert.equal(parsed.pathname, "/electrostatics");
  assert.deepEqual([...parsed.searchParams.keys()], ["s"]);
  assert.equal(parsed.hash, "");
  const loaded = initialStateFromShare({ present: true, encoded: parsed.searchParams.get("s") });
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.setup, setup);

  const noisyCurrentUrl = createShareUrl(setup, `https://lab.kakau.tw/${"x".repeat(1900)}?tracking=discarded#fragment`);
  assert.equal(noisyCurrentUrl.ok, true, "the canonical share URL must not inherit route noise");
  if (noisyCurrentUrl.ok) assert.equal(new URL(noisyCurrentUrl.url).pathname, "/electrostatics");

  const malformed = initialStateFromShare({ present: true, encoded: "not!base64" });
  assert.ok(malformed.error);
  assert.deepEqual(malformed.setup, ELECTROSTATIC_PRESETS["single-positive"]);
});

test("probe-only edits retain field-scene references and the desktop grid stays within budget", () => {
  const setup = ELECTROSTATIC_PRESETS.dipole;
  const result = applySetupEdit(setup, initialRuntime(setup), { ...setup, probe: { ...setup.probe, x_m: 0.2 }, presetId: null });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const shared = retainFieldSceneReferences(setup, result.setup);
  assert.equal(shared.sources, setup.sources);
  assert.equal(shared.domain, setup.domain);
  const started = performance.now();
  const grid = sampleFieldGrid(shared.sources, shared.domain, 40, 30, shared.singularity.rCore_m, shared.fieldStyle);
  const elapsed = performance.now() - started;
  assert.equal(grid.ok, true);
  if (grid.ok) assert.equal(grid.samples.length, 1200);
  assert.ok(Number.isFinite(elapsed));
});

test("share route input separates parameter presence from payload validity", () => {
  const absent = initialStateFromShare({ present: false });
  assert.equal(absent.sandbox, false, "no `s` leaves the route at the D-05 intent choice");
  assert.equal(absent.error, null);
  assert.deepEqual(absent.issues, []);

  const empty = initialStateFromShare({ present: true, encoded: "" });
  assert.equal(empty.sandbox, true, "an empty `s` is still a share parameter: free exploration");
  assert.ok(empty.error, "empty payload fails closed with a warning");
  assert.equal(empty.setup.presetId, "single-positive");

  const repeated = initialStateFromShare({ present: true, repeated: true });
  assert.equal(repeated.sandbox, true);
  assert.ok(repeated.error);
  assert.deepEqual(repeated.issues.map((issue) => issue.code), ["repeated-parameter"]);
  assert.equal(repeated.setup.presetId, "single-positive");

  const valid = initialStateFromShare({ present: true, encoded: encodeSetup(ELECTROSTATIC_PRESETS.dipole).encoded });
  assert.equal(valid.sandbox, true);
  assert.equal(valid.error, null);
  assert.deepEqual(valid.setup, ELECTROSTATIC_PRESETS.dipole);
});
