"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Compass, Download, Info, Layers3, MousePointer2, RotateCcw, Settings2 } from "lucide-react";
import { formatLatitude, radians } from "@/lib/science/solar";
import { pickDirectory, saveDataUrl, type DirectoryHandle } from "@/lib/render/export";
import {
  advanceSolarState,
  deriveSolarModel,
  initialAppearance,
  initialLayers,
  initialSolarState,
  shadowSampleAt,
  withLayerToggled,
  type AppearanceState,
  type ExportMode,
  type ExportTarget,
  type LayerState,
  type PlaybackMode,
  type ShadowSample,
  type SolarLabState,
} from "@/models/solar";
import { setupScenes, type SolarSceneApi } from "@/components/solar/scene";
import ControlDeck from "@/components/solar/ControlDeck";
import ExportDialog from "@/components/solar/ExportDialog";
import LayerDrawer from "@/components/solar/LayerDrawer";

export default function SolarLab() {
  const globalRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SolarSceneApi | null>(null);
  const directoryRef = useRef<DirectoryHandle | null>(null);
  const previousTraceTime = useRef<number | null>(null);

  const [state, setState] = useState<SolarLabState>(initialSolarState);
  const [layers, setLayers] = useState<LayerState>(initialLayers);
  const [appearance, setAppearance] = useState<AppearanceState>(initialAppearance);
  const [playing, setPlaying] = useState<PlaybackMode>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>("local");
  const [exportMode, setExportMode] = useState<ExportMode>("color");
  const [lineWidth, setLineWidth] = useState(1);
  const [exportShadowTimes, setExportShadowTimes] = useState(true);
  const [exportPreview, setExportPreview] = useState("");
  const [directoryName, setDirectoryName] = useState("瀏覽器下載資料夾");

  const [shadowTraceEnabled, setShadowTraceEnabled] = useState(false);
  const [shadowTraceInterval, setShadowTraceInterval] = useState(30);
  const [shadowSamples, setShadowSamples] = useState<ShadowSample[]>([]);

  useEffect(() => {
    if (!globalRef.current || !localRef.current) return;
    sceneRef.current = setupScenes(globalRef.current, localRef.current, (patch) => {
      setPlaying(null);
      setState((current) => ({ ...current, ...patch }));
    });
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(
    () => sceneRef.current?.update(state, layers, appearance, { enabled: shadowTraceEnabled, samples: shadowSamples }),
    [state, layers, appearance, shadowTraceEnabled, shadowSamples],
  );

  useEffect(() => {
    if (!exportOpen) return;
    const frame = requestAnimationFrame(() => {
      const preview = sceneRef.current?.capture(exportTarget, exportMode, lineWidth, exportShadowTimes);
      if (preview) setExportPreview(preview);
    });
    return () => cancelAnimationFrame(frame);
  }, [exportOpen, exportTarget, exportMode, lineWidth, exportShadowTimes, state, layers, appearance, shadowSamples, shadowTraceEnabled]);

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      setState((current) => advanceSolarState(current, playing, delta));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const previous = previousTraceTime.current;
    previousTraceTime.current = state.time;
    if (!shadowTraceEnabled) return;
    // Wrapping past midnight starts a fresh day's trace.
    if (playing === "day" && previous !== null && state.time < previous) {
      const frame = requestAnimationFrame(() => setShadowSamples([]));
      return () => cancelAnimationFrame(frame);
    }
    if (playing !== "day") return;
    const sampled = shadowSampleAt(state, shadowTraceInterval);
    if (!sampled) return;
    const frame = requestAnimationFrame(() => {
      setShadowSamples((current) => current.some((sample) => Math.round((sample.time * 60) / shadowTraceInterval) === sampled.slot)
        ? current
        : [...current, sampled.sample]);
    });
    return () => cancelAnimationFrame(frame);
  }, [state, playing, shadowTraceEnabled, shadowTraceInterval]);

  const { declination, angles, noonAltitude, shadow: status } = useMemo(() => deriveSolarModel(state), [state]);

  const patchState = useCallback((patch: Partial<SolarLabState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const seek = useCallback((patch: Partial<SolarLabState>) => {
    setPlaying(null);
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const toggleLayer = useCallback((key: keyof LayerState) => {
    setLayers((current) => withLayerToggled(current, key));
  }, []);

  const patchAppearance = useCallback((patch: Partial<AppearanceState>) => {
    setAppearance((current) => ({ ...current, ...patch }));
  }, []);

  const chooseDirectory = useCallback(async () => {
    const selection = await pickDirectory();
    if (!selection.supported) {
      setDirectoryName("此瀏覽器使用預設下載資料夾");
      return;
    }
    // A dismissed picker leaves the current destination untouched.
    if (!selection.handle) return;
    directoryRef.current = selection.handle;
    setDirectoryName(selection.handle.name);
  }, []);

  const saveExport = useCallback(async () => {
    const dataUrl = sceneRef.current?.capture(exportTarget, exportMode, lineWidth, exportShadowTimes);
    if (!dataUrl) return;
    const filename = `astrolab-${exportTarget}-${Math.round(state.latitude)}-${Math.round(state.day)}-${exportMode}.png`;
    await saveDataUrl(dataUrl, filename, directoryRef.current);
  }, [exportTarget, exportMode, lineWidth, exportShadowTimes, state.latitude, state.day]);

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div>
          <Link href="/" className="lab-brand" aria-label="AstroLab 模型目錄"><Compass size={15} />AstroLab</Link>
          <div className="eyebrow"><span className="live-dot" /> 模型 01</div>
          <h1>太陽、天球與竿影</h1>
        </div>
        <div className="header-actions">
          <button className={appearance.directManipulation ? "active" : ""} onClick={() => patchAppearance({ directManipulation: !appearance.directManipulation })}><MousePointer2 size={15} />直接操控</button>
          <button className={showLayers ? "active" : ""} onClick={() => setShowLayers((value) => !value)}><Layers3 size={15} />圖層</button>
          <button className={showControls ? "active" : ""} onClick={() => setShowControls((value) => !value)}><Settings2 size={15} />控制台</button>
          <button onClick={() => sceneRef.current?.reset()} aria-label="重設視角"><RotateCcw size={15} />重設</button>
          <Link className="model-index-link" href="/">模型目錄</Link>
          <Link className="model-index-link" href="/about"><Info size={15} />模型說明</Link>
          <button className="primary-action" onClick={() => setExportOpen(true)}><Download size={15} />匯出</button>
        </div>
      </header>

      <section className="stage-grid">
        <article className="viewport-card global-card">
          <div className="card-label"><span>01</span><div><strong>地心模型</strong><small>地球、天球赤道與黃道</small></div></div>
          <div className="canvas-host" ref={globalRef} />
          <div className="legend globe-legend"><i className="light" />赤經／赤緯<i className="earth-grid" />地理經緯線<i className="ecliptic-line" />黃道<i className="sun" />太陽<i className="observer" />觀察者</div>
        </article>

        <div className="right-column">
          <article className="viewport-card local-card">
            <div className="card-label"><span>02</span><div><strong>觀察者模型</strong><small>{formatLatitude(state.latitude)}的天空</small></div></div>
            <div className="canvas-host" ref={localRef} />
            <div className="season-key"><span><i className="current" />當日</span><span><i className="seasonal" />二分二至</span></div>
          </article>

          <section className="metrics" aria-label="計算結果">
            <div><span>太陽赤緯</span><strong>{Math.abs(radians(declination)).toFixed(1)}°{declination >= 0 ? " N" : " S"}</strong></div>
            <div><span>正午高度角</span><strong>{noonAltitude.toFixed(1)}°</strong></div>
            <div><span>目前高度／方位</span><strong>{angles.altitude.toFixed(1)}° / {angles.azimuth.toFixed(0)}°</strong></div>
            <div><span>影長（竿高 = 1）</span><strong>{status.length}</strong></div>
            <div><span>竿影指向</span><strong>{status.direction}</strong></div>
          </section>
        </div>
      </section>

      <LayerDrawer
        open={showLayers}
        layers={layers}
        appearance={appearance}
        onClose={() => setShowLayers(false)}
        onToggleLayer={toggleLayer}
        onAppearanceChange={patchAppearance}
      />

      <ControlDeck
        state={state}
        playing={playing}
        expanded={showControls}
        shadowTraceEnabled={shadowTraceEnabled}
        shadowTraceInterval={shadowTraceInterval}
        shadowSampleCount={shadowSamples.length}
        onToggleExpanded={() => setShowControls((value) => !value)}
        onStateChange={patchState}
        onSeek={seek}
        onPlayingChange={setPlaying}
        onShadowTraceEnabledChange={(enabled) => {
          setShadowTraceEnabled(enabled);
          if (!enabled) setShadowSamples([]);
        }}
        onShadowTraceIntervalChange={setShadowTraceInterval}
        onClearShadowSamples={() => setShadowSamples([])}
      />

      {exportOpen && (
        <ExportDialog
          target={exportTarget}
          mode={exportMode}
          lineWidth={lineWidth}
          includeShadowTimes={exportShadowTimes}
          preview={exportPreview}
          directoryName={directoryName}
          onTargetChange={setExportTarget}
          onModeChange={setExportMode}
          onLineWidthChange={setLineWidth}
          onIncludeShadowTimesChange={setExportShadowTimes}
          onChooseDirectory={chooseDirectory}
          onSave={saveExport}
          onClose={() => setExportOpen(false)}
        />
      )}

      <footer className="lab-footer"><span>ASTROLAB / INTERACTIVE SCIENCE MODELS</span><span>教學近似模型 · 赤緯採週期近似式</span></footer>
    </main>
  );
}
