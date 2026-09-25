import assert from "node:assert/strict";
import test from "node:test";

import { fieldAt, R_CORE_M } from "../lib/science/electrostatics/field.ts";
import {
  FIELD_LINE_OPTIONS_V1,
  fieldLineSeeds,
  seedCountForCharge,
  traceFieldLine,
  traceFieldLines,
} from "../lib/science/electrostatics/fieldLines.ts";

const DOMAIN = { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 };
const nC = 1e-9;
const source = (id, x_m, y_m, q_nC) => ({ id, x_m, y_m, q_C: q_nC * nC });

const SCENES = {
  "single +Q": [source("s1", 0, 0, 3)],
  "single −Q": [source("s1", 0, 0, -3)],
  "equal like pair": [source("s1", -0.6, 0, 3), source("s2", 0.6, 0, 3)],
  dipole: [source("s1", -0.6, 0, 3), source("s2", 0.6, 0, -3)],
  "unequal like pair": [source("s1", -0.6, 0, 5), source("s2", 0.6, 0, 1)],
  "four-charge square": [source("s1", -0.5, -0.5, 3), source("s2", 0.5, -0.5, 3), source("s3", 0.5, 0.5, 3), source("s4", -0.5, 0.5, 3)],
};

/** Terminal endpoint tolerances (metres). Crossings are solved analytically, so these are rounding-level. */
const CORE_TOLERANCE_M = 1e-9;
const BOUNDARY_TOLERANCE_M = 1e-9;
/** Chord tangent vs local E at the chord midpoint. */
const TANGENT_LIMIT_DEG = 5;
const ORDINARY = new Set(["source-core", "domain-boundary", "zero-field"]);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function distanceToPolyline(point, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return best;
}

/** Max distance from every point of `a` to polyline `b` (one-sided Hausdorff). */
const geometricGap = (a, b) => Math.max(...a.map((point) => distanceToPolyline(point, b)));

function onBoundary(point) {
  const inside = point.x >= DOMAIN.xmin - BOUNDARY_TOLERANCE_M && point.x <= DOMAIN.xmax + BOUNDARY_TOLERANCE_M &&
    point.y >= DOMAIN.ymin - BOUNDARY_TOLERANCE_M && point.y <= DOMAIN.ymax + BOUNDARY_TOLERANCE_M;
  const edge = Math.min(Math.abs(point.x - DOMAIN.xmin), Math.abs(point.x - DOMAIN.xmax), Math.abs(point.y - DOMAIN.ymin), Math.abs(point.y - DOMAIN.ymax));
  return inside && edge <= BOUNDARY_TOLERANCE_M;
}

