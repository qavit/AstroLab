"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { HelpCircle, House, ZoomIn, ZoomOut, X } from "lucide-react";
import { sampleFieldGrid } from "../../lib/science/electrostatics/sampling.ts";
import type { Vec2 } from "../../lib/science/electrostatics/types.ts";
import { probeReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { EvidencePolicy } from "../../models/electrostatic-learning.ts";
import AccessibleObjects, { type DraggableObject, type HoverTarget } from "./AccessibleObjects";
import { formatCharge, sourceDisplayName } from "./labels.ts";
import { TOOL_BANNER, type ToolMode } from "./tools.ts";
import ElectrostaticLayerDrawer, { INITIAL_ELECTROSTATIC_LAYERS, type ElectrostaticLayerState } from "./ElectrostaticLayerDrawer";
import { buildVectorConstruction, probeVectorEnvelopeRadius } from "./vectorConstruction.ts";
import {
  drawDynamicField,
  drawStaticField,
  prepareCanvas,
  type ParticleGlyph,
  type ProbeVectorScene,
  type SelectedObject,
} from "./render.ts";
import { cameraForView, INITIAL_CAMERA_VIEW, worldToScreen, zoomView, type CameraView } from "./viewport.ts";
import styles from "./ElectrostaticFieldLab.module.css";

interface FieldCanvasProps {
  readonly setup: ElectrostaticSetup;
  readonly runtime: ElectrostaticRuntime;
  /** Learning visibility policy; gated evidence is never computed into draw inputs. */
  readonly policy: EvidencePolicy;
  readonly onDragStart: (target: DraggableObject) => void;
  readonly selected: SelectedObject;
  readonly onSelect: (target: SelectedObject) => void;
  readonly onMove: (target: DraggableObject, point: Vec2) => void;
  readonly tool: ToolMode;
  readonly onPlace: (point: Vec2) => void;
  readonly onDelete: (target: DraggableObject) => void;
  readonly onExitTool: () => void;
  /** Header-owned workspace control; display state remains local to this model. */
  readonly layersOpen: boolean;
  readonly onLayersOpenChange: (open: boolean) => void;
  readonly layersTriggerRef: RefObject<HTMLButtonElement | null>;
  /** Transient Canvas<->readout linkage (never selection, never physics). */
  readonly emphasizedSourceId: string | null;
  readonly onSourceHover: (id: string | null) => void;
}

const HIDDEN_GRID = { ok: false, reason: "no-sources" } as const;

export default function FieldCanvas(props: FieldCanvasProps) {
  const { setup, runtime, policy, selected, onSelect, onMove, onDragStart } = props;
  const { tool, onPlace, onDelete, onExitTool, layersOpen, onLayersOpenChange, layersTriggerRef } = props;
  const { emphasizedSourceId, onSourceHover } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hoverTarget, setHoverTarget] = useState<HoverTarget>(null);
  /** The tooltip target and the readout-linkage emphasis share one pointer/focus source: this. */
  const handleHover = (target: HoverTarget) => {
    setHoverTarget(target);
    onSourceHover(target?.kind === "source" ? target.id : null);
  };
  const [layers, setLayers] = useState<ElectrostaticLayerState>(INITIAL_ELECTROSTATIC_LAYERS);
  const [view, setView] = useState<CameraView>(INITIAL_CAMERA_VIEW);
  const [tipOpen, setTipOpen] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const rounded = { width: Math.round(width), height: Math.round(height) };
      setSize((current) => current.width === rounded.width && current.height === rounded.height ? current : rounded);
    };
    update(host.clientWidth, host.clientHeight);
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const camera = useMemo(() => cameraForView(setup.domain, size, view), [setup.domain, size, view]);
  const showField = policy.globalField && layers.field;
  const showProbe = policy.probe && layers.probe;
  const showParticle = policy.particle && layers.particle;
  const showTrail = policy.trajectory && layers.trail;
  const showContributions = policy.probeContributions && layers.contributions;

  useEffect(() => {
    if ((selected?.kind === "probe" && !showProbe) || (selected?.kind === "particle" && !showParticle)) onSelect(null);
  }, [onSelect, selected, showParticle, showProbe]);
  const hover = useMemo(() => {
    if (hoverTarget?.kind === "source") {
      const source = setup.sources.find((item) => item.id === hoverTarget.id);
      if (!source) return null;
      return {
        target: `source:${source.id}`,
        point: worldToScreen({ x: source.x_m, y: source.y_m }, camera),
        title: sourceDisplayName(setup.sources, source.id),
        detail: formatCharge(source.q_C),
      };
    }
    if (hoverTarget?.kind === "probe") {
      return {
        target: "probe",
        point: worldToScreen({ x: setup.probe.x_m, y: setup.probe.y_m }, camera),
        title: "測量點",
        detail: "可拖曳，或選取後用方向鍵移動",
      };
    }
    if (hoverTarget?.kind === "particle") {
      return {
        target: "particle",
        point: worldToScreen({ x: setup.testParticle.x_m, y: setup.testParticle.y_m }, camera),
        title: "測試電荷起點",
        detail: "可拖曳，或選取後用方向鍵移動",
      };
    }
    return null;
  }, [camera, hoverTarget, setup.probe.x_m, setup.probe.y_m, setup.sources, setup.testParticle.x_m, setup.testParticle.y_m]);
  const dimensions = size.width < 600 ? { cols: 24, rows: 18 } : { cols: 40, rows: 30 };
  const grid = useMemo(() => (!showField ? HIDDEN_GRID :
    sampleFieldGrid(
      setup.sources,
      setup.domain,
      dimensions.cols,
      dimensions.rows,
      setup.singularity.rCore_m,
      setup.fieldStyle,
    )
  ), [showField, setup.sources, setup.domain, setup.singularity, setup.fieldStyle, dimensions.cols, dimensions.rows]);
  const probe = useMemo(() => probeReadout(setup), [setup]);
  const { probeTotal } = policy;
  const probeZero = showProbe && probeTotal && probe.valid && probe.isZero;
  const probeScene: ProbeVectorScene = useMemo(() => {
    const empty: ProbeVectorScene = { contributions: [], chain: [], resultant: null };
    if (!showProbe || !showContributions || !probe.valid) return empty;
    // Physics y is up, screen y is down: flip once here so every vector below is already
    // screen-oriented and drawn with no further sign handling.
    const components = probe.contributions.map((item) => ({ x: item.Ex_N_per_C, y: -item.Ey_N_per_C }));
    // Camera zoom is irrelevant here: the envelope tracks the Canvas element's own on-screen
    // size, not `camera.scale_px_per_m`, so it reads clearly at normal desktop and mobile alike.
    const envelopeRadius = probeVectorEnvelopeRadius(Math.min(size.width, size.height));
    const construction = buildVectorConstruction(components, envelopeRadius);
    const anyEmphasized = emphasizedSourceId !== null && probe.contributions.some((item) => item.sourceId === emphasizedSourceId);
    const contributions = probe.contributions.map((item, index) => ({
      sourceId: item.sourceId,
      displacement: construction.contributions[index],
      positive: (setup.sources.find((source) => source.id === item.sourceId)?.q_C ?? 0) > 0,
      emphasized: item.sourceId === emphasizedSourceId,
      quiet: anyEmphasized && item.sourceId !== emphasizedSourceId,
    }));
    // The resultant (and the chain that leads to it) stays gated with it: a chain drawn before
    // the resultant is revealed would visually give away where the resultant lands.
    const showResultant = probeTotal && !probe.isZero;
    return {
      contributions,
      chain: showResultant ? construction.chain : [],
      resultant: showResultant ? construction.resultant : null,
    };
  }, [probe, showProbe, showContributions, probeTotal, emphasizedSourceId, size.width, size.height, setup.sources]);

  useEffect(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const context = prepareCanvas(canvas, { x: size.width, y: size.height }, window.devicePixelRatio);
    if (context) drawStaticField(context, camera, grid, setup.sources, setup.singularity.rCore_m);
  }, [camera, grid, setup.sources, setup.singularity.rCore_m, size]);

  const particleGlyph: ParticleGlyph = useMemo(() => ({
    initial: { x: setup.testParticle.x_m, y: setup.testParticle.y_m },
    current: { x: runtime.particle.x_m, y: runtime.particle.y_m },
    velocity: { x: runtime.particle.vx_mps, y: runtime.particle.vy_mps },
    positive: setup.testParticle.q_C > 0,
    stopped: runtime.status === "stopped",
    trail: runtime.trail.points,
    trailCount: runtime.trail.count,
    showTrail,
  }), [setup.testParticle, runtime.particle, runtime.status, runtime.trail, showTrail]);

  useEffect(() => {
    const canvas = dynamicCanvasRef.current;
    if (!canvas) return;
    const context = prepareCanvas(canvas, { x: size.width, y: size.height }, window.devicePixelRatio);
    if (context) {
      drawDynamicField(
        context,
        camera,
        setup.sources,
        { x: setup.probe.x_m, y: setup.probe.y_m },
        probeScene,
        selected,
        showParticle ? particleGlyph : null,
        { showProbe, probeZero },
      );
    }
  }, [showProbe, probeZero, showParticle, camera, particleGlyph, probeScene, selected, setup.probe.x_m, setup.probe.y_m, setup.sources, size]);

  return (
    <div
      ref={hostRef}
      className={styles.canvasHost}
      data-testid="field-viewport"
      data-tool={tool}
      data-grid={`${dimensions.cols}x${dimensions.rows}`}
      data-sample-count={grid.ok ? grid.samples.length : 0}
      data-trail-count={showTrail ? runtime.trail.count : 0}
      data-field-visible={showField ? "true" : "false"}
      data-camera-zoom={view.zoom.toFixed(3)}
      data-camera-pan={`${view.panX_px.toFixed(1)},${view.panY_px.toFixed(1)}`}
      data-probe-vectors={probeScene.contributions.length + (probeScene.resultant ? 1 : 0)}
      data-particle-screen={(() => {
        const p = worldToScreen({ x: runtime.particle.x_m, y: runtime.particle.y_m }, camera);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })()}
    >
      <canvas ref={staticCanvasRef} className={styles.canvasLayer} aria-hidden="true" />
      <canvas ref={dynamicCanvasRef} className={styles.canvasLayer} aria-hidden="true" />
      <div className={styles.viewportToolbar} role="group" aria-label="畫布視圖">
        <button type="button" onClick={() => setView((current) => zoomView(current, 1 / 1.25))} aria-label="縮小" title="縮小" data-testid="zoom-out"><ZoomOut size={18} aria-hidden="true" /></button>
        <button type="button" onClick={() => setView((current) => zoomView(current, 1.25))} aria-label="放大" title="放大" data-testid="zoom-in"><ZoomIn size={18} aria-hidden="true" /></button>
        <button type="button" onClick={() => setView(INITIAL_CAMERA_VIEW)} aria-label="回到完整視圖" title="回到完整視圖" data-testid="view-home"><House size={18} aria-hidden="true" /></button>
      </div>
      {tipOpen ? <div className={styles.canvasTip} data-testid="canvas-tip"><span>箭頭指出電場方向，明暗與長度表示強弱。</span><button type="button" onClick={() => setTipOpen(false)} aria-label="關閉畫布說明" title="關閉"><X size={15} aria-hidden="true" /></button></div> : <button type="button" className={styles.canvasHelp} onClick={() => setTipOpen(true)} aria-label="開啟畫布說明" title="畫布說明" data-testid="canvas-help"><HelpCircle size={18} aria-hidden="true" /></button>}
      <AccessibleObjects
        camera={camera}
        sources={setup.sources}
        probe={{ x: setup.probe.x_m, y: setup.probe.y_m }}
        selected={selected}
        onSelect={onSelect}
        onMove={onMove}
        onDragStart={onDragStart}
        showProbe={showProbe}
        showParticle={showParticle}
        particle={{ initial: { x: setup.testParticle.x_m, y: setup.testParticle.y_m }, q_C: setup.testParticle.q_C, mass_kg: setup.testParticle.mass_kg }}
        tool={tool}
        onPlace={onPlace}
        onDelete={onDelete}
        onExitTool={onExitTool}
        onHover={handleHover}
        onPan={(delta) => setView((current) => ({ ...current, panX_px: current.panX_px + delta.x, panY_px: current.panY_px + delta.y }))}
        emphasizedSourceId={emphasizedSourceId}
      />
      {tool !== "select" ? (
        <p className={styles.toolBanner} role="status" data-testid="tool-banner">{TOOL_BANNER[tool]}</p>
      ) : null}
      {/* HTML rather than SVG text so the bubble sizes itself to the label at any string length. */}
      {hover ? (
        <div
          className={styles.objectTooltip}
          data-testid="object-tooltip"
          data-tooltip-target={hover.target}
          style={{ left: hover.point.x, top: hover.point.y }}
          aria-hidden="true"
        >
          <strong>{hover.title}</strong><span>{hover.detail}</span>
        </div>
      ) : null}
      <p className={styles.srOnly} id="field-semantic-summary">
        電場方向與大小由箭頭呈現。源電荷、測量點與測試電荷都能直接點選、拖曳或用鍵盤移動；完整數值可在右側讀值中查看。
      </p>
      <ElectrostaticLayerDrawer
        open={layersOpen}
        layers={layers}
        available={{ field: policy.globalField, probe: policy.probe, particle: policy.particle, trail: policy.trajectory, contributions: policy.probeContributions }}
        onClose={() => onLayersOpenChange(false)}
        onToggle={(key) => setLayers((current) => ({ ...current, [key]: !current[key] }))}
        returnFocusRef={layersTriggerRef}
      />
    </div>
  );
}
