import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  COULOMB_K,
  R_CORE_M,
  accelerationFromField,
  fieldAt,
  forceFromField,
} from "../lib/science/electrostatics/field.ts";
import {
  firstBoundaryIntersection,
  firstCoreIntersection,
  firstSegmentEvent,
} from "../lib/science/electrostatics/events.ts";
import {
  FIELD_SCALE_V1,
  GRID_LIMITS,
  classifyField,
  normalizedStrength,
  sampleFieldGrid,
} from "../lib/science/electrostatics/sampling.ts";
import { MACRO_DT_S, chooseSubsteps, stepMacro } from "../lib/science/electrostatics/integrator.ts";

/**
 * Verification matrix U-01..U-08 and P-01..P-03 of the approved spec, plus event, sampling and
 * finite-output checks. Every oracle is an independent analytic value or a symmetry argument.
 */

const NC = 1e-9;
const DOMAIN = { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 };
const src = (id, x_m, y_m, q_C) => ({ id, x_m, y_m, q_C });

/** Σ|E_i|: the natural scale for rounding when contributions cancel. */
function contributionScale(field) {
  return field.contributions.reduce((sum, c) => sum + c.magnitude_N_per_C, 0);
}

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / Math.abs(expected);
}

/** Deterministic PRNG so every property failure is reproducible from its seed. */
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

