"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Controls from "./electrostatic/Controls";
import FieldCanvas from "./electrostatic/FieldCanvas";
import FieldLegend from "./electrostatic/FieldLegend";
import ParticleControls from "./electrostatic/ParticleControls";
import ParticlePanel from "./electrostatic/ParticlePanel";
import TimeControls from "./electrostatic/TimeControls";
import GuidedActivities from "./electrostatic/GuidedActivities";
import ProbePanel from "./electrostatic/ProbePanel";
import type { DraggableObject } from "./electrostatic/AccessibleObjects";
import type { SelectedObject } from "./electrostatic/render";
import { createShareUrl, initialStateFromShare, retainFieldSceneReferences, type ShareRouteInput } from "./electrostatic/share";
import styles from "./electrostatic/ElectrostaticFieldLab.module.css";
import type { Vec2 } from "../lib/science/electrostatics/types.ts";
import {
  advancePlayback,
  applySetupEdit,
  ELECTROSTATIC_PRESETS,
  initialRuntime,
  pauseRuntime,
  playRuntime,
  stepRuntime,
  type ElectrostaticRuntime,
  type ElectrostaticSetup,
  type PresetId,
} from "../models/electrostatic.ts";
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
    return `模擬停止：粒子在 t = ${runtime.stop.t_s.toFixed(4)} s 進入來源 ${runtime.stop.sourceId ?? ""} 的 0.12 m excluded core（entered-source-core），停在首次交點。按「重設粒子／模擬」重新開始。`;
  }
  if (runtime.stop?.reason === "left-domain") {
    return `模擬停止：粒子在 t = ${runtime.stop.t_s.toFixed(4)} s 離開 4 × 3 m 世界範圍（left-domain），停在邊界交點。按「重設粒子／模擬」重新開始。`;
  }
  if (runtime.error) return `數值錯誤（${runtime.error}）：已暫停並保留最後有效狀態。請重設粒子／模擬。`;
  if (runtime.autoPause === "behind-realtime") {
    return "播放落後即時：單次待補算已超過即時播放預算，已自動暫停；模擬時間沒有跳躍。按播放重新開始。";
  }
  if (runtime.autoPause === "hidden") return "分頁已隱藏，播放自動暫停；模擬時間沒有跳躍。按播放重新開始。";
  return null;
}

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest("input, textarea, select, button, a, summary, [role='button'], [contenteditable='true']") !== null;
}

