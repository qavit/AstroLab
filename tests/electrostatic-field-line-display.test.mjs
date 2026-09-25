import assert from "node:assert/strict";
import test from "node:test";

import { fieldAt, R_CORE_M } from "../lib/science/electrostatics/field.ts";
import { traceFieldLines } from "../lib/science/electrostatics/fieldLines.ts";
import { buildFieldLineScene, fieldLineArrowheads, selectDisplayFieldLines } from "../components/electrostatic/fieldLineDisplay.ts";
import { INITIAL_ELECTROSTATIC_LAYERS } from "../components/electrostatic/layers.ts";
import { encodeSetup } from "../models/electrostatic-serialization.ts";
import { ELECTROSTATIC_PRESETS } from "../models/electrostatic.ts";

const DOMAIN = { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 };
const nC = 1e-9;
const source = (id, x_m, y_m, q_nC) => ({ id, x_m, y_m, q_C: q_nC * nC });
const dipole = [source("s1", -0.6, 0, 3), source("s2", 0.6, 0, -3)];

test("field lines are an independent presentation layer that defaults off", () => {
  assert.equal(INITIAL_ELECTROSTATIC_LAYERS.fieldLines, false);
  assert.equal(INITIAL_ELECTROSTATIC_LAYERS.field, true, "arrows stay the opening view");
  assert.equal(INITIAL_ELECTROSTATIC_LAYERS.fieldStrengthMap, false);
});

test("a source-to-source line is kept only in its upstream (positive) source's copy", () => {
  const candidates = traceFieldLines(dipole, DOMAIN, R_CORE_M);
  const shown = selectDisplayFieldLines(candidates);
  const connecting = (lines) => lines.filter((line) => line.start.reason === "source-core" && line.end.reason === "source-core");
  assert.equal(connecting(candidates).length, 14, "each connection is traced from both ends");
  assert.equal(connecting(shown).length, 7);
  for (const line of connecting(shown)) {
    assert.equal(line.seed.sourceId, line.start.sourceId);
    assert.equal(line.start.sourceId, "s1");
  }
});

test("boundary → negative and positive → boundary lines survive ownership filtering", () => {
  const shown = selectDisplayFieldLines(traceFieldLines(dipole, DOMAIN, R_CORE_M));
  assert.equal(shown.filter((line) => line.start.reason === "domain-boundary" && line.end.sourceId === "s2").length, 5);
  assert.equal(shown.filter((line) => line.start.sourceId === "s1" && line.end.reason === "domain-boundary").length, 5);
  const loneNegative = traceFieldLines([source("s1", 0, 0, -3)], DOMAIN, R_CORE_M);
  assert.equal(selectDisplayFieldLines(loneNegative).length, loneNegative.length);
  const likePair = traceFieldLines([source("s1", -0.6, 0, 3), source("s2", 0.6, 0, 3)], DOMAIN, R_CORE_M);
  assert.deepEqual(selectDisplayFieldLines(likePair), likePair, "zero-field and boundary lines are all kept");
});

test("arrowheads follow the +E ordering of each line and stay clear of its ends", () => {
  for (const sources of [[source("s1", 0, 0, 3)], [source("s1", 0, 0, -3)], dipole]) {
    for (const line of buildFieldLineScene(traceFieldLines(sources, DOMAIN, R_CORE_M)).lines) {
      assert.ok(line.arrowheads.length >= 1 && line.arrowheads.length <= 3);
      for (const head of line.arrowheads) {
        const field = fieldAt(head.point, sources, R_CORE_M);
        assert.equal(field.valid, true);
        const cos = (head.direction.x * field.Ex_N_per_C + head.direction.y * field.Ey_N_per_C) / field.magnitude_N_per_C;
        assert.ok(cos > 0.99, `arrowhead points along +E (cos ${cos})`);
        for (const end of [line.points[0], line.points.at(-1)]) {
          assert.ok(Math.hypot(head.point.x - end.x, head.point.y - end.y) > 0.1, "clear of cores, boundary and nulls");
        }
      }
    }
  }
  const plus = buildFieldLineScene(traceFieldLines([source("s1", 0, 0, 3)], DOMAIN, R_CORE_M)).lines[0].arrowheads[0];
  assert.ok(plus.point.x * plus.direction.x + plus.point.y * plus.direction.y > 0, "single +Q points outward");
  const minus = buildFieldLineScene(traceFieldLines([source("s1", 0, 0, -3)], DOMAIN, R_CORE_M)).lines[0].arrowheads[0];
  assert.ok(minus.point.x * minus.direction.x + minus.point.y * minus.direction.y < 0, "single −Q points inward");
});

test("arrowhead placement uses arc length, not vertex index", () => {
  // Same straight 2 m line, once with dense vertices at one end and once uniform.
  const uniform = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.1, y: 0 }));
  const skewed = [...Array.from({ length: 200 }, (_, i) => ({ x: i * 0.001, y: 0 })), { x: 1, y: 0 }, { x: 2, y: 0 }];
  const a = fieldLineArrowheads(uniform).map((head) => head.point.x);
  const b = fieldLineArrowheads(skewed).map((head) => head.point.x);
  assert.equal(a.length, 2);
  for (const [i, x] of a.entries()) assert.ok(Math.abs(x - b[i]) < 1e-12);
  assert.deepEqual(fieldLineArrowheads([{ x: 0, y: 0 }, { x: 0.2, y: 0 }]), [], "very short lines get none");
});

test("field-line presentation never enters the schema-v1 share payload", () => {
  const encoded = encodeSetup(ELECTROSTATIC_PRESETS.dipole).encoded;
  const json = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.doesNotMatch(json, /fieldLines|fieldStrengthMap|layers/);
});