function uniform(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

/** 1–4 sources inside the envelope, centres at least 0.24 m apart, plus a probe outside every core. */
function randomScene(rng) {
  const count = 1 + Math.floor(rng() * 4);
  const sources = [];
  while (sources.length < count) {
    const candidate = src(`s${sources.length + 1}`, uniform(rng, -1.6, 1.6), uniform(rng, -1.2, 1.2),
      (rng() < 0.5 ? -1 : 1) * uniform(rng, 1, 5) * NC);
    if (sources.every((s) => Math.hypot(s.x_m - candidate.x_m, s.y_m - candidate.y_m) >= 0.24)) sources.push(candidate);
  }
  let probe;
  do {
    probe = { x: uniform(rng, -2, 2), y: uniform(rng, -1.5, 1.5) };
  } while (sources.some((s) => Math.hypot(probe.x - s.x_m, probe.y - s.y_m) <= R_CORE_M * 1.01));
  return { sources, probe };
}

test("U-01 single positive charge: radial outward with analytic magnitude", () => {
  const q = 3 * NC;
  for (const [x, y] of [[0.5, 0], [0.3, -0.4], [-1.1, 0.7], [0, 0.13]]) {
    const field = fieldAt({ x, y }, [src("s1", 0, 0, q)]);
    assert.equal(field.valid, true);
    const r = Math.hypot(x, y);
    const cross = (field.Ex_N_per_C * y - field.Ey_N_per_C * x) / (field.magnitude_N_per_C * r);
    assert.ok(Math.abs(cross) <= 1e-12, `cross residual ${cross}`);
    assert.ok(field.Ex_N_per_C * x + field.Ey_N_per_C * y > 0, "field points away from a positive charge");
    assert.ok(relativeError(field.magnitude_N_per_C, (COULOMB_K * q) / (r * r)) <= 1e-12);
  }
});

test("U-02 inverse square: doubling the distance quarters the field", () => {
  const sources = [src("s1", 0.2, -0.1, 4 * NC)];
  for (const [ux, uy] of [[1, 0], [0.6, 0.8], [-0.28, 0.96]]) {
    const near = fieldAt({ x: 0.2 + 0.3 * ux, y: -0.1 + 0.3 * uy }, sources);
    const far = fieldAt({ x: 0.2 + 0.6 * ux, y: -0.1 + 0.6 * uy }, sources);
    assert.ok(relativeError(near.magnitude_N_per_C / far.magnitude_N_per_C, 4) <= 1e-12);
  }
});

test("U-03 single negative charge: radial inward with analytic magnitude", () => {
  const q = -2 * NC;
  for (const [x, y] of [[0.5, 0], [-0.3, 0.4], [1.2, -0.9]]) {
    const field = fieldAt({ x, y }, [src("s1", 0, 0, q)]);
    const r = Math.hypot(x, y);
    assert.ok(field.Ex_N_per_C * x + field.Ey_N_per_C * y < 0, "field points toward a negative charge");
    assert.ok(relativeError(field.magnitude_N_per_C, (COULOMB_K * Math.abs(q)) / (r * r)) <= 1e-12);
  }
});

test("U-04 equal like charges: midpoint field is zero with undefined direction", () => {
  const field = fieldAt({ x: 0, y: 0 }, [src("s1", -0.6, 0, 3 * NC), src("s2", 0.6, 0, 3 * NC)]);
  assert.equal(field.valid, true);
  assert.ok(field.magnitude_N_per_C <= field.zeroTolerance_N_per_C);
  assert.equal(field.isZero, true);
  assert.equal(field.direction_rad, null, "zero field has no direction, not 0°");
});

test("U-05 equal unlike charges: midpoint field points to the negative charge with 8kq/d²", () => {
  const q = 5 * NC;
  const d = 1.3;
  const field = fieldAt({ x: 0.1, y: 0.2 }, [src("s1", 0.1 - d / 2, 0.2, q), src("s2", 0.1 + d / 2, 0.2, -q)]);
  assert.ok(field.Ex_N_per_C > 0 && Math.abs(field.Ey_N_per_C) <= 1e-12 * field.magnitude_N_per_C);
  assert.ok(relativeError(field.magnitude_N_per_C, (8 * COULOMB_K * q) / (d * d)) <= 1e-12);
  assert.ok(Math.abs(field.direction_rad) <= 1e-12);
});

test("U-06 four equal charges at rectangle corners: centre field is zero", () => {
  const q = 2 * NC;
  const sources = [src("a", -0.7, -0.4, q), src("b", 0.7, -0.4, q), src("c", 0.7, 0.4, q), src("d", -0.7, 0.4, q)];
  const field = fieldAt({ x: 0, y: 0 }, sources);
  assert.equal(field.isZero, true);
  const [a, b, c, d] = field.contributions;
  assert.ok(Math.abs(a.Ex_N_per_C + c.Ex_N_per_C) <= 1e-12 * a.magnitude_N_per_C, "diagonal pairs cancel");
  assert.ok(Math.abs(b.Ey_N_per_C + d.Ey_N_per_C) <= 1e-12 * b.magnitude_N_per_C);
});

test("U-07 flipping the test charge leaves E identical and reverses F and a", () => {
  const sources = [src("s1", -0.5, 0.2, 3 * NC), src("s2", 0.7, -0.3, -4 * NC)];
  const field = fieldAt({ x: 0.1, y: 0.6 }, sources);
  const again = fieldAt({ x: 0.1, y: 0.6 }, sources);
  assert.deepEqual(again, field, "E is a pure function of position and sources");
  const Fp = forceFromField(field.Ex_N_per_C, field.Ey_N_per_C, 0.3 * NC);
  const Fn = forceFromField(field.Ex_N_per_C, field.Ey_N_per_C, -0.3 * NC);
  const ap = accelerationFromField(field.Ex_N_per_C, field.Ey_N_per_C, 0.3 * NC, 1e-8);
  const an = accelerationFromField(field.Ex_N_per_C, field.Ey_N_per_C, -0.3 * NC, 1e-8);
  assert.deepEqual([Fn.x, Fn.y, an.x, an.y], [-Fp.x, -Fp.y, -ap.x, -ap.y]);
});

test("U-08 doubling the mass halves a and leaves E and F unchanged", () => {
  const field = fieldAt({ x: -0.4, y: 0.9 }, [src("s1", 0.3, 0.1, 5 * NC)]);
  const F1 = forceFromField(field.Ex_N_per_C, field.Ey_N_per_C, 0.2 * NC);
  const a1 = accelerationFromField(field.Ex_N_per_C, field.Ey_N_per_C, 0.2 * NC, 8e-9);
  const a2 = accelerationFromField(field.Ex_N_per_C, field.Ey_N_per_C, 0.2 * NC, 16e-9);
  assert.deepEqual(forceFromField(field.Ex_N_per_C, field.Ey_N_per_C, 0.2 * NC), F1);
  assert.ok(relativeError(a2.x, a1.x / 2) <= 1e-12 && relativeError(a2.y, a1.y / 2) <= 1e-12);
  assert.ok(relativeError(Math.hypot(a2.x, a2.y), Math.hypot(a1.x, a1.y) / 2) <= 1e-12);
});

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

test("P-01 source order invariance across 1,000 seeded states and all permutations", () => {
  const rng = mulberry32(0xe1ec);
  for (let n = 0; n < 1000; n += 1) {
    const { sources, probe } = randomScene(rng);
    const reference = fieldAt(probe, sources);
    for (const order of permutations(sources)) {
      // Reassign ids so the permutation really changes the summation order.
      const relabelled = order.map((s, i) => ({ ...s, id: `s${i + 1}` }));
      const field = fieldAt(probe, relabelled);
      const diff = Math.hypot(field.Ex_N_per_C - reference.Ex_N_per_C, field.Ey_N_per_C - reference.Ey_N_per_C);
      assert.ok(diff <= reference.zeroTolerance_N_per_C, `seeded case ${n}: diff ${diff}`);
    }
  }
});

test("P-02 rotations and mirror reflections transform E covariantly", () => {
  const rng = mulberry32(0x0202);
  for (let n = 0; n < 1000; n += 1) {
    const { sources, probe } = randomScene(rng);
    const theta = uniform(rng, 0, 2 * Math.PI);
    const mirror = rng() < 0.5;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // Orthogonal map: optional mirror y → −y, then rotation by θ.
    const map = (x, y) => {
      const yy = mirror ? -y : y;
      return { x: c * x - s * yy, y: s * x + c * yy };
    };
    const base = fieldAt(probe, sources);
    const moved = fieldAt(map(probe.x, probe.y), sources.map((q) => {
      const p = map(q.x_m, q.y_m);
      return { ...q, x_m: p.x, y_m: p.y };
    }));
    const expected = map(base.Ex_N_per_C, base.Ey_N_per_C);
    const residual = Math.hypot(moved.Ex_N_per_C - expected.x, moved.Ey_N_per_C - expected.y);
    // Near-cancelling configurations are judged against 1e-3 Σ|E_i| instead of a tiny |E|.
    const scale = Math.max(base.magnitude_N_per_C, 1e-3 * contributionScale(base));
    assert.ok(residual / scale <= 1e-11, `seeded case ${n}: residual ${residual / scale}`);
  }
});

test("P-03 E is linear in the source charges", () => {
  const rng = mulberry32(0x0303);
  for (let n = 0; n < 1000; n += 1) {
    const { sources, probe } = randomScene(rng);
    const k = uniform(rng, -3, 3);
    const base = fieldAt(probe, sources);
    const scaled = fieldAt(probe, sources.map((q) => ({ ...q, q_C: q.q_C * k })));
    const residual = Math.hypot(scaled.Ex_N_per_C - k * base.Ex_N_per_C, scaled.Ey_N_per_C - k * base.Ey_N_per_C);
    assert.ok(residual <= 1e-12 * Math.abs(k) * Math.max(base.magnitude_N_per_C, 1e-3 * contributionScale(base)),
      `seeded case ${n}`);
  }
});

test("points on or inside an excluded core are typed invalid with no hidden shift", () => {
  const sources = [src("s1", 0, 0, 3 * NC), src("s2", 1, 0, -3 * NC)];
  for (const point of [{ x: 0, y: 0 }, { x: 0.12, y: 0 }, { x: 0.05, y: -0.05 }, { x: 1 - 1e-300, y: 0 }]) {
    const field = fieldAt(point, sources);
    assert.equal(field.valid, false);
    assert.equal(field.reason, "inside-source-core");
  }
  assert.equal(fieldAt({ x: 0.1200001, y: 0 }, sources).valid, true, "just outside the core is valid");
  assert.equal(fieldAt({ x: 1, y: 0 }, sources).sourceId, "s2");
  assert.equal(fieldAt({ x: Number.NaN, y: 0 }, sources).reason, "non-finite-input");
  assert.equal(fieldAt({ x: 0.5, y: 0 }, []).reason, "no-sources");
});

test("every finite input produces finite output or a typed invalid result", () => {
  const rng = mulberry32(0xf1f1);
  const extremes = [0, 1e-300, -1e-300, 1e300, -1e300, 1e-12, 0.12, 5e-9, Number.MAX_VALUE, -Number.MAX_VALUE];
  const pick = () => (rng() < 0.3 ? extremes[Math.floor(rng() * extremes.length)] : uniform(rng, -3, 3));
  for (let n = 0; n < 5000; n += 1) {
    const sources = Array.from({ length: 1 + Math.floor(rng() * 4) }, (_, i) =>
      src(`s${i + 1}`, pick(), pick(), rng() < 0.2 ? pick() : uniform(rng, -5, 5) * NC));
    const field = fieldAt({ x: pick(), y: pick() }, sources);
    if (field.valid) {
      for (const value of [field.Ex_N_per_C, field.Ey_N_per_C, field.magnitude_N_per_C, field.zeroTolerance_N_per_C]) {
        assert.ok(Number.isFinite(value), `seeded case ${n}`);
      }
    } else {
      assert.ok(["inside-source-core", "non-finite-input", "no-sources"].includes(field.reason));
    }
    const state = { x_m: pick(), y_m: pick(), vx_mps: pick(), vy_mps: pick(), t_s: 0 };
    const result = stepMacro(state, { q_C: pick(), mass_kg: pick() }, { sources, domain: DOMAIN, rCore_m: R_CORE_M });
    for (const value of Object.values(result.state)) assert.ok(Number.isFinite(value), `seeded step ${n}`);
    if (result.status === "invalid") assert.equal(typeof result.reason, "string");
  }
});

test("core intersection returns the first crossing along the segment", () => {
  const sources = [src("s1", 0, 0, NC), src("s2", 0.5, 0, NC)];
  const hit = firstCoreIntersection({ x: -1, y: 0 }, { x: 1, y: 0 }, sources, 0.12);
  assert.equal(hit.sourceId, "s1");
  assert.ok(Math.abs(hit.fraction - 0.44) <= 1e-15);
  assert.equal(firstCoreIntersection({ x: -1, y: 0.2 }, { x: 1, y: 0.2 }, sources, 0.12), null, "passing by misses");
  const tangent = firstCoreIntersection({ x: -1, y: 0.12 }, { x: 1, y: 0.12 }, [sources[0]], 0.12);
  assert.ok(tangent !== null && Math.abs(tangent.fraction - 0.5) <= 1e-12, "grazing contact counts");
  assert.equal(firstCoreIntersection({ x: 0.3, y: 0.3 }, { x: 0.3, y: 0.3 }, sources, 0.12), null, "zero-length segment");
});

test("boundary intersection stops at the first rectangle edge and never wraps", () => {
  assert.equal(firstBoundaryIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, DOMAIN), null);
  assert.ok(Math.abs(firstBoundaryIntersection({ x: 1.5, y: 0 }, { x: 2.5, y: 0 }, DOMAIN) - 0.5) <= 1e-15);
  const corner = firstBoundaryIntersection({ x: 1.9, y: 1.4 }, { x: 2.3, y: 1.9 }, DOMAIN);
  assert.ok(Math.abs(corner - 0.2) <= 1e-12, "the nearer edge (x = 2) wins");
  const event = firstSegmentEvent({ x: 1.7, y: 0 }, { x: 2.2, y: 0 }, [src("s1", 1.95, 0, NC)], DOMAIN, 0.12);
  assert.equal(event.reason, "entered-source-core", "core crossed before the edge");
});

