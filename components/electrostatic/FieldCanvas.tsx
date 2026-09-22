"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizedStrength, sampleFieldGrid } from "../../lib/science/electrostatics/sampling.ts";
import type { Vec2 } from "../../lib/science/electrostatics/types.ts";
import { probeReadout, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import AccessibleObjects, { type DraggableObject } from "./AccessibleObjects";
import { drawDynamicField, drawStaticField, prepareCanvas, type ProbeVectorGlyph, type SelectedObject } from "./render.ts";
import { fitCamera } from "./viewport.ts";
import styles from "./ElectrostaticFieldLab.module.css";

interface FieldCanvasProps {
  readonly setup: ElectrostaticSetup;
  readonly selected: SelectedObject;
  readonly onSelect: (target: SelectedObject) => void;
  readonly onMove: (target: DraggableObject, point: Vec2) => void;
}

export default function FieldCanvas({ setup, selected, onSelect, onMove }: FieldCanvasProps) {
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
  const grid = useMemo(() => (
    sampleFieldGrid(
      setup.sources,
      setup.domain,
      dimensions.cols,
      dimensions.rows,
      setup.singularity.rCore_m,
      setup.fieldStyle,
    )
  ), [setup.sources, setup.domain, setup.singularity, setup.fieldStyle, dimensions.cols, dimensions.rows]);
  const probe = useMemo(() => probeReadout(setup), [setup]);
  const probeVectors: readonly ProbeVectorGlyph[] = useMemo(() => {
    if (!probe.valid || probe.isZero) return [];
    const contributions: ProbeVectorGlyph[] = probe.contributions.map((item) => ({
      sourceId: item.sourceId,
      ux: item.Ex_N_per_C / item.magnitude_N_per_C,
      uy: item.Ey_N_per_C / item.magnitude_N_per_C,
      strength: normalizedStrength(item.magnitude_N_per_C, setup.fieldStyle),
      kind: "contribution" as const,
    }));
    contributions.push({
      sourceId: null,
      ux: probe.Ex_N_per_C / probe.magnitude_N_per_C,
      uy: probe.Ey_N_per_C / probe.magnitude_N_per_C,
      strength: normalizedStrength(probe.magnitude_N_per_C, setup.fieldStyle),
      kind: "total" as const,
    });
    return contributions;
  }, [probe, setup.fieldStyle]);

  useEffect(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const context = prepareCanvas(canvas, { x: size.width, y: size.height }, window.devicePixelRatio);
    if (context) drawStaticField(context, camera, grid, setup.sources, setup.singularity.rCore_m);
  }, [camera, grid, setup.sources, setup.singularity.rCore_m, size]);

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
      );
    }
  }, [camera, probeVectors, selected, setup.probe.x_m, setup.probe.y_m, setup.sources, size]);

  return (
    <div
      ref={hostRef}
      className={styles.canvasHost}
      data-testid="field-viewport"
      data-grid={`${dimensions.cols}x${dimensions.rows}`}
      data-sample-count={grid.ok ? grid.samples.length : 0}
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
      />
      <p className={styles.srOnly} id="field-semantic-summary">
        電場方向與大小由可見箭頭呈現；下方圖例文字說明零場、低截斷、正常、高截斷與 excluded core。來源與探針可由鍵盤操作，完整數值在探針讀值表。
      </p>
    </div>
  );
}
