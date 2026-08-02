export type Vec3 = { x: number; y: number; z: number };

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const addV = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subV = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scaleV = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dotV = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const crossV = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const lengthV = (a: Vec3) => Math.sqrt(dotV(a, a));
export const normalizeV = (a: Vec3): Vec3 => {
  const len = lengthV(a);
  return len < 1e-12 ? vec(0, 0, 0) : scaleV(a, 1 / len);
};

/** Permeability of free space divided by 2π, in T·m/A. Ampere's law for an infinite straight wire: B = (MU0_OVER_2PI * I) / r. */
export const MU0_OVER_2PI = 2e-7;
/** Below this distance the zero-radius, infinite-wire idealization is undefined. */
export const MIN_WIRE_DISTANCE = 1e-6;

export type Orientation = "vertical" | "horizontal";

export type Wire = {
  id: string;
  label: string;
  orientation: Orientation;
  /** Position along the axis perpendicular to the wire (x for vertical wires, y for horizontal wires), in meters. */
  offset: number;
  /** Signed current in amps. Vertical: positive is +y (up the page). Horizontal: positive is +x (right). */
  current: number;
  active: boolean;
};

/** A point on the wire's line and its unit current direction, both in the shared xy plane (z = 0). */
export function wireGeometry(wire: Wire): { point: Vec3; direction: Vec3; current: number } {
  const point = wire.orientation === "vertical" ? vec(wire.offset, 0, 0) : vec(0, wire.offset, 0);
  const axis = wire.orientation === "vertical" ? vec(0, 1, 0) : vec(1, 0, 0);
  const direction = wire.current >= 0 ? axis : scaleV(axis, -1);
  return { point, direction, current: Math.abs(wire.current) };
}

/** Perpendicular distance from a point to a wire's infinite line. */
export function distanceToWire(wire: Wire, at: Vec3): number {
  const { point, direction } = wireGeometry(wire);
  const toPoint = subV(at, point);
  const perp = subV(toPoint, scaleV(direction, dotV(toPoint, direction)));
  return lengthV(perp);
}

/** Whether the ideal infinite, zero-radius wire model is defined at the observation point. */
export function hasWireSingularity(wires: Wire[], at: Vec3): boolean {
  return wires.some((wire) => wire.active && distanceToWire(wire, at) < MIN_WIRE_DISTANCE);
}

/** Magnetic field contributed by one infinite straight wire, via Ampere's law and the right-hand rule. */
export function fieldFromWire(wire: Wire, at: Vec3): Vec3 {
  if (!wire.active || wire.current === 0) return vec(0, 0, 0);
  const { point, direction, current } = wireGeometry(wire);
  const toPoint = subV(at, point);
  const perp = subV(toPoint, scaleV(direction, dotV(toPoint, direction)));
  const distance = lengthV(perp);
  if (distance < MIN_WIRE_DISTANCE) return vec(0, 0, 0);
  const radial = normalizeV(perp);
  const magnitude = (MU0_OVER_2PI * current) / distance;
  return scaleV(crossV(direction, radial), magnitude);
}

export function totalField(wires: Wire[], at: Vec3): Vec3 {
  return wires.reduce((sum, wire) => addV(sum, fieldFromWire(wire, at)), vec(0, 0, 0));
}

/** For a set of coplanar wires and a coplanar observation point, the resultant field is purely
 * perpendicular to the shared plane (out of / into the page) — this reads that component directly. */
export function pageComponent(field: Vec3): { magnitude: number; sign: "out" | "in" | "none" } {
  const magnitude = Math.abs(field.z);
  const sign = field.z > 1e-15 ? "out" : field.z < -1e-15 ? "in" : "none";
  return { magnitude, sign };
}

export function formatField(teslas: number): string {
  const microTesla = teslas * 1e6;
  if (Math.abs(microTesla) < 0.0005) return "0 μT";
  return `${microTesla.toFixed(3)} μT`;
}

export function directionLabel(sign: "out" | "in" | "none") {
  if (sign === "out") return "射出紙面（⊙）";
  if (sign === "in") return "射入紙面（⊗）";
  return "無明顯方向";
}

/** Example configuration approximating a common textbook problem: two vertical and two
 * horizontal wires with equal current magnitude, enclosing an off-center observation point O. */
export const exampleWires: Wire[] = [
  { id: "I1", label: "I₁", orientation: "vertical", offset: -1.6, current: 3, active: true },
  { id: "I2", label: "I₂", orientation: "vertical", offset: -0.4, current: -3, active: true },
  { id: "I3", label: "I₃", orientation: "horizontal", offset: 0.9, current: 3, active: true },
  { id: "I4", label: "I₄", orientation: "horizontal", offset: -0.9, current: -3, active: true },
];

export const examplePoint: Vec3 = vec(0.35, -0.15, 0);
