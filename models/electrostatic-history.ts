import type { ElectrostaticRuntime, ElectrostaticSetup } from "./electrostatic.ts";
import { advancePlayback, executeMacroSteps, pauseRuntime } from "./electrostatic.ts";

/** D-10 learner-time contract: ±0.1 s and one sparse checkpoint every 0.5 s. */
export const LEARNER_SEEK_STEPS = 96;
export const CHECKPOINT_INTERVAL_STEPS = 480;
/** Initial checkpoint plus the most recent minute of half-second checkpoints. */
export const MAX_CHECKPOINTS = 121;

export interface RuntimeCheckpoint {
  readonly macroSteps: number;
  readonly runtime: ElectrostaticRuntime;
}

export interface PlaybackHistory {
  readonly checkpoints: readonly RuntimeCheckpoint[];
  readonly maxSimulatedSteps: number;
  readonly terminalSteps: number | null;
}

function snapshot(runtime: ElectrostaticRuntime): ElectrostaticRuntime {
  return {
    ...runtime,
    status: runtime.status === "stopped" ? "stopped" : "paused",
    accumulator_s: 0,
    autoPause: null,
    trail: { ...runtime.trail, points: new Float64Array(runtime.trail.points) },
  };
}

export function createPlaybackHistory(runtime: ElectrostaticRuntime): PlaybackHistory {
  const first = snapshot(runtime);
  return {
    checkpoints: [{ macroSteps: first.macroSteps, runtime: first }],
    maxSimulatedSteps: runtime.macroSteps,
    terminalSteps: runtime.status === "stopped" ? runtime.macroSteps : null,
  };
}

/** Collect only exact 0.5 s boundaries while a fixed-step transition runs. */
export function checkpointCollector(target: ElectrostaticRuntime[]): (runtime: ElectrostaticRuntime) => void {
  return (runtime) => {
    if (runtime.macroSteps % CHECKPOINT_INTERVAL_STEPS === 0 || runtime.status === "stopped") {
      target.push(snapshot(runtime));
    }
  };
}

export function recordPlayback(history: PlaybackHistory, runtime: ElectrostaticRuntime, candidates: readonly ElectrostaticRuntime[]): PlaybackHistory {
  let checkpoints = [...history.checkpoints];
  for (const candidate of candidates) {
    const checkpoint = { macroSteps: candidate.macroSteps, runtime: candidate };
    const existing = checkpoints.findIndex((item) => item.macroSteps === checkpoint.macroSteps);
    if (existing >= 0) checkpoints[existing] = checkpoint;
    else checkpoints.push(checkpoint);
  }
  checkpoints.sort((a, b) => a.macroSteps - b.macroSteps);
  if (checkpoints.length > MAX_CHECKPOINTS) {
    checkpoints = [checkpoints[0], ...checkpoints.slice(-(MAX_CHECKPOINTS - 1))];
  }
  const maxSimulatedSteps = Math.max(history.maxSimulatedSteps, runtime.macroSteps);
  return {
    checkpoints,
    maxSimulatedSteps,
    terminalSteps: runtime.status === "stopped" && runtime.macroSteps >= maxSimulatedSteps
      ? runtime.macroSteps
      : history.terminalSteps,
  };
}

export type SeekResult =
  | { readonly ok: true; readonly runtime: ElectrostaticRuntime }
  | { readonly ok: false; readonly reason: "outside-history" | "non-integer-target" };

/** Restore the latest checkpoint at or before target, then deterministically replay forward. */
export function seekRuntime(setup: ElectrostaticSetup, history: PlaybackHistory, targetSteps: number): SeekResult {
  if (!Number.isInteger(targetSteps)) return { ok: false, reason: "non-integer-target" };
  if (targetSteps < 0 || targetSteps > history.maxSimulatedSteps) return { ok: false, reason: "outside-history" };
  const checkpoint = [...history.checkpoints].reverse().find((item) => item.macroSteps <= targetSteps);
  if (!checkpoint) return { ok: false, reason: "outside-history" };
  const restored = snapshot(pauseRuntime(checkpoint.runtime));
  const runtime = executeMacroSteps(setup, restored, targetSteps - checkpoint.macroSteps, "paused");
  return { ok: true, runtime };
}

