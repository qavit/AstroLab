/**
 * Shared SI types for the Electrostatic Field Studio science core.
 *
 * Every quantity is canonical SI: metres, seconds, coulombs, kilograms, N/C, N, m/s, m/s².
 * Display prefixes (nC, µg) belong to the UI layer and never appear here.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A fixed point source charge. `id` is stable and defines the summation order. */
export interface SourceCharge {
  readonly id: string;
  readonly x_m: number;
  readonly y_m: number;
  readonly q_C: number;
}

/** Axis-aligned world rectangle; x to the right, y up. */
export interface Domain {
  readonly xmin: number;
  readonly xmax: number;
  readonly ymin: number;
  readonly ymax: number;
}

/** Everything the field and the integrator need to know about the fixed scene. */
export interface ElectrostaticSystem {
  readonly sources: readonly SourceCharge[];
  readonly domain: Domain;
  readonly rCore_m: number;
}

export type FieldInvalidReason = "inside-source-core" | "non-finite-input" | "no-sources";

export interface FieldContribution {
  readonly sourceId: string;
  readonly dx_m: number;
  readonly dy_m: number;
  readonly r_m: number;
  readonly Ex_N_per_C: number;
  readonly Ey_N_per_C: number;
  readonly magnitude_N_per_C: number;
}

export interface FieldValid {
  readonly valid: true;
  /** Per-source contributions in stable id order. */
  readonly contributions: readonly FieldContribution[];
  readonly Ex_N_per_C: number;
  readonly Ey_N_per_C: number;
  readonly magnitude_N_per_C: number;
  /** τ_zero = 1e-12 · max(1 N/C, Σ|E_i|). */
  readonly zeroTolerance_N_per_C: number;
  readonly isZero: boolean;
  /** Angle from +x, counter-clockwise, in [0, 2π); `null` when the field is zero. */
  readonly direction_rad: number | null;
}

export interface FieldInvalid {
  readonly valid: false;
  readonly reason: FieldInvalidReason;
  /** The source whose excluded core contains the point, when `reason` is inside-source-core. */
  readonly sourceId?: string;
}

export type FieldResult = FieldValid | FieldInvalid;

/** Kinematic state of the single test particle. */
export interface ParticleState {
  readonly x_m: number;
  readonly y_m: number;
  readonly vx_mps: number;
  readonly vy_mps: number;
  readonly t_s: number;
}

export interface ParticleProperties {
  readonly q_C: number;
  readonly mass_kg: number;
}

export type StopReason = "entered-source-core" | "left-domain";

export interface StopEvent {
  readonly reason: StopReason;
  /** Time of the first intersection. */
  readonly t_s: number;
  /** Source whose core was entered, for entered-source-core. */
  readonly sourceId?: string;
}

export type StepInvalidReason =
  | "inside-source-core"
  | "outside-domain"
  | "non-finite-input"
  | "invalid-particle"
  | "no-sources"
  | "numerical-error";
