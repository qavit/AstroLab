import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ELECTROSTATIC_PRESETS,
  applySetupEdit,
  initialRuntime,
  probeReadout,
  particleReadout,
  stepRuntime,
} from "../models/electrostatic.ts";
import { ENVELOPE, validateSetup } from "../models/electrostatic-validation.ts";
import {
  MAX_ENCODED_LENGTH,
  canonicalJson,
  decodeSetup,
  encodeSetup,
} from "../models/electrostatic-serialization.ts";

/** R-01..R-03 of the verification matrix plus envelope validation and atomic edits. */

const NC = 1e-9;
const UG = 1e-9;
const PRESET_IDS = ["single-positive", "like-pair", "dipole"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uniform = (rng, lo, hi) => lo + (hi - lo) * rng();
const clone = (value) => structuredClone(value);

/** Random valid schema-v1 setup inside the approved envelope. */
function randomSetup(rng) {
  const base = clone(ELECTROSTATIC_PRESETS["single-positive"]);
  const count = 1 + Math.floor(rng() * 4);
  const sources = [];
  while (sources.length < count) {
    const candidate = {
      id: `s${sources.length + 1}`,
      x_m: uniform(rng, -2, 2),
      y_m: uniform(rng, -1.5, 1.5),
      q_C: (rng() < 0.5 ? -1 : 1) * uniform(rng, 1, 5) * NC,
    };
    if (sources.every((s) => Math.hypot(s.x_m - candidate.x_m, s.y_m - candidate.y_m) >= 0.24)) sources.push(candidate);
  }
  let x;
  let y;
  do {
    x = uniform(rng, -2, 2);
    y = uniform(rng, -1.5, 1.5);
  } while (sources.some((s) => Math.hypot(x - s.x_m, y - s.y_m) < 0.24));
  const mass = uniform(rng, 5, 20) * UG;
  const ratio = uniform(rng, Math.max(0.005, 0.1e-9 / mass), Math.min(0.05, 0.5e-9 / mass));
  const speed = uniform(rng, 0, 2);
  const angle = uniform(rng, 0, 2 * Math.PI);
  return {
    ...base,
    sources: rng() < 0.5 ? sources.reverse() : sources,
    probe: { x_m: uniform(rng, -2, 2), y_m: uniform(rng, -1.5, 1.5), visible: rng() < 0.5 },
    testParticle: {
      x_m: x, y_m: y,
      vx_mps: speed * Math.cos(angle), vy_mps: speed * Math.sin(angle),
      q_C: (rng() < 0.5 ? -1 : 1) * ratio * mass,
      mass_kg: mass,
    },
    presetId: null,
  };
}

test("R-01 presets match versioned golden data and pass the shared validator", async () => {
  const golden = JSON.parse(await readFile(new URL("./fixtures/electrostatic/presets-v1.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(ELECTROSTATIC_PRESETS).sort(), [...PRESET_IDS].sort());
  for (const id of PRESET_IDS) {
    const preset = ELECTROSTATIC_PRESETS[id];
    assert.deepEqual(preset, { ...golden.fixed, ...golden.presets[id], presetId: id });
    const validated = validateSetup(preset);
    assert.equal(validated.ok, true, id);
    assert.deepEqual(validated.warnings, [], `${id} stays inside the validated envelope`);
    const decoded = decodeSetup(encodeSetup(preset).encoded);
    assert.deepEqual(decoded.setup, preset, `${id} decodes to its golden data`);
    for (let i = 0; i < preset.sources.length; i += 1) {
      for (let j = i + 1; j < preset.sources.length; j += 1) {
        const [a, b] = [preset.sources[i], preset.sources[j]];
        assert.ok(Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m) >= ENVELOPE.presetSourceSpacing_m);
      }
    }
  }
});

test("R-01 preset probes reproduce U-01, U-04 and U-05", () => {
  const single = probeReadout(ELECTROSTATIC_PRESETS["single-positive"]);
  const { x_m, y_m } = ELECTROSTATIC_PRESETS["single-positive"].probe;
  assert.ok(single.valid && single.Ex_N_per_C * x_m + single.Ey_N_per_C * y_m > 0, "radially outward");
  const pair = probeReadout(ELECTROSTATIC_PRESETS["like-pair"]);
  assert.ok(pair.valid && pair.isZero && pair.direction_rad === null, "like-pair midpoint is zero");
  const dipole = probeReadout(ELECTROSTATIC_PRESETS.dipole);
  const expected = (8 * 8.9875517923e9 * 3 * NC) / (1.2 * 1.2);
  assert.ok(dipole.valid && dipole.Ex_N_per_C > 0, "dipole midpoint points to the negative charge");
  assert.ok(Math.abs(dipole.magnitude_N_per_C - expected) / expected <= 1e-12);
});

test("R-02 round trip is exact for every preset and 1,000 seeded valid states per preset", () => {
  const rng = mulberry32(0x2002);
  for (const id of PRESET_IDS) {
    for (let n = 0; n <= 1000; n += 1) {
      const setup = n === 0 ? ELECTROSTATIC_PRESETS[id] : { ...randomSetup(rng), presetId: id };
      const canonical = validateSetup(setup);
      assert.equal(canonical.ok, true, `${id} #${n}: ${JSON.stringify(canonical.issues)}`);
      const encoded = encodeSetup(setup);
      assert.equal(encoded.ok, true);
      assert.ok(encoded.encoded.length <= MAX_ENCODED_LENGTH);
      const decoded = decodeSetup(encoded.encoded);
      assert.deepEqual(decoded.setup, canonical.setup, `${id} #${n}`);
      assert.equal(encodeSetup(decoded.setup).encoded, encoded.encoded, "encoding is canonical");
      assert.deepEqual(probeReadout(decoded.setup), probeReadout(canonical.setup), "derived readouts identical");
    }
  }
});

test("canonical encoding orders sources by id and keys alphabetically, and normalises −0", () => {
  const a = clone(ELECTROSTATIC_PRESETS.dipole);
  const b = { ...clone(a), sources: [...a.sources].reverse(), probe: { visible: true, y_m: -0, x_m: 0 } };
  assert.equal(encodeSetup(b).encoded, encodeSetup(a).encoded);
  const decoded = decodeSetup(encodeSetup(b).encoded).setup;
  assert.deepEqual(decoded.sources.map((s) => s.id), ["s1", "s2"]);
  assert.ok(Object.is(decoded.probe.y_m, 0));
  assert.equal(canonicalJson({ b: 1, a: [-0, { d: 2, c: 3 }] }), '{"a":[0,{"c":3,"d":2}],"b":1}');
});

function encodeRaw(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8").toString("base64url");
}

test("R-03 invalid payloads are rejected atomically with structured issues", () => {
  const valid = clone(ELECTROSTATIC_PRESETS["like-pair"]);
  const good = encodeSetup(valid).encoded;
  const mutate = (fn) => {
    const copy = clone(valid);
    fn(copy);
    return encodeRaw(copy);
  };
  const cases = {
    truncated: good.slice(0, good.length - 7),
    "bad alphabet": `${good.slice(0, 10)}*${good.slice(11)}`,
    "non-canonical tail": `${good.slice(0, -1)}${good.at(-1) === "A" ? "B" : "A"}`,
    "not json": encodeRaw("{not json"),
    "json array": encodeRaw([]),
    "future version": mutate((s) => { s.schemaVersion = 2; }),
    "unknown version": mutate((s) => { s.schemaVersion = 0; }),
    "wrong model": mutate((s) => { s.modelVersion = "electrostatic-point-charge-0"; }),
    "unknown key": mutate((s) => { s.trail = []; }),
    "missing key": mutate((s) => { delete s.probe; }),
    "five sources": mutate((s) => {
      s.sources = [0, 1, 2, 3, 4].map((i) => ({ id: `s${i + 1}`, x_m: -1.6 + 0.8 * i, y_m: 1, q_C: 2e-9 }));
    }),
    "no sources": mutate((s) => { s.sources = []; }),
    "duplicate id": mutate((s) => { s.sources[1].id = "s1"; }),
    "bad id": mutate((s) => { s.sources[0].id = "S 1"; }),
    "source too strong": mutate((s) => { s.sources[0].q_C = 6e-9; }),
    "source too weak": mutate((s) => { s.sources[0].q_C = 0.5e-9; }),
    "source outside domain": mutate((s) => { s.sources[0].x_m = 2.5; }),
    "string number": mutate((s) => { s.sources[0].x_m = "0.1"; }),
    "null number": mutate((s) => { s.testParticle.vx_mps = null; }),
    "huge number": encodeRaw(JSON.stringify(valid).replace('"x_m":0.1', '"x_m":1e999')),
    "zero mass": mutate((s) => { s.testParticle.mass_kg = 0; }),
    "negative mass": mutate((s) => { s.testParticle.mass_kg = -1e-8; }),
    "mass too large": mutate((s) => { s.testParticle.mass_kg = 25e-9; }),
    "test charge zero": mutate((s) => { s.testParticle.q_C = 0; }),
    "q over m too high": mutate((s) => { s.testParticle.q_C = 0.5e-9; s.testParticle.mass_kg = 5e-9; }),
    "q over m too low": mutate((s) => { s.testParticle.q_C = 0.1e-9; s.testParticle.mass_kg = 20.1e-9; }),
    "too fast": mutate((s) => { s.testParticle.vx_mps = 1.5; s.testParticle.vy_mps = 1.5; }),
    "test too close": mutate((s) => { s.testParticle.x_m = -0.6; s.testParticle.y_m = 0.2; }),
    "probe outside": mutate((s) => { s.probe.y_m = 1.6; }),
    "probe visible string": mutate((s) => { s.probe.visible = "yes"; }),
    "core changed": mutate((s) => { s.singularity.rCore_m = 0.08; }),
    "softening policy": mutate((s) => { s.singularity.policy = "softening"; }),
    "dt changed": mutate((s) => { s.integrator.dt_s = 1 / 240; }),
    "auto scale": mutate((s) => { s.fieldStyle.Emax_N_per_C = 10000; }),
    "domain changed": mutate((s) => { s.domain.xmax = 3; }),
    "unknown preset": mutate((s) => { s.presetId = "quadrupole"; }),
    "too long": "A".repeat(MAX_ENCODED_LENGTH + 4),
    empty: "",
  };
  for (const [label, payload] of Object.entries(cases)) {
    const decoded = decodeSetup(payload);
    assert.equal(decoded.ok, false, label);
    assert.ok(decoded.issues.length > 0 && decoded.issues.every((i) => i.severity === "error" && i.code && i.path), label);
    assert.equal("setup" in decoded, false, `${label}: nothing is partially applied`);
  }
  assert.equal(decodeSetup(mutate((s) => { s.schemaVersion = 2; })).issues[0].code, "unsupported-future-version");
});

test("envelope bounds are inclusive at their exact decimal values", () => {
  const edge = clone(ELECTROSTATIC_PRESETS["single-positive"]);
  edge.sources[0].q_C = 5e-9;
  edge.testParticle = { x_m: -0.24, y_m: 0, vx_mps: 2, vy_mps: 0, q_C: -0.5e-9, mass_kg: 10e-9 };
  assert.equal(validateSetup(edge).ok, true, "0.5 nC / 10 µg = 0.05 C/kg and 0.24 m are allowed");
  edge.testParticle = { ...edge.testParticle, q_C: 0.1e-9, mass_kg: 20e-9 };
  assert.equal(validateSetup(edge).ok, true, "0.1 nC / 20 µg = 0.005 C/kg is allowed");
});

test("overlapping source cores validate with a warning, not an error", () => {
  const setup = clone(ELECTROSTATIC_PRESETS["like-pair"]);
  setup.sources[1].x_m = -0.5;
  setup.testParticle.x_m = 0.8;
  const result = validateSetup(setup);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings.map((w) => w.code), ["cores-overlap"]);
});

test("atomic edits: invalid candidates keep state; source edits reset runtime; probe edits do not", () => {
  const setup = ELECTROSTATIC_PRESETS.dipole;
  let runtime = initialRuntime(setup);
  for (let i = 0; i < 20; i += 1) runtime = stepRuntime(setup, runtime);
  assert.ok(runtime.particle.t_s > 0);

  const rejected = applySetupEdit(setup, runtime, { ...setup, sources: [{ ...setup.sources[0], q_C: 9e-9 }, setup.sources[1]] });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.setup, setup);
  assert.equal(rejected.runtime, runtime);

  const probeMove = applySetupEdit(setup, runtime, { ...setup, probe: { ...setup.probe, x_m: 0.3 } });
  assert.equal(probeMove.ok, true);
  assert.equal(probeMove.runtime, runtime, "moving the probe keeps the particle runtime");

  const sourceMove = applySetupEdit(setup, runtime, { ...setup, sources: [{ ...setup.sources[0], y_m: 0.2 }, setup.sources[1]] });
  assert.equal(sourceMove.ok, true);
  assert.deepEqual(sourceMove.runtime, initialRuntime(sourceMove.setup), "source edits pause and reset the particle");
});

test("particle readout separates E, F = qE and a = qE/m", () => {
  const setup = ELECTROSTATIC_PRESETS["single-positive"];
  const readout = particleReadout(setup, initialRuntime(setup));
  const { q_C, mass_kg } = setup.testParticle;
  assert.equal(readout.valid, true);
  assert.equal(readout.force_N.x, q_C * readout.field.x);
  assert.equal(readout.acceleration_mps2.y, (q_C / mass_kg) * readout.field.y);
});
