#!/usr/bin/env python3
"""Regenerate the Electrostatic Field Studio v0.1 RK4 reference fixtures.

Provenance
----------
The physics, event detection, RK4 reference integrator, the seven representative
scenarios and the seeded Monte Carlo case construction below are copied verbatim
(``field_at`` .. ``simulate``, ``interp``, ``scenarios`` and the RNG sequence in
``monte_carlo_cases``; ``simulate_bounded`` and ``compare`` are trimmed to the
metrics used by the self-check, arithmetic unchanged) from the Owner-approved independent
reference harness ``validate_envelope.py`` attached to the Notion page
"Electrostatic Field Studio v0.1 | Numerical Envelope Validation (D-01-D-04)"
(file upload 3e2494ee-b117-8114-b9ba-00b23289a0b2, 2026-09-21).

Only fixture emission and the self-check are new. This script is test tooling;
it is never imported by production code. It uses only the Python standard library.

Usage:  python3 tests/fixtures/electrostatic/generate_reference.py
Output: representative-rk4.json and monte-carlo-rk4.json next to this file.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path


K = 8.9875517923e9
DOMAIN = (-2.0, 2.0, -1.5, 1.5)
OUT = Path(__file__).resolve().parent
REFERENCE_MAX_DT = 1 / 30720
MONTE_CARLO_REFERENCE_DT = 1 / 15360
MONTE_CARLO_SEED = 20260922
MONTE_CARLO_COUNT = 200
REPRESENTATIVE_GRID_POINTS = 101
MONTE_CARLO_GRID_POINTS = 51


@dataclass(frozen=True)
class Charge:
    x: float
    y: float
    q_c: float


@dataclass(frozen=True)
class Scenario:
    name: str
    sources: tuple[Charge, ...]
    q_test_c: float
    mass_kg: float
    r0: tuple[float, float]
    v0: tuple[float, float]
    r_core: float
    t_end: float
    description: str


# ---- verbatim from validate_envelope.py ------------------------------------

def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def mul(s, a):
    return (s * a[0], s * a[1])


def norm(a):
    return math.hypot(a[0], a[1])


def field_at(pos, sources, r_core, allow_inside=False):
    ex = 0.0
    ey = 0.0
    for src in sources:
        dx = pos[0] - src.x
        dy = pos[1] - src.y
        r2 = dx * dx + dy * dy
        if not allow_inside and r2 <= r_core * r_core:
            return None
        if r2 == 0.0:
            return None
        inv_r3 = 1.0 / (r2 * math.sqrt(r2))
        scale = K * src.q_c * inv_r3
        ex += scale * dx
        ey += scale * dy
    return (ex, ey)


def acceleration(pos, scenario, allow_inside=False):
    e = field_at(pos, scenario.sources, scenario.r_core, allow_inside)
    if e is None:
        return None
    beta = scenario.q_test_c / scenario.mass_kg
    return (beta * e[0], beta * e[1])


def energy(pos, vel, scenario):
    kinetic = 0.5 * scenario.mass_kg * (vel[0] ** 2 + vel[1] ** 2)
    potential = 0.0
    abs_potential = 0.0
    for src in scenario.sources:
        r = math.hypot(pos[0] - src.x, pos[1] - src.y)
        term = K * scenario.q_test_c * src.q_c / r
        potential += term
        abs_potential += abs(term)
    total = kinetic + potential
    scale = max(abs(total), kinetic, abs_potential, 1e-30)
    return total, scale


def first_circle_hit(p0, p1, sources, radius):
    dx = p1[0] - p0[0]
    dy = p1[1] - p0[1]
    a = dx * dx + dy * dy
    if a == 0:
        return None
    best = None
    for index, src in enumerate(sources):
        fx = p0[0] - src.x
        fy = p0[1] - src.y
        b = 2 * (fx * dx + fy * dy)
        c = fx * fx + fy * fy - radius * radius
        disc = b * b - 4 * a * c
        if disc < 0:
            continue
        root = math.sqrt(max(0.0, disc))
        for t in ((-b - root) / (2 * a), (-b + root) / (2 * a)):
            if 0.0 <= t <= 1.0 and (best is None or t < best[0]):
                best = (t, index)
    return best


def first_boundary_hit(p0, p1, domain=DOMAIN):
    xmin, xmax, ymin, ymax = domain
    if xmin <= p1[0] <= xmax and ymin <= p1[1] <= ymax:
        return None
    dx = p1[0] - p0[0]
    dy = p1[1] - p0[1]
    candidates = []
    if dx != 0:
        for x in (xmin, xmax):
            t = (x - p0[0]) / dx
            y = p0[1] + t * dy
            if 0 <= t <= 1 and ymin - 1e-12 <= y <= ymax + 1e-12:
                candidates.append(t)
    if dy != 0:
        for y in (ymin, ymax):
            t = (y - p0[1]) / dy
            x = p0[0] + t * dx
            if 0 <= t <= 1 and xmin - 1e-12 <= x <= xmax + 1e-12:
                candidates.append(t)
    return min(candidates) if candidates else None


def event_on_segment(p0, p1, scenario):
    circle = first_circle_hit(p0, p1, scenario.sources, scenario.r_core)
    boundary = first_boundary_hit(p0, p1)
    candidates = []
    if circle is not None:
        candidates.append((circle[0], "entered-source-core"))
    if boundary is not None:
        candidates.append((boundary, "left-domain"))
    return min(candidates, key=lambda item: item[0]) if candidates else None


def vv_step(pos, vel, dt, scenario):
    a0 = acceleration(pos, scenario)
    if a0 is None:
        raise ValueError("invalid starting position")
    candidate = add(add(pos, mul(dt, vel)), mul(0.5 * dt * dt, a0))
    event = event_on_segment(pos, candidate, scenario)
    if event is not None:
        fraction, reason = event
        hit = add(pos, mul(fraction, (candidate[0] - pos[0], candidate[1] - pos[1])))
        hit_vel = add(vel, mul(fraction * dt, a0))
        return hit, hit_vel, reason, fraction
    a1 = acceleration(candidate, scenario)
    if a1 is None:
        raise RuntimeError("event detection failed before invalid field evaluation")
    new_vel = add(vel, mul(0.5 * dt, add(a0, a1)))
    return candidate, new_vel, None, 1.0


def rk4_candidate(pos, vel, dt, scenario):
    def deriv(p, v):
        a = acceleration(p, scenario)
        if a is None:
            return None
        return v, a

    k1 = deriv(pos, vel)
    if k1 is None:
        return None
    p2 = add(pos, mul(0.5 * dt, k1[0]))
    v2 = add(vel, mul(0.5 * dt, k1[1]))
    k2 = deriv(p2, v2)
    if k2 is None:
        return None
    p3 = add(pos, mul(0.5 * dt, k2[0]))
    v3 = add(vel, mul(0.5 * dt, k2[1]))
    k3 = deriv(p3, v3)
    if k3 is None:
        return None
    p4 = add(pos, mul(dt, k3[0]))
    v4 = add(vel, mul(dt, k3[1]))
    k4 = deriv(p4, v4)
    if k4 is None:
        return None
    dp = (
        dt * (k1[0][0] + 2 * k2[0][0] + 2 * k3[0][0] + k4[0][0]) / 6,
        dt * (k1[0][1] + 2 * k2[0][1] + 2 * k3[0][1] + k4[0][1]) / 6,
    )
    dv = (
        dt * (k1[1][0] + 2 * k2[1][0] + 2 * k3[1][0] + k4[1][0]) / 6,
        dt * (k1[1][1] + 2 * k2[1][1] + 2 * k3[1][1] + k4[1][1]) / 6,
    )
    return add(pos, dp), add(vel, dv)


def simulate(scenario, method, dt, sample_interval=0.001):
    pos = scenario.r0
    vel = scenario.v0
    t = 0.0
    event = None
    event_time = None
    samples = [(0.0, pos[0], pos[1], vel[0], vel[1])]
    next_sample = sample_interval
    h0, energy_scale = energy(pos, vel, scenario)
    max_energy_drift = 0.0
    final_energy_drift = 0.0
    steps = 0
    min_distance = min(math.hypot(pos[0] - s.x, pos[1] - s.y) for s in scenario.sources)

    while t < scenario.t_end - 1e-15 and event is None:
        h = min(dt, scenario.t_end - t)
        if method == "rk4":
            trial_h = h
            candidate = rk4_candidate(pos, vel, trial_h, scenario)
            while candidate is None and trial_h > dt / 4096:
                trial_h *= 0.5
                candidate = rk4_candidate(pos, vel, trial_h, scenario)
            if candidate is None:
                a0 = acceleration(pos, scenario)
                candidate_pos = add(add(pos, mul(trial_h, vel)), mul(0.5 * trial_h * trial_h, a0))
                hit = event_on_segment(pos, candidate_pos, scenario)
                if hit is None:
                    raise RuntimeError("RK4 failed without a detectable event")
                frac, event = hit
                pos = add(pos, mul(frac, (candidate_pos[0] - pos[0], candidate_pos[1] - pos[1])))
                vel = add(vel, mul(frac * trial_h, a0))
                event_time = t + frac * trial_h
                t = event_time
                break
            candidate_pos, candidate_vel = candidate
            hit = event_on_segment(pos, candidate_pos, scenario)
            if hit is not None:
                frac, event = hit
                pos = add(pos, mul(frac, (candidate_pos[0] - pos[0], candidate_pos[1] - pos[1])))
                vel = add(vel, mul(frac, (candidate_vel[0] - vel[0], candidate_vel[1] - vel[1])))
                event_time = t + frac * trial_h
                t = event_time
            else:
                pos, vel = candidate_pos, candidate_vel
                t += trial_h
        else:
            pos, vel, event, fraction = vv_step(pos, vel, h, scenario)
            t += fraction * h
            if event is not None:
                event_time = t

        steps += 1
        min_distance = min(min_distance, *(math.hypot(pos[0] - s.x, pos[1] - s.y) for s in scenario.sources))
        if event is None:
            h_now, _ = energy(pos, vel, scenario)
            final_energy_drift = abs(h_now - h0) / energy_scale
            max_energy_drift = max(max_energy_drift, final_energy_drift)
        if t + 1e-12 >= next_sample or event is not None or t >= scenario.t_end - 1e-15:
            samples.append((t, pos[0], pos[1], vel[0], vel[1]))
            while next_sample <= t + 1e-12:
                next_sample += sample_interval

    if samples[-1][0] != t:
        samples.append((t, pos[0], pos[1], vel[0], vel[1]))
    return {
        "method": method, "dt": dt, "steps": steps, "t": t, "pos": pos, "vel": vel,
        "event": event or "none", "event_time": event_time, "samples": samples,
        "max_energy_drift": max_energy_drift, "final_energy_drift": final_energy_drift,
        "min_distance": min_distance,
    }


def simulate_bounded(scenario, base_dt=1 / 960, max_substeps=4, target_fraction=0.02, sample_interval=0.001):
    pos = scenario.r0
    vel = scenario.v0
    t = 0.0
    event = None
    event_time = None
    samples = [(0.0, pos[0], pos[1], vel[0], vel[1])]
    next_sample = sample_interval
    h0, energy_scale = energy(pos, vel, scenario)
    max_energy_drift = 0.0
    steps = 0
    macro_steps = 0
    while t < scenario.t_end - 1e-15 and event is None:
        macro_h = min(base_dt, scenario.t_end - t)
        a0 = acceleration(pos, scenario)
        nearest = min(math.hypot(pos[0] - s.x, pos[1] - s.y) for s in scenario.sources)
        clearance = max(nearest - scenario.r_core, 1e-12)
        chosen = max_substeps
        for n in (1, 2, 4):
            h = macro_h / n
            estimated = norm(vel) * h + 0.5 * norm(a0) * h * h
            if estimated / clearance <= target_fraction:
                chosen = n
                break
        macro_steps += 1
        h = macro_h / chosen
        for _ in range(chosen):
            pos, vel, event, fraction = vv_step(pos, vel, h, scenario)
            t += fraction * h
            steps += 1
            if event is not None:
                event_time = t
            else:
                h_now, _ = energy(pos, vel, scenario)
                max_energy_drift = max(max_energy_drift, abs(h_now - h0) / energy_scale)
            if t + 1e-12 >= next_sample or event is not None or t >= scenario.t_end - 1e-15:
                samples.append((t, pos[0], pos[1], vel[0], vel[1]))
                while next_sample <= t + 1e-12:
                    next_sample += sample_interval
            if event is not None:
                break
    if samples[-1][0] != t:
        samples.append((t, pos[0], pos[1], vel[0], vel[1]))
    return {"t": t, "event": event or "none", "event_time": event_time, "samples": samples,
            "max_energy_drift": max_energy_drift, "steps": steps, "macro_steps": macro_steps}


def interp(samples, t):
    if t <= samples[0][0]:
        return samples[0][1:]
    if t >= samples[-1][0]:
        return samples[-1][1:]
    lo, hi = 0, len(samples) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if samples[mid][0] <= t:
            lo = mid
        else:
            hi = mid
    a, b = samples[lo], samples[hi]
    f = (t - a[0]) / (b[0] - a[0])
    return tuple(a[i] + f * (b[i] - a[i]) for i in range(1, 5))


def compare(run, reference):
    common_t = min(run["t"], reference["t"])
    path_errors = []
    for t in [i * common_t / 100 for i in range(101)] if common_t > 0 else [0]:
        va = interp(run["samples"], t)
        vb = interp(reference["samples"], t)
        path_errors.append(math.hypot(va[0] - vb[0], va[1] - vb[1]))
    return {"max_path_error_m": max(path_errors), "event_match": run["event"] == reference["event"]}


def scenarios():
    nc = 1e-9
    ug = 1e-9
    return (
        Scenario("single_scatter", (Charge(0, 0, 5 * nc),), 0.5 * nc, 5 * ug,
                 (-1.4, -0.38), (2.2, 0.25), 0.12, 1.4,
                 "Repulsive single-charge scattering with visible deflection."),
        Scenario("near_core_graze", (Charge(0, 0, 5 * nc),), 0.5 * nc, 50 * ug,
                 (-1.1, 0.13), (4.0, 0.0), 0.12, 0.8,
                 "High-curvature repulsive pass close to the exclusion core."),
        Scenario("single_core_hit", (Charge(0, 0, 5 * nc),), -0.5 * nc, 5 * ug,
                 (-0.9, 0.0), (0.0, 0.0), 0.12, 1.0,
                 "Attractive radial fall used to compare core-entry stopping events."),
        Scenario("envelope_limit_core_hit", (Charge(0, 0, 5 * nc),), -0.5 * nc, 10 * ug,
                 (-0.24, 0.0), (0.0, 0.0), 0.12, 0.5,
                 "Attractive core hit at the proposed Q and q/m envelope boundary."),
        Scenario("like_pair", (Charge(-0.6, 0, 5 * nc), Charge(0.6, 0, 5 * nc)), 0.5 * nc, 5 * ug,
                 (0.0, -1.1), (0.0, 1.5), 0.12, 1.8,
                 "Symmetric equal-sign pair; launch along the symmetry axis."),
        Scenario("dipole", (Charge(-0.5, 0, 5 * nc), Charge(0.5, 0, -5 * nc)), 0.5 * nc, 5 * ug,
                 (0.0, -1.0), (0.0, 1.5), 0.12, 1.5,
                 "Dipole trajectory with strong lateral bending."),
        Scenario("zero_field_nearby", (Charge(-0.6, 0, 5 * nc), Charge(0.6, 0, 5 * nc)), 0.5 * nc, 5 * ug,
                 (0.02, 0.03), (0.15, 0.10), 0.12, 1.8,
                 "Motion launched near the equal-sign midpoint zero-field point."),
    )


def monte_carlo_cases(seed=MONTE_CARLO_SEED, count=MONTE_CARLO_COUNT):
    """Case construction copied from monte_carlo_validation(); RNG call order is unchanged."""
    rng = random.Random(seed)
    cases = []
    for case_id in range(count):
        source_count = rng.randint(1, 4)
        sources = []
        attempts = 0
        while len(sources) < source_count and attempts < 1000:
            attempts += 1
            candidate = Charge(
                rng.uniform(-1.2, 1.2), rng.uniform(-0.8, 0.8),
                rng.choice((-1, 1)) * rng.randint(1, 5) * 1e-9,
            )
            if all(math.hypot(candidate.x - s.x, candidate.y - s.y) >= 0.24 for s in sources):
                sources.append(candidate)
        q_nc = rng.choice((0.1, 0.25, 0.5))
        mass_ug = rng.choice((5.0, 10.0, 20.0))
        while q_nc / mass_ug > 0.05:
            mass_ug = rng.choice((5.0, 10.0, 20.0))
            q_nc = rng.choice((0.1, 0.25, 0.5))
        q_test = rng.choice((-1, 1)) * q_nc * 1e-9
        while True:
            r0 = (rng.uniform(-1.5, 1.5), rng.uniform(-1.0, 1.0))
            if all(math.hypot(r0[0] - s.x, r0[1] - s.y) >= 0.24 for s in sources):
                break
        speed = rng.uniform(0.0, 2.0)
        angle = rng.uniform(0.0, 2 * math.pi)
        v0 = (speed * math.cos(angle), speed * math.sin(angle))
        cases.append(Scenario(
            f"mc_{case_id:03d}", tuple(sources), q_test, mass_ug * 1e-9,
            r0, v0, 0.12, 0.5, "Seeded envelope Monte Carlo case.",
        ))
    return cases

# ---- fixture emission (new) --------------------------------------------------


def hermite(a, b, t):
    """Cubic Hermite position/linear velocity between two dense RK4 steps."""
    h = b[0] - a[0]
    s = (t - a[0]) / h
    h00 = 2 * s**3 - 3 * s**2 + 1
    h10 = s**3 - 2 * s**2 + s
    h01 = -2 * s**3 + 3 * s**2
    h11 = s**3 - s**2
    x = h00 * a[1] + h10 * h * a[3] + h01 * b[1] + h11 * h * b[3]
    y = h00 * a[2] + h10 * h * a[4] + h01 * b[2] + h11 * h * b[4]
    return (x, y, a[3] + s * (b[3] - a[3]), a[4] + s * (b[4] - a[4]))


def dense_state(samples, t):
    if t <= samples[0][0]:
        return samples[0][1:]
    if t >= samples[-1][0]:
        return samples[-1][1:]
    lo, hi = 0, len(samples) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if samples[mid][0] <= t:
            lo = mid
        else:
            hi = mid
    return hermite(samples[lo], samples[hi], t)


def fixture_case(scenario, reference_dt, grid_points):
    ref = simulate(scenario, "rk4", reference_dt, sample_interval=reference_dt / 2)
    grid = []
    for i in range(grid_points):
        t = ref["t"] * i / (grid_points - 1)
        grid.append([t, *dense_state(ref["samples"], t)])
    grid[-1] = [ref["t"], *ref["pos"], *ref["vel"]]
    return {
        "name": scenario.name,
        "description": scenario.description,
        "sources": [{"x_m": s.x, "y_m": s.y, "q_C": s.q_c} for s in scenario.sources],
        "qTest_C": scenario.q_test_c,
        "mass_kg": scenario.mass_kg,
        "r0_m": list(scenario.r0),
        "v0_mps": list(scenario.v0),
        "rCore_m": scenario.r_core,
        "tEnd_s": scenario.t_end,
        "reference": {
            "method": "rk4",
            "dt_s": reference_dt,
            "event": ref["event"],
            "eventTime_s": ref["event_time"],
            "t_s": ref["t"],
            "maxEnergyDrift": ref["max_energy_drift"],
            "grid": grid,
        },
    }


def self_check(cases, reference_dt):
    """Reproduce the published bounded-substep Monte Carlo aggregate with the harness itself."""
    worst_path = 0.0
    worst_energy = 0.0
    mismatches = 0
    for scenario in cases:
        ref = simulate(scenario, "rk4", reference_dt)
        run = simulate_bounded(scenario)
        comp = compare(run, ref)
        mismatches += not comp["event_match"]
        worst_path = max(worst_path, comp["max_path_error_m"])
        worst_energy = max(worst_energy, run["max_energy_drift"])
    return {"event_mismatches": mismatches, "max_path_error_m": worst_path, "max_energy_drift": worst_energy}


def main():
    provenance = {
        "source": "Notion: Electrostatic Field Studio v0.1 | Numerical Envelope Validation (D-01-D-04)",
        "harness": "validate_envelope.py (Notion file upload 3e2494ee-b117-8114-b9ba-00b23289a0b2)",
        "generator": "tests/fixtures/electrostatic/generate_reference.py",
        "coulombConstant": K,
        "domain_m": list(DOMAIN),
        "units": "SI",
        "gridColumns": ["t_s", "x_m", "y_m", "vx_mps", "vy_mps"],
        "gridNote": "Grid times are uniform over [0, reference t]; states are cubic-Hermite "
                    "interpolated from every RK4 step. The last row is the exact RK4 stop state.",
    }
    representative = [fixture_case(s, REFERENCE_MAX_DT, REPRESENTATIVE_GRID_POINTS) for s in scenarios()]
    (OUT / "representative-rk4.json").write_text(json.dumps({
        "schema": "electrostatic-rk4-reference-1",
        "provenance": {**provenance, "referenceDt_s": REFERENCE_MAX_DT},
        "cases": representative,
    }, separators=(",", ":")) + "\n", encoding="utf-8")

    cases = monte_carlo_cases()
    check = self_check(cases, MONTE_CARLO_REFERENCE_DT)
    monte_carlo = [fixture_case(s, MONTE_CARLO_REFERENCE_DT, MONTE_CARLO_GRID_POINTS) for s in cases]
    (OUT / "monte-carlo-rk4.json").write_text(json.dumps({
        "schema": "electrostatic-rk4-reference-1",
        "provenance": {
            **provenance,
            "referenceDt_s": MONTE_CARLO_REFERENCE_DT,
            "seed": MONTE_CARLO_SEED,
            "count": MONTE_CARLO_COUNT,
            "harnessBoundedSelfCheck": check,
        },
        "cases": monte_carlo,
    }, separators=(",", ":")) + "\n", encoding="utf-8")
    events = {}
    for case in monte_carlo:
        events[case["reference"]["event"]] = events.get(case["reference"]["event"], 0) + 1
    print(json.dumps({"self_check": check, "monte_carlo_events": events}, indent=2))


if __name__ == "__main__":
    main()
