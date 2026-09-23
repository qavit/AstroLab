"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { HelpCircle, House, ZoomIn, ZoomOut, X } from "lucide-react";
import { Tex } from "../math/MathJax";
import { sampleFieldGrid } from "../../lib/science/electrostatics/sampling.ts";
import type { Vec2 } from "../../lib/science/electrostatics/types.ts";
import { probeReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { EvidencePolicy } from "../../models/electrostatic-learning.ts";
import AccessibleObjects, { type DraggableObject, type HoverTarget } from "./AccessibleObjects";
import { formatCharge, sourceDisplayName } from "./labels.ts";
import { TOOL_BANNER, type ToolMode } from "./tools.ts";
import ElectrostaticLayerDrawer, { INITIAL_ELECTROSTATIC_LAYERS, type ElectrostaticLayerState } from "./ElectrostaticLayerDrawer";
import { buildVectorConstruction, probeVectorEnvelopeRadius } from "./vectorConstruction.ts";
import { layoutPredictionMarkers, predictionLabelPoint, type PredictionMarker } from "./guidedPrediction.ts";
import type { GuidedCanvasSemantics } from "./guidedCanvasSemantics.ts";
import {
  drawDynamicField,
  drawPredictionMarkers,
  drawStaticField,
  prepareCanvas,
  type ParticleGlyph,
  type PredictionGlyph,
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
  /** Guided-only: the learner's own uncommitted-or-committed compass guess(es). Never model evidence. */
  readonly predictionMarkers: readonly PredictionMarker[];
  /** Learner-facing labels derived from the visible guided setup, never from a model readout. */
  readonly guidedSemantics: GuidedCanvasSemantics;
  /** Guided-only: a one-shot attention cue; remounted (and replayed) whenever `key` changes. */
  readonly attentionCue: { readonly anchor: "probe" | "particle"; readonly key: string } | null;
}

const HIDDEN_GRID = { ok: false, reason: "no-sources" } as const;
/** Fixed, direction-only length for a learner's compass guess — deliberately not the Gate 5
 * shared physical vector scale, since a guess never carries a magnitude claim. */
const PREDICTION_ARROW_LENGTH_PX = 40;

export default function FieldCanvas(props: FieldCanvasProps) {
  const { setup, runtime, policy, selected, onSelect, onMove, onDragStart } = props;
  const { tool, onPlace, onDelete, onExitTool, layersOpen, onLayersOpenChange, layersTriggerRef } = props;
  const { emphasizedSourceId, onSourceHover, predictionMarkers, guidedSemantics, attentionCue } = props;
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
  // Pointer capture keeps a dragged object "hovered" even once the cursor leaves it, so the
  // identity tooltip needs its own drag-aware suppression rather than relying on hover state.
  const [dragging, setDragging] = useState(false);
  const handleDragStart = (target: DraggableObject) => {
    setDragging(true);
    onDragStart(target);
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
        detail: policy.probeMovable ? "可拖曳，或選取後用方向鍵移動" : "此任務中位置固定",
      };
    }
    if (hoverTarget?.kind === "particle") {
      return {
        target: "particle",
        point: worldToScreen({ x: setup.testParticle.x_m, y: setup.testParticle.y_m }, camera),
        title: "測試電荷起點",
        detail: policy.setupControls ? "可拖曳，或選取後用方向鍵移動" : "此任務中位置固定",
      };
    }
    return null;
  }, [camera, hoverTarget, policy.probeMovable, policy.setupControls, setup.probe.x_m, setup.probe.y_m, setup.sources, setup.testParticle.x_m, setup.testParticle.y_m]);
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

  /** Guided-only prediction glyphs: resolved anchors, direction-only length, never model evidence. */
  const predictionGlyphs: readonly PredictionGlyph[] = useMemo(() => layoutPredictionMarkers(
    predictionMarkers,
    predictionMarkers.map((marker) => marker.anchor === "probe"
      ? worldToScreen({ x: setup.probe.x_m, y: setup.probe.y_m }, camera)
      : worldToScreen({ x: setup.testParticle.x_m, y: setup.testParticle.y_m }, camera)),
    PREDICTION_ARROW_LENGTH_PX,
  ), [predictionMarkers, camera, setup.probe.x_m, setup.probe.y_m, setup.testParticle.x_m, setup.testParticle.y_m]);

  const attentionCuePoint = useMemo(() => {
    if (!attentionCue) return null;
    return attentionCue.anchor === "probe"
      ? worldToScreen({ x: setup.probe.x_m, y: setup.probe.y_m }, camera)
      : worldToScreen({ x: setup.testParticle.x_m, y: setup.testParticle.y_m }, camera);
  }, [attentionCue, camera, setup.probe.x_m, setup.probe.y_m, setup.testParticle.x_m, setup.testParticle.y_m]);

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
      if (predictionGlyphs.length > 0) drawPredictionMarkers(context, predictionGlyphs);
    }
  }, [showProbe, probeZero, showParticle, camera, particleGlyph, probeScene, selected, setup.probe.x_m, setup.probe.y_m, setup.sources, size, predictionGlyphs]);

  /** MathJax labels are a semantic HTML overlay, so they remain crisp at any device pixel ratio
   * and follow the live camera / particle position without inventing a second Canvas font system. */
  const guidedLabelPositions = useMemo(() => guidedSemantics.labels.flatMap((label) => {
    if (label.target === "source") {
      const source = setup.sources.find((item) => item.id === label.sourceId);
      if (!source) return [];
      return [{ label, point: worldToScreen({ x: source.x_m, y: source.y_m }, camera) }];
    }
    if (!showParticle) return [];
    return [{ label, point: worldToScreen({ x: runtime.particle.x_m, y: runtime.particle.y_m }, camera) }];
  }), [camera, guidedSemantics.labels, runtime.particle.x_m, runtime.particle.y_m, setup.sources, showParticle]);

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
      data-prediction-count={predictionMarkers.length}
      data-prediction-anchors={predictionMarkers.map((marker) => marker.anchor).join(",")}
      data-prediction-labels={predictionMarkers.map((marker) => marker.label ?? "").join(",")}
      data-prediction-colours={predictionGlyphs.map((glyph) => glyph.colour).join(",")}
      data-prediction-label-points={predictionGlyphs.map((glyph) => {
        const point = predictionLabelPoint(glyph);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      }).join(";")}
      data-guided-labels={guidedSemantics.labels.map((label) => `${label.target}:${label.text}`).join(",")}
      data-particle-screen={(() => {
        const p = worldToScreen({ x: runtime.particle.x_m, y: runtime.particle.y_m }, camera);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })()}
    >
      <canvas ref={staticCanvasRef} className={styles.canvasLayer} aria-hidden="true" />
      <canvas ref={dynamicCanvasRef} className={styles.canvasLayer} aria-hidden="true" />
      {guidedLabelPositions.map(({ label, point }) => (
        <span
          key={label.target === "source" ? `${label.target}:${label.sourceId}:${label.role}` : `${label.target}:${label.role}`}
          className={styles.guidedCanvasLabel}
          data-testid="guided-canvas-label"
          data-label={label.text}
          data-role={label.role}
          style={{
            left: point.x + 15,
            top: point.y + (label.role === "charge" ? -17 : 18),
          }}
          aria-hidden="true"
        >
          <Tex dynamic>{label.text}</Tex>
        </span>
      ))}
      {predictionGlyphs.map((glyph, index) => {
        if (!glyph.label) return null;
        const point = predictionLabelPoint(glyph);
        return (
          <span
            key={`${glyph.label}:${index}`}
            className={styles.predictionCanvasLabel}
            data-testid="prediction-canvas-label"
            data-vector={glyph.label}
            style={{ left: point.x, top: point.y, color: glyph.colour }}
            aria-hidden="true"
          >
            <Tex dynamic>{glyph.label}</Tex>
          </span>
        );
      })}
      <div className={styles.viewportToolbar} role="group" aria-label="畫布視圖">
        <button type="button" onClick={() => setView((current) => zoomView(current, 1 / 1.25))} aria-label="縮小" title="縮小" data-testid="zoom-out"><ZoomOut size={18} aria-hidden="true" /></button>
        <button type="button" onClick={() => setView((current) => zoomView(current, 1.25))} aria-label="放大" title="放大" data-testid="zoom-in"><ZoomIn size={18} aria-hidden="true" /></button>
        <button type="button" onClick={() => setView(INITIAL_CAMERA_VIEW)} aria-label="回到完整視圖" title="回到完整視圖" data-testid="view-home"><House size={18} aria-hidden="true" /></button>
      </div>
      {tipOpen ? <div className={styles.canvasTip} data-testid="canvas-tip"><span>箭頭指出電場方向，明暗與長度表示強弱。</span><button type="button" className={styles.canvasTipClose} onClick={() => setTipOpen(false)} aria-label="關閉畫布說明" title="關閉"><X size={14} aria-hidden="true" /></button></div> : <button type="button" className={styles.canvasHelp} onClick={() => setTipOpen(true)} aria-label="開啟畫布說明" title="畫布說明" data-testid="canvas-help"><HelpCircle size={18} aria-hidden="true" /></button>}
      <AccessibleObjects
        camera={camera}
        sources={setup.sources}
        probe={{ x: setup.probe.x_m, y: setup.probe.y_m }}
        selected={selected}
        onSelect={onSelect}
        onMove={onMove}
        onDragStart={handleDragStart}
        onDragEnd={() => setDragging(false)}
        showProbe={showProbe}
        showParticle={showParticle}
        sourcesMovable={policy.sourcesMovable}
        probeMovable={policy.probeMovable}
        particleMovable={policy.setupControls}
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
      {/* HTML rather than SVG text so the bubble sizes itself to the label at any string length.
          Suppressed while dragging: pointer capture keeps the object "hovered" the whole drag,
          but the identity tooltip should only read as a hover affordance, not linger over a drag. */}
      {hover && !dragging ? (
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
      {/* One-shot attention cue: remounted (key = attentionCue.key) whenever new evidence appears,
          so the CSS animation replays; prefers-reduced-motion turns the animation off in CSS,
          leaving the evidence itself unaffected. */}
      {attentionCue && attentionCuePoint ? (
        <div
          key={attentionCue.key}
          className={styles.attentionPulse}
          data-testid="guided-attention-cue"
          data-attention-key={attentionCue.key}
          style={{ left: attentionCuePoint.x, top: attentionCuePoint.y }}
          aria-hidden="true"
        />
      ) : null}
      <p className={styles.srOnly} id="field-semantic-summary">
        電場方向與大小由箭頭呈現。{policy.sourcesMovable || policy.probeMovable || policy.setupControls
          ? "可操作的物件可直接點選、拖曳或用鍵盤移動；完整數值可在右側讀值中查看。"
          : "這個任務的物件位置固定；完成預測後可在右側讀值中核對結果。"}
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
