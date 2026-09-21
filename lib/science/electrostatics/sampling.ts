import { fieldAt, orderSources } from "./field.ts";
import type { Domain, FieldResult, SourceCharge } from "./types.ts";

/** Fixed logarithmic field-glyph scale (D-04). */
export interface FieldScale {
  readonly Emin_N_per_C: number;
  readonly Emax_N_per_C: number;
}

export const FIELD_SCALE_V1: FieldScale = { Emin_N_per_C: 1, Emax_N_per_C: 5000 };

/** Maximum glyph grids from the performance envelope. */
export const GRID_LIMITS = {
  desktop: { cols: 40, rows: 30 },
  mobile: { cols: 24, rows: 18 },
} as const;

/**
 * Glyph classes. `zero`, `low-clip`, `high-clip` and `core` must stay visually distinct;
 * the numeric probe readout is never clipped, only glyphs are.
 */
export type GlyphClass =
  | { readonly kind: "core"; readonly sourceId: string }
  | { readonly kind: "zero" }
  | { readonly kind: "low-clip"; readonly strength: 0 }
  | { readonly kind: "normal"; readonly strength: number }
  | { readonly kind: "high-clip"; readonly strength: 1 };

/** s(E) = clamp((log10 E − log10 Emin) / (log10 Emax − log10 Emin), 0, 1). */
export function normalizedStrength(magnitude_N_per_C: number, scale: FieldScale = FIELD_SCALE_V1): number {
  if (!(magnitude_N_per_C > 0)) return 0;
  const lo = Math.log10(scale.Emin_N_per_C);
  const hi = Math.log10(scale.Emax_N_per_C);
  const s = (Math.log10(magnitude_N_per_C) - lo) / (hi - lo);
  return Math.min(1, Math.max(0, s));
}

/** Classify one field result for glyph rendering; `null` for non-core invalid results. */
export function classifyField(field: FieldResult, scale: FieldScale = FIELD_SCALE_V1): GlyphClass | null {
  if (!field.valid) {
    return field.reason === "inside-source-core" && field.sourceId !== undefined
      ? { kind: "core", sourceId: field.sourceId }
      : null;
  }
  if (field.isZero) return { kind: "zero" };
  const E = field.magnitude_N_per_C;
  if (E < scale.Emin_N_per_C) return { kind: "low-clip", strength: 0 };
  if (E > scale.Emax_N_per_C) return { kind: "high-clip", strength: 1 };
  return { kind: "normal", strength: normalizedStrength(E, scale) };
}

export interface FieldSample {
  readonly x_m: number;
  readonly y_m: number;
  readonly glyph: GlyphClass;
  /** Unit field direction, or null for zero or core. */
  readonly ux: number | null;
  readonly uy: number | null;
  /** Unclipped magnitude, or null inside a core. */
  readonly magnitude_N_per_C: number | null;
}

export type FieldGrid =
  | { readonly ok: true; readonly cols: number; readonly rows: number; readonly samples: readonly FieldSample[] }
  | { readonly ok: false; readonly reason: "invalid-grid-size" | "non-finite-input" | "no-sources" };

/**
 * Sample the field at cell centres of a cols × rows grid spanning `domain`, row-major from
 * (xmin, ymin). Renderer-neutral: no pixels, colours or arrow lengths.
 */
export function sampleFieldGrid(
  sources: readonly SourceCharge[],
  domain: Domain,
  cols: number,
  rows: number,
  rCore_m: number,
  scale: FieldScale = FIELD_SCALE_V1,
): FieldGrid {
  if (
    !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 ||
    cols > GRID_LIMITS.desktop.cols || rows > GRID_LIMITS.desktop.rows
  ) {
    return { ok: false, reason: "invalid-grid-size" };
  }
  if (sources.length === 0) return { ok: false, reason: "no-sources" };
  const ordered = orderSources(sources);
  const width = domain.xmax - domain.xmin;
  const height = domain.ymax - domain.ymin;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "non-finite-input" };
  }
  const samples: FieldSample[] = [];
  for (let iy = 0; iy < rows; iy += 1) {
    const y = domain.ymin + ((iy + 0.5) * height) / rows;
    for (let ix = 0; ix < cols; ix += 1) {
      const x = domain.xmin + ((ix + 0.5) * width) / cols;
      const field = fieldAt({ x, y }, ordered, rCore_m);
      const glyph = classifyField(field, scale);
      if (glyph === null) return { ok: false, reason: "non-finite-input" };
      if (!field.valid || field.isZero) {
        samples.push({ x_m: x, y_m: y, glyph, ux: null, uy: null, magnitude_N_per_C: field.valid ? field.magnitude_N_per_C : null });
      } else {
        const E = field.magnitude_N_per_C;
        samples.push({ x_m: x, y_m: y, glyph, ux: field.Ex_N_per_C / E, uy: field.Ey_N_per_C / E, magnitude_N_per_C: E });
      }
    }
  }
  return { ok: true, cols, rows, samples };
}