test("substep count is the smallest of 1, 2, 4 meeting the 2% clearance rule", () => {
  const system = { sources: [src("s1", 0, 0, 5 * NC)], domain: DOMAIN, rCore_m: 0.12 };
  const at = (x, v, a) => chooseSubsteps({ x_m: x, y_m: 0, vx_mps: v, vy_mps: 0, t_s: 0 }, { x: a, y: 0 }, system);
  const h = MACRO_DT_S;
  // clearance 0.1 m: n = 1 allows |v| h ≤ 0.002 m.
  assert.equal(at(0.22, 0.002 / h * 0.999, 0), 1);
  assert.equal(at(0.22, 0.002 / h * 1.5, 0), 2);
  assert.equal(at(0.22, 0.002 / h * 3, 0), 4);
  assert.equal(at(0.22, 0.002 / h * 100, 0), 4, "bounded: never more than 4");
});

test("fixed log scale classifies zero, low clip, normal, high clip and core distinctly", () => {
  assert.equal(normalizedStrength(1), 0);
  assert.equal(normalizedStrength(5000), 1);
  assert.ok(Math.abs(normalizedStrength(Math.sqrt(5000)) - 0.5) <= 1e-15);
  const q = 5 * NC;
  const sources = [src("s1", 0, 0, q)];
  const at = (x) => classifyField(fieldAt({ x, y: 0 }, sources)).kind;
  assert.equal(at(0.05), "core");
  assert.equal(at(0.5), "normal");
  assert.equal(at(Math.sqrt((COULOMB_K * q) / 0.5)), "low-clip", "E = 0.5 N/C");
  // Two nearly coincident 5 nC sources just outside both cores: E ≈ 2 × 3,095 N/C.
  const stacked = [src("a", 0, 0.001, q), src("b", 0, -0.001, q)];
  assert.equal(classifyField(fieldAt({ x: 0.1205, y: 0 }, stacked)).kind, "high-clip");
  assert.equal(classifyField(fieldAt({ x: 0, y: 0 }, [src("a", -1, 0, q), src("b", 1, 0, q)])).kind, "zero");
  assert.deepEqual(FIELD_SCALE_V1, { Emin_N_per_C: 1, Emax_N_per_C: 5000 });
});

