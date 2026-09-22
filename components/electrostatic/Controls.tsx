"use client";

import type { ReactNode } from "react";
import type { ElectrostaticSetup, PresetId } from "../../models/electrostatic.ts";
import type { SelectedObject } from "./render.ts";
import styles from "./ElectrostaticFieldLab.module.css";

interface ControlsProps {
  readonly setup: ElectrostaticSetup;
  readonly selected: SelectedObject;
  readonly onSelect: (selected: SelectedObject) => void;
  readonly onPreset: (preset: PresetId) => void;
  readonly onAddSource: () => void;
  readonly onRemoveSource: () => void;
  readonly onToggleSign: () => void;
  readonly onMagnitude: (magnitude_nC: number) => void;
  readonly onSourcePosition: (axis: "x" | "y", value_m: number) => void;
  readonly onProbePosition: (axis: "x" | "y", value_m: number) => void;
  readonly onReset: () => void;
  readonly onShare: () => void;
  /** Test-particle initial-condition controls, placed after the probe in focus order. */
  readonly children?: ReactNode;
}

const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: "single-positive", label: "單一正電荷" },
  { id: "like-pair", label: "同號雙電荷" },
  { id: "dipole", label: "電偶極" },
];

export default function Controls(props: ControlsProps) {
  const selectedSourceId = props.selected?.kind === "source" ? props.selected.id : null;
  const selectedSource = selectedSourceId
    ? props.setup.sources.find((source) => source.id === selectedSourceId) ?? null
    : null;
  return (
    <section className={styles.controls} aria-labelledby="setup-controls-title">
      <div className={styles.sectionHeading}>
        <p>PHYSICAL INITIAL SETUP</p>
        <h2 id="setup-controls-title">Sandbox 設定</h2>
      </div>

      <fieldset className={styles.controlGroup}>
        <legend>預設配置</legend>
        <div className={styles.presetGrid}>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={props.setup.presetId === preset.id ? styles.activeButton : undefined}
              aria-pressed={props.setup.presetId === preset.id}
              data-testid={`preset-${preset.id}`}
              onClick={() => props.onPreset(preset.id)}
            >{preset.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>來源電荷（{props.setup.sources.length}/4）</legend>
        <div className={styles.sourceList} role="group" aria-label="來源電荷清單">
          {props.setup.sources.map((source) => {
            const active = props.selected?.kind === "source" && props.selected.id === source.id;
            return (
              <button
                type="button"
                key={source.id}
                aria-pressed={active}
                className={active ? styles.activeButton : undefined}
                onClick={() => props.onSelect({ kind: "source", id: source.id })}
                data-testid={`select-source-${source.id}`}
              >
                <span className={source.q_C > 0 ? styles.sourceCircle : styles.sourceDiamond}>{source.q_C > 0 ? "+" : "−"}</span>
                {source.id} · {Math.abs(source.q_C / 1e-9).toPrecision(3)} nC
              </button>
            );
          })}
        </div>
        <div className={styles.inlineActions}>
          <button type="button" onClick={props.onAddSource} disabled={props.setup.sources.length >= 4} data-testid="add-source">新增來源</button>
          <button type="button" onClick={props.onRemoveSource} disabled={!selectedSource || props.setup.sources.length <= 1} data-testid="remove-source">刪除選取</button>
        </div>
        {selectedSource ? (
          <div className={styles.parameterGrid} data-testid="selected-source-controls">
            <button type="button" onClick={props.onToggleSign} data-testid="toggle-source-sign">
              切換為{selectedSource.q_C > 0 ? "負" : "正"}電荷
            </button>
            <label>大小（nC）
              <input
                type="number" min="1" max="5" step="0.25"
                value={Math.abs(selectedSource.q_C / 1e-9)}
                onChange={(event) => props.onMagnitude(Number(event.target.value))}
                data-testid="source-magnitude"
              />
            </label>
            <label>x（m）
              <input type="number" min="-2" max="2" step="0.01" value={selectedSource.x_m}
                onChange={(event) => props.onSourcePosition("x", Number(event.target.value))} data-testid="source-x" />
            </label>
            <label>y（m）
              <input type="number" min="-1.5" max="1.5" step="0.01" value={selectedSource.y_m}
                onChange={(event) => props.onSourcePosition("y", Number(event.target.value))} data-testid="source-y" />
            </label>
          </div>
        ) : <p className={styles.helperText}>在畫布或清單選取一個來源，才能修改參數。</p>}
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>Probe 位置</legend>
        <button type="button" onClick={() => props.onSelect({ kind: "probe" })} aria-pressed={props.selected?.kind === "probe"}>
          選取電場探針
        </button>
        <div className={styles.parameterGrid}>
          <label>x（m）
            <input type="number" min="-2" max="2" step="0.01" value={props.setup.probe.x_m}
              onChange={(event) => props.onProbePosition("x", Number(event.target.value))} data-testid="probe-x" />
          </label>
          <label>y（m）
            <input type="number" min="-1.5" max="1.5" step="0.01" value={props.setup.probe.y_m}
              onChange={(event) => props.onProbePosition("y", Number(event.target.value))} data-testid="probe-y" />
          </label>
        </div>
      </fieldset>

      {props.children}

      <p id="electrostatic-keyboard-help" className={styles.keyboardHelp}>
        鍵盤：Tab 選取來源、probe 或測試粒子初始位置；方向鍵移動 0.01 m，Shift＋方向鍵移動 0.10 m；Escape 取消選取。
      </p>
      <div className={styles.primaryActions}>
        <button type="button" onClick={props.onReset} data-testid="reset-setup">重設設定</button>
        <button type="button" className={styles.shareButton} onClick={props.onShare} data-testid="share-setup">分享設定</button>
      </div>
    </section>
  );
}
