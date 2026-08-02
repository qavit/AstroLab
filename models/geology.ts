import {
  beddingStrike,
  cardinalAzimuth,
  classifyValleyTrace,
  formatStrike,
  type BeddingParameters,
  type ValleyParameters,
} from "@/lib/science/geology";

export type GeologyState = ValleyParameters & BeddingParameters & {
  showContours: boolean;
  showLayerPlane: boolean;
  showDipArrow: boolean;
};

export function initialGeologyState(): GeologyState {
  return {
    valleyGradient: 0.28,
    valleyRelief: 0.17,
    dipDirection: 180,
    dipAngle: 31,
    layerOffset: 0.08,
    layerThickness: 0.2,
    showContours: true,
    showLayerPlane: false,
    showDipArrow: true,
  };
}

export function deriveGeologyModel(state: GeologyState) {
  const strike = beddingStrike(state.dipDirection);
  const trace = classifyValleyTrace(state, state);
  const matchesQuestion =
    Math.abs(strike - 90) < 1 &&
    Math.abs(state.dipDirection - 180) < 1 &&
    trace.opens === "downstream";
  return {
    strike,
    strikeLabel: formatStrike(strike),
    dipDirectionLabel: cardinalAzimuth(state.dipDirection),
    valleySlopeAngle: Math.atan(state.valleyGradient) * 180 / Math.PI,
    trace,
    matchesQuestion,
    answer15: "D",
    answer16: "A（東西向）",
  };
}

export type GeologyReadout = ReturnType<typeof deriveGeologyModel>;

