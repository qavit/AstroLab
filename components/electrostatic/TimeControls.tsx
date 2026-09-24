"use client";

import { useState, type SyntheticEvent } from "react";
import { HelpCircle, Pause, Play, RotateCcw } from "lucide-react";
import type { ElectrostaticRuntime } from "../../models/electrostatic.ts";
import { LEARNER_SEEK_STEPS } from "../../models/electrostatic-history.ts";
import styles from "./ElectrostaticFieldLab.module.css";

const HELP_POPOVER_WIDTH = 260;

interface TimeControlsProps {
  readonly runtime: ElectrostaticRuntime;
  readonly maxSimulatedSteps: number;
  readonly horizonSteps: number;
  readonly terminal: boolean;
  readonly speed: number;
  readonly onSpeed: (speed: number) => void;
  readonly onTogglePlay: () => void;
  readonly onSeek: (macroSteps: number) => void;
  readonly onStepForward: () => void;
  readonly onResetRuntime: () => void;
  /** Guided: playback is the current observation target. */
  readonly focused?: boolean;
}

const SPEEDS = [0.25, 0.5, 1, 2] as const;
const timeOf = (steps: number) => steps / 960;
const HELP_ID = "electrostatic-transport-help";
const HELP_TEXT = "空白鍵播放／暫停。拖曳時間軸可回看已經模擬過的部分；按播放會從目前位置繼續，追上最新狀態後再往前模擬。";

/**
 * A compact single dock (Projectile's `.projectile-transport` grammar): one row, ~34px
 * controls, the scrub input taking the remaining width instead of a full-width row of its
 * own. The keyboard-shortcut sentence that used to sit permanently under the row is always
 * available to assistive tech via aria-describedby (never gated behind an interaction), and
 * separately reachable for sighted/touch users as a tap-to-open disclosure on the help icon —
 * a native <details> rather than a hover-only tooltip, which does nothing on tap.
 */
export default function TimeControls(props: TimeControlsProps) {
  const { runtime } = props;
  const running = runtime.status === "running";
  const blocked = runtime.status === "stopped" || runtime.error !== null;
  const current = runtime.macroSteps;
  const [helpOffset, setHelpOffset] = useState(0);

  /**
   * The popover opens upward (CSS), because the dock sits near the bottom of the page and a
   * downward one ran off the edge. Horizontally the transport row wraps at narrow widths, so
   * the trigger is not reliably at the row's trailing edge and no static CSS anchor works:
   * this measures where the trigger actually is and returns an offset *relative to the
   * trigger*, so the popover stays absolutely positioned — scrolling with the dock as any
   * in-flow popover should — while still being clamped inside the viewport.
   */
  const onHelpToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(HELP_POPOVER_WIDTH, window.innerWidth - 16);
    const clampedLeft = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8,
    );
    setHelpOffset(clampedLeft - rect.left);
  };

  return (
    <section className={`${styles.timeControls} ${props.focused ? styles.focusedPanel : ""}`} data-focus={props.focused ? "true" : "false"} aria-label="時間控制" aria-describedby={HELP_ID} data-testid="time-controls" data-clock-status={runtime.status}>
      <div className={styles.transportRow}>
        <button
          type="button"
          onClick={props.onTogglePlay}
          disabled={blocked}
          aria-pressed={running}
          className={`${styles.iconButton} ${running ? styles.activeButton : ""}`}
          data-testid="play-toggle"
        >
          {running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {running ? "暫停" : "播放"}
        </button>
        <button type="button" onClick={props.onResetRuntime} className={styles.iconButton} aria-label="回到起點（時間 0）" data-testid="reset-runtime">
          <RotateCcw size={14} aria-hidden="true" />回到起點
        </button>
        <button type="button" onClick={() => props.onSeek(Math.max(0, current - LEARNER_SEEK_STEPS))} disabled={current === 0} aria-label="後退約 0.1 秒" data-testid="seek-back">−0.1s</button>
        <button type="button" onClick={props.onStepForward} disabled={blocked || (props.terminal && current >= props.maxSimulatedSteps)} aria-label="前進約 0.1 秒" data-testid="seek-forward">＋0.1s</button>
        <select
          className={styles.speedSelect}
          value={props.speed}
          onChange={(event) => props.onSpeed(Number(event.target.value))}
          aria-label="播放速度"
          data-testid="playback-speed"
        >
          {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
        </select>

        <span className={styles.timelineLabel} data-testid="timeline-time" aria-live="off">t = {timeOf(current).toFixed(2)} s</span>
        <input
          type="range"
          className={styles.timelineInput}
          min={0}
          max={props.horizonSteps}
          step={1}
          value={Math.min(current, props.horizonSteps)}
          style={{ ["--simulated" as string]: `${Math.min(100, (props.maxSimulatedSteps / props.horizonSteps) * 100)}%` }}
          aria-label="時間軸：拖曳回看已模擬的時間"
          aria-valuetext={`${timeOf(current).toFixed(2)} 秒`}
          onChange={(event) => props.onSeek(Math.min(Number(event.target.value), props.maxSimulatedSteps))}
          data-history-steps={props.maxSimulatedSteps}
          data-testid="timeline"
        />
        <span className={styles.timelineLabel}>已模擬 {timeOf(props.maxSimulatedSteps).toFixed(2)} s{props.terminal ? "（終點）" : ""}</span>

        <details className={styles.helpPopoverWrap} onToggle={onHelpToggle}>
          <summary className={styles.iconButton} aria-label="鍵盤操作說明" data-testid="transport-help">
            <HelpCircle size={16} aria-hidden="true" />
          </summary>
          <div className={styles.helpPopover} role="note" style={{ left: helpOffset }}>
            {HELP_TEXT}
          </div>
        </details>
      </div>
      <p id={HELP_ID} className={styles.srOnly}>{HELP_TEXT}</p>
    </section>
  );
}
