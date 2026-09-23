import assert from "node:assert/strict";
import test from "node:test";

import { buildVectorConstruction, probeVectorEnvelopeRadius } from "../components/electrostatic/vectorConstruction.ts";

function magnitude(v) {
  return Math.hypot(v.x, v.y);
}

test("one shared scale preserves display(E_total) = sum(display(E_i))", () => {
  const components = [{ x: 12, y: -4 }, { x: -3, y: 9 }, { x: 5, y: 5 }];
  const construction = buildVectorConstruction(components, 60);
  const summed = construction.contributions.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
  assert.ok(Math.abs(summed.x - construction.resultant.x) < 1e-9);
  assert.ok(Math.abs(summed.y - construction.resultant.y) < 1e-9);
});

test("relative magnitude between vectors is preserved (one shared scale, not per-vector)", () => {
  const components = [{ x: 10, y: 0 }, { x: 1, y: 0 }];
  const construction = buildVectorConstruction(components, 50);
  const ratioBefore = magnitude(components[0]) / magnitude(components[1]);
  const ratioAfter = magnitude(construction.contributions[0]) / magnitude(construction.contributions[1]);
  assert.ok(Math.abs(ratioBefore - ratioAfter) < 1e-9);
});

test("the largest extent (a contribution or a chain point) fits exactly at maxRadius_px", () => {
  const components = [{ x: 3, y: 4 }, { x: 3, y: 4 }]; // resultant (6,8) has |.|=10, larger than either single (5)
  const construction = buildVectorConstruction(components, 40);
  const extents = [...construction.contributions, construction.resultant].map(magnitude);
  assert.ok(Math.max(...extents) <= 40 + 1e-9);
  assert.ok(Math.abs(Math.max(...extents) - 40) < 1e-6);
});

test("head-to-tail chain starts at the origin and ends at the resultant", () => {
  const components = [{ x: 8, y: 0 }, { x: 0, y: -6 }, { x: -2, y: 2 }];
  const construction = buildVectorConstruction(components, 50);
  assert.equal(construction.chain.length, 3);
  assert.deepEqual(construction.chain[0].from, { x: 0, y: 0 });
  const last = construction.chain[construction.chain.length - 1];
  assert.ok(Math.abs(last.to.x - construction.resultant.x) < 1e-9);
  assert.ok(Math.abs(last.to.y - construction.resultant.y) < 1e-9);
  // each link's tail is the previous link's head
  for (let i = 1; i < construction.chain.length; i += 1) {
    assert.ok(Math.abs(construction.chain[i].from.x - construction.chain[i - 1].to.x) < 1e-9);
    assert.ok(Math.abs(construction.chain[i].from.y - construction.chain[i - 1].to.y) < 1e-9);
  }
});

test("no construction is built for a single contribution", () => {
  const construction = buildVectorConstruction([{ x: 7, y: -3 }], 40);
  assert.equal(construction.chain.length, 0);
});

test("a zero resultant closes the chain back near the origin, without fabricating a nonzero arrow", () => {
  const components = [{ x: 5, y: 5 }, { x: -5, y: -5 }];
  const construction = buildVectorConstruction(components, 40);
  assert.ok(magnitude(construction.resultant) < 1e-9);
  const last = construction.chain[construction.chain.length - 1];
  assert.ok(magnitude(last.to) < 1e-9);
});

test("degenerate all-zero input never divides by zero", () => {
  const construction = buildVectorConstruction([{ x: 0, y: 0 }], 40);
  assert.equal(construction.scale_px_per_NperC, 0);
  assert.deepEqual(construction.resultant, { x: 0, y: 0 });
});

test("the probe-vector envelope reads in the mobile band at a 320px Canvas", () => {
  const radius = probeVectorEnvelopeRadius(320);
  assert.ok(radius >= 56 && radius <= 72, `expected 56-72, got ${radius}`);
});

test("the probe-vector envelope reads in the desktop band at a normal desktop Canvas", () => {
  const radius = probeVectorEnvelopeRadius(700);
  assert.ok(radius >= 90 && radius <= 120, `expected 90-120, got ${radius}`);
});

test("the probe-vector envelope grows monotonically between mobile and desktop", () => {
  const a = probeVectorEnvelopeRadius(320);
  const b = probeVectorEnvelopeRadius(500);
  const c = probeVectorEnvelopeRadius(700);
  assert.ok(a < b && b < c);
});

test("the probe-vector envelope clamps at both ends instead of growing or shrinking without bound", () => {
  assert.equal(probeVectorEnvelopeRadius(100), 56);
  assert.equal(probeVectorEnvelopeRadius(5000), 120);
});
