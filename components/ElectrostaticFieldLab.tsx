"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Controls from "./electrostatic/Controls";
import FieldCanvas from "./electrostatic/FieldCanvas";
import FieldLegend from "./electrostatic/FieldLegend";
import ParticleControls from "./electrostatic/ParticleControls";
import ParticlePanel from "./electrostatic/ParticlePanel";
import TimeControls from "./electrostatic/TimeControls";
import ProbePanel from "./electrostatic/ProbePanel";
import type { DraggableObject } from "./electrostatic/AccessibleObjects";
import type { SelectedObject } from "./electrostatic/render";
import { createShareUrl, initialStateFromShare, retainFieldSceneReferences } from "./electrostatic/share";
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

interface ElectrostaticFieldLabProps {
  readonly initialShare: string | null;
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
    return "播放落後即時：待補算已超過 16 個 1/960 s 步，已自動暫停；模擬時間沒有跳躍。按播放重新開始。";
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

export default function ElectrostaticFieldLab({ initialShare }: ElectrostaticFieldLabProps) {
  const shellRef = useRef<HTMLElement>(null);
  const initial = useMemo(() => initialStateFromShare(initialShare), [initialShare]);
  const [lab, setLab] = useState<LabState>(() => ({ setup: initial.setup, runtime: initialRuntime(initial.setup) }));
  const labRef = useRef<LabState>(lab);
  const { setup, runtime } = lab;
  const [announcement, setAnnouncement] = useState("");
  const [baseline, setBaseline] = useState<ElectrostaticSetup>(initial.setup);
  const [selected, setSelected] = useState<SelectedObject>(() => ({ kind: "source", id: initial.setup.sources[0].id }));
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
      if (event.key === " " && !isInteractive(event.target)) {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "." && !isTextEntry(event.target)) {
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
    <main ref={shellRef} className={styles.labShell} data-testid="electrostatic-lab" data-source-count={setup.sources.length}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MODEL 09 · EXPERIMENTAL</p>
          <h1>靜電場工作室</h1>
          <p className={styles.subtitle}>建立來源、觀察全域場，再用 probe 拆解每一個向量貢獻。</p>
        </div>
        <Link href="/" className={styles.catalogLink}>返回模型目錄</Link>
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
            selected={selected}
            onSelect={setSelected}
            onMove={moveObject}
            onDragStart={pauseForDrag}
          />
        </section>

        <aside className={styles.sidePanel} aria-label="Sandbox 控制與證據">
          <Controls
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
          </Controls>
          <TimeControls runtime={runtime} onTogglePlay={togglePlay} onStep={stepOnce} onResetRuntime={resetRuntime} />
        </aside>
      </div>

      {clockMessage ? <div className={styles.notice} data-testid="clock-notice">{clockMessage}</div> : null}
      <p className={styles.srOnly} role="status" aria-live="polite" data-testid="clock-announcer">{clockMessage ?? announcement}</p>

      <div className={styles.evidenceGrid}>
        <ParticlePanel setup={setup} runtime={runtime} />
        <ProbePanel setup={setup} />
        <FieldLegend />
      </div>
      <footer className={styles.footer}>
        <span>Canonical SI · schema v1 · sandbox semantics</span>
        <span>Point-charge model valid only outside each 0.12 m source core</span>
      </footer>
    </main>
  );
}