test("grid sampler covers the domain at cell centres and enforces the grid budget", () => {
  const sources = [src("s1", 0, 0, 3 * NC)];
  const grid = sampleFieldGrid(sources, DOMAIN, GRID_LIMITS.mobile.cols, GRID_LIMITS.mobile.rows, R_CORE_M);
  assert.equal(grid.ok, true);
  assert.equal(grid.samples.length, 24 * 18);
  assert.deepEqual([grid.samples[0].x_m, grid.samples[0].y_m], [-2 + 4 / 48, -1.5 + 3 / 36]);
  for (const sample of grid.samples) {
    if (sample.glyph.kind === "normal" || sample.glyph.kind.endsWith("clip")) {
      assert.ok(Math.abs(Math.hypot(sample.ux, sample.uy) - 1) <= 1e-12);
    }
  }
  const desktop = sampleFieldGrid(sources, DOMAIN, 40, 30, R_CORE_M);
  assert.equal(desktop.samples.length, 1200);
  assert.equal(sampleFieldGrid(sources, DOMAIN, 41, 30, R_CORE_M).reason, "invalid-grid-size");
  assert.equal(sampleFieldGrid(sources, DOMAIN, 2.5, 3, R_CORE_M).reason, "invalid-grid-size");
});

test("pure science imports nothing from React, DOM, Canvas, Three.js, URL or models", async () => {
  const dir = new URL("../lib/science/electrostatics/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".ts"));
  assert.deepEqual(files.sort(), ["events.ts", "field.ts", "integrator.ts", "sampling.ts", "types.ts"]);
  for (const name of files) {
    const source = await readFile(new URL(name, dir), "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      assert.match(match[1], /^\.\/[a-z]+\.ts$/, `${name} may only import sibling science modules`);
    }
    assert.doesNotMatch(source, /\b(react|three|document|window|canvas|HTMLElement|URLSearchParams|new URL|location)\b/i,
      `${name} must stay renderer-, DOM- and URL-free`);
  }
});

test("electrostatic models import only lib/science and sibling electrostatic models", async () => {
  for (const name of ["electrostatic.ts", "electrostatic-validation.ts", "electrostatic-serialization.ts"]) {
    const source = await readFile(new URL(`../models/${name}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      assert.match(match[1], /^(\.\.\/lib\/science\/electrostatics\/[a-z]+\.ts|\.\/electrostatic[a-z-]*\.ts)$/, `${name}: ${match[1]}`);
    }
    assert.doesNotMatch(source, /\b(react|three|document|window|URLSearchParams|new URL|location)\b/i);
  }
});
