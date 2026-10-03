import {
  accelerationFromForce,
  directionFromDegrees,
  normalize,
  resolveKnownForces,
  type ForceVector,
  type Vec2,
} from "../lib/science/fbd.ts";

export type FbdForceKind =
  | "weight"
  | "normal"
  | "friction"
  | "tension"
  | "spring"
  | "drag"
  | "applied"
  | "other";

export type FbdInteractionKind =
  | "gravitational"
  | "contact"
  | "tension"
  | "spring"
  | "drag"
  | "applied"
  | "other";

export type FbdSystem = Readonly<{
  id: string;
  label: string;
  /** Optional because qualitative force identification should not require a number. */
  massKg: number | null;
}>;

export type FbdAgent = Readonly<{
  id: string;
  label: string;
}>;

/**
 * A learner-identified relation between one external agent and the selected system. Interaction
 * identity is upstream of force-vector representation: one contact interaction may later support
 * both normal and friction forces without duplicating the agent/system relationship.
 */
export type FbdInteraction = Readonly<{
  id: string;
  kind: FbdInteractionKind;
  sourceAgentId: string;
  targetSystemId: string;
  label: string;
}>;

/** One learner-authored force, traceable to an interaction rather than to display text. */
export type FbdForce = Readonly<{
  id: string;
  interactionId: string;
  kind: FbdForceKind;
  label: string;
  magnitudeN: number | null;
  direction: Vec2;
}>;

export type FbdDiagram = Readonly<{
  system: FbdSystem;
  agents: readonly FbdAgent[];
  interactions: readonly FbdInteraction[];
  forces: readonly FbdForce[];
}>;

export type FbdLabState = Readonly<{
  /** Learner-authored model only. Canonical/reference answers live outside lab state. */
  diagram: FbdDiagram;
  /** Selection semantics stay FBD-local; this is not a candidate generic selection API. */
  selectedForceId: string | null;
}>;

/** Scenario/reference answers are deliberately separate from learner-authored lab state. */
export type FbdReferenceModel = Readonly<{
  canonicalInteractions: readonly FbdInteraction[];
  canonicalForces: readonly FbdForce[];
}>;

export function initialFbdState(): FbdLabState {
  return {
    diagram: {
      system: {
        id: "body-1",
        label: "物體",
        massKg: null,
      },
      agents: [],
      interactions: [],
      forces: [],
    },
    selectedForceId: null,
  };
}

export type NewFbdAgent = Readonly<{
  id: string;
  label: string;
}>;

export function createFbdAgent(agent: NewFbdAgent): FbdAgent {
  if (!agent.id.trim() || !agent.label.trim()) {
    throw new Error("FBD agent id and label must be non-empty.");
  }
  return agent;
}

export function addFbdAgent(
  state: FbdLabState,
  agent: FbdAgent,
): FbdLabState {
  if (state.diagram.agents.some(({ id }) => id === agent.id)) {
    throw new Error(`Duplicate FBD agent id: ${agent.id}`);
  }
  return {
    ...state,
    diagram: {
      ...state.diagram,
      agents: [...state.diagram.agents, agent],
    },
  };
}

export type NewFbdInteraction = Readonly<{
  id: string;
  kind: FbdInteractionKind;
  sourceAgentId: string;
  targetSystemId: string;
  label: string;
}>;

export function createFbdInteraction(
  interaction: NewFbdInteraction,
): FbdInteraction {
  if (
    !interaction.id.trim()
    || !interaction.sourceAgentId.trim()
    || !interaction.targetSystemId.trim()
    || !interaction.label.trim()
  ) {
    throw new Error("FBD interaction identity fields must be non-empty.");
  }
  return interaction;
}

