import {
  distanceToWire,
  examplePoint,
  exampleWires,
  fieldFromWire,
  hasWireSingularity,
  MIN_WIRE_DISTANCE,
  pageComponent,
  totalField,
  type Vec3,
  type Wire,
} from "@/lib/science/magnetism";

export type MagnetismState = { wires: Wire[]; point: Vec3 };

/** A fresh copy of the textbook configuration, so edits never mutate the shared example. */
export function initialMagnetismState(): MagnetismState {
  return { wires: exampleWires.map((wire) => ({ ...wire })), point: { ...examplePoint } };
}

export type MagnetismReadout = ReturnType<typeof deriveMagnetismModel>;

/**
 * The resultant field at O, each wire's separate contribution, and what the field would become
 * if any one active wire were cut — the comparison the textbook problem actually asks for.
 */
export function deriveMagnetismModel({ wires, point }: MagnetismState) {
  const field = totalField(wires, point);
  const defined = !hasWireSingularity(wires, point);
  const { magnitude, sign } = pageComponent(field);

  const contributions = wires.map((wire) => {
    const component = pageComponent(fieldFromWire(wire, point));
    const distance = distanceToWire(wire, point);
    return { wire, component, distance, singular: wire.active && distance < MIN_WIRE_DISTANCE };
  });

  const cutComparison = wires
    .filter((wire) => wire.active)
    .map((wire) => {
      const trial = wires.map((candidate) => (candidate.id === wire.id ? { ...candidate, active: false } : candidate));
      const trialComponent = pageComponent(totalField(trial, point));
      return { wire, magnitude: trialComponent.magnitude * 1e6, sign: trialComponent.sign };
    })
    .sort((a, b) => b.magnitude - a.magnitude);

  return {
    field,
    defined,
    magnitude,
    sign,
    contributions,
    cutComparison,
    baselineMicroTesla: magnitude * 1e6,
    strongestCut: defined ? cutComparison[0] : undefined,
    activeCount: wires.filter((wire) => wire.active).length,
  };
}
