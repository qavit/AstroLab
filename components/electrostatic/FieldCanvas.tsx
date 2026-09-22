"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizedStrength, sampleFieldGrid } from "../../lib/science/electrostatics/sampling.ts";
import type { Vec2 } from "../../lib/science/electrostatics/types.ts";
import { probeReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { EvidencePolicy } from "../../models/electrostatic-learning.ts";
import AccessibleObjects, { type DraggableObject } from "./AccessibleObjects";
import {
  drawDynamicField,
  drawStaticField,
  prepareCanvas,
  type ParticleGlyph,
  type ProbeVectorGlyph,
  type SelectedObject,
} from "./render.ts";
import { fitCamera, worldToScreen } from "./viewport.ts";
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
}

const HIDDEN_GRID = { ok: false, reason: "no-sources" } as const;

export default function FieldCanvas({ setup, runtime, policy, selected, onSelect, onMove, onDragStart }: FieldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

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

  const camera = useMemo(() => fitCamera(setup.domain, size), [setup.domain, size]);
  const dimensions = size.width < 600 ? { cols: 24, rows: 18 } : { cols: 40, rows: 30 };
  const showField = policy.globalField;
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
  const { probe: showProbe, probeContributions, probeTotal } = policy;
  const probeZero = showProbe && probeTotal && probe.valid && probe.isZero;
  const probeVectors: readonly ProbeVectorGlyph[] = useMemo(() => {
    if (!showProbe || !probeContributions || !probe.valid) return [];
    const contributions: ProbeVectorGlyph[] = probe.contributions.map((item) => ({
      sourceId: item.sourceId,
      ux: item.Ex_N_per_C / item.magnitude_N_per_C,
      uy: item.Ey_N_per_C / item.magnitude_N_per_C,
      strength: normalizedStrength(item.magnitude_N_per_C, setup.fieldStyle),
      kind: "contribution" as const,
    }));
    if (!probeTotal || probe.isZero) return contributions;
    contributions.push({
      sourceId: null,
      ux: probe.Ex_N_per_C / probe.magnitude_N_per_C,
      uy: probe.Ey_N_per_C / probe.magnitude_N_per_C,
      strength: normalizedStrength(probe.magnitude_N_per_C, setup.fieldStyle),
      kind: "total" as const,
    });
    return contributions;
  }, [probe, setup.fieldStyle, showProbe, probeContributions, probeTotal]);

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
    showTrail: policy.trajectory,
  }), [setup.testParticle, runtime.particle, runtime.status, runtime.trail, policy.trajectory]);

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
        probeVectors,
        selected,
        policy.particle ? particleGlyph : null,
        { showProbe, probeZero },
      );
    }
  }, [showProbe, probeZero, policy.particle, camera, particleGlyph, probeVectors, selected, setup.probe.x_m, setup.probe.y_m, setup.sources, size]);

  return (
    <div
      ref={hostRef}
      className={styles.canvasHost}
      data-testid="field-viewport"
      data-grid={`${dimensions.cols}x${dimensions.rows}`}
      data-sample-count={grid.ok ? grid.samples.length : 0}
      data-trail-count={policy.trajectory ? runtime.trail.count : 0}
      data-field-visible={showField ? "true" : "false"}
      data-probe-vectors={probeVectors.length}
      data-particle-screen={(() => {
        const p = worldToScreen({ x: runtime.particle.x_m, y: runtime.particle.y_m }, camera);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })()}
    >
      <canvas ref={staticCanvasRef} className={styles.canvasLayer} aria-hidden="true" />
      <canvas ref={dynamicCanvasRef} className={styles.canvasLayer} aria-hidden="true" />
      <AccessibleObjects
        camera={camera}
        sources={setup.sources}
        probe={{ x: setup.probe.x_m, y: setup.probe.y_m }}
        selected={selected}
        onSelect={onSelect}
        onMove={onMove}
        onDragStart={onDragStart}
        showProbe={showProbe}
        showParticle={policy.particle}
        particle={{ initial: { x: setup.testParticle.x_m, y: setup.testParticle.y_m }, q_C: setup.testParticle.q_C, mass_kg: setup.testParticle.mass_kg }}
      />
      <p className={styles.srOnly} id="field-semantic-summary">
        電場方向與大小由可見箭頭呈現；下方圖例文字說明零場、低截斷、正常、高截斷與 excluded core。來源、探針與測試粒子初始位置可由鍵盤操作；完整數值在探針讀值表與粒子證據表。
      </p>
    </div>
  );
}
