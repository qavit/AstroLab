"use client";

import type { ReactNode } from "react";
import { Plus, RotateCcw, Share2, Trash2 } from "lucide-react";
import type { ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { SelectedObject } from "./render.ts";
import { sourceDisplayName } from "./labels.ts";
import { TOOL_SHORTCUT, type ToolMode } from "./tools.ts";
import CommittedNumberField from "./CommittedNumberField";
import styles from "./ElectrostaticFieldLab.module.css";

interface ControlsProps {
  readonly setup: ElectrostaticSetup;
  readonly selected: SelectedObject;
  readonly tool: ToolMode;
  readonly onToolChange: (tool: ToolMode) => void;
  readonly onRemoveSource: () => void;
  readonly onToggleSign: () => void;
  readonly onMagnitude: (magnitude_nC: number) => boolean;
  readonly onSourcePosition: (axis: "x" | "y", value_m: number) => boolean;
  readonly onProbePosition: (axis: "x" | "y", value_m: number) => boolean;
  readonly onReset: () => void;
  readonly onShare: () => void;
  readonly children?: ReactNode;
}

const sourceName = (setup: ElectrostaticSetup, id: string) => sourceDisplayName(setup.sources, id);

export default function Controls(props: ControlsProps) {
  /* Bound to a local first: TypeScript cannot narrow `props.selected` inside the find callback. */
  const selected = props.selected;
  const selectedSource = selected?.kind === "source"
    ? props.setup.sources.find((source) => source.id === selected.id) ?? null
    : null;
  const heading = selectedSource ? sourceName(props.setup, selectedSource.id)
    : props.selected?.kind === "probe" ? "測量點"
      : props.selected?.kind === "particle" ? "測試電荷"
        : "開始探索";

  return (
    <section className={styles.controls} aria-labelledby="setup-controls-title" data-testid="context-inspector">
      <div className={styles.sectionHeading}>
        <div>
          <p>{props.selected ? "目前選取" : "自由探索"}</p>
          <div className={styles.inspectorHeadingRow}>
            <h2 id="setup-controls-title">{heading}</h2>
            {selectedSource ? (
              <button
                type="button"
                className={styles.selectedSourceDelete}
                aria-label="刪除這顆源電荷"
                title="刪除這顆源電荷"
                disabled={props.setup.sources.length <= 1}
                onClick={props.onRemoveSource}
                data-testid="selected-source-delete"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.toolbar} role="group" aria-label="畫布工具">
        <button
          type="button"
          className={`${styles.iconButton} ${props.tool === "add-source" ? styles.activeButton : ""}`}
          aria-pressed={props.tool === "add-source"}
          disabled={props.setup.sources.length >= 4}
          title={`新增源電荷（快捷鍵 ${TOOL_SHORTCUT["add-source"]}）：在畫布上連續放置；Esc 取消`}
          onClick={() => props.onToolChange(props.tool === "add-source" ? "select" : "add-source")}
          data-testid="add-source"
        >
          <Plus size={16} aria-hidden="true" />新增
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${props.tool === "delete-source" ? styles.activeButton : ""}`}
          aria-pressed={props.tool === "delete-source"}
          disabled={props.setup.sources.length <= 1}
          title={`刪除源電荷（快捷鍵 ${TOOL_SHORTCUT["delete-source"]}）：在畫布上連續刪除；Esc 取消`}
          onClick={() => props.onToolChange(props.tool === "delete-source" ? "select" : "delete-source")}
          data-testid="delete-tool"
        >
          <Trash2 size={16} aria-hidden="true" />刪除
        </button>
      </div>

      {!props.selected ? (
        <p className={styles.inspectorLead}>直接點選畫布上的電荷、測量點或測試電荷，就能在這裡調整它；或用上方的「快速配置」快速套用情境。</p>
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
        <button type="button" className={styles.iconButton} onClick={props.onReset} data-testid="reset-setup">
          <RotateCcw size={16} aria-hidden="true" />重置
        </button>
        <button type="button" className={`${styles.shareButton} ${styles.iconButton}`} onClick={props.onShare} data-testid="share-setup">
          <Share2 size={16} aria-hidden="true" />分享設定
        </button>
      </div>
      <p id="electrostatic-keyboard-help" className={styles.keyboardHelp}>
        鍵盤也能完成相同操作：Tab 移到畫布物件，Enter／Space 選取；方向鍵移動 0.01 m，Shift＋方向鍵移動 0.10 m；
        {TOOL_SHORTCUT["add-source"]} 進入新增模式，{TOOL_SHORTCUT["delete-source"]} 進入刪除模式；Escape 離開模式或清除選取。
      </p>
    </section>
  );
}
