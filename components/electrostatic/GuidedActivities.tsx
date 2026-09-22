"use client";

import { useEffect, useRef, useState } from "react";
import {
  accelerationCompass,
  changeOf,
  COMPASS_4_ZERO,
  COMPASS_8,
  compassOf,
  probeCompass,
  type ActivityId,
  type AExplanation,
  type BExplanation,
  type CFlipPrediction,
  type Change,
  type Compass,
  type CVelocityPrediction,
  type DirectionPrediction,
  type LearningState,
  type ReasonTag,
} from "../../models/electrostatic-learning.ts";
import { initialRuntime, particleReadout, probeReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import styles from "./ElectrostaticFieldLab.module.css";

const COMPASS_LABEL: Record<Compass, string> = {
  E: "→ 向右", NE: "↗ 右上", N: "↑ 向上", NW: "↖ 左上", W: "← 向左", SW: "↙ 左下", S: "↓ 向下", SE: "↘ 右下", zero: "零場",
};
const REASON_LABEL: Record<ReasonTag, string> = {
  symmetry: "對稱", components: "分量", nearest: "最近的來源影響最大", sign: "正負電荷方向", other: "其他",
};
const CHANGE_LABEL: Record<Change, string> = { same: "不變", reverse: "反向", double: "加倍", half: "減半" };

const ACTIVITY_TITLE: Record<ActivityId, string> = {
  A: "Activity A｜先判斷合場方向",
  B: "Activity B｜對稱與零場",
  C: "Activity C｜E、F、a 不是同一件事",
};

/**
 * Task wording is part of the answer-leak surface: B's own topic ("零場") is one of the options
 * the learner must choose between, so the heading stays neutral until the prediction is committed.
 */
function taskTitle(state: LearningState): string {
  if (state.activity === "B" && (state.step === "predict" || state.step === "transfer-predict")) {
    return "Activity B｜用對稱性做預測";
  }
  return ACTIVITY_TITLE[state.activity];
}

export interface GuidedHandlers {
  readonly onCommitDirection: (prediction: DirectionPrediction) => void;
  readonly onCommitChange: (prediction: CFlipPrediction) => void;
  readonly onCommitVelocity: (prediction: CVelocityPrediction) => void;
  readonly onReveal: () => void;
  readonly onAdvance: () => void;
  readonly onExplainA: (explanation: AExplanation) => void;
  readonly onExplainB: (explanation: BExplanation) => void;
  readonly onSwitch: (activity: ActivityId) => void;
  readonly onRestart: () => void;
  readonly onExplore: () => void;
  readonly onShare: () => void;
  readonly onSourceMagnitude: (id: string, magnitude_nC: number) => void;
}

interface GuidedActivitiesProps extends GuidedHandlers {
  readonly learning: LearningState;
  readonly setup: ElectrostaticSetup;
  readonly runtime: ElectrostaticRuntime;
  /** Previous C stage setup for the before/after comparison, from the learning model. */
  readonly comparisonSetup: ElectrostaticSetup | null;
  /** Increments when the task heading should take focus (switch / restart). */
  readonly focusToken: number;
}

function RadioGroup<T extends string>(props: {
  readonly legend: string;
  readonly name: string;
  readonly options: readonly T[];
  readonly labels: Record<T, string>;
  readonly value: T | null;
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.controlGroup}>
      <legend>{props.legend}</legend>
      <div className={styles.choiceGrid}>
        {props.options.map((option) => (
          <label key={option} className={styles.choice}>
            <input
              type="radio"
              name={props.name}
              value={option}
              checked={props.value === option}
              onChange={() => props.onChange(option)}
              data-testid={`${props.name}-${option}`}
            />
            <span>{props.labels[option]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DirectionForm(props: {
  readonly prompt: string;
  readonly options: readonly Compass[];
  readonly withReason: boolean;
  readonly onCommit: (prediction: DirectionPrediction) => void;
}) {
  const [direction, setDirection] = useState<Compass | null>(null);
  const [reason, setReason] = useState<ReasonTag | null>(props.withReason ? null : "other");
  return (
    <form
      className={styles.guidedForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (direction && reason) props.onCommit({ direction, reason });
      }}
    >
      <p className={styles.guidedPrompt}>{props.prompt}</p>
      <RadioGroup legend="你的方向預測" name="predict-direction" options={props.options} labels={COMPASS_LABEL} value={direction} onChange={setDirection} />
      {props.withReason ? (
        <RadioGroup legend="主要理由" name="predict-reason" options={Object.keys(REASON_LABEL) as ReasonTag[]} labels={REASON_LABEL} value={reason} onChange={setReason} />
      ) : null}
      <button type="submit" className={styles.shareButton} disabled={!direction || !reason} data-testid="commit-prediction">送出預測（送出後不能修改）</button>
    </form>
  );
}

function ChangeForm(props: { readonly prompt: string; readonly options: readonly Change[]; readonly onCommit: (p: CFlipPrediction) => void }) {
  const [E, setE] = useState<Change | null>(null);
  const [F, setF] = useState<Change | null>(null);
  const [a, setA] = useState<Change | null>(null);
  return (
    <form className={styles.guidedForm} onSubmit={(event) => { event.preventDefault(); if (E && F && a) props.onCommit({ E, F, a }); }}>
      <p className={styles.guidedPrompt}>{props.prompt}</p>
      <RadioGroup legend="電場 E 會" name="predict-E" options={props.options} labels={CHANGE_LABEL} value={E} onChange={setE} />
      <RadioGroup legend="力 F 會" name="predict-F" options={props.options} labels={CHANGE_LABEL} value={F} onChange={setF} />
      <RadioGroup legend="加速度 a 會" name="predict-a" options={props.options} labels={CHANGE_LABEL} value={a} onChange={setA} />
      <button type="submit" className={styles.shareButton} disabled={!E || !F || !a} data-testid="commit-prediction">送出預測（送出後不能修改）</button>
    </form>
  );
}

function VelocityForm(props: { readonly onCommit: (p: CVelocityPrediction) => void }) {
  const [velocity, setVelocity] = useState<Compass | null>(null);
  const [acceleration, setAcceleration] = useState<Compass | null>(null);
  return (
    <form className={styles.guidedForm} onSubmit={(event) => { event.preventDefault(); if (velocity && acceleration) props.onCommit({ velocity, acceleration }); }}>
      <p className={styles.guidedPrompt}>粒子現在有向上的初速度。一開始，它的速度與加速度各指向哪裡？</p>
      <RadioGroup legend="初速度方向" name="predict-velocity" options={COMPASS_8} labels={COMPASS_LABEL} value={velocity} onChange={setVelocity} />
      <RadioGroup legend="初始加速度方向" name="predict-acceleration" options={COMPASS_8} labels={COMPASS_LABEL} value={acceleration} onChange={setAcceleration} />
      <button type="submit" className={styles.shareButton} disabled={!velocity || !acceleration} data-testid="commit-prediction">送出預測（送出後不能修改）</button>
    </form>
  );
}

function Verdict({ predicted, model }: { readonly predicted: string; readonly model: string | null }) {
  const match = model !== null && predicted === model;
  return (
    <p className={styles.guidedVerdict} data-testid="prediction-verdict" data-match={match ? "true" : "false"}>
      你的預測：{predicted}；模型證據：{model ?? "未定義"}。{match ? "一致。" : "不一致——看證據找原因。"}
    </p>
  );
}

function AExplainForm({ onSubmit }: { readonly onSubmit: (e: AExplanation) => void }) {
  const [x, setX] = useState<AExplanation["x"] | null>(null);
  const [y, setY] = useState<AExplanation["y"] | null>(null);
  const [revise, setRevise] = useState<AExplanation["revise"] | null>(null);
  const verdicts = { cancel: "互相抵消（至少部分）", add: "互相相加" };
  return (
    <form className={styles.guidedForm} onSubmit={(event) => { event.preventDefault(); if (x && y && revise) onSubmit({ x, y, revise }); }}>
      <p className={styles.guidedPrompt}>Explain：用分量說明合場方向。</p>
      <RadioGroup legend="兩個來源的 x 分量" name="explain-x" options={["cancel", "add"] as const} labels={verdicts} value={x} onChange={setX} />
      <RadioGroup legend="兩個來源的 y 分量" name="explain-y" options={["cancel", "add"] as const} labels={verdicts} value={y} onChange={setY} />
      <RadioGroup legend="你的原預測" name="explain-revise" options={["kept", "revised"] as const} labels={{ kept: "不用修正", revised: "需要修正" }} value={revise} onChange={setRevise} />
      <button type="submit" className={styles.shareButton} disabled={!x || !y || !revise} data-testid="submit-explanation">送出說明，進入 Transfer</button>
    </form>
  );
}

function BExplainForm({ onSubmit }: { readonly onSubmit: (e: BExplanation) => void }) {
  const [value, setValue] = useState<BExplanation | null>(null);
  const labels: Record<BExplanation, string> = {
    "toward-smaller": "較大電荷在中點的場較強，零場點移向較小的電荷",
    "toward-larger": "零場點移向較大的電荷",
    "stays-midpoint": "零場點仍在中點",
  };
  return (
    <form className={styles.guidedForm} onSubmit={(event) => { event.preventDefault(); if (value) onSubmit(value); }}>
      <RadioGroup legend="原本的零場點為什麼不再在中點？" name="explain-b" options={Object.keys(labels) as BExplanation[]} labels={labels} value={value} onChange={setValue} />
      <button type="submit" className={styles.shareButton} disabled={!value} data-testid="submit-explanation">送出說明，進入 Transfer</button>
    </form>
  );
}

function stepLabel(state: LearningState): string {
  if (state.activity === "C") {
    if (state.step === "complete") return "完成";
    const stage = { c1: "1 初始加速度", c2: "2 反轉 q", c3: "3 質量加倍", c4: "4 加入初速度" }[state.stage];
    return `${stage} · ${state.step === "predict" ? "Predict" : "Observe"}`;
  }
  return {
    predict: "Predict", observe: "Manipulate／Observe", explain: "Explain", manipulate: "Manipulate／Explain",
    "transfer-predict": "Transfer · Predict", "transfer-observe": "Transfer · Observe", complete: "完成 → Explore",
  }[state.step];
}

export default function GuidedActivities(props: GuidedActivitiesProps) {
  const { learning, setup } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [props.focusToken]);

  const formKey = `${learning.activity}-${learning.step}-${"stage" in learning ? learning.stage : ""}`;
  const field = probeReadout(setup);
  const modelDirection = probeCompass(field);

  let body: React.ReactNode = null;
  if (learning.activity === "A") {
    if (learning.step === "predict" || learning.step === "transfer-predict") {
      body = (
        <DirectionForm
          key={formKey}
          prompt={learning.step === "predict"
            ? "來源已鎖定。只看電荷符號與位置：探針所在目標點的合電場指向哪裡？"
            : "Transfer：右側來源 s2 已反轉為負電荷。重新預測目標點的合電場方向。"}
          options={[...COMPASS_8, "zero"]}
          withReason
          onCommit={props.onCommitDirection}
        />
      );
    } else if (learning.step === "observe" || learning.step === "transfer-observe") {
      const predicted = learning.step === "observe" ? learning.prediction : learning.transferPrediction;
      const nextLabel = ["", "顯示合場向量", "顯示 Eₓ、Eᵧ 與方向數值"][learning.reveal];
      body = (
        <div className={styles.guidedForm}>
          <p className={styles.guidedPrompt}>你已承諾：{COMPASS_LABEL[predicted.direction]}（{REASON_LABEL[predicted.reason]}）。可以移動探針，逐層查看證據。</p>
          <ol className={styles.revealList} data-testid="reveal-progress" data-reveal={learning.reveal}>
            <li>各來源貢獻 Eᵢ（已顯示）</li>
            <li>{learning.reveal >= 2 ? "合場向量（已顯示）" : "合場向量"}</li>
            <li>{learning.reveal >= 3 ? "Eₓ、Eᵧ 與方向（已顯示）" : "Eₓ、Eᵧ 與方向"}</li>
          </ol>
          {learning.reveal >= 3 ? <Verdict predicted={COMPASS_LABEL[predicted.direction]} model={modelDirection ? COMPASS_LABEL[modelDirection] : null} /> : null}
          {learning.reveal < 3
            ? <button type="button" onClick={props.onReveal} data-testid="reveal-next">{nextLabel}</button>
            : <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">{learning.step === "observe" ? "進入 Explain" : "完成 Activity A"}</button>}
        </div>
      );
    } else if (learning.step === "explain") {
      body = (
        <>
          <p className={styles.helperText}>對照探針表格裡每個來源的 Eₓ、Eᵧ 正負號。</p>
          <AExplainForm key={formKey} onSubmit={props.onExplainA} />
        </>
      );
    } else {
      body = <CompletePanel onExplore={props.onExplore} />;
    }
  } else if (learning.activity === "B") {
    if (learning.step === "predict" || learning.step === "transfer-predict") {
      body = (
        <DirectionForm
          key={formKey}
          prompt={learning.step === "predict"
            ? "兩顆等量正電荷左右對稱，探針在中點。中點的合電場指向哪裡？"
            : "Transfer：四顆等量正電荷位於矩形四角，探針在中心。中心的合電場是？"}
          options={COMPASS_4_ZERO}
          withReason={false}
          onCommit={props.onCommitDirection}
        />
      );
    } else if (learning.step === "observe" || learning.step === "transfer-observe") {
      const predicted = learning.step === "observe" ? learning.prediction : learning.transferPrediction;
      body = (
        <div className={styles.guidedForm}>
          <p className={styles.guidedPrompt}>你已承諾：{COMPASS_LABEL[predicted]}。</p>
          <ol className={styles.revealList} data-testid="reveal-progress" data-reveal={learning.reveal}>
            <li>各來源貢獻（已顯示）</li>
            <li>{learning.reveal >= 2 ? "合場與零場標記（已顯示）" : "合場與零場標記"}</li>
          </ol>
          {learning.reveal >= 2 ? (
            <>
              <Verdict predicted={COMPASS_LABEL[predicted]} model={modelDirection ? COMPASS_LABEL[modelDirection] : null} />
              {field.valid && field.isZero ? <p className={styles.helperText} data-testid="zero-direction">合場為零：方向未定義（不是 0°）。</p> : null}
            </>
          ) : null}
          {learning.reveal < 2
            ? <button type="button" onClick={props.onReveal} data-testid="reveal-next">顯示合場</button>
            : <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">{learning.step === "observe" ? "進入 Manipulate" : "完成 Activity B"}</button>}
        </div>
      );
    } else if (learning.step === "manipulate") {
      const s2 = setup.sources.find((source) => source.id === "s2");
      body = (
        <div className={styles.guidedForm}>
          <p className={styles.guidedPrompt}>Manipulate：把 s2 的電量大小改變，再移動探針尋找新的零場點。來源位置在本步驟保持固定。</p>
          {s2 ? (
            <label>s2 大小（nC）
              <input
                type="number" min="1" max="5" step="0.5"
                value={Math.abs(s2.q_C) * 1e9}
                onChange={(event) => props.onSourceMagnitude("s2", Number(event.target.value))}
                data-testid="guided-s2-magnitude"
              />
            </label>
          ) : null}
          <BExplainForm key={formKey} onSubmit={props.onExplainB} />
        </div>
      );
    } else {
      body = <CompletePanel onExplore={props.onExplore} />;
    }
  } else {
    body = <ActivityCBody {...props} formKey={formKey} />;
  }

  return (
    <section className={styles.guidedPanel} aria-labelledby="guided-task-heading" data-testid="guided-panel" data-activity={learning.activity} data-step={learning.step}>
      <div className={styles.sectionHeading}>
        <p>GUIDED · {stepLabel(learning)}</p>
      </div>
      <nav className={styles.activityTabs} aria-label="引導活動">
        {(["A", "B", "C"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-current={learning.activity === id ? "step" : undefined}
            className={learning.activity === id ? styles.activeButton : undefined}
            onClick={() => props.onSwitch(id)}
            data-testid={`activity-${id}`}
          >Activity {id}</button>
        ))}
      </nav>
      <h2 id="guided-task-heading" ref={headingRef} tabIndex={-1} className={styles.guidedHeading}>{taskTitle(learning)}</h2>
      {body}
      <div className={styles.inlineActions}>
        <button type="button" onClick={props.onRestart} data-testid="restart-activity">重新開始此活動</button>
        <button type="button" onClick={props.onShare} data-testid="share-setup">分享物理設定</button>
      </div>
    </section>
  );
}

function CompletePanel({ onExplore }: { readonly onExplore: () => void }) {
  return (
    <div className={styles.guidedForm}>
      <p className={styles.guidedPrompt} data-testid="activity-complete">活動完成。現在可以在 sandbox 自由操作同一個模型。</p>
      <button type="button" className={styles.shareButton} onClick={onExplore} data-testid="explore-sandbox">在 sandbox 繼續探索此配置</button>
    </div>
  );
}

function ActivityCBody(props: GuidedActivitiesProps & { readonly formKey: string }) {
  const { learning, setup, runtime, comparisonSetup } = props;
  if (learning.activity !== "C") return null;
  if (learning.step === "complete") return <CompletePanel onExplore={props.onExplore} />;
  const { stage } = learning;
  if (learning.step === "predict") {
    if (stage === "c1") {
      return (
        <DirectionForm
          key={props.formKey}
          prompt="來源與測試粒子都固定、粒子靜止。這顆正測試電荷的初始加速度指向哪裡？"
          options={[...COMPASS_8, "zero"]}
          withReason
          onCommit={props.onCommitDirection}
        />
      );
    }
    if (stage === "c4") return <VelocityForm key={props.formKey} onCommit={props.onCommitVelocity} />;
    return (
      <ChangeForm
        key={props.formKey}
        prompt={stage === "c2" ? "把測試電荷改成負電荷（大小不變）。和原本相比：" : "把測試粒子質量加倍（電荷不變）。和原本相比："}
        options={stage === "c2" ? ["same", "reverse"] : ["same", "double", "half"]}
        onCommit={props.onCommitChange}
      />
    );
  }
  const readout = particleReadout(setup, initialRuntime(setup));
  const accel = accelerationCompass(readout);
  let verdict: React.ReactNode = null;
  if (stage === "c1" && learning.predictions.c1) {
    verdict = <Verdict predicted={COMPASS_LABEL[learning.predictions.c1]} model={accel ? COMPASS_LABEL[accel] : null} />;
  } else if ((stage === "c2" || stage === "c3") && comparisonSetup && readout.valid) {
    const before = particleReadout(comparisonSetup, initialRuntime(comparisonSetup));
    const predicted = learning.predictions[stage];
    if (before.valid && predicted) {
      const rows = [
        { key: "E", label: "E（場，只看來源與位置）", change: changeOf(before.field, readout.field) },
        { key: "F", label: "F = qE（依賴 q）", change: changeOf(before.force_N, readout.force_N) },
        { key: "a", label: "a = qE/m（依賴 q/m）", change: changeOf(before.acceleration_mps2, readout.acceleration_mps2) },
      ] as const;
      verdict = (
        <table className={styles.probeTable} data-testid="change-verdict">
          <caption>和上一個設定相比（由模型讀值判定）</caption>
          <thead><tr><th scope="col">量</th><th scope="col">你的預測</th><th scope="col">模型</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-testid={`change-${row.key}`} data-model={row.change}>
                <th scope="row">{row.label}</th>
                <td>{CHANGE_LABEL[predicted[row.key]]}</td>
                <td>{row.change === "other" ? "其他" : CHANGE_LABEL[row.change]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  } else if (stage === "c4" && learning.predictions.c4) {
    verdict = (
      <>
        <p className={styles.guidedVerdict} data-testid="prediction-verdict">
          你的預測：速度 {COMPASS_LABEL[learning.predictions.c4.velocity]}、加速度 {COMPASS_LABEL[learning.predictions.c4.acceleration]}；
          模型：速度 {COMPASS_LABEL[compassOf({ x: setup.testParticle.vx_mps, y: setup.testParticle.vy_mps }, false)]}（初始條件）、加速度 {accel ? COMPASS_LABEL[accel] : "未定義"}。
        </p>
        <p className={styles.helperText}>用「單步」或短暫播放觀察：粒子往上走，軌跡卻逐漸彎向加速度方向。t = {runtime.particle.t_s.toFixed(4)} s</p>
      </>
    );
  }
  return (
    <div className={styles.guidedForm}>
      <p className={styles.guidedPrompt}>證據已顯示：下方「測試粒子讀值」列出同一位置的 E、F、a。E 屬於場；F 依賴 q；a 依賴 q/m。</p>
      {verdict}
      <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">
        {stage === "c4" ? "完成 Activity C" : "下一步"}
      </button>
    </div>
  );
}
