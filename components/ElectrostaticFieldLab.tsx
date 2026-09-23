"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Compass, Info } from "lucide-react";
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
import styles from "./electrostatic/ElectrostaticFieldLab.module.css";
import { MathProvider } from "./math/MathJax";
import type { Vec2 } from "../lib/science/electrostatics/types.ts";
import {
  advancePlayback,
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
  checkpointCollector,
  createPlaybackHistory,
  recordPlayback,
  seekRuntime,
  type PlaybackHistory,
} from "../models/electrostatic-history.ts";
import {
  ACTIVITY_SETUPS,
  activitySetup,
  advance,
  commitChange,
  commitDirection,
  commitVelocity,
  comparisonStage,
  evidencePolicy,
  explainA,
  explainB,
  revealNext,
  startActivity,
  type ActivityId,
  type LearningState,
} from "../models/electrostatic-learning.ts";

interface ElectrostaticFieldLabProps {
  readonly share: ShareRouteInput;
}

const ADD_SOURCE_POSITIONS: readonly Vec2[] = [
  { x: 1.2, y: 0.8 },
  { x: -1.2, y: 0.8 },
  { x: 1.2, y: -0.8 },
  { x: -1.2, y: -0.8 },
];

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
    return `測試電荷在 ${runtime.stop.t_s.toFixed(3)} 秒時太靠近源電荷，因此停在模型仍有效的邊界。請按「重新開始」再試一次。`;
  }
  if (runtime.stop?.reason === "left-domain") {
    return `測試電荷在 ${runtime.stop.t_s.toFixed(3)} 秒時離開觀察範圍，已停在邊界。請按「重新開始」再試一次。`;
  }
  if (runtime.error) return "計算暫時無法繼續，已保留最後一個有效狀態。請按「重新開始」。";
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

