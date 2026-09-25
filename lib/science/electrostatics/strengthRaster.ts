import { fieldAt, orderSources } from "./field.ts";
import type { Domain, SourceCharge } from "./types.ts";

/**
 * Field-strength map raster resolution. Deliberately independent of the arrow grid
 * (GRID_LIMITS): arrows need a sparse lattice to stay legible, a scalar raster needs enough
 * texels that the circular excluded core is not visibly quantized.
 */
export const MAP_RASTER = {
  desktop: { cols: 64, rows: 48 },
  mobile: { cols: 48, rows: 36 },
} as const;

export interface StrengthRaster {
  readonly cols: number;
  readonly rows: number;
  /**
   * |E| in N/C at each texel centre, row-major from (xmin, ymin) — physics orientation, y up.
   * `NaN` marks a texel whose centre lies inside a source core: there is no field value there.
   */
  readonly magnitude_N_per_C: Float64Array;
}

/** Sample the real `fieldAt()` magnitude at texel centres. Returns null for unusable input. */
export function sampleStrengthRaster(
  sources: readonly SourceCharge[],
  domain: Domain,
  cols: number,
  rows: number,
  rCore_m: number,
): StrengthRaster | null {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || sources.length === 0) return null;
  const width = domain.xmax - domain.xmin;
  const height = domain.ymax - domain.ymin;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ordered = orderSources(sources);
  const magnitude_N_per_C = new Float64Array(cols * rows);
  for (let iy = 0; iy < rows; iy += 1) {
    const y = domain.ymin + ((iy + 0.5) * height) / rows;
    for (let ix = 0; ix < cols; ix += 1) {
      const x = domain.xmin + ((ix + 0.5) * width) / cols;
      const field = fieldAt({ x, y }, ordered, rCore_m);
      magnitude_N_per_C[iy * cols + ix] = field.valid ? field.magnitude_N_per_C : Number.NaN;
    }
  }
  return { cols, rows, magnitude_N_per_C };
}