/** Shared per-line invariants; returns the worst tangent angle (degrees) seen on ordinary segments. */
function checkLine(line, sources, label) {
  assert.equal(line.orientation, "along-E");
  assert.ok(ORDINARY.has(line.start.reason), `${label}: start ${line.start.reason}`);
  assert.ok(ORDINARY.has(line.end.reason), `${label}: end ${line.end.reason}`);
  const { points } = line;
  assert.ok(points.length >= 2, label);
  for (const point of points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), label);
    for (const s of sources) {
      assert.ok(Math.hypot(point.x - s.x_m, point.y - s.y_m) >= R_CORE_M - CORE_TOLERANCE_M, `${label}: point inside core ${s.id}`);
    }
  }
  for (const point of points.slice(1, -1)) {
    assert.ok(point.x > DOMAIN.xmin && point.x < DOMAIN.xmax && point.y > DOMAIN.ymin && point.y < DOMAIN.ymax, `${label}: interior point outside domain`);
  }
  for (const [terminal, point] of [[line.start, points[0]], [line.end, points.at(-1)]]) {
    if (terminal.reason === "source-core") {
      const s = sources.find((item) => item.id === terminal.sourceId);
      assert.ok(Math.abs(Math.hypot(point.x - s.x_m, point.y - s.y_m) - R_CORE_M) <= CORE_TOLERANCE_M, `${label}: core endpoint off circle`);
    }
    if (terminal.reason === "domain-boundary") assert.ok(onBoundary(point), `${label}: boundary endpoint off rectangle`);
  }
  // Electrostatic lines never close: the two ends are distinct.
  assert.ok(dist(points[0], points.at(-1)) > FIELD_LINE_OPTIONS_V1.loopRadius_m, `${label}: closed geometry`);

  let worst = 0;
  const cosLimit = Math.cos((TANGENT_LIMIT_DEG * Math.PI) / 180);
  const zeroEnds = [line.start.reason === "zero-field" ? points[0] : null, line.end.reason === "zero-field" ? points.at(-1) : null].filter(Boolean);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const chord = dist(a, b);
    if (chord < 1e-12) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Near a null the direction is ill-conditioned by definition; skip the last few millimetres.
    if (zeroEnds.some((z) => dist(mid, z) < 0.02)) continue;
    const field = fieldAt(mid, sources, R_CORE_M);
    if (!field.valid) continue; // midpoint of a chord ending exactly on a core circle can graze it
    const cos = ((b.x - a.x) * field.Ex_N_per_C + (b.y - a.y) * field.Ey_N_per_C) / (chord * field.magnitude_N_per_C);
    assert.ok(cos > cosLimit, `${label}: segment ${i} deviates from +E (cos ${cos})`);
    worst = Math.max(worst, (Math.acos(Math.min(1, cos)) * 180) / Math.PI);
  }
  return worst;
}

const traced = Object.fromEntries(Object.entries(SCENES).map(([name, sources]) => [name, traceFieldLines(sources, DOMAIN, R_CORE_M)]));

test("every canonical line is +E oriented, tangent to E, core-safe, clipped and not closed", () => {
  for (const [name, lines] of Object.entries(traced)) {
    assert.ok(lines.length > 0, name);
    let worst = 0;
    for (const [index, line] of lines.entries()) worst = Math.max(worst, checkLine(line, SCENES[name], `${name} #${index}`));
    assert.ok(worst < TANGENT_LIMIT_DEG, name);
  }
});

test("seeds are deterministic, outside every core, and scale mildly with |q|", () => {
  assert.equal(seedCountForCharge(1 * nC), 6);
  assert.equal(seedCountForCharge(3 * nC), 8);
  assert.equal(seedCountForCharge(5 * nC), 12);
  assert.equal(seedCountForCharge(-5 * nC), 12);
  const sources = SCENES["four-charge square"];
  const seeds = fieldLineSeeds(sources, DOMAIN, R_CORE_M);
  assert.deepEqual(seeds, fieldLineSeeds(sources, DOMAIN, R_CORE_M));
  for (const seed of seeds) {
    const s = sources.find((item) => item.id === seed.sourceId);
    assert.ok(Math.abs(dist(seed.point, { x: s.x_m, y: s.y_m }) - FIELD_LINE_OPTIONS_V1.seedRadiusFactor * R_CORE_M) < 1e-12);
    assert.equal(fieldAt(seed.point, sources, R_CORE_M).valid, true);
  }
});

test("tracing is deterministic for the same scene, options and seeds", () => {
  for (const [name, sources] of Object.entries(SCENES)) {
    assert.deepEqual(traceFieldLines(sources, DOMAIN, R_CORE_M), traced[name], name);
  }
});

test("A: a single +Q gives straight radial lines from its core to the boundary", () => {
  for (const line of traced["single +Q"]) {
    assert.deepEqual(line.start, { reason: "source-core", sourceId: "s1" });
    assert.deepEqual(line.end, { reason: "domain-boundary" });
    let previous = 0;
    for (const point of line.points) {
      const r = Math.hypot(point.x, point.y);
      assert.ok(r > previous, "outward along +E");
      previous = r;
      // Perpendicular drift from the seed ray.
      const drift = Math.abs(point.x * Math.sin(line.seed.angle_rad) - point.y * Math.cos(line.seed.angle_rad));
      assert.ok(drift < 1e-9, `radial drift ${drift}`);
    }
  }
});

