/** Pure geometry for a planar rock layer intersecting an idealized river valley. */

export type ValleyParameters = {
  valleyGradient: number;
  valleyRelief: number;
};

export type BeddingParameters = {
  dipDirection: number;
  dipAngle: number;
  layerOffset: number;
  layerThickness: number;
};

export type Point2 = { x: number; y: number };
export type Segment2 = { start: Point2; end: Point2 };

export const GEOLOGY_BOUNDS = { xMin: -2.4, xMax: 2.4, yMin: -2, yMax: 2 } as const;

export function normalizeAzimuth(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

/** Height rises upstream (+y) and away from the valley axis (x = 0). */
export function terrainElevation(x: number, y: number, valley: ValleyParameters) {
  return valley.valleyGradient * y + valley.valleyRelief * x * x;
}

/**
 * Plane convention: dip direction is clockwise from north; height decreases in that direction.
 * x points east and y points north/upstream.
 */
export function layerElevation(x: number, y: number, bedding: BeddingParameters) {
  const azimuth = normalizeAzimuth(bedding.dipDirection) * Math.PI / 180;
  const downhillDistance = x * Math.sin(azimuth) + y * Math.cos(azimuth);
  return bedding.layerOffset - Math.tan(bedding.dipAngle * Math.PI / 180) * downhillDistance;
}

export function isLayerOutcrop(
  x: number,
  y: number,
  valley: ValleyParameters,
  bedding: BeddingParameters,
) {
  return Math.abs(terrainElevation(x, y, valley) - layerElevation(x, y, bedding)) <= bedding.layerThickness / 2;
}

/** Strike uses the right-hand-rule plane but is reported without direction, in 0–179°. */
export function beddingStrike(dipDirection: number) {
  return normalizeAzimuth(dipDirection + 90) % 180;
}

export function cardinalAzimuth(azimuth: number) {
  const normalized = normalizeAzimuth(azimuth);
  const labels = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
  return labels[Math.round(normalized / 45) % 8];
}

export function formatStrike(strike: number) {
  const normalized = normalizeAzimuth(strike) % 180;
  if (Math.abs(normalized - 90) < 0.5) return "東西向";
  if (normalized < 0.5 || Math.abs(normalized - 180) < 0.5) return "南北向";
  return normalized < 90 ? `N${normalized.toFixed(0)}E` : `N${(180 - normalized).toFixed(0)}W`;
}

/** The along-valley elevation gradient of the planar layer. */
export function layerNorthGradient(bedding: BeddingParameters) {
  const azimuth = normalizeAzimuth(bedding.dipDirection) * Math.PI / 180;
  return -Math.tan(bedding.dipAngle * Math.PI / 180) * Math.cos(azimuth);
}

export function classifyValleyTrace(valley: ValleyParameters, bedding: BeddingParameters) {
  const layerGradient = layerNorthGradient(bedding);
  const denominator = valley.valleyGradient - layerGradient;
  const nearlyParallel = Math.abs(denominator) < 0.025;
  const opens = nearlyParallel ? "parallel" : denominator < 0 ? "downstream" : "upstream";
  return {
    layerGradient,
    denominator,
    opens,
    dipIsSteeperThanValley: Math.abs(layerGradient) > valley.valleyGradient,
  } as const;
}

/** Marching-squares contour segments, shared by the 2D map and the 3D terrain. */
export function contourSegments(
  level: number,
  field: (x: number, y: number) => number,
  columns = 72,
  rows = 60,
): Segment2[] {
  const { xMin, xMax, yMin, yMax } = GEOLOGY_BOUNDS;
  const dx = (xMax - xMin) / columns;
  const dy = (yMax - yMin) / rows;
  const segments: Segment2[] = [];

  const interpolate = (a: Point2, b: Point2, va: number, vb: number) => {
    const fraction = Math.abs(vb - va) < 1e-9 ? 0.5 : (level - va) / (vb - va);
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = xMin + column * dx;
      const x1 = x0 + dx;
      const y0 = yMin + row * dy;
      const y1 = y0 + dy;
      const corners = [
        { point: { x: x0, y: y0 }, value: field(x0, y0) },
        { point: { x: x1, y: y0 }, value: field(x1, y0) },
        { point: { x: x1, y: y1 }, value: field(x1, y1) },
        { point: { x: x0, y: y1 }, value: field(x0, y1) },
      ];
      const crossings: Point2[] = [];
      for (const [aIndex, bIndex] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        const a = corners[aIndex];
        const b = corners[bIndex];
        if ((a.value < level) !== (b.value < level)) {
          crossings.push(interpolate(a.point, b.point, a.value, b.value));
        }
      }
      if (crossings.length === 2) segments.push({ start: crossings[0], end: crossings[1] });
      if (crossings.length === 4) {
        segments.push({ start: crossings[0], end: crossings[1] });
        segments.push({ start: crossings[2], end: crossings[3] });
      }
    }
  }
  return segments;
}