export function addFbdInteraction(
  state: FbdLabState,
  interaction: FbdInteraction,
): FbdLabState {
  if (state.diagram.interactions.some(({ id }) => id === interaction.id)) {
    throw new Error(`Duplicate FBD interaction id: ${interaction.id}`);
  }
  if (interaction.targetSystemId !== state.diagram.system.id) {
    throw new Error("FBD interaction must target the selected system.");
  }
  if (!state.diagram.agents.some(({ id }) => id === interaction.sourceAgentId)) {
    throw new Error(`Unknown FBD source agent: ${interaction.sourceAgentId}`);
  }
  return {
    ...state,
    diagram: {
      ...state.diagram,
      interactions: [...state.diagram.interactions, interaction],
    },
  };
}

export type NewFbdForce = Readonly<{
  id: string;
  interactionId: string;
  kind: FbdForceKind;
  label: string;
  magnitudeN?: number | null;
  direction?: Vec2;
}>;

export function createFbdForce(force: NewFbdForce): FbdForce {
  const direction = normalize(force.direction ?? directionFromDegrees(90));
  if (!force.interactionId.trim()) {
    throw new Error("FBD force must reference an interaction.");
  }
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
    interactionId: force.interactionId,
    kind: force.kind,
    label: force.label,
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
  if (!state.diagram.interactions.some(({ id }) => id === force.interactionId)) {
    throw new Error(`Unknown FBD interaction: ${force.interactionId}`);
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
  if (
    patch.interactionId !== undefined
    && !state.diagram.interactions.some(({ id }) => id === patch.interactionId)
  ) {
    throw new Error(`Unknown FBD interaction: ${patch.interactionId}`);
  }
  let found = false;
  const forces = state.diagram.forces.map((force) => {
    if (force.id !== forceId) {
      return force;
    }
    found = true;
    return createFbdForce({ ...force, ...patch, id: force.id });
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

export type FbdForceContext = Readonly<{
  force: FbdForce;
  interaction: FbdInteraction;
  sourceAgent: FbdAgent;
  targetSystem: FbdSystem;
}>;

export function forceContext(
  state: FbdLabState,
  forceId: string,
): FbdForceContext | null {
  const force = state.diagram.forces.find(({ id }) => id === forceId);
  if (!force) {
    return null;
  }
  const interaction = state.diagram.interactions.find(
    ({ id }) => id === force.interactionId,
  );
  if (!interaction) {
    return null;
  }
  const sourceAgent = state.diagram.agents.find(
    ({ id }) => id === interaction.sourceAgentId,
  );
  if (!sourceAgent || interaction.targetSystemId !== state.diagram.system.id) {
    return null;
  }
  return {
    force,
    interaction,
    sourceAgent,
    targetSystem: state.diagram.system,
  };
}

export type FbdStructureIssue =
  | "unknown-interaction-agent"
  | "wrong-interaction-target"
  | "unknown-force-interaction";

export function validateFbdStructure(
  diagram: FbdDiagram,
): readonly FbdStructureIssue[] {
  const agentIds = new Set(diagram.agents.map(({ id }) => id));
  const interactionIds = new Set(diagram.interactions.map(({ id }) => id));
  const issues: FbdStructureIssue[] = [];

  for (const interaction of diagram.interactions) {
    if (!agentIds.has(interaction.sourceAgentId)) {
      issues.push("unknown-interaction-agent");
    }
    if (interaction.targetSystemId !== diagram.system.id) {
      issues.push("wrong-interaction-target");
    }
  }
  for (const force of diagram.forces) {
    if (!interactionIds.has(force.interactionId)) {
      issues.push("unknown-force-interaction");
    }
  }
  return issues;
}

export function deriveFbdModel(state: FbdLabState) {
  const structureIssues = validateFbdStructure(state.diagram);
  const resolution = resolveKnownForces(
    state.diagram.forces as readonly ForceVector[],
  );
  const netForceN = structureIssues.length === 0 && resolution.isComplete
    ? resolution.knownResultantN
    : null;
  const acceleration = netForceN
    ? accelerationFromForce(netForceN, state.diagram.system.massKg)
    : null;

  return {
    agentCount: state.diagram.agents.length,
    interactionCount: state.diagram.interactions.length,
    forceCount: state.diagram.forces.length,
    structureIssues,
    resolution,
    netForceN,
    acceleration,
  };
}