test("B: a single −Q has the +Q geometry with reversed orientation", () => {
  const plus = traced["single +Q"];
  const minus = traced["single −Q"];
  assert.equal(minus.length, plus.length);
  for (const [index, line] of minus.entries()) {
    assert.deepEqual(line.start, { reason: "domain-boundary" });
    assert.deepEqual(line.end, { reason: "source-core", sourceId: "s1" });
    const reversed = [...plus[index].points].reverse();
    assert.equal(line.points.length, reversed.length);
    for (const [i, point] of line.points.entries()) assert.ok(dist(point, reversed[i]) < 1e-9);
  }
});

/** Collinear point charges on the x axis conserve the flux function Ψ = Σ q_i cos θ_i along a line. */
function fluxDrift(line, sources) {
  const psi = (p) => sources.reduce((sum, s) => sum + (s.q_C / nC) * ((p.x - s.x_m) / Math.hypot(p.x - s.x_m, p.y - s.y_m)), 0);
  const reference = psi(line.points[0]);
  const total = sources.reduce((sum, s) => sum + Math.abs(s.q_C / nC), 0);
  return Math.max(...line.points.map((p) => Math.abs(psi(p) - reference))) / total;
}

test("collinear scenes conserve the analytic flux function along every line", () => {
  let worst = 0;
  for (const name of ["equal like pair", "dipole", "unequal like pair"]) {
    for (const line of traced[name]) worst = Math.max(worst, fluxDrift(line, SCENES[name]));
  }
  assert.ok(worst < 1e-4, `relative flux drift ${worst}`);
});

function mirrored(lines, map) {
  return lines.map((line) => line.points.map(map));
}

function assertSetMatches(lines, expected, tolerance, label) {
  for (const [index, points] of lines.entries()) {
    const gap = Math.min(...expected.map((other) => geometricGap(points, other.points)));
    assert.ok(gap < tolerance, `${label} #${index}: nearest mirrored line is ${gap} m away`);
  }
}

test("C: equal like charges are mirror-symmetric, never connect, and stop at the midpoint null", () => {
  const lines = traced["equal like pair"];
  assertSetMatches(mirrored(lines, (p) => ({ x: -p.x, y: p.y })), lines, 1e-4, "x mirror");
  assertSetMatches(mirrored(lines, (p) => ({ x: p.x, y: -p.y })), lines, 1e-4, "y mirror");
  for (const line of lines) {
    assert.notEqual(line.end.reason, "source-core", "no line ends on a positive charge");
    assert.equal(line.start.reason, "source-core");
  }
  const nulls = lines.filter((line) => line.end.reason === "zero-field");
  assert.equal(nulls.length, 2);
  for (const line of nulls) assert.ok(dist(line.points.at(-1), { x: 0, y: 0 }) < 0.01);
});

test("D: the dipole runs + → − or boundary, with mirror symmetry", () => {
  const lines = traced.dipole;
  for (const line of lines) {
    if (line.seed.sourceId === "s1") {
      assert.deepEqual(line.start, { reason: "source-core", sourceId: "s1" });
      assert.ok(line.end.reason === "domain-boundary" || (line.end.reason === "source-core" && line.end.sourceId === "s2"));
    } else {
      assert.deepEqual(line.end, { reason: "source-core", sourceId: "s2" });
      assert.ok(line.start.reason === "domain-boundary" || (line.start.reason === "source-core" && line.start.sourceId === "s1"));
    }
  }
  assert.ok(lines.some((line) => line.start.reason === "source-core" && line.end.reason === "source-core"));
  assertSetMatches(mirrored(lines, (p) => ({ x: p.x, y: -p.y })), lines, 1e-4, "y mirror");
  // x → −x swaps + and −, so the mirrored + lines are the − lines traced the other way.
  assertSetMatches(mirrored(lines, (p) => ({ x: -p.x, y: p.y })), lines, 1e-4, "x mirror");
});

