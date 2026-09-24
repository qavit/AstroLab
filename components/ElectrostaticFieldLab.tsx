"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeftRight, Compass, Info, Layers3 } from "lucide-react";
import Controls from "./electrostatic/Controls";
import QuickPresetsMenu from "./electrostatic/QuickPresetsMenu";
import FieldCanvas from "./electrostatic/FieldCanvas";
import ModelInfoOverlay from "./electrostatic/ModelInfoOverlay";
import ParticleControls from "./electrostatic/ParticleControls";
import ParticlePanel from "./electrostatic/ParticlePanel";
import TimeControls from "./electrostatic/TimeControls";
import GuidedActivities from "./electrostatic/GuidedActivities";
import ProbePanel from "./electrostatic/ProbePanel";
import type { DraggableObject } from "./electrostatic/AccessibleObjects";
import type { SelectedObject } from "./electrostatic/render";
import { createShareUrl, initialStateFromShare, retainFieldSceneReferences, type ShareRouteInput } from "./electrostatic/share";
import { TOOL_SHORTCUT, type ToolMode } from "./electrostatic/tools.ts";
import { pointInDomain } from "./electrostatic/viewport.ts";
import styles from "./electrostatic/ElectrostaticFieldLab.module.css";
import { MathProvider } from "./math/MathJax";
import type { Vec2 } from "../lib/science/electrostatics/types.ts";
import {
  applySetupEdit,
  ELECTROSTATIC_PRESETS,
  initialRuntime,
  pauseRuntime,
  playRuntime,
  type ElectrostaticRuntime,
  type ElectrostaticSetup,
  type PresetId,
} from "../models/electrostatic.ts";
import {
  advanceTimeline,
  createPlaybackHistory,
  seekRuntime,
  stepTimelineForward,
  timelineHorizonSteps,
  type PlaybackHistory,
} from "../models/electrostatic-history.ts";
import {
  ACTIVITY_SETUPS,
  activitySetup,
  advance,
  commitChange,
  commitDirection,
  commitTrajectory,
  comparisonStage,
  evidencePolicy,
  explainA,
  explainB,
  revealNext,
  startActivity,
  type ActivityId,
  type LearningState,
} from "../models/electrostatic-learning.ts";
import { guidedProgress } from "./electrostatic/guidedProgress.ts";
import { guidedFocusFor } from "./electrostatic/guidedFocus.ts";
import { attentionCueFor, committedPredictionMarkers, type PredictionMarker } from "./electrostatic/guidedPrediction.ts";
import { guidedCanvasSemantics } from "./electrostatic/guidedCanvasSemantics.ts";

interface ElectrostaticFieldLabProps {
  readonly share: ShareRouteInput;
}

const SOURCE_IDS = ["s1", "s2", "s3", "s4"] as const;
const MAX_SOURCES = SOURCE_IDS.length;

function firstIssueMessage(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? "設定未通過驗證；已保留上一個有效狀態。";
}

const DEFAULT_SANDBOX_PRESET: PresetId = "single-positive";

function clonePreset(id: PresetId): ElectrostaticSetup {
  return structuredClone(ELECTROSTATIC_PRESETS[id]);
}

interface LabState {
  readonly setup: ElectrostaticSetup;
  readonly runtime: ElectrostaticRuntime;
}

function stopAnnouncement(runtime: ElectrostaticRuntime): string | null {
  if (runtime.stop?.reason === "entered-source-core") {
    return `測試電荷在 ${runtime.stop.t_s.toFixed(3)} 秒時太靠近源電荷，因此停在模型仍有效的邊界。請按「回到起點」再試一次。`;
  }
  if (runtime.stop?.reason === "left-domain") {
    return `測試電荷在 ${runtime.stop.t_s.toFixed(3)} 秒時離開觀察範圍，已停在邊界。請按「回到起點」再試一次。`;
  }
  if (runtime.error) return "計算暫時無法繼續，已保留最後一個有效狀態。請按「回到起點」。";
  if (runtime.autoPause === "behind-realtime") {
    return "裝置來不及連續顯示每一步，已自動暫停；模型時間沒有跳過。按播放即可繼續。";
  }
  if (runtime.autoPause === "hidden") return "分頁已隱藏，播放自動暫停；模擬時間沒有跳躍。按播放重新開始。";
  return null;
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest("input, textarea, select, button, a, summary, [role='button'], [contenteditable='true']") !== null;
}

