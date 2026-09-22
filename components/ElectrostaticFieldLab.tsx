"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Controls from "./electrostatic/Controls";
import FieldCanvas from "./electrostatic/FieldCanvas";
import FieldLegend from "./electrostatic/FieldLegend";
import ProbePanel from "./electrostatic/ProbePanel";
import type { DraggableObject } from "./electrostatic/AccessibleObjects";
import type { SelectedObject } from "./electrostatic/render";
import { createShareUrl, initialStateFromShare, retainFieldSceneReferences } from "./electrostatic/share";
import styles from "./electrostatic/ElectrostaticFieldLab.module.css";
import type { Vec2 } from "../lib/science/electrostatics/types.ts";
import {
  applySetupEdit,
  ELECTROSTATIC_PRESETS,
  initialRuntime,
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

export default function ElectrostaticFieldLab({ initialShare }: ElectrostaticFieldLabProps) {
  const shellRef = useRef<HTMLElement>(null);
  const initial = useMemo(() => initialStateFromShare(initialShare), [initialShare]);
  const [setup, setSetup] = useState<ElectrostaticSetup>(initial.setup);
  const [runtime, setRuntime] = useState<ElectrostaticRuntime>(() => initialRuntime(initial.setup));
  const [baseline, setBaseline] = useState<ElectrostaticSetup>(initial.setup);
  const [selected, setSelected] = useState<SelectedObject>(() => ({ kind: "source", id: initial.setup.sources[0].id }));
  const [notice, setNotice] = useState<string | null>(() => initial.error ?? (initial.issues[0]?.message ?? null));
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    shellRef.current?.setAttribute("data-interactive", "true");
  }, []);

  const commitCandidate = (candidate: ElectrostaticSetup): ElectrostaticSetup | null => {
    const result = applySetupEdit(setup, runtime, candidate);
    if (!result.ok) {
      setNotice(firstIssueMessage(result.issues));
      return null;
    }
    const next = retainFieldSceneReferences(setup, result.setup);
    setSetup(next);
    setRuntime(result.runtime);
    setNotice(result.warnings.length > 0 ? firstIssueMessage(result.warnings) : null);
    setShareStatus(null);
    return next;
  };

  const replaceWith = (candidate: ElectrostaticSetup, updateBaseline: boolean) => {
    const result = applySetupEdit(setup, runtime, candidate);
    if (!result.ok) {
      setNotice(firstIssueMessage(result.issues));
      return;
    }
    setSetup(result.setup);
    setRuntime(result.runtime);
    if (updateBaseline) setBaseline(result.setup);
    setSelected({ kind: "source", id: result.setup.sources[0].id });
    setNotice(result.warnings.length > 0 ? firstIssueMessage(result.warnings) : null);
    setShareStatus(null);
  };

  const applyPreset = (id: PresetId) => replaceWith(clonePreset(id), true);

  const moveObject = (target: DraggableObject, point: Vec2) => {
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
          <FieldCanvas setup={setup} selected={selected} onSelect={setSelected} onMove={moveObject} />
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
          />
        </aside>
      </div>

      <div className={styles.evidenceGrid}>
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
