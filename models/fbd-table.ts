import { directionFromDegrees, normalize } from "../lib/science/fbd.ts";
import { type FbdDiagram, type FbdLabState, type FbdReferenceModel } from "./fbd.ts";

/** One reviewed scene, not a scenario authoring schema. The table is smooth; the hand stays in contact. */
export const TABLE_AGENTS = [
  { id: "earth", label: "地球", kind: "gravitational" },
  { id: "table", label: "桌面", kind: "contact" },
  { id: "hand", label: "手", kind: "applied" },
  { id: "air", label: "空氣", kind: "drag" },
] as const;

export const TABLE_REFERENCE: FbdReferenceModel = {
  canonicalInteractions: TABLE_AGENTS.slice(0, 3).map((agent) => ({
    id: `${agent.id}-block`, kind: agent.kind, sourceAgentId: agent.id, targetSystemId: "block", label: `${agent.label} ↔ 木塊`,
  })),
  canonicalForces: [
    { id: "weight", interactionId: "earth-block", kind: "weight", label: "重力", magnitudeN: null, direction: directionFromDegrees(270) },
    { id: "normal", interactionId: "table-block", kind: "normal", label: "正向力", magnitudeN: null, direction: directionFromDegrees(90) },
    { id: "pull", interactionId: "hand-block", kind: "applied", label: "手的拉力", magnitudeN: null, direction: directionFromDegrees(0) },
  ],
};

export function initialTableState(): FbdLabState {
  return {
    diagram: { system: { id: "block", label: "木塊", massKg: null }, agents: TABLE_AGENTS.map(({ id, label }) => ({ id, label })), interactions: [], forces: [] },
    selectedForceId: null,
  };
}

export type NormalAssumption = "unknown" | "always-mg" | "vertical-balance";
export type DiagnosticCode = "missing-interaction" | "extra-interaction" | "missing-force" | "extra-force" | "wrong-direction" | "wrong-agent" | "wrong-target" | "unknown-interaction" | "indeterminate-magnitude" | "invalid-assumption";
export type FbdDiagnostic = Readonly<{ code: DiagnosticCode; severity: "issue" | "info"; message: string; forceId?: string; interactionId?: string }>;

/** Identity is matched through interaction kind/agent/target, never through learner IDs or labels. */
export function compareTableDiagram(diagram: FbdDiagram, assumption: NormalAssumption = "unknown", reference: FbdReferenceModel = TABLE_REFERENCE) {
  const diagnostics: FbdDiagnostic[] = [];
  const issue = (code: DiagnosticCode, message: string, ids: { forceId?: string; interactionId?: string } = {}) => diagnostics.push({ code, message, severity: "issue", ...ids });
  if (diagram.system.id !== "block") issue("wrong-target", "本情境研究木塊；先確認系統邊界。");
  const matches = new Map<string, string>();
  const used = new Set<string>();
  for (const interaction of diagram.interactions) {
    if (interaction.targetSystemId !== diagram.system.id || interaction.targetSystemId !== "block") {
      issue("wrong-target", `${interaction.label} 的力作用在別的物體；第三定律的伙伴力不屬於木塊的 FBD。`, { interactionId: interaction.id });
      continue;
    }
    if (!diagram.agents.some((agent) => agent.id === interaction.sourceAgentId)) {
      issue("wrong-agent", `${interaction.label} 的施力者不存在。`, { interactionId: interaction.id });
      continue;
    }
    const expected = reference.canonicalInteractions.find((candidate) => candidate.sourceAgentId === interaction.sourceAgentId && candidate.kind === interaction.kind);
    if (!expected || used.has(expected.id)) {
      issue("extra-interaction", `${interaction.label} 不符合此情境，或重複記錄了同一個交互作用。`, { interactionId: interaction.id });
      continue;
    }
    used.add(expected.id);
    matches.set(interaction.id, expected.id);
  }
  for (const expected of reference.canonicalInteractions) {
    if (!used.has(expected.id)) issue("missing-interaction", `尚未記錄 ${expected.label} 的交互作用。`);
  }
  const represented = new Set<string>();
  for (const force of diagram.forces) {
    const interaction = diagram.interactions.find((candidate) => candidate.id === force.interactionId);
    if (!interaction) {
      issue("unknown-interaction", `${force.label} 沒有交互作用來源；匿名箭頭不能表示力。`, { forceId: force.id });
      continue;
    }
    const expected = reference.canonicalForces.find((candidate) => candidate.kind === force.kind && candidate.interactionId === matches.get(interaction.id));
    if (!expected) {
      const sameKind = reference.canonicalForces.find((candidate) => candidate.kind === force.kind);
      issue(sameKind ? "wrong-agent" : "extra-force", sameKind
        ? `${force.label} 的種類存在，但交互作用／施力者不對。`
        : `${force.label} 沒有此情境的物理依據；向右運動不代表有「運動力」，分量也不是額外的力。`, { forceId: force.id });
      continue;
    }
    if (represented.has(expected.id)) {
      issue("extra-force", `${force.label} 重複表示了同一個力。`, { forceId: force.id });
      continue;
    }
    represented.add(expected.id);
    const direction = normalize(force.direction);
    if (!direction || direction.x * expected.direction.x + direction.y * expected.direction.y < Math.cos(10 * Math.PI / 180)) {
      issue("wrong-direction", `${force.label} 的施力來源正確，但方向不符；請依交互作用判斷方向。`, { forceId: force.id });
    }
    diagnostics.push({ code: "indeterminate-magnitude", severity: "info", forceId: force.id, message: `${force.label}：情境未提供數值，大小目前未定；箭頭長度只表示定性草圖。` });
  }
  for (const expected of reference.canonicalForces) {
    if (!represented.has(expected.id)) issue("missing-force", `缺少由交互作用支持的${expected.label}。`);
  }
  if (assumption === "always-mg") issue("invalid-assumption", "N = mg 不是一般定律。本情境沒有垂直加速度，且沒有其他垂直力，才可推得 N = mg；仍無法求數值。");
  return { pass: diagnostics.every((diagnostic) => diagnostic.severity === "info"), diagnostics };
}

export type TableSubmission = Readonly<{ diagram: FbdDiagram; assumption: NormalAssumption }>;
export type TableLearningState = Readonly<{ phase: "scene" | "system" | "interactions" | "forces" | "committed" | "compared"; learner: FbdLabState; assumption: NormalAssumption; submission: TableSubmission | null }>;
export function initialTableLearning(): TableLearningState {
  return { phase: "scene", learner: initialTableState(), assumption: "unknown", submission: null };
}
export function commitTable(state: TableLearningState): TableLearningState {
  return { ...state, phase: "committed", submission: structuredClone({ diagram: state.learner.diagram, assumption: state.assumption }) };
}
export function compareTable(state: TableLearningState): TableLearningState {
  return state.phase === "committed" && state.submission ? { ...state, phase: "compared" } : state;
}
export function reviseTable(state: TableLearningState): TableLearningState {
  return { ...state, phase: "forces", submission: null };
}
