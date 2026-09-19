import type { ProjectileState } from "./projectile.ts";

export type ProjectileActivityId = "apex" | "complementary" | "elevated";
export type GuidedPhase = "predict" | "manipulate" | "observe" | "explain" | "complete";

export type PredictionChoice = {
  id: string;
  label: string;
};

export type ProjectileLearningActivity = {
  id: ProjectileActivityId;
  number: 1 | 2 | 3;
  title: string;
  question: string;
  choices: readonly PredictionChoice[];
  initialState: ProjectileState;
  targetHeight?: number;
};

export type GuidedSession = {
  activityId: ProjectileActivityId;
  phase: GuidedPhase;
  prediction: string | null;
  explanation: string | null;
  hintLevel: number;
  hasManipulated: boolean;
};

const STAIRS = { width: 0.3, rise: 0.18, count: 24 } as const;

/**
 * Complete teaching states, deliberately separate from the free-exploration presets. Guided
 * activities must never inherit a stale layer, playback direction, or drag setting from the
 * previous investigation.
 */
function learningState(earthGravity: number, patch: Partial<ProjectileState>): ProjectileState {
  return {
    scenario: "field",
    speed: 20,
    angle: 30,
    height: 0,
    gravity: earthGravity,
    dragFactor: 0,
    stairs: { ...STAIRS },
    showComplementary: false,
    showEnvelope: false,
    showAcceleration: true,
    showDrag: false,
    playing: false,
    direction: 1,
    animationSpeed: 1,
    ...patch,
  };
}

export function projectileLearningActivities(earthGravity: number): readonly ProjectileLearningActivity[] {
  return [
    {
      id: "apex",
      number: 1,
      title: "最高點時，速度是零嗎？",
      question: "拋體到達最高點的瞬間，它的速度會變成 0 嗎？",
      choices: [
        { id: "stops", label: "會，最高點就是瞬間靜止" },
        { id: "vertical-only", label: "不會，只有垂直速度變成 0" },
        { id: "unsure", label: "不確定，先看模型" },
      ],
      initialState: learningState(earthGravity, { speed: 24, angle: 45 }),
    },
    {
      id: "complementary",
      number: 2,
      title: "30° 和 60° 會落在同一點嗎？",
      question: "同樣以 20 m/s 發射，30° 與 60° 的結果會怎樣？",
      choices: [
        { id: "same-all", label: "射程相同，飛行時間也相同" },
        { id: "same-range", label: "射程相同，但 60° 飛得比較久" },
        { id: "sixty-farther", label: "60° 射得比較遠" },
        { id: "thirty-farther", label: "30° 射得比較遠" },
        { id: "unsure", label: "不確定，先看模型" },
      ],
      initialState: learningState(earthGravity, { showComplementary: false }),
    },
    {
      id: "elevated",
      number: 3,
      title: "把發射點抬高，規則還成立嗎？",
      question: "如果把發射點抬高到 25 m，但其他條件不變，30° 與 60° 還會落在同一個水平位置嗎？",
      choices: [
        { id: "same", label: "仍然相同" },
        { id: "different", label: "不再相同" },
        { id: "unsure", label: "不確定，改變高度看看" },
      ],
      initialState: learningState(earthGravity, { showComplementary: true }),
      targetHeight: 25,
    },
  ];
}

export function newGuidedSession(activityId: ProjectileActivityId): GuidedSession {
  return {
    activityId,
    phase: "predict",
    prediction: null,
    explanation: null,
    hintLevel: 0,
    hasManipulated: false,
  };
}

export function submitPrediction(session: GuidedSession, prediction: string): GuidedSession {
  return {
    ...session,
    prediction,
    phase: session.activityId === "complementary" ? "observe" : "manipulate",
  };
}

export function recordManipulation(session: GuidedSession): GuidedSession {
  return session.hasManipulated ? session : { ...session, hasManipulated: true };
}

export function revealObservation(session: GuidedSession): GuidedSession {
  return { ...session, phase: "observe", hasManipulated: true };
}

export function advanceToExplanation(session: GuidedSession): GuidedSession {
  return { ...session, phase: "explain" };
}

export function completeGuidedSession(session: GuidedSession, explanation: string): GuidedSession {
  return { ...session, phase: "complete", explanation };
}

export function revealNextHint(session: GuidedSession, maximum = 3): GuidedSession {
  return { ...session, hintLevel: Math.min(maximum, session.hintLevel + 1) };
}

/** A forgiving model-space target: either time or v_y may be the easier truth to hit by slider. */
export function isNearApex(
  peakTime: number,
  cursorTime: number,
  verticalVelocity: number,
  duration: number,
): boolean {
  const timeTolerance = Math.max(0.08, duration * 0.025);
  return Math.abs(cursorTime - peakTime) <= timeTolerance || Math.abs(verticalVelocity) <= 0.6;
}

export function isRaisedHeightReady(height: number, targetHeight = 25): boolean {
  return Math.abs(height - targetHeight) <= 0.5;
}

/** The comparison stays masked until Activity 2's prediction has been committed. */
export function comparisonVisible(session: GuidedSession): boolean {
  return session.activityId !== "complementary" || session.phase !== "predict";
}

/** Scenario and preset controls belong to free exploration; guided activities own a known state. */
export function canUseFreeStateControls(session: GuidedSession | null): boolean {
  return session === null;
}

/** Prediction is a real interaction gate, not just a visual phase label. */
export function canManipulateTime(session: GuidedSession | null): boolean {
  return session === null || session.phase !== "predict";
}
