import type { FieldLine } from "../../lib/science/electrostatics/fieldLines.ts";
import type { Vec2 } from "../../lib/science/electrostatics/types.ts";

/**
 * Presentation-only choice of which traced field lines to draw. This is not electrostatics:
 * every candidate is a valid integral curve of the same field; the rule only avoids drawing one
 * physical curve twice.
 *
 * A source-core → source-core line is traced once from each end's seed ring. Lines are ordered
 * along +E, so the upstream (positive) source owns it; the copy seeded at the downstream source
 * is dropped. Lines ending at the domain boundary or at a null have no opposite owner and all stay,
 * so boundary → negative lines survive when the net charge is not zero.
 */
export function selectDisplayFieldLines(lines: readonly FieldLine[]): FieldLine[] {
  return lines.filter((line) => !(
    line.start.reason === "source-core" &&
    line.end.reason === "source-core" &&
    line.seed.sourceId !== line.start.sourceId
  ));
}

export interface FieldLineArrowhead {
  /** World-space position on the polyline. */
  readonly point: Vec2;
  /** Unit world-space direction of +E there (the polyline's own ordering). */
  readonly direction: Vec2;
}

/** Arrowheads keep this much arc length (m) clear of both ends: cores, boundary and nulls. */
const ARROW_END_CLEARANCE_M = 0.15;

/** Arrowhead fractions of arc length by line length; 0 on very short lines, at most 3. */
function arrowFractions(length_m: number): readonly number[] {
  if (length_m < 0.35) return [];
  if (length_m < 1.2) return [0.5];
  if (length_m < 2.6) return [1 / 3, 2 / 3];
  return [0.25, 0.5, 0.75];
}

/**
 * Direction arrowheads placed by arc length (never by vertex index) along the +E-ordered points.
 * Placement depends only on world geometry, so zoom and pan never move them along the line.
 */
export function fieldLineArrowheads(points: readonly Vec2[]): FieldLineArrowhead[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  const heads: FieldLineArrowhead[] = [];
  let segment = 1;
  for (const fraction of arrowFractions(total)) {
    const target = Math.min(total - ARROW_END_CLEARANCE_M, Math.max(ARROW_END_CLEARANCE_M, fraction * total));
    while (segment < points.length - 1 && cumulative[segment] < target) segment += 1;
    const a = points[segment - 1];
    const b = points[segment];
    const span = cumulative[segment] - cumulative[segment - 1];
    if (!(span > 0)) continue;
    const t = (target - cumulative[segment - 1]) / span;
    heads.push({
      point: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) },
      direction: { x: (b.x - a.x) / span, y: (b.y - a.y) / span },
    });
  }
  return heads;
}

export interface FieldLineScene {
  readonly lines: readonly { readonly points: readonly Vec2[]; readonly arrowheads: readonly FieldLineArrowhead[] }[];
  /** Traced candidates before ownership selection, for diagnostics. */
  readonly candidateCount: number;
}

export function buildFieldLineScene(candidates: readonly FieldLine[]): FieldLineScene {
  return {
    lines: selectDisplayFieldLines(candidates).map((line) => ({ points: line.points, arrowheads: fieldLineArrowheads(line.points) })),
    candidateCount: candidates.length,
  };
}