test("E: an unequal like pair's null shifts toward the smaller charge", () => {
  // 5/(x+0.6)² = 1/(0.6−x)²  ⇒  x = 0.6(√5−1)/(√5+1)
  const expected = { x: (0.6 * (Math.sqrt(5) - 1)) / (Math.sqrt(5) + 1), y: 0 };
  const nulls = traced["unequal like pair"].filter((line) => line.end.reason === "zero-field");
  assert.deepEqual(nulls.map((line) => line.seed.sourceId).sort(), ["s1", "s2"]);
  for (const line of nulls) assert.ok(dist(line.points.at(-1), expected) < 0.01, `null endpoint ${JSON.stringify(line.points.at(-1))}`);
  assert.ok(expected.x > 0, "closer to the 1 nC charge at +0.6 m");
});

test("F: the symmetric square respects its mirror and 90° symmetry and a safely handled centre null", () => {
  const lines = traced["four-charge square"];
  assertSetMatches(mirrored(lines, (p) => ({ x: -p.x, y: p.y })), lines, 1e-4, "x mirror");
  assertSetMatches(mirrored(lines, (p) => ({ x: p.x, y: -p.y })), lines, 1e-4, "y mirror");
  // The 4 × 3 m domain is not square, so compare the rotated geometry only where it stays inside.
  const inside = (p) => p.x >= DOMAIN.xmin && p.x <= DOMAIN.xmax && p.y >= DOMAIN.ymin && p.y <= DOMAIN.ymax;
  assertSetMatches(mirrored(lines, (p) => ({ x: -p.y, y: p.x })).map((points) => points.filter(inside)), lines, 1e-4, "90° rotation");
  const nulls = lines.filter((line) => line.end.reason === "zero-field");
  assert.equal(nulls.length, 4);
  for (const line of nulls) assert.ok(dist(line.points.at(-1), { x: 0, y: 0 }) < 0.01);
  for (const line of lines) assert.notEqual(line.end.reason, "source-core");
});

test("default tolerance agrees with a 100× tighter trace of the same dipole lines", () => {
  const sources = SCENES.dipole;
  const tight = { ...FIELD_LINE_OPTIONS_V1, tolerance_m: FIELD_LINE_OPTIONS_V1.tolerance_m / 100 };
  for (const line of traced.dipole) {
    const reference = traceFieldLine(line.seed.point, sources, DOMAIN, R_CORE_M, tight);
    assert.deepEqual([reference.start, reference.end], [line.start, line.end]);
    assert.ok(geometricGap(line.points, reference.points) < 1e-3);
  }
});

test("a seed at an exact null or inside a core never normalizes an undefined direction", () => {
  const pair = SCENES["equal like pair"];
  const atNull = traceFieldLine({ x: 0, y: 0 }, pair, DOMAIN, R_CORE_M);
  assert.deepEqual([atNull.start, atNull.end], [{ reason: "zero-field" }, { reason: "zero-field" }]);
  assert.equal(atNull.points.length, 1);
  const inCore = traceFieldLine({ x: 0.6, y: 0.05 }, pair, DOMAIN, R_CORE_M);
  assert.deepEqual(inCore.end, { reason: "source-core", sourceId: "s2" });
});

test("safety limits return typed terminals instead of partial silent geometry", () => {
  const sources = SCENES["single +Q"];
  const short = traceFieldLine({ x: 0.2, y: 0 }, sources, DOMAIN, R_CORE_M, { ...FIELD_LINE_OPTIONS_V1, maxLength_m: 0.3 });
  assert.equal(short.end.reason, "max-length");
  const few = traceFieldLine({ x: 0.2, y: 0 }, sources, DOMAIN, R_CORE_M, { ...FIELD_LINE_OPTIONS_V1, maxSteps: 3 });
  assert.equal(few.end.reason, "max-steps");
  assert.equal(few.acceptedSteps <= 6, true);
});
