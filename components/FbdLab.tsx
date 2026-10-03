"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import KakauLabMark from "./KakauLabMark";
import ThemeToggle from "./ThemeToggle";
import { directionFromDegrees } from "../lib/science/fbd.ts";
import { addFbdForce, addFbdInteraction, createFbdForce, removeFbdForce, selectFbdForce, updateFbdForce, type FbdForceKind, type FbdLabState } from "../models/fbd.ts";
import { TABLE_AGENTS, commitTable, compareTable, compareTableDiagram, initialTableLearning, reviseTable, type NormalAssumption } from "../models/fbd-table.ts";
import styles from "./fbd/FbdLab.module.css";

const FORCE_CHOICES: readonly [FbdForceKind, string][] = [["weight", "重力"], ["normal", "正向力"], ["applied", "手的拉力"], ["other", "運動力（我的假設）"], ["friction", "摩擦力（我的假設）"]];
const PHASES = ["觀察情境", "選擇系統", "辨識交互作用", "建立力圖", "提交", "比較", "修正"];

export default function FbdLab() {
  const shellRef = useRef<HTMLElement>(null);
  useEffect(() => { shellRef.current?.setAttribute("data-interactive", "true"); }, []);
  const [learning, setLearning] = useState(initialTableLearning);
  const [lengths, setLengths] = useState<Record<string, number>>({});
  const nextId = useRef(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { learner, phase } = learning;
  const { diagram, selectedForceId } = learner;
  const selected = diagram.forces.find((force) => force.id === selectedForceId);
  const editable = phase === "interactions" || phase === "forces";
  const phaseIndex = ["scene", "system", "interactions", "forces", "committed", "compared"].indexOf(phase);
  const result = phase === "compared" && learning.submission ? compareTableDiagram(learning.submission.diagram, learning.submission.assumption) : null;
  const edit = (change: (current: FbdLabState) => FbdLabState) => setLearning((current) => ({ ...current, learner: change(current.learner) }));
  const move = (next: typeof phase) => { setLearning((current) => ({ ...current, phase: next })); requestAnimationFrame(() => headingRef.current?.focus()); };
  const toggleInteraction = (agent: typeof TABLE_AGENTS[number]) => edit((current) => {
    const id = `${agent.id}-block`;
    if (!current.diagram.interactions.some((interaction) => interaction.id === id)) return addFbdInteraction(current, { id, kind: agent.kind, sourceAgentId: agent.id, targetSystemId: current.diagram.system.id, label: `${agent.label} ↔ 木塊` });
    const forces = current.diagram.forces.filter((force) => force.interactionId !== id);
    return { ...current, selectedForceId: forces.some((force) => force.id === current.selectedForceId) ? current.selectedForceId : null, diagram: { ...current.diagram, forces, interactions: current.diagram.interactions.filter((interaction) => interaction.id !== id) } };
  });
  const addForce = (interactionId: string) => edit((current) => addFbdForce(current, createFbdForce({ id: `force-${nextId.current++}`, interactionId, kind: "other", label: "尚未命名的力", direction: directionFromDegrees(0) })));
  const degrees = selected ? (Math.round(Math.atan2(selected.direction.y, selected.direction.x) * 180 / Math.PI) + 360) % 360 : 0;

  return <main ref={shellRef} className={`lab-shell ${styles.shell}`}>
    <header className="topbar">
      <div><Link href="/" className="lab-brand" aria-label="Kakau Lab 模型目錄"><KakauLabMark /></Link><div className="eyebrow">Mechanics · FBD v0.1</div><h1>自由體圖：先找交互作用</h1></div>
      <div className="header-actions"><ThemeToggle /><button onClick={() => { setLearning(initialTableLearning()); setLengths({}); }}>重新開始</button></div>
    </header>
    <ol className={styles.steps} aria-label="學習流程">{PHASES.map((label, index) => <li key={label} aria-current={index === phaseIndex ? "step" : undefined}>{index + 1}. {label}</li>)}</ol>
    <div className={styles.grid}>
      <section className={styles.card} aria-label="物理情境">
        <h2>情境：手向右拉木塊</h2><p>木塊在光滑的水平桌面上，手持續接觸木塊並水平向右拉。忽略空氣阻力；木塊沒有垂直加速度。</p>
        <svg className={styles.scene} viewBox="0 0 440 240" role="img" aria-label="木塊放在桌面，右側的手接觸木塊，下方是地球；情境圖沒有力箭頭">
          <rect x="45" y="128" width="345" height="16" rx="4" fill="var(--muted)" /><path d="M75 144v44M365 144v44" stroke="var(--muted)" strokeWidth="10" />
          <rect x="150" y="66" width="100" height="62" rx="5" fill="#cba575" /><text x="200" y="101" textAnchor="middle" fill="#172a3b">木塊</text>
          <path d="M310 88h-48q-12 0-12 10q0 10 12 10h48" fill="none" stroke="#d49c7f" strokeWidth="12" /><text x="325" y="100" fill="currentColor">手</text>
          <text x="90" y="166" fill="currentColor">桌面</text><ellipse cx="220" cy="223" rx="160" ry="20" fill="#489482" /><text x="220" y="229" textAnchor="middle" fill="#fff">地球</text>
        </svg>
        <small>這是物理情境，沒有力箭頭。右側的 FBD 只畫作用在木塊上的力。</small>
      </section>
      <section className={styles.card} aria-label="學習工作區">
        <h2 ref={headingRef} tabIndex={-1}>{PHASES[phaseIndex]}</h2>
        {phase === "scene" && <><p>先找出物體、接觸面與外部施力者，再決定研究哪個系統。</p><button onClick={() => move("system")}>開始選擇系統</button></>}
        {phase === "system" && <><p>本次只研究單一木塊。地球、桌面與手都在系統之外。</p><button onClick={() => move("interactions")}>選擇木塊為系統</button></>}
        {phaseIndex >= 2 && <>
          <p><strong>研究系統：{diagram.system.label}</strong> · 質點模型，沒有轉矩或作用點。</p>
          {editable && <fieldset className={styles.interactions}><legend>哪些外部施力者與木塊交互作用？</legend>{TABLE_AGENTS.map((agent) => <label key={agent.id}><input type="checkbox" checked={diagram.interactions.some((interaction) => interaction.sourceAgentId === agent.id)} onChange={() => toggleInteraction(agent)} />{agent.label} ↔ 木塊</label>)}<small>取消交互作用也會移除其力；力不能失去來源。</small></fieldset>}
          {phase === "interactions" && <button onClick={() => move("forces")}>用交互作用建立力圖</button>}
          {phase !== "interactions" && <>
            <div className={styles.diagram}>
              <svg viewBox="0 0 360 280" role="img" aria-label={`木塊自由體圖，有 ${diagram.forces.length} 個由學習者建立的力；箭頭長度只表示定性草圖`}>
                <defs><marker id="fbd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
                {diagram.forces.map((force) => { const length = lengths[force.id] ?? 65; const x = 180 + force.direction.x * length; const y = 140 - force.direction.y * length; return <g key={force.id} color={force.id === selectedForceId ? "var(--strong)" : "var(--muted)"}><line x1="180" y1="140" x2={x} y2={y} stroke="currentColor" strokeWidth="3" markerEnd="url(#fbd-arrow)" /><text x={x} y={y - 10} textAnchor="middle" fill="currentColor" fontSize="12">{force.label}</text></g>; })}
                <circle cx="180" cy="140" r="7" fill="var(--strong)" /><text x="180" y="165" textAnchor="middle" fill="currentColor">木塊</text>
              </svg><small>箭尾共用質點，不代表實際接觸位置。方向：右 0°、上 90°、左 180°、下 270°。</small>
            </div>
            {editable && <>
              <div className={styles.stack}>{diagram.interactions.map((interaction) => <button key={interaction.id} onClick={() => addForce(interaction.id)}>從 {interaction.label} 補一個力</button>)}{diagram.interactions.length === 0 && <p>先選交互作用，才能補力。</p>}</div>
              <div className={styles.forceList} aria-label="選擇力">{diagram.forces.map((force) => <button key={force.id} aria-pressed={force.id === selectedForceId} onClick={() => edit((current) => selectFbdForce(current, force.id))}>{force.label} · {diagram.interactions.find((interaction) => interaction.id === force.interactionId)?.label}</button>)}</div>
              {selected && <fieldset className={styles.editor}><legend>編輯選取的力</legend>
                <label>力的種類<select value={selected.kind} onChange={(event) => { const kind = event.target.value as FbdForceKind; edit((current) => updateFbdForce(current, selected.id, { kind, label: FORCE_CHOICES.find((choice) => choice[0] === kind)![1] })); }}>{FORCE_CHOICES.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
                <label>交互作用來源<select value={selected.interactionId} onChange={(event) => edit((current) => updateFbdForce(current, selected.id, { interactionId: event.target.value }))}>{diagram.interactions.map((interaction) => <option key={interaction.id} value={interaction.id}>{interaction.label}</option>)}</select></label>
                <label>方向（度）<input type="range" min="0" max="359" step="1" value={degrees} onChange={(event) => edit((current) => updateFbdForce(current, selected.id, { direction: directionFromDegrees(Number(event.target.value)) }))} /><output>{degrees}°</output></label>
                <div className={styles.directions}>{[[0, "向右"], [90, "向上"], [180, "向左"], [270, "向下"]].map(([angle, label]) => <button key={angle} onClick={() => edit((current) => updateFbdForce(current, selected.id, { direction: directionFromDegrees(Number(angle)) }))}>{label}</button>)}</div>
                <label>定性箭頭長度（不等於牛頓）<input type="range" min="35" max="100" value={lengths[selected.id] ?? 65} onChange={(event) => setLengths((current) => ({ ...current, [selected.id]: Number(event.target.value) }))} /></label>
                <p>力大小：未知。改長度不會產生數值大小或合力。</p><button onClick={() => edit((current) => removeFbdForce(current, selected.id))}>刪除選取的力</button>
              </fieldset>}
              <label className={styles.assumption}>你對正向力的假設<select value={learning.assumption} onChange={(event) => setLearning((current) => ({ ...current, assumption: event.target.value as NormalAssumption }))}><option value="unknown">先不判斷大小</option><option value="always-mg">任何情況都有 N = mg</option><option value="vertical-balance">只有垂直平衡、無其他垂直力時才有 N = mg</option></select></label>
              <button className={styles.primary} onClick={() => { setLearning(commitTable); requestAnimationFrame(() => headingRef.current?.focus()); }}>提交我的力圖</button>
            </>}
            {phase === "committed" && <><p>已保存你的提交。比較只讀取這次提交，不會自動補上答案。</p><button onClick={() => setLearning(compareTable)}>比較交互作用與力</button><button onClick={() => setLearning(reviseTable)}>返回修正</button></>}
            {result && <div aria-live="polite" className={styles.feedback}><h3>{result.pass ? "PASS：交互作用、力的身分與方向一致" : "還有需要修正的模型假設"}</h3><ul>{result.diagnostics.map((diagnostic, index) => <li key={index} data-code={diagnostic.code}><strong>{diagnostic.severity === "issue" ? "待修正" : "大小未定"}</strong>：{diagnostic.message}</li>)}</ul><button onClick={() => { setLearning(reviseTable); requestAnimationFrame(() => headingRef.current?.focus()); }}>修正我的力圖</button></div>}
          </>}
        </>}
      </section>
    </div>
  </main>;
}
