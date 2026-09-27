import {
  accelerationFromForce,
  directionFromDegrees,
  normalize,
  resolveKnownForces,
  type ForceVector,
  type Vec2,
} from "../lib/science/fbd.ts";

/**
 * A deliberately small first-pass vocabulary. `other` keeps this from becoming an assessment
 * ontology before the learning design is settled.
 */
export type FbdForceKind =
  | "weight"
  | "normal"
  | "friction"
  | "tension"
  | "spring"
  | "drag"
  | "applied"
  | "other";

export type FbdBody = Readonly<{
  id: string;
  label: string;
  /** Optional because qualitative force identification should not require a number. */
  massKg: number | null;
}>;

/**
 * One learner-authored force on the chosen body. The agent is stored separately from the label so
 * future feedback can reason about interaction pairs without parsing display text.
 */
export type FbdForce = Readonly<{
  id: string;
  kind: FbdForceKind;
  label: string;
  agent: string | null;
  magnitudeN: number | null;
  direction: Vec2;
}>;

export type FbdDiagram = Readonly<{
  body: FbdBody;
  forces: readonly FbdForce[];
}>;

export type FbdLabState = Readonly<{
  diagram: FbdDiagram;
  /** Interaction state is FBD-local; it is not a candidate generic selection API. */
  selectedForceId: string | null;
}>;

export function initialFbdState(): FbdLabState {
  return {
    diagram: {
      body: {
        id: "body-1",
        label: "物體",
        massKg: null,
      },
      forces: [],
    },
    selectedForceId: null,
  };
}

export type NewFbdForce = Readonly<{
  id: string;
  kind: FbdForceKind;
  label: string;
  agent?: string | null;
  magnitudeN?: number | null;
  direction?: Vec2;
}>;

export function createFbdForce(force: NewFbdForce): FbdForce {
  const direction = normalize(force.direction ?? directionFromDegrees(90));
  if (!direction) {
    throw new Error("FBD force direction must be a finite non-zero vector.");
  }
  if (
    force.magnitudeN !== undefined
    && force.magnitudeN !== null
    && (!Number.isFinite(force.magnitudeN) || force.magnitudeN < 0)
  ) {
    throw new Error("FBD force magnitude must be null or a finite non-negative number.");
  }
  return {
    id: force.id,
    kind: force.kind,
    label: force.label,
    agent: force.agent ?? null,
    magnitudeN: force.magnitudeN ?? null,
    direction,
  };
}

export function addFbdForce(
  state: FbdLabState,
  force: FbdForce,
): FbdLabState {
  if (state.diagram.forces.some(({ id }) => id === force.id)) {
    throw new Error(`Duplicate FBD force id: ${force.id}`);
  }
  return {
    ...state,
    diagram: {
      ...state.diagram,
      forces: [...state.diagram.forces, force],
    },
    selectedForceId: force.id,
  };
}

export function updateFbdForce(
  state: FbdLabState,
  forceId: string,
  patch: Partial<Omit<FbdForce, "id">>,
): FbdLabState {
  let found = false;
  const forces = state.diagram.forces.map((force) => {
    if (force.id !== forceId) {
      return force;
    }
    found = true;
    return createFbdForce({
      ...force,
      ...patch,
      id: force.id,
    });
  });
  return found
    ? { ...state, diagram: { ...state.diagram, forces } }
    : state;
}

export function removeFbdForce(
  state: FbdLabState,
  forceId: string,
): FbdLabState {
  const forces = state.diagram.forces.filter(({ id }) => id !== forceId);
  if (forces.length === state.diagram.forces.length) {
    return state;
  }
  return {
    ...state,
    diagram: { ...state.diagram, forces },
    selectedForceId:
      state.selectedForceId === forceId ? null : state.selectedForceId,
  };
}

export function selectFbdForce(
  state: FbdLabState,
  forceId: string | null,
): FbdLabState {
  if (forceId === null) {
    return { ...state, selectedForceId: null };
  }
  return state.diagram.forces.some(({ id }) => id === forceId)
    ? { ...state, selectedForceId: forceId }
    : state;
}

export function deriveFbdModel(state: FbdLabState) {
  const resolution = resolveKnownForces(
    state.diagram.forces as readonly ForceVector[],
  );
  const netForceN = resolution.isComplete
    ? resolution.knownResultantN
    : null;
  const acceleration = netForceN
    ? accelerationFromForce(netForceN, state.diagram.body.massKg)
    : null;

  return {
    forceCount: state.diagram.forces.length,
    resolution,
    netForceN,
    acceleration,
  };
}
