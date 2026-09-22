"use client";

import type { ReactNode } from "react";
import type { ElectrostaticSetup, PresetId } from "../../models/electrostatic.ts";
import type { SelectedObject } from "./render.ts";
import CommittedNumberField from "./CommittedNumberField";
import styles from "./ElectrostaticFieldLab.module.css";

interface ControlsProps {
  readonly setup: ElectrostaticSetup;
  readonly selected: SelectedObject;
  readonly onPreset: (preset: PresetId) => void;
  readonly onAddSource: () => void;
  readonly onRemoveSource: () => void;
  readonly onToggleSign: () => void;
  readonly onMagnitude: (magnitude_nC: number) => boolean;
  readonly onSourcePosition: (axis: "x" | "y", value_m: number) => boolean;
  readonly onProbePosition: (axis: "x" | "y", value_m: number) => boolean;
  readonly onReset: () => void;
  readonly onShare: () => void;
  readonly children?: ReactNode;
}

const PRESETS: readonly { id: PresetId; label: string; hint: string }[] = [
  { id: "single-positive", label: "單一正電荷", hint: "先看一顆電荷如何建立電場" },
  { id: "like-pair", label: "同號雙電荷", hint: "找出互相抵消的位置" },
  { id: "dipole", label: "一正一負", hint: "比較兩個方向如何疊加" },
];

function sourceName(setup: ElectrostaticSetup, id: string): string {
  const index = setup.sources.findIndex((source) => source.id === id);
  const source = setup.sources[index];
  if (!source) return "來源電荷";
  return `${source.q_C > 0 ? "正" : "負"}電荷 ${index + 1}`;
}

export default function Controls(props: ControlsProps) {
  const selectedSource = props.selected?.kind === "source"
    ? props.setup.sources.find((source) => source.id === props.selected?.id) ?? null
    : null;
  const heading = selectedSource ? sourceName(props.setup, selectedSource.id)
    : props.selected?.kind === "probe" ? "測量點"
      : props.selected?.kind === "particle" ? "測試電荷"
        : "開始探索";

  return (
    <section className={styles.controls} aria-labelledby="setup-controls-title" data-testid="context-inspector">
      <div className={styles.sectionHeading}>
        <p>{props.selected ? "目前選取" : "自由探索"}</p>
        <h2 id="setup-controls-title">{heading}</h2>
      </div>

      {!props.selected ? (
        <>
          <p className={styles.inspectorLead}>直接點選畫布上的電荷、測量點或測試電荷，就能在這裡調整它。</p>
          <fieldset className={styles.controlGroup}>
            <legend>快速配置</legend>
            <div className={styles.presetGrid}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={props.setup.presetId === preset.id ? styles.activeButton : undefined}
                  aria-pressed={props.setup.presetId === preset.id}
                  data-testid={`preset-${preset.id}`}
                  onClick={() => props.onPreset(preset.id)}
                ><strong>{preset.label}</strong><small>{preset.hint}</small></button>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      {selectedSource ? (
        <fieldset className={styles.controlGroup} data-testid="selected-source-controls">
          <legend>{sourceName(props.setup, selectedSource.id)}的設定</legend>
          <button type="button" onClick={props.onToggleSign} data-testid="toggle-source-sign">
            改成{selectedSource.q_C > 0 ? "負" : "正"}電荷
          </button>
          <div className={styles.parameterGrid}>
            <CommittedNumberField label="電量大小（nC）" value={Math.abs(selectedSource.q_C / 1e-9)} step="0.25" min="1" max="5" testId="source-magnitude" onCommit={props.onMagnitude} />
            <CommittedNumberField label="水平位置 x（m）" value={selectedSource.x_m} step="0.01" min="-2" max="2" testId="source-x" onCommit={(value) => props.onSourcePosition("x", value)} />
            <CommittedNumberField label="垂直位置 y（m）" value={selectedSource.y_m} step="0.01" min="-1.5" max="1.5" testId="source-y" onCommit={(value) => props.onSourcePosition("y", value)} />
          </div>
          <button type="button" className={styles.dangerButton} onClick={props.onRemoveSource} disabled={props.setup.sources.length <= 1} data-testid="remove-source">移除這顆電荷</button>
        </fieldset>
      ) : null}

      {props.selected?.kind === "probe" ? (
        <fieldset className={styles.controlGroup}>
          <legend>精確位置</legend>
          <div className={styles.parameterGrid}>
            <CommittedNumberField label="水平位置 x（m）" value={props.setup.probe.x_m} step="0.01" min="-2" max="2" testId="probe-x" onCommit={(value) => props.onProbePosition("x", value)} />
            <CommittedNumberField label="垂直位置 y（m）" value={props.setup.probe.y_m} step="0.01" min="-1.5" max="1.5" testId="probe-y" onCommit={(value) => props.onProbePosition("y", value)} />
          </div>
        </fieldset>
      ) : null}

      {props.children}

      <div className={styles.inspectorActions}>
        <button type="button" onClick={props.onAddSource} disabled={props.setup.sources.length >= 4} data-testid="add-source">＋ 新增來源電荷</button>
        <button type="button" onClick={props.onReset} data-testid="reset-setup">回到這次的起始設定</button>
        <button type="button" className={styles.shareButton} onClick={props.onShare} data-testid="share-setup">分享設定</button>
      </div>
      <p id="electrostatic-keyboard-help" className={styles.keyboardHelp}>
        鍵盤也能完成相同操作：Tab 移到畫布物件，Enter／Space 選取；方向鍵移動 0.01 m，Shift＋方向鍵移動 0.10 m；Escape 清除選取。
      </p>
    </section>
  );
}