export default function ElectrostaticFieldLab({ share }: ElectrostaticFieldLabProps) {
  const shellRef = useRef<HTMLElement>(null);
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
  const [maxSimulatedSteps, setMaxSimulatedSteps] = useState(lab.runtime.macroSteps);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const policy = evidencePolicy(learning);
  const policyRef = useRef(policy);
  useEffect(() => {
    policyRef.current = policy;
  }, [policy]);
  const labRef = useRef<LabState>(lab);
  const { setup, runtime } = lab;
  const [announcement, setAnnouncement] = useState("");
  const [baseline, setBaseline] = useState<ElectrostaticSetup>(initial.setup);
  const [selected, setSelected] = useState<SelectedObject>(null);
  const [notice, setNotice] = useState<string | null>(() => initial.error ?? (initial.issues[0]?.message ?? null));
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);

  useEffect(() => {
    shellRef.current?.setAttribute("data-interactive", "true");
  }, []);

  /** Every lab transition goes through the ref so RAF ticks and edits never see stale state. */
  const commitLab = useCallback((next: LabState) => {
    labRef.current = next;
    setLab(next);
  }, []);

  const resetHistory = useCallback((runtime: ElectrostaticRuntime) => {
    const history = createPlaybackHistory(runtime);
    historyRef.current = history;
    setMaxSimulatedSteps(history.maxSimulatedSteps);
  }, []);

  const updateRuntime = useCallback((transition: (current: LabState) => ElectrostaticRuntime) => {
    const current = labRef.current;
    const next = transition(current);
    if (next !== current.runtime) commitLab({ setup: current.setup, runtime: next });
  }, [commitLab]);

  const commitCandidate = (candidate: ElectrostaticSetup): ElectrostaticSetup | null => {
    const current = labRef.current;
    const result = applySetupEdit(current.setup, current.runtime, candidate);
    if (!result.ok) {
      setNotice(firstIssueMessage(result.issues));
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

  const addSource = () => {
    if (setup.sources.length >= 4) return;
    const used = new Set(setup.sources.map((source) => source.id));
    const id = ["s1", "s2", "s3", "s4"].find((candidate) => !used.has(candidate));
    if (!id) return;
    const position = ADD_SOURCE_POSITIONS[setup.sources.length - 1] ?? ADD_SOURCE_POSITIONS[0];
    const next = commitCandidate({
      ...setup,
      sources: [...setup.sources, { id, x_m: position.x, y_m: position.y, q_C: 3e-9 }],
      presetId: null,
    });
    if (next) setSelected({ kind: "source", id });
  };

  const removeSource = () => {
    if (!selectedSource || setup.sources.length <= 1) return;
    const remaining = setup.sources.filter((source) => source.id !== selectedSource.id);
    const next = commitCandidate({ ...setup, sources: remaining, presetId: null });
    if (next) setSelected({ kind: "source", id: remaining[0].id });
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
    }) !== null;
  };

  const setSourcePosition = (axis: "x" | "y", value_m: number): boolean => {
    if (!selectedSource) return false;
    return commitCandidate({
      ...setup,
      sources: setup.sources.map((source) => source.id === selectedSource.id
        ? { ...source, [axis === "x" ? "x_m" : "y_m"]: value_m }
        : source),
      presetId: null,
    }) !== null;
  };

  const setProbePosition = (axis: "x" | "y", value_m: number): boolean => {
    return commitCandidate({
      ...setup,
      probe: { ...setup.probe, [axis === "x" ? "x_m" : "y_m"]: value_m },
      presetId: null,
    }) !== null;
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
        const candidates: ElectrostaticRuntime[] = [];
        const next = advancePlayback(setup, runtime, elapsed_s * playbackSpeed, checkpointCollector(candidates));
        const history = recordPlayback(historyRef.current, next, candidates);
        historyRef.current = history;
        setMaxSimulatedSteps(history.maxSimulatedSteps);
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
      const clockAllowed = policyRef.current.timeControls;
      if (event.key === " " && clockAllowed && !isInteractive(event.target)) {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "Escape" && !isInteractive(event.target)) {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

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
    setNotice(null);
    setShareStatus(null);
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
    if (activitySetup(next) !== activitySetup(learning)) loadLearning(next, true);
    else {
      setLearning(next);
      setFocusToken((token) => token + 1);
    }
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
    >
      <header className={styles.appBar}>
        <div className={styles.appBarLeft}>
          <Link href="/" className="catalog-brand" aria-label="Kakau Lab 模型目錄">
            <Compass size={20} aria-hidden="true" /> <span>Kakau Lab</span>
          </Link>
          <span className={styles.appBarDivider} aria-hidden="true">/</span>
          <h1 className={styles.appBarTitle}>靜電學</h1>
          <span className={styles.statusChip} title="MODEL 09">實驗中</span>
        </div>
        <div className={styles.headerActions}>
          {!entryPending && !learning ? <QuickPresetsMenu setup={setup} onPreset={applyPreset} /> : null}
          {!entryPending && (learning
            ? <button type="button" className={`${styles.catalogLink} ${styles.modeToggle}`} onClick={() => exploreSandbox(false)} data-testid="direct-explore"><ArrowLeftRight size={16} aria-hidden="true" />自由探索</button>
            : <button type="button" className={`${styles.catalogLink} ${styles.modeToggle}`} onClick={() => enterActivity("A")} data-testid="enter-guided"><ArrowLeftRight size={16} aria-hidden="true" />探索任務</button>)}
          {!entryPending ? (
            <button
              type="button"
              className={styles.catalogLink}
              onClick={() => setModelInfoOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={modelInfoOpen}
              data-testid="model-info-toggle"
            >
              <Info size={16} aria-hidden="true" />模型說明
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
          <section className={styles.viewportCard} aria-labelledby="field-viewport-title" aria-describedby="field-semantic-summary">
            <div className={styles.viewportTitle}>
              <span>01</span>
              <div><h2 id="field-viewport-title">電場</h2><p>箭頭指出方向，明暗與長度表示強弱</p></div>
            </div>
            <FieldCanvas
              setup={setup}
              runtime={runtime}
              policy={policy}
              selected={selected}
              onSelect={setSelected}
              onMove={moveObject}
              onDragStart={pauseForDrag}
            />
          </section>

          {!entryPending && policy.timeControls
            ? <TimeControls
                runtime={runtime}
                maxSimulatedSteps={maxSimulatedSteps}
                speed={playbackSpeed}
                onSpeed={setPlaybackSpeed}
                onTogglePlay={togglePlay}
                onSeek={seekTo}
                onResetRuntime={resetRuntime}
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
              onCommitDirection={(p) => transition(commitDirection(learning, p), "預測已送出；開始顯示證據。")}
              onCommitChange={(p) => transition(commitChange(learning, p), "預測已送出；E、F、a 證據已顯示。")}
              onCommitVelocity={(p) => transition(commitVelocity(learning, p), "預測已送出；可以單步或播放觀察。")}
              onReveal={() => transition(revealNext(learning), "已顯示下一層證據。")}
              onAdvance={() => transition(advance(learning), "進入下一步。")}
              onExplainA={(e) => transition(explainA(learning, e), "說明已送出；已換成新的情境。")}
              onExplainB={(e) => transition(explainB(learning, e), "說明已送出；已換成新的情境。")}
              onSwitch={enterActivity}
              onRestart={() => enterActivity(learning.activity)}
              onExplore={() => exploreSandbox(true)}
              onShare={shareSetup}
              onSourceMagnitude={setGuidedSourceMagnitude}
            />
            {learning.activity === "C"
              ? <ParticlePanel setup={setup} runtime={runtime} policy={policy} />
              : <ProbePanel setup={setup} policy={policy} />}
            </>
          ) : <Controls
            setup={setup}
            selected={selected}
            onAddSource={addSource}
            onRemoveSource={removeSource}
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
            {selected?.kind === "probe" ? <ProbePanel setup={setup} policy={policy} /> : null}
          </Controls>}
        </aside>
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite" data-testid="clock-announcer">{clockMessage ?? announcement}</p>

      {modelInfoOpen ? <ModelInfoOverlay onClose={() => setModelInfoOpen(false)} /> : null}

      <footer className={styles.footer}>
        <span>schema v1 · {learning ? "探索任務不會寫入網址" : "分享只保存起始物理設定"}</span>
        <span>點電荷模型只在每顆電荷的灰色核心之外使用</span>
      </footer>
    </main></MathProvider>
  );
}