export default function ElectrostaticFieldLab({ share }: ElectrostaticFieldLabProps) {
  const shellRef = useRef<HTMLElement>(null);
  const initial = useMemo(() => initialStateFromShare(share), [share]);
  // D-05 + D-07: no `s` → guided Activity A; any `s` (valid or failed-closed) → sandbox semantics.
  const [learning, setLearning] = useState<LearningState | null>(() => (initial.sandbox ? null : startActivity("A")));
  const [focusToken, setFocusToken] = useState(0);
  const [lab, setLab] = useState<LabState>(() => {
    const first = initial.sandbox ? initial.setup : activitySetup(startActivity("A"));
    return { setup: first, runtime: initialRuntime(first) };
  });
  const policy = evidencePolicy(learning);
  const policyRef = useRef(policy);
  useEffect(() => {
    policyRef.current = policy;
  }, [policy]);
  const labRef = useRef<LabState>(lab);
  const { setup, runtime } = lab;
  const [announcement, setAnnouncement] = useState("");
  const [baseline, setBaseline] = useState<ElectrostaticSetup>(initial.setup);
  const [selected, setSelected] = useState<SelectedObject>(() => (initial.sandbox ? { kind: "source", id: initial.setup.sources[0].id } : null));
  const [notice, setNotice] = useState<string | null>(() => initial.error ?? (initial.issues[0]?.message ?? null));
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    shellRef.current?.setAttribute("data-interactive", "true");
  }, []);

  /** Every lab transition goes through the ref so RAF ticks and edits never see stale state. */
  const commitLab = useCallback((next: LabState) => {
    labRef.current = next;
    setLab(next);
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
    commitLab({ setup: result.setup, runtime: initialRuntime(result.setup) });
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

  const setMagnitude = (magnitude_nC: number) => {
    if (!selectedSource) return;
    const sign = selectedSource.q_C < 0 ? -1 : 1;
    commitCandidate({
      ...setup,
      sources: setup.sources.map((source) => source.id === selectedSource.id
        ? { ...source, q_C: sign * magnitude_nC * 1e-9 }
        : source),
      presetId: null,
    });
  };

  const setSourcePosition = (axis: "x" | "y", value_m: number) => {
    if (!selectedSource) return;
    commitCandidate({
      ...setup,
      sources: setup.sources.map((source) => source.id === selectedSource.id
        ? { ...source, [axis === "x" ? "x_m" : "y_m"]: value_m }
        : source),
      presetId: null,
    });
  };

  const setProbePosition = (axis: "x" | "y", value_m: number) => {
    commitCandidate({
      ...setup,
      probe: { ...setup.probe, [axis === "x" ? "x_m" : "y_m"]: value_m },
      presetId: null,
    });
  };

  const editParticle = (field: "x_m" | "y_m" | "vx_mps" | "vy_mps" | "q_nC" | "mass_ug", value: number) => {
    const particle = labRef.current.setup.testParticle;
    const sign = particle.q_C < 0 ? -1 : 1;
    const patch = field === "q_nC" ? { q_C: sign * (value / 1e9) }
      : field === "mass_ug" ? { mass_kg: value / 1e9 }
      : { [field]: value };
    commitCandidate({ ...labRef.current.setup, testParticle: { ...particle, ...patch }, presetId: null });
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

  const stepOnce = useCallback(() => {
    updateRuntime(({ setup, runtime }) => stepRuntime(setup, pauseRuntime(runtime)));
  }, [updateRuntime]);

  const resetRuntime = useCallback(() => {
    updateRuntime(({ setup }) => initialRuntime(setup));
    setAnnouncement("粒子與模擬已重設：t = 0，暫停；設定未改變。");
  }, [updateRuntime]);

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
      updateRuntime(({ setup, runtime }) => advancePlayback(setup, runtime, elapsed_s));
      if (labRef.current.runtime.status === "running") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, updateRuntime]);

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
      } else if (event.key === "." && clockAllowed && !isTextEntry(event.target)) {
        event.preventDefault();
        stepOnce();
      } else if (event.key === "Escape" && !isInteractive(event.target)) {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepOnce, togglePlay]);

  // Stop, error and auto-pause messages take priority; user actions announce otherwise.
  const clockMessage = stopAnnouncement(runtime);

  /** Atomic activity (re)load: pause, canonical setup, fresh runtime, fresh learning state. */
  const loadLearning = (next: LearningState, focus: boolean) => {
    const target = structuredClone(activitySetup(next));
    commitLab({ setup: target, runtime: initialRuntime(target) });
    setLearning(next);
    setSelected(null);
    setNotice(null);
    setShareStatus(null);
    if (focus) setFocusToken((token) => token + 1);
  };

  const enterActivity = (activity: ActivityId) => {
    loadLearning(startActivity(activity), true);
    setAnnouncement(`已開始 Activity ${activity}；模擬已重設。`);
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
      commitLab({ setup: fresh, runtime: initialRuntime(fresh) });
      setBaseline(fresh);
    } else {
      setBaseline(labRef.current.setup);
    }
    setLearning(null);
    setSelected({ kind: "source", id: labRef.current.setup.sources[0].id });
    setAnnouncement("已進入 sandbox：全部儀器與讀值已開放。");
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
      setShareStatus("分享網址已建立並複製；重新開啟會以 sandbox initial setup 載入。");
    } catch {
      setShareStatus("分享網址已建立；瀏覽器未允許自動複製，請從網址列複製。");
    }
    setNotice(null);
  };

  return (
    <main
      ref={shellRef}
      className={styles.labShell}
      data-testid="electrostatic-lab"
      data-source-count={setup.sources.length}
      data-mode={learning ? "guided" : "sandbox"}
      data-activity={learning?.activity ?? ""}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MODEL 09 · EXPERIMENTAL</p>
          <h1>靜電場工作室</h1>
          <p className={styles.subtitle}>建立來源、觀察全域場，再用 probe 拆解每一個向量貢獻。</p>
        </div>
        <div className={styles.headerActions}>
          {learning ? (
            <button type="button" className={styles.catalogLink} onClick={() => exploreSandbox(false)} data-testid="direct-explore">直接探索（sandbox）</button>
          ) : (
            <button type="button" className={styles.catalogLink} onClick={() => enterActivity("A")} data-testid="enter-guided">引導活動</button>
          )}
          <Link href="/" className={styles.catalogLink}>返回模型目錄</Link>
        </div>
      </header>

      {notice ? <div className={styles.notice} role="status" data-testid="setup-notice">{notice}</div> : null}
      {shareStatus ? <div className={styles.shareStatus} role="status" data-testid="share-status">{shareStatus}</div> : null}

      <div className={styles.workspace}>
        <section className={styles.viewportCard} aria-labelledby="field-viewport-title" aria-describedby="field-semantic-summary">
          <div className={styles.viewportTitle}>
            <span>01</span>
            <div><h2 id="field-viewport-title">Electric field</h2><p>4 × 3 m · fixed logarithmic scale</p></div>
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

        <aside className={styles.sidePanel} aria-label={learning ? "引導活動" : "Sandbox 控制與證據"}>
          {learning ? (
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
              onExplainA={(e) => transition(explainA(learning, e), "說明已送出；Transfer 已載入新設定。")}
              onExplainB={(e) => transition(explainB(learning, e), "說明已送出；Transfer 已載入新設定。")}
              onSwitch={enterActivity}
              onRestart={() => enterActivity(learning.activity)}
              onExplore={() => exploreSandbox(true)}
              onShare={shareSetup}
              onSourceMagnitude={setGuidedSourceMagnitude}
            />
          ) : <Controls
            setup={setup}
            selected={selected}
            onSelect={setSelected}
            onPreset={applyPreset}
            onAddSource={addSource}
            onRemoveSource={removeSource}
            onToggleSign={toggleSign}
            onMagnitude={setMagnitude}
            onSourcePosition={setSourcePosition}
            onProbePosition={setProbePosition}
            onReset={() => replaceWith(structuredClone(baseline), false)}
            onShare={shareSetup}
          >
            <ParticleControls
              setup={setup}
              selected={selected?.kind === "particle"}
              onSelect={() => setSelected({ kind: "particle" })}
              onEdit={editParticle}
              onToggleSign={toggleParticleSign}
            />
          </Controls>}
          {policy.timeControls
            ? <TimeControls runtime={runtime} onTogglePlay={togglePlay} onStep={stepOnce} onResetRuntime={resetRuntime} />
            : null}
        </aside>
      </div>

      {clockMessage ? <div className={styles.notice} data-testid="clock-notice">{clockMessage}</div> : null}
      <p className={styles.srOnly} role="status" aria-live="polite" data-testid="clock-announcer">{clockMessage ?? announcement}</p>

      <div className={styles.evidenceGrid}>
        {policy.particle ? <ParticlePanel setup={setup} runtime={runtime} policy={policy} /> : null}
        {policy.probe ? <ProbePanel setup={setup} policy={policy} /> : null}
        <FieldLegend />
      </div>
      <footer className={styles.footer}>
        <span>Canonical SI · schema v1 · {learning ? "guided session（不進網址）" : "sandbox semantics"}</span>
        <span>Point-charge model valid only outside each 0.12 m source core</span>
      </footer>
    </main>
  );
}
