"use client";

import { ChevronDown, ChevronUp, Pause, Play, Settings2 } from "lucide-react";
import { dateFromDay, formatLatitude, formatTime } from "@/lib/science/solar";
import {
  datePresets,
  dayForSolarTerm,
  latitudePresets,
  solarTerms,
  type PlaybackMode,
  type SolarLabState,
} from "@/models/solar";

type Props = {
  state: SolarLabState;
  playing: PlaybackMode;
  expanded: boolean;
  shadowTraceEnabled: boolean;
  shadowTraceInterval: number;
  shadowSampleCount: number;
  onToggleExpanded: () => void;
  onStateChange: (patch: Partial<SolarLabState>) => void;
  /** Any deliberate jump to a value stops playback, so the model never fights the user. */
  onSeek: (patch: Partial<SolarLabState>) => void;
  onPlayingChange: (playing: PlaybackMode) => void;
  onShadowTraceEnabledChange: (enabled: boolean) => void;
  onShadowTraceIntervalChange: (minutes: number) => void;
  onClearShadowSamples: () => void;
};

export default function ControlDeck({
  state, playing, expanded, shadowTraceEnabled, shadowTraceInterval, shadowSampleCount,
  onToggleExpanded, onStateChange, onSeek, onPlayingChange,
  onShadowTraceEnabledChange, onShadowTraceIntervalChange, onClearShadowSamples,
}: Props) {
  return (
    <section className="control-panel" aria-label="同步控制台">
      <header className="control-panel-heading">
        <div><Settings2 size={17} /><strong>同步控制台</strong></div>
        <button onClick={onToggleExpanded} aria-expanded={expanded} aria-label={expanded ? "收合同步控制台" : "展開同步控制台"}>
          {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </header>
      {expanded && (
        <div className="control-deck">
          <label>
            <span>緯度 <b>{formatLatitude(state.latitude)}</b></span>
            <input type="range" min="-90" max="90" step="0.5" value={state.latitude} onChange={(event) => onStateChange({ latitude: Number(event.target.value) })} />
            <div className="preset-row latitude-presets">
              {latitudePresets.map(([label, latitude]) => (
                <button type="button" key={label} className={state.latitude === latitude ? "selected" : ""} onClick={() => onSeek({ latitude })}>{label}</button>
              ))}
            </div>
          </label>

          <label>
            <span>日期 <b>{dateFromDay(state.day)}</b></span>
            <input type="range" min="1" max="365" step="0.1" value={state.day} onChange={(event) => onStateChange({ day: Number(event.target.value) })} />
            <div className="preset-row">
              {datePresets.map(([label, day]) => (
                <button type="button" key={label} className={Math.round(state.day) === day ? "selected" : ""} onClick={() => onSeek({ day })}>{label}</button>
              ))}
            </div>
            <select
              className="term-select"
              value=""
              onChange={(event) => {
                const index = Number(event.target.value);
                if (Number.isNaN(index)) return;
                onSeek({ day: dayForSolarTerm(index) });
              }}
            >
              <option value="">24 節氣…</option>
              {solarTerms.map((term, index) => <option key={term} value={index}>{term}</option>)}
            </select>
          </label>

          <label className="time-control">
            <span>地方太陽時 <b>{formatTime(state.time)}</b></span>
            <input type="range" min="0" max="24" step="0.05" value={state.time} onChange={(event) => onStateChange({ time: Number(event.target.value) })} />
            <div className="shadow-trace-controls">
              <label>
                <input type="checkbox" checked={shadowTraceEnabled} onChange={(event) => onShadowTraceEnabledChange(event.target.checked)} />
                描繪竿影
              </label>
              <select disabled={!shadowTraceEnabled} value={shadowTraceInterval} onChange={(event) => onShadowTraceIntervalChange(Number(event.target.value))}>
                <option value="15">每 15 分</option>
                <option value="30">每 30 分</option>
                <option value="60">每 1 小時</option>
                <option value="120">每 2 小時</option>
              </select>
              <button type="button" disabled={!shadowSampleCount} onClick={onClearShadowSamples}>清除</button>
            </div>
          </label>

          <div className="play-actions">
            <button className={playing === "day" ? "active" : ""} onClick={() => onPlayingChange(playing === "day" ? null : "day")}>
              {playing === "day" ? <Pause size={14} /> : <Play size={14} />}一天
            </button>
            <button className={playing === "year" ? "active year-play" : "year-play"} onClick={() => onPlayingChange(playing === "year" ? null : "year")}>
              {playing === "year" ? <Pause size={14} /> : <Play size={14} />}一年
            </button>
            <button onClick={() => onSeek({ time: 12 })}>正午</button>
          </div>
        </div>
      )}
    </section>
  );
}
