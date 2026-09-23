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
  readonly speed: number;
  readonly onSpeed: (speed: number) => void;
  readonly onTogglePlay: () => void;
  readonly onSeek: (macroSteps: number) => void;
  readonly onResetRuntime: () => void;
}

const SPEEDS = [0.25, 0.5, 1, 2] as const;
const timeOf = (steps: number) => steps / 960;
const HELP_ID = "electrostatic-transport-help";
const HELP_TEXT = "空白鍵播放／暫停。時間軸只能回看已經算過的歷史；播放會從目前位置繼續向前。";

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
  const [helpPos, setHelpPos] = useState<{ top: number; left: number } | null>(null);

  /**
   * The transport row wraps at narrow widths, so the help trigger's on-screen position isn't
   * fixed relative to any CSS anchor — a static `right:0` popover ended up jumping off-screen
   * whenever the icon landed mid-row instead of at the row's trailing edge. Measuring the
   * trigger's actual rect on open and placing the (position:fixed) popover from that keeps it
   * anchored to the icon regardless of where the row wrapped it to.
   */
  const onHelpToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) {
      setHelpPos(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.right - HELP_POPOVER_WIDTH),
      window.innerWidth - HELP_POPOVER_WIDTH - 8,
    );
    setHelpPos({ top: rect.bottom + 8, left });
  };

  return (
    <section className={styles.timeControls} aria-label="時間控制" aria-describedby={HELP_ID} data-testid="time-controls" data-clock-status={runtime.status}>
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
        <button type="button" onClick={() => props.onSeek(Math.max(0, current - LEARNER_SEEK_STEPS))} disabled={running || current === 0} data-testid="seek-back">−0.1s</button>
        <button type="button" onClick={() => props.onSeek(current + LEARNER_SEEK_STEPS)} disabled={running || current + LEARNER_SEEK_STEPS > props.maxSimulatedSteps} data-testid="seek-forward">＋0.1s</button>
        <button type="button" className={styles.iconButton} onClick={props.onResetRuntime} data-testid="reset-runtime">
          <RotateCcw size={14} aria-hidden="true" />重新開始
        </button>
        <select
          className={styles.speedSelect}
          value={props.speed}
          onChange={(event) => props.onSpeed(Number(event.target.value))}
          aria-label="播放速度"
          data-testid="playback-speed"
        >
          {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
        </select>

        <span className={styles.timelineLabel}>{timeOf(current).toFixed(2)}s</span>
        <input
          type="range"
          className={styles.timelineInput}
          min={0}
          max={Math.max(0, props.maxSimulatedSteps)}
          step={1}
          value={Math.min(current, props.maxSimulatedSteps)}
          disabled={running || props.maxSimulatedSteps === 0}
          aria-label="回看已模擬的時間"
          onChange={(event) => props.onSeek(Number(event.target.value))}
          data-testid="timeline"
        />
        <span className={styles.timelineLabel}>{timeOf(props.maxSimulatedSteps).toFixed(2)}s</span>

        <details className={styles.helpPopoverWrap} onToggle={onHelpToggle}>
          <summary className={styles.iconButton} aria-label="鍵盤操作說明" data-testid="transport-help">
            <HelpCircle size={16} aria-hidden="true" />
          </summary>
          <div
            className={styles.helpPopover}
            role="note"
            style={helpPos ? { top: helpPos.top, left: helpPos.left, right: "auto" } : undefined}
          >
            {HELP_TEXT}
          </div>
        </details>
      </div>
      <p id={HELP_ID} className={styles.srOnly}>{HELP_TEXT}</p>
    </section>
  );
}
