/** Presentation-only layer choices. They intentionally never enter schema-v1 setup data. */
export interface ElectrostaticLayerState {
  readonly field: boolean;
  readonly fieldStrengthMap: boolean;
  readonly fieldLines: boolean;
  readonly probe: boolean;
  readonly particle: boolean;
  readonly trail: boolean;
  readonly contributions: boolean;
}

export const INITIAL_ELECTROSTATIC_LAYERS: ElectrostaticLayerState = {
  field: true, fieldStrengthMap: false, fieldLines: false, probe: true, particle: true, trail: true, contributions: true,
};
