"use client";

import type { ElectrostaticRuntime } from "../../models/electrostatic.ts";
import styles from "./ElectrostaticFieldLab.module.css";

interface TimeControlsProps {
  readonly runtime: ElectrostaticRuntime;
  readonly onTogglePlay: () => void;
  readonly onStep: () => void;
  readonly onResetRuntime: () => void;
}

export default function TimeControls({ runtime, onTogglePlay, onStep, onResetRuntime }: TimeControlsProps) {
  const running = runtime.status === "running";
  const blocked = runtime.status === "stopped" || runtime.error !== null;
  return (
    <section className={styles.timeControls} aria-labelledby="time-controls-title" data-testid="time-controls" data-clock-status={runtime.status}>
      <div className={styles.sectionHeading}>
        <p>FIXED CLOCK · 1/960 s</p>
        <h2 id="time-controls-title">時間控制</h2>
      </div>
      <div className={styles.timeButtons}>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={blocked}
          aria-pressed={running}
          className={running ? styles.activeButton : undefined}
          data-testid="play-toggle"
        >{running ? "暫停" : "播放"}</button>
        <button type="button" onClick={onStep} disabled={blocked} data-testid="step-once">單步 1/960 s</button>
        <button type="button" onClick={onResetRuntime} data-testid="reset-runtime">重設粒子／模擬</button>
      </div>
      <p className={styles.keyboardHelp} id="time-shortcut-help">
        快捷鍵：焦點不在按鈕或輸入框時，Space 播放／暫停；句點（.）單步一個 1/960 s macro step；Escape 取消選取。重設粒子只把粒子送回初始條件、t = 0，不改設定。
      </p>
    </section>
  );
}
