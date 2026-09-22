"use client";

import type { ElectrostaticRuntime } from "../../models/electrostatic.ts";
import { LEARNER_SEEK_STEPS } from "../../models/electrostatic-history.ts";
import styles from "./ElectrostaticFieldLab.module.css";

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

export default function TimeControls(props: TimeControlsProps) {
  const { runtime } = props;
  const running = runtime.status === "running";
  const blocked = runtime.status === "stopped" || runtime.error !== null;
  const current = runtime.macroSteps;
  return (
    <section className={styles.timeControls} aria-label="時間控制" data-testid="time-controls" data-clock-status={runtime.status}>
      <div className={styles.transportRow}>
        <button type="button" onClick={props.onTogglePlay} disabled={blocked} aria-pressed={running} className={running ? styles.activeButton : undefined} data-testid="play-toggle">{running ? "暫停" : "播放"}</button>
        <button type="button" onClick={() => props.onSeek(Math.max(0, current - LEARNER_SEEK_STEPS))} disabled={running || current === 0} data-testid="seek-back">−0.1 s</button>
        <button type="button" onClick={() => props.onSeek(current + LEARNER_SEEK_STEPS)} disabled={running || current + LEARNER_SEEK_STEPS > props.maxSimulatedSteps} data-testid="seek-forward">＋0.1 s</button>
        <button type="button" onClick={props.onResetRuntime} data-testid="reset-runtime">重新開始</button>
        <label>速度
          <select value={props.speed} onChange={(event) => props.onSpeed(Number(event.target.value))} data-testid="playback-speed">
            {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
          </select>
        </label>
      </div>
      <div className={styles.timelineRow}>
        <span>{timeOf(current).toFixed(2)} s</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, props.maxSimulatedSteps)}
          step={1}
          value={Math.min(current, props.maxSimulatedSteps)}
          disabled={running || props.maxSimulatedSteps === 0}
          aria-label="回看已模擬的時間"
          onChange={(event) => props.onSeek(Number(event.target.value))}
          data-testid="timeline"
        />
        <span>{timeOf(props.maxSimulatedSteps).toFixed(2)} s</span>
      </div>
      <p className={styles.keyboardHelp}>空白鍵播放／暫停。時間軸只能回看已經算過的歷史；播放會從目前位置繼續向前。</p>
    </section>
  );
}