/** Timeline track length shown to the learner: a fixed 5 s window that grows in whole windows. */
export const TIMELINE_WINDOW_STEPS = 4800;

/**
 * The scrubber's domain. Using the simulated extent itself would pin the thumb to the right
 * edge whenever playback is at the live edge, so the track is longer than the history except
 * once a terminal event has fixed the true end of the motion.
 */
export function timelineHorizonSteps(history: PlaybackHistory): number {
  if (history.terminalSteps !== null) return Math.max(1, history.terminalSteps);
  return Math.max(1, Math.ceil((history.maxSimulatedSteps + 1) / TIMELINE_WINDOW_STEPS)) * TIMELINE_WINDOW_STEPS;
}

export interface TimelineAdvance {
  readonly runtime: ElectrostaticRuntime;
  readonly history: PlaybackHistory;
}

/**
 * Wall-clock playback over the timeline. Behind the live edge the cursor replays the fixed-step
 * trajectory that history already covers (forward stepping only, nothing is recorded); once it
 * reaches the live edge the remaining wall time extends the physical simulation and history.
 * Playback speed only scales `elapsed_s` before this call — it never changes the step.
 */
export function advanceTimeline(
  setup: ElectrostaticSetup,
  history: PlaybackHistory,
  runtime: ElectrostaticRuntime,
  elapsed_s: number,
): TimelineAdvance {
  if (runtime.status !== "running") return { runtime, history };
  let current = runtime;
  let remaining = elapsed_s;
  const behind = history.maxSimulatedSteps - runtime.macroSteps;
  if (behind > 0) {
    if (!Number.isFinite(elapsed_s) || elapsed_s < 0) return { runtime: pauseRuntime(runtime, "behind-realtime"), history };
    const dt = setup.integrator.dt_s;
    const owed = runtime.accumulator_s + elapsed_s;
    const due = Math.floor(owed / dt + 1e-9);
    const replay = Math.min(due, behind);
    current = executeMacroSteps(setup, runtime, replay, "running");
    if (current.status !== "running") return { runtime: current, history };
    if (current.macroSteps < history.maxSimulatedSteps) {
      return { runtime: { ...current, accumulator_s: Math.max(0, owed - replay * dt) }, history };
    }
    remaining = owed - replay * dt;
    current = { ...current, accumulator_s: 0 };
  }
  const candidates: ElectrostaticRuntime[] = [];
  const next = advancePlayback(setup, current, remaining, checkpointCollector(candidates));
  return { runtime: next, history: recordPlayback(history, next, candidates) };
}

/**
 * Learner ±0.1 s forward navigation: through existing history first, then extending the
 * simulation at the live edge. A terminal event stops the extension where it happened.
 */
export function stepTimelineForward(
  setup: ElectrostaticSetup,
  history: PlaybackHistory,
  runtime: ElectrostaticRuntime,
  steps: number = LEARNER_SEEK_STEPS,
): TimelineAdvance {
  const paused = snapshot(pauseRuntime(runtime));
  const replay = Math.min(steps, Math.max(0, history.maxSimulatedSteps - runtime.macroSteps));
  const replayed = executeMacroSteps(setup, paused, replay, "paused");
  const extend = steps - replay;
  if (extend <= 0 || replayed.status !== "paused") return { runtime: replayed, history };
  const candidates: ElectrostaticRuntime[] = [];
  const next = executeMacroSteps(setup, replayed, extend, "paused", checkpointCollector(candidates));
  return { runtime: next, history: recordPlayback(history, next, candidates) };
}