/** Render-facing summary of the playback history (the history itself lives in a ref). */
function timelineViewOf(history: PlaybackHistory) {
  return { max: history.maxSimulatedSteps, horizon: timelineHorizonSteps(history), terminal: history.terminalSteps !== null };
}

export default function ElectrostaticFieldLab({ share }: ElectrostaticFieldLabProps) {
  const shellRef = useRef<HTMLElement>(null);
  const appBarRef = useRef<HTMLElement>(null);
  const layersTriggerRef = useRef<HTMLButtonElement>(null);
  const [appBarHeight, setAppBarHeight] = useState<number | null>(null);
  const initial = useMemo(() => initialStateFromShare(share), [share]);
  // D-05 + D-07: no `s` pauses at an intent choice; any present `s` bypasses it into free exploration.
  const [entryPending, setEntryPending] = useState(() => !initial.sandbox);
  const [learning, setLearning] = useState<LearningState | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [lab, setLab] = useState<LabState>(() => {
    const first = initial.setup;
    return { setup: first, runtime: initialRuntime(first) };
  });
  const [initialHistory] = useState(() => createPlaybackHistory(lab.runtime));
  const historyRef = useRef<PlaybackHistory>(initialHistory);
  const [timelineView, setTimelineView] = useState(() => timelineViewOf(createPlaybackHistory(lab.runtime)));
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const policy = evidencePolicy(learning);
  const policyRef = useRef(policy);
  useEffect(() => {
    policyRef.current = policy;
  }, [policy]);
  const labRef = useRef<LabState>(lab);
  const { setup, runtime } = lab;
  const canvasSemantics = useMemo(() => guidedCanvasSemantics(learning, setup), [learning, setup]);
  const [announcement, setAnnouncement] = useState("");
  const [baseline, setBaseline] = useState<ElectrostaticSetup>(initial.setup);
  const [selected, setSelected] = useState<SelectedObject>(null);
  /** Transient Canvas<->readout hover/focus linkage only; never selection, physics or history. */
  const [emphasizedSourceId, setEmphasizedSourceId] = useState<string | null>(null);
  /** Guided-only: the learner's own live, uncommitted compass guess(es). Never model evidence,
   * never physical setup/runtime/schema — cleared on every learning transition. */
  const [livePreview, setLivePreview] = useState<readonly PredictionMarker[]>([]);
  const [notice, setNotice] = useState<string | null>(() => initial.error ?? (initial.issues[0]?.message ?? null));
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [tool, setTool] = useState<ToolMode>("select");
  const toolRef = useRef<ToolMode>(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    shellRef.current?.setAttribute("data-interactive", "true");
  }, []);

  /** The Layer Drawer docks below the app bar, not over it; measured (not hard-coded per
   * breakpoint) so it holds at any width without duplicating the app bar's own responsive CSS. */
  useEffect(() => {
    const bar = appBarRef.current;
    if (!bar) return;
    const update = () => setAppBarHeight(bar.getBoundingClientRect().bottom);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  /** Every lab transition goes through the ref so RAF ticks and edits never see stale state. */
  const commitLab = useCallback((next: LabState) => {
    labRef.current = next;
    setLab(next);
  }, []);

  const resetHistory = useCallback((runtime: ElectrostaticRuntime) => {
    const history = createPlaybackHistory(runtime);
    historyRef.current = history;
    setTimelineView(timelineViewOf(history));
  }, []);

  const updateRuntime = useCallback((transition: (current: LabState) => ElectrostaticRuntime) => {
    const current = labRef.current;
    const next = transition(current);
    if (next !== current.runtime) commitLab({ setup: current.setup, runtime: next });
  }, [commitLab]);

  const commitCandidate = (candidate: ElectrostaticSetup, options: { readonly localError?: boolean } = {}): ElectrostaticSetup | null => {
    const current = labRef.current;
    const result = applySetupEdit(current.setup, current.runtime, candidate);
    if (!result.ok) {
      if (!options.localError) setNotice(firstIssueMessage(result.issues));
      return null;
    }
    const next = retainFieldSceneReferences(current.setup, result.setup);
    if (result.runtime !== current.runtime) resetHistory(result.runtime);
    commitLab({ setup: next, runtime: result.runtime });
    setNotice(result.warnings.length > 0 ? firstIssueMessage(result.warnings) : null);
    setShareStatus(null);
    return next;
  };

  const replaceWith = (candidate: ElectrostaticSetup, updateBaseline: boolean) => {
    const current = labRef.current;
    const result = applySetupEdit(current.setup, current.runtime, candidate);
    if (!result.ok) {
      setNotice(firstIssueMessage(result.issues));
      return;
    }
    const runtime = initialRuntime(result.setup);
    resetHistory(runtime);
    commitLab({ setup: result.setup, runtime });
    if (updateBaseline) setBaseline(result.setup);
    setSelected({ kind: "source", id: result.setup.sources[0].id });
    setNotice(result.warnings.length > 0 ? firstIssueMessage(result.warnings) : null);
    setShareStatus(null);
  };

  const applyPreset = (id: PresetId) => replaceWith(clonePreset(id), true);

  const moveObject = (target: DraggableObject, point: Vec2) => {
    const setup = labRef.current.setup;
    const gate = policyRef.current;
    if (target.kind === "source" && !gate.sourcesMovable) return;
    if (target.kind === "probe" && !gate.probeMovable) return;
    if (target.kind === "particle" && !gate.setupControls) return;
    if (target.kind === "particle") {
      commitCandidate({ ...setup, testParticle: { ...setup.testParticle, x_m: point.x, y_m: point.y }, presetId: null });
      return;
    }
    if (target.kind === "probe") {
      commitCandidate({ ...setup, probe: { ...setup.probe, x_m: point.x, y_m: point.y }, presetId: null });
      return;
    }
    commitCandidate({
      ...setup,
      sources: setup.sources.map((source) => source.id === target.id ? { ...source, x_m: point.x, y_m: point.y } : source),
      presetId: null,
    });
  };

  const selectedSource = selected?.kind === "source"
    ? setup.sources.find((source) => source.id === selected.id) ?? null
    : null;

  /** Places a source at the point the learner actually chose, rather than a canned slot. */
  const placeSourceAt = (point: Vec2) => {
    const current = labRef.current.setup;
    if (current.sources.length >= MAX_SOURCES) {
      setNotice(`最多只能有 ${MAX_SOURCES} 顆源電荷。`);
      setTool("select");
      return;
    }
    if (!pointInDomain(point, current.domain)) {
      setNotice("請點在觀察範圍內。");
      return;
    }
    const used = new Set(current.sources.map((source) => source.id));
    const id = SOURCE_IDS.find((candidate) => !used.has(candidate));
    if (!id) return;
    const next = commitCandidate({
      ...current,
      sources: [...current.sources, { id, x_m: point.x, y_m: point.y, q_C: 3e-9 }],
      presetId: null,
    });
    if (next) {
      setSelected({ kind: "source", id });
      if (next.sources.length >= MAX_SOURCES) {
        setTool("select");
        setNotice(`已達 ${MAX_SOURCES} 顆源電荷上限。`);
      }
    }
  };

  const deleteSourceById = (id: string, persistent = false) => {
    const current = labRef.current.setup;
    if (current.sources.length <= 1) {
      setNotice("至少要保留一顆源電荷，這顆不能刪除。");
      if (persistent) setTool("select");
      return;
    }
    const remaining = current.sources.filter((source) => source.id !== id);
    const next = commitCandidate({ ...current, sources: remaining, presetId: null });
    if (next) {
      setSelected({ kind: "source", id: remaining[0].id });
      if (!persistent || remaining.length <= 1) {
        setTool("select");
        if (remaining.length <= 1) setNotice("只剩一顆源電荷，已離開刪除模式。");
      }
    }
  };

  /** Delete-tool click: only sources may be removed; the probe and test charge are permanent. */
  const deleteTarget = (target: DraggableObject) => {
    if (target.kind !== "source") {
      setNotice("刪除工具只能刪除源電荷；測量點與測試電荷不能刪除。");
      return;
    }
    deleteSourceById(target.id, true);
  };

  const toggleSign = () => {
    if (!selectedSource) return;
    commitCandidate({
      ...setup,
      sources: setup.sources.map((source) => source.id === selectedSource.id ? { ...source, q_C: -source.q_C } : source),
      presetId: null,
    });
  };

  const setMagnitude = (magnitude_nC: number): boolean => {
    if (!selectedSource) return false;
    const sign = selectedSource.q_C < 0 ? -1 : 1;
    return commitCandidate({
      ...setup,
      sources: setup.sources.map((source) => source.id === selectedSource.id
        ? { ...source, q_C: sign * magnitude_nC * 1e-9 }
        : source),
      presetId: null,
    }, { localError: true }) !== null;
  };

  const setSourcePosition = (axis: "x" | "y", value_m: number): boolean => {
    if (!selectedSource) return false;
    return commitCandidate({
      ...setup,
      sources: setup.sources.map((source) => source.id === selectedSource.id
        ? { ...source, [axis === "x" ? "x_m" : "y_m"]: value_m }
        : source),
      presetId: null,
    }, { localError: true }) !== null;
  };

  const setProbePosition = (axis: "x" | "y", value_m: number): boolean => {
    return commitCandidate({
      ...setup,
      probe: { ...setup.probe, [axis === "x" ? "x_m" : "y_m"]: value_m },
      presetId: null,
    }, { localError: true }) !== null;
  };

  const editParticle = (field: "x_m" | "y_m" | "vx_mps" | "vy_mps" | "q_nC" | "mass_ug", value: number): boolean => {
    const particle = labRef.current.setup.testParticle;
    const sign = particle.q_C < 0 ? -1 : 1;
    const patch = field === "q_nC" ? { q_C: sign * (value / 1e9) }
      : field === "mass_ug" ? { mass_kg: value / 1e9 }
      : { [field]: value };
    return commitCandidate({ ...labRef.current.setup, testParticle: { ...particle, ...patch }, presetId: null }) !== null;
  };

  const toggleParticleSign = () => {
    const particle = labRef.current.setup.testParticle;
    commitCandidate({ ...labRef.current.setup, testParticle: { ...particle, q_C: -particle.q_C }, presetId: null });
  };

  const togglePlay = useCallback(() => {
    const current = labRef.current.runtime;
    if (current.status === "running") {
      updateRuntime(({ runtime }) => pauseRuntime(runtime));
      setAnnouncement(`已暫停，t = ${current.particle.t_s.toFixed(4)} s`);
    } else if (current.status === "paused" && current.error === null) {
      updateRuntime(({ runtime }) => playRuntime(runtime));
      setAnnouncement("開始播放");
    }
  }, [updateRuntime]);

  const resetRuntime = useCallback(() => {
    const current = labRef.current;
    const next = initialRuntime(current.setup);
    resetHistory(next);
    commitLab({ setup: current.setup, runtime: next });
    setAnnouncement("測試電荷已回到起點；設定沒有改變。");
  }, [commitLab, resetHistory]);

  const seekTo = useCallback((macroSteps: number) => {
    const current = labRef.current;
    const result = seekRuntime(current.setup, historyRef.current, macroSteps);
    if (!result.ok) return;
    commitLab({ setup: current.setup, runtime: result.runtime });
    setAnnouncement(`已回到 ${result.runtime.particle.t_s.toFixed(2)} 秒。`);
  }, [commitLab]);

  /** ±0.1 s forward: existing history first, then the live edge extends the simulation. */
  const stepForward = useCallback(() => {
    const current = labRef.current;
    const result = stepTimelineForward(current.setup, historyRef.current, current.runtime);
    historyRef.current = result.history;
    setTimelineView(timelineViewOf(result.history));
    commitLab({ setup: current.setup, runtime: result.runtime });
    setAnnouncement(`已前進到 ${result.runtime.particle.t_s.toFixed(2)} 秒。`);
  }, [commitLab]);

  const pauseForDrag = (target: DraggableObject) => {
    if (target.kind === "probe") return;
    if (target.kind === "source" && !policyRef.current.sourcesMovable) return;
    updateRuntime(({ runtime }) => pauseRuntime(runtime));
  };

  const running = runtime.status === "running";

  // Browser clock boundary: RAF only measures wall time; the model decides the fixed steps.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const elapsed_s = last === null ? 0 : (now - last) / 1000;
      last = now;
      updateRuntime(({ setup, runtime }) => {
        const { runtime: next, history } = advanceTimeline(setup, historyRef.current, runtime, elapsed_s * playbackSpeed);
        historyRef.current = history;
        setTimelineView(timelineViewOf(history));
        return next;
      });
      if (labRef.current.runtime.status === "running") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playbackSpeed, running, updateRuntime]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") updateRuntime(({ runtime }) => pauseRuntime(runtime, "hidden"));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [updateRuntime]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const policy = policyRef.current;
      /* A focused Canvas object or form control owns its own keys first; only keys that reach
       * here unclaimed are treated as global shortcuts. */
      const global = !isInteractive(event.target);
      const canvasObjectFocused = event.target instanceof Element && event.target.closest('[data-canvas-object="true"]') !== null;
      if (event.key === " " && policy.timeControls && global) {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "Escape") {
        /* Escape backs out one step: the active tool first, then the selection. */
        if (toolRef.current !== "select") {
          event.preventDefault();
          setTool("select");
        } else if (global) {
          setSelected(null);
        }
      } else if ((global || canvasObjectFocused) && policy.setupControls && learning === null && !entryPending && !event.repeat) {
        const key = event.key.toUpperCase();
        if (key === TOOL_SHORTCUT["add-source"]) {
          event.preventDefault();
          if (labRef.current.setup.sources.length >= MAX_SOURCES) {
            setNotice(`最多只能有 ${MAX_SOURCES} 顆源電荷。`);
            setTool("select");
            return;
          }
          setTool((current) => (current === "add-source" ? "select" : "add-source"));
        } else if (key === TOOL_SHORTCUT["delete-source"]) {
          event.preventDefault();
          if (labRef.current.setup.sources.length <= 1) {
            setNotice("至少要保留一顆源電荷，目前沒有可刪除的電荷。");
            setTool("select");
            return;
          }
          setTool((current) => (current === "delete-source" ? "select" : "delete-source"));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entryPending, learning, togglePlay]);

  // Stop, error and auto-pause messages take priority; user actions announce otherwise.
  const clockMessage = stopAnnouncement(runtime);

  /** Atomic activity (re)load: pause, canonical setup, fresh runtime, fresh learning state. */
  const loadLearning = (next: LearningState, focus: boolean) => {
    const target = structuredClone(activitySetup(next));
    const freshRuntime = initialRuntime(target);
    resetHistory(freshRuntime);
    commitLab({ setup: target, runtime: freshRuntime });
    setLearning(next);
    setSelected(null);
    setTool("select");
    setNotice(null);
    setShareStatus(null);
    setLivePreview([]);
    if (focus) setFocusToken((token) => token + 1);
  };

  const enterActivity = (activity: ActivityId) => {
    setEntryPending(false);
    loadLearning(startActivity(activity), true);
    setAnnouncement(`已開始任務 ${activity}；模型已回到任務起點。`);
  };

  /** Learning transitions; a step that needs a different canonical setup loads it atomically. */
  const transition = (next: LearningState, message: string) => {
    if (learning === null || next === learning) return;
    if (activitySetup(next) !== activitySetup(learning)) loadLearning(next, guidedProgress(next).current !== guidedProgress(learning).current);
    else {
      setLearning(next);
      if (guidedProgress(next).current !== guidedProgress(learning).current) setFocusToken((token) => token + 1);
    }
    // The learner's live, uncommitted guess never survives a transition: either it was just
    // committed (the model's own copy in `learning` now takes over) or the step moved on.
    setLivePreview([]);
    setAnnouncement(message);
  };

  const exploreSandbox = (keepSetup: boolean) => {
    updateRuntime(({ runtime }) => pauseRuntime(runtime));
    if (!keepSetup) {
      const fresh = clonePreset(DEFAULT_SANDBOX_PRESET);
      const freshRuntime = initialRuntime(fresh);
      resetHistory(freshRuntime);
      commitLab({ setup: fresh, runtime: freshRuntime });
      setBaseline(fresh);
    } else {
      setBaseline(labRef.current.setup);
    }
    setLearning(null);
    setEntryPending(false);
    setSelected(null);
    setTool("select");
    setLivePreview([]);
    setAnnouncement("已進入自由探索；全部操作與讀值都已開放。");
  };

  const setGuidedSourceMagnitude = (id: string, magnitude_nC: number) => {
    if (policyRef.current.sourceMagnitudeId !== id) return;
    const current = labRef.current.setup;
    commitCandidate({
      ...current,
      sources: current.sources.map((source) => source.id === id ? { ...source, q_C: Math.sign(source.q_C) * (magnitude_nC / 1e9) } : source),
      presetId: null,
    });
  };

  const comparison = learning ? comparisonStage(learning) : null;
  /** The live guess wins while the learner is still choosing; once committed, `learning` itself
   * carries the answer, so the Canvas keeps showing it through the compare/observe steps too. */
  const predictionMarkers = livePreview.length > 0 ? livePreview : learning ? committedPredictionMarkers(learning) : [];
  const attentionCue = learning ? attentionCueFor(learning) : null;
  const focus = learning ? guidedFocusFor(learning) : null;
  const focusKey = focus?.key ?? null;
  const focusTarget = focus?.target ?? null;

  /** On a guided transition, bring the newly relevant region into view — only when it is off
   * screen (`nearest`), only when the step changes, and never on the first render. */
  const previousFocusKey = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousFocusKey.current;
    previousFocusKey.current = focusKey;
    if (previous === null || focusKey === null || previous === focusKey) return;
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 900px)").matches) return;
    const selector = focusTarget === "probe-readout" ? '[data-testid="probe-panel"]'
      : focusTarget === "particle-readout" ? '[data-testid="particle-panel"]'
        : focusTarget === "time-controls" ? '[data-testid="time-controls"]'
          : focusTarget === "probe-on-canvas" || focusTarget === "particle-on-canvas" ? '[data-testid="field-viewport"]'
            : '[data-testid="guided-panel"]';
    document.querySelector(selector)?.scrollIntoView({ block: "nearest" });
  }, [focusKey, focusTarget]);

  const shareSetup = async () => {
    const result = createShareUrl(setup, window.location.href);
    if (!result.ok) {
      setNotice(result.message);
      setShareStatus(null);
      return;
    }
    window.history.replaceState(null, "", result.url);
    try {
      await navigator.clipboard?.writeText(result.url);
      setShareStatus("分享網址已建立並複製；重新開啟會直接進入自由探索。");
    } catch {
      setShareStatus("分享網址已建立；瀏覽器未允許自動複製，請從網址列複製。");
    }
    setNotice(null);
  };

  return (
    <MathProvider><main
      ref={shellRef}
      className={styles.labShell}
      data-testid="electrostatic-lab"
      data-source-count={setup.sources.length}
      data-mode={entryPending ? "intent" : learning ? "guided" : "sandbox"}
      data-activity={learning?.activity ?? ""}
      style={appBarHeight ? ({ "--electro-appbar-h": `${appBarHeight}px` } as CSSProperties) : undefined}
    >
      <header ref={appBarRef} className={styles.appBar}>
        <div className={styles.appBarLeft}>
          <Link href="/" className="catalog-brand" aria-label="Kakau Lab 模型目錄">
            <Compass size={20} aria-hidden="true" /> <span>Kakau Lab</span>
          </Link>
          <span className={styles.appBarDivider} aria-hidden="true">/</span>
          <h1 className={styles.appBarTitle}>靜電學</h1>
          <span className={styles.statusChip} title="MODEL 09" aria-label="Beta 版">Beta</span>
        </div>
        <div className={styles.headerActions}>
          {!entryPending && !learning ? <QuickPresetsMenu setup={setup} onPreset={applyPreset} /> : null}
          {!entryPending && (learning
            ? <button type="button" className={`${styles.catalogLink} ${styles.modeToggle}`} onClick={() => exploreSandbox(false)} data-testid="direct-explore"><ArrowLeftRight size={16} aria-hidden="true" />自由探索</button>
            : <button type="button" className={`${styles.catalogLink} ${styles.modeToggle}`} onClick={() => enterActivity("A")} data-testid="enter-guided"><ArrowLeftRight size={16} aria-hidden="true" />探索任務</button>)}
          {!entryPending ? (
            <button
              type="button"
              className={`${styles.catalogLink} ${layersOpen ? styles.activeHeaderAction : ""}`}
              ref={layersTriggerRef}
              onClick={() => setLayersOpen((open) => !open)}
              aria-expanded={layersOpen}
              aria-controls="electrostatic-layer-drawer"
              data-testid="layers-toggle"
            >
              <Layers3 size={16} aria-hidden="true" />視圖圖層
            </button>
          ) : null}
          {!entryPending ? (
            <button
              type="button"
              className={styles.catalogLink}
              onClick={() => setModelInfoOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={modelInfoOpen}
              data-testid="model-info-toggle"
            >
              <Info size={16} aria-hidden="true" />理論與計算
            </button>
          ) : null}
        </div>
      </header>

      <div className={styles.statusOverlay} aria-live="polite">
        {notice ? <div className={styles.notice} role="status" data-testid="setup-notice">{notice}</div> : null}
        {shareStatus ? <div className={styles.shareStatus} role="status" data-testid="share-status">{shareStatus}</div> : null}
        {clockMessage ? <div className={styles.notice} data-testid="clock-notice">{clockMessage}</div> : null}
      </div>

      {!entryPending ? <nav className={styles.mobileTabs} aria-label="學習面板">
        <button type="button" aria-pressed={learning !== null} onClick={() => learning ? undefined : setSelected(null)}>任務</button>
        <button type="button" aria-pressed={!learning && selected?.kind === "source"} disabled={learning !== null} onClick={() => setSelected({ kind: "source", id: setup.sources[0].id })}>操作</button>
        <button type="button" aria-pressed={!learning && (selected?.kind === "probe" || selected?.kind === "particle")} disabled={learning !== null} onClick={() => setSelected({ kind: "probe" })}>讀值</button>
      </nav> : null}

      <div className={styles.workspace}>
        <div className={styles.canvasColumn}>
          <section className={styles.viewportCard} aria-label="電場畫布" aria-describedby="field-semantic-summary">
            <FieldCanvas
              setup={setup}
              runtime={runtime}
              policy={policy}
              freeExploration={!entryPending && learning === null}
              selected={selected}
              onSelect={setSelected}
              onMove={moveObject}
              onDragStart={pauseForDrag}
              tool={!entryPending && learning === null ? tool : "select"}
              onPlace={placeSourceAt}
              onDelete={deleteTarget}
              onExitTool={() => setTool("select")}
              layersOpen={layersOpen}
              onLayersOpenChange={setLayersOpen}
              layersTriggerRef={layersTriggerRef}
              emphasizedSourceId={emphasizedSourceId}
              onSourceHover={setEmphasizedSourceId}
              predictionMarkers={predictionMarkers}
              guidedSemantics={canvasSemantics}
              attentionCue={attentionCue}
              focusAnchor={focus?.canvasAnchor ?? null}
            />
          </section>

          {!entryPending && policy.timeControls
            ? <TimeControls
                runtime={runtime}
                maxSimulatedSteps={timelineView.max}
                horizonSteps={timelineView.horizon}
                terminal={timelineView.terminal}
                speed={playbackSpeed}
                onSpeed={setPlaybackSpeed}
                onTogglePlay={togglePlay}
                onSeek={seekTo}
                onStepForward={stepForward}
                onResetRuntime={resetRuntime}
                focused={focus?.target === "time-controls"}
              />
            : null}
        </div>

        <aside className={styles.sidePanel} aria-label={entryPending ? "選擇探索方式" : learning ? "探索任務" : "自由探索工具"}>
          {entryPending ? (
            <section className={styles.intentPanel} data-testid="intent-choice">
              <p className={styles.eyebrow}>從哪裡開始？</p>
              <h2>你想跟著任務，還是自己試？</h2>
              <p>兩種方式使用同一個物理模型，隨時都能切換。</p>
              <button type="button" className={styles.intentChoice} onClick={() => enterActivity("A")} data-testid="choose-guided">
                <strong>探索任務</strong><span>先預測，再用測量結果找出規律</span>
              </button>
              <div className={styles.taskPreview}>
                <span>任務一　兩個電場會往哪裡？</span>
                <span>任務二　對稱會留下什麼？</span>
                <span>任務三　從電場到運動</span>
              </div>
              <button type="button" className={styles.intentChoice} onClick={() => exploreSandbox(false)} data-testid="choose-sandbox">
                <strong>自由探索</strong><span>直接移動電荷與測量點，自己組合情境</span>
              </button>
            </section>
          ) : learning ? (
            <>
            <GuidedActivities
              learning={learning}
              setup={setup}
              runtime={runtime}
              comparisonSetup={comparison ? ACTIVITY_SETUPS[comparison] : null}
              focusToken={focusToken}
              onCommitDirection={(p) => transition(commitDirection(learning, p), "答案已提交。")}
              onCommitChange={(p) => transition(commitChange(learning, p), "答案已提交；下方是 E、F、a 的結果。")}
              onCommitTrajectory={(p) => transition(commitTrajectory(learning, p), "答案已提交；可以單步或播放觀察。")}
              onReveal={() => transition(revealNext(learning), "已顯示下一層結果。")}
              onAdvance={() => transition(advance(learning), "進入下一步。")}
              onExplainA={(e) => transition(explainA(learning, e), "說明已送出；換個情境再試一次。")}
              onExplainB={(e) => transition(explainB(learning, e), "說明已送出；換個情境再試一次。")}
              onSwitch={enterActivity}
              onRestart={() => enterActivity(learning.activity)}
              onExplore={() => exploreSandbox(true)}
              onSourceMagnitude={setGuidedSourceMagnitude}
              onPreview={setLivePreview}
            />
            {learning.activity === "C"
              ? <ParticlePanel setup={setup} runtime={runtime} policy={policy} focused={focus?.target === "particle-readout"} />
              : <ProbePanel
                  setup={setup}
                  policy={policy}
                  emphasizedSourceId={emphasizedSourceId}
                  onEmphasizeSource={setEmphasizedSourceId}
                  focused={focus?.target === "probe-readout"}
                  secondary={learning.activity === "B" && learning.step === "manipulate"}
                  detail={
                    learning.activity === "A" && ((learning.step === "observe" || learning.step === "transfer-observe") ? learning.reveal >= 3 : learning.step === "explain")
                      ? "inline"
                      : learning.activity === "B" && learning.step === "manipulate" ? "disclosure" : "hidden"
                  }
                />}
            </>
          ) : <Controls
            setup={setup}
        selected={selected}
        tool={tool}
        onToolChange={setTool}
        onToggleSign={toggleSign}
            onMagnitude={setMagnitude}
            onSourcePosition={setSourcePosition}
            onProbePosition={setProbePosition}
            onReset={() => replaceWith(structuredClone(baseline), false)}
            onShare={shareSetup}
          >
            {selected?.kind === "particle" ? <>
              <ParticleControls setup={setup} onEdit={editParticle} onToggleSign={toggleParticleSign} />
              <ParticlePanel setup={setup} runtime={runtime} policy={policy} />
            </> : null}
            {selected?.kind === "probe" ? <ProbePanel setup={setup} policy={policy} emphasizedSourceId={emphasizedSourceId} onEmphasizeSource={setEmphasizedSourceId} /> : null}
          </Controls>}
        </aside>
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite" data-testid="clock-announcer">{clockMessage ?? announcement}</p>

      {modelInfoOpen ? <ModelInfoOverlay onClose={() => setModelInfoOpen(false)} /> : null}

      <footer className={styles.footer}>
        {learning ? null : <span>分享連結只保存起始設定</span>}
        <span>點電荷模型只在每顆電荷的灰色核心之外使用</span>
      </footer>
    </main></MathProvider>
  );
}
