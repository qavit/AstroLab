"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import {
  accelerationCompass,
  changeOf,
  COMPASS_4_ZERO,
  COMPASS_8,
  compassOf,
  componentVerdicts,
  probeCompass,
  type ActivityId,
  type AExplanation,
  type BExplanation,
  type CFlipPrediction,
  type Change,
  type Compass,
  type ComponentVerdict,
  type CVelocityPrediction,
  type DirectionPrediction,
  type LearningState,
} from "../../models/electrostatic-learning.ts";
import { initialRuntime, particleReadout, probeReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { PredictionMarker } from "./guidedPrediction.ts";
import { guidedProgress } from "./guidedProgress.ts";
import CompassChooser from "./CompassChooser";
import styles from "./ElectrostaticFieldLab.module.css";

const COMPASS_LABEL: Record<Compass, string> = {
  E: "→ 向右", NE: "↗ 右上", N: "↑ 向上", NW: "↖ 左上", W: "← 向左", SW: "↙ 左下", S: "↓ 向下", SE: "↘ 右下", zero: "零場",
};
const CHANGE_LABEL: Record<Change, string> = { same: "不變", reverse: "反向", double: "加倍", half: "減半" };

const ACTIVITY_TITLE: Record<ActivityId, string> = {
  A: "任務一｜兩個電場會往哪裡？",
  B: "任務二｜對稱會留下什麼？",
  C: "任務三｜從電場到運動",
};

/**
 * Task wording is part of the answer-leak surface: B's own topic ("零場") is one of the options
 * the learner must choose between, so the heading stays neutral until the prediction is committed.
 */
function taskTitle(state: LearningState): string {
  if (state.activity === "C") {
    const stage = state.step === "complete" ? 4 : Number(state.stage.slice(1));
    return `${ACTIVITY_TITLE.C}（${stage}/4）`;
  }
  if (state.activity === "B" && (state.step === "predict" || state.step === "transfer-predict")) {
    return "任務二｜對稱會留下什麼？";
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
  readonly onSourceMagnitude: (id: string, magnitude_nC: number) => void;
  /** Live, uncommitted compass guess(es) for the Canvas prediction preview. Never model evidence. */
  readonly onPreview: (markers: readonly PredictionMarker[]) => void;
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

/** Spatial direction prediction. Selecting a direction previews it on the Canvas immediately;
 * unmounting (task switch/restart/step change) clears that preview so it never goes stale. */
function DirectionForm(props: {
  readonly prompt: string;
  /** Physics wording belongs to this activity's actual source/target geometry. */
  readonly hint: string;
  readonly options: readonly Compass[];
  readonly anchor: "probe" | "particle";
  readonly onCommit: (prediction: DirectionPrediction) => void;
  readonly onPreview: (markers: readonly PredictionMarker[]) => void;
}) {
  const [direction, setDirection] = useState<Compass | null>(null);
  useEffect(() => () => props.onPreview([]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (value: Compass) => {
    setDirection(value);
    props.onPreview([{ anchor: props.anchor, compass: value }]);
  };
  return (
    <form
      className={styles.guidedForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (direction) props.onCommit({ direction, reason: "other" });
      }}
    >
      <p className={styles.guidedPrompt}>{props.prompt}</p>
      <CompassChooser legend="你的方向預測" name="predict-direction" directions={props.options} value={direction} onChange={choose} />
      <details className={styles.hintDisclosure}><summary>需要一點提示？</summary><p>{props.hint}</p></details>
      <button type="submit" className={styles.shareButton} disabled={!direction} data-testid="commit-prediction">提交答案</button>
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
      <button type="submit" className={styles.shareButton} disabled={!E || !F || !a} data-testid="commit-prediction">提交答案</button>
    </form>
  );
}

/** Two spatial predictions (velocity, acceleration) at the test charge. Only the most recently
 * touched one previews on Canvas before submit, so the two guesses never stack unreadably. */
function VelocityForm(props: { readonly onCommit: (p: CVelocityPrediction) => void; readonly onPreview: (markers: readonly PredictionMarker[]) => void }) {
  const [velocity, setVelocity] = useState<Compass | null>(null);
  const [acceleration, setAcceleration] = useState<Compass | null>(null);
  useEffect(() => () => props.onPreview([]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseVelocity = (value: Compass) => {
    setVelocity(value);
    props.onPreview([{ anchor: "particle", compass: value, label: "v" }]);
  };
  const chooseAcceleration = (value: Compass) => {
    setAcceleration(value);
    props.onPreview([{ anchor: "particle", compass: value, label: "a" }]);
  };
  return (
    <form className={styles.guidedForm} onSubmit={(event) => { event.preventDefault(); if (velocity && acceleration) props.onCommit({ velocity, acceleration }); }}>
      <p className={styles.guidedPrompt}>粒子現在有向上的初速度。一開始，它的速度與加速度各指向哪裡？</p>
      <CompassChooser legend="初速度方向 v" name="predict-velocity" directions={COMPASS_8} value={velocity} onChange={chooseVelocity} />
      <CompassChooser legend="初始加速度方向 a" name="predict-acceleration" directions={COMPASS_8} value={acceleration} onChange={chooseAcceleration} />
      <p className={styles.helperText}>速度 v 是粒子現在往哪裡走；加速度 a 是速度接下來會往哪裡偏。兩者可以不同方向。</p>
      <button type="submit" className={styles.shareButton} disabled={!velocity || !acceleration} data-testid="commit-prediction">提交答案</button>
    </form>
  );
}

function FeedbackStatus(props: { readonly match: boolean; readonly matchMessage: string; readonly mismatchMessage: string }) {
  return (
    <div className={`${styles.feedbackStatus} ${props.match ? styles.feedbackMatch : styles.feedbackMiss}`} role="status" data-testid="feedback-status" data-match={props.match ? "true" : "false"}>
      {props.match ? <CircleCheck size={22} aria-hidden="true" /> : <CircleAlert size={22} aria-hidden="true" />}
      <div><strong>{props.match ? "答對了" : "和模型不同"}</strong><span>{props.match ? props.matchMessage : props.mismatchMessage}</span></div>
    </div>
  );
}

/** A two-column result makes agreement and disagreement scannable before any explanation. */
function Comparison(props: { readonly answer: string; readonly model: string | null; readonly explanation?: string; readonly mismatchGuidance?: string }) {
  const { answer, model, explanation, mismatchGuidance } = props;
  const match = model !== null && answer === model;
  return (
    <section className={styles.comparisonCard} data-testid="prediction-verdict" data-match={match ? "true" : "false"}>
      <FeedbackStatus match={match} matchMessage="你的選擇和模型一致。" mismatchMessage={mismatchGuidance ?? "先比較你的選擇和模型結果。"} />
      <dl className={styles.comparisonGrid}>
      <div><dt>你的答案</dt><dd>{answer}</dd></div>
      <div><dt>模型結果</dt><dd>{model ?? "未定義"}</dd></div>
      </dl>
      {explanation && match ? <p className={styles.feedbackExplanation}>關鍵：{explanation}</p> : null}
      {explanation && !match ? <details className={styles.feedbackDetails}><summary>查看模型說明</summary><p>{explanation}</p></details> : null}
    </section>
  );
}

function ParticleReadoutLink() {
  return <a className={styles.readoutLink} href="#particle-panel-title" data-testid="particle-readout-link">查看下方讀值：E、F、a</a>;
}

const VERDICT_WORD: Record<ComponentVerdict, string> = { cancel: "部分抵消", add: "同向相加" };

/** Component-based explanation read from the model's own per-source contributions — never
 * hard-coded to one canonical setup, since A's transfer setup has a different component pattern. */
function componentExplanation(field: ReturnType<typeof probeReadout>): string | undefined {
  const verdicts = componentVerdicts(field);
  if (!verdicts) return undefined;
  return `水平分量${VERDICT_WORD[verdicts.x]}，垂直分量${VERDICT_WORD[verdicts.y]}。`;
}

function AExplainForm({ onSubmit }: { readonly onSubmit: (e: AExplanation) => void }) {
  const [x, setX] = useState<AExplanation["x"] | null>(null);
  const [y, setY] = useState<AExplanation["y"] | null>(null);
  const [revise, setRevise] = useState<AExplanation["revise"] | null>(null);
  const verdicts = { cancel: "互相抵消（至少部分）", add: "互相相加" };
  return (
    <form className={styles.guidedForm} onSubmit={(event) => { event.preventDefault(); if (x && y && revise) onSubmit({ x, y, revise }); }}>
      <p className={styles.guidedPrompt}>用分量說明合場方向。</p>
      <RadioGroup legend="兩個來源的 x 分量" name="explain-x" options={["cancel", "add"] as const} labels={verdicts} value={x} onChange={setX} />
      <RadioGroup legend="兩個來源的 y 分量" name="explain-y" options={["cancel", "add"] as const} labels={verdicts} value={y} onChange={setY} />
      <RadioGroup legend="你的原預測" name="explain-revise" options={["kept", "revised"] as const} labels={{ kept: "不用修正", revised: "需要修正" }} value={revise} onChange={setRevise} />
      <button type="submit" className={styles.shareButton} disabled={!x || !y || !revise} data-testid="submit-explanation">提交說明，換個情境</button>
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
      <button type="submit" className={styles.shareButton} disabled={!value} data-testid="submit-explanation">提交說明，換個情境</button>
    </form>
  );
}

function stepLabel(state: LearningState): string {
  if (state.activity === "C") {
    if (state.step === "complete") return "完成";
    const stage = { c1: "1 初始加速度", c2: "2 反轉 q", c3: "3 質量加倍", c4: "4 加入初速度" }[state.stage];
    return `${stage} · ${state.step === "predict" ? "先預測" : "看結果"}`;
  }
  return {
    predict: "先預測", observe: "看結果", explain: "說明原因", manipulate: "動手找規律",
    "transfer-predict": "換個情境再預測", "transfer-observe": "換個情境看結果", complete: "完成",
  }[state.step];
}

function TaskProgress({ state }: { readonly state: LearningState }) {
  const { stages, current, total } = guidedProgress(state);
  const taskName = ACTIVITY_TITLE[state.activity].split("｜")[0];
  return (
    <nav className={styles.taskProgress} aria-label={`${taskName}進度`} data-testid="task-progress" data-activity={state.activity} data-stage={current} data-count={total}>
      <p>{taskName}共有 {total} 個階段・目前第 {current} 階段</p>
      <ol style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>{stages.map((label, index) => <li key={label} data-current={index + 1 === current ? "true" : "false"} data-complete={index + 1 < current ? "true" : "false"}>{index + 1} {label}</li>)}</ol>
    </nav>
  );
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
            ? "來源已鎖定。只看電荷符號與位置：測量點的合電場指向哪裡？"
            : "換個情境：右側來源已反轉為負電荷。重新預測測量點的合電場方向。"}
          hint="先分別想每顆源電荷在測量點造成的方向，再把兩支箭頭合起來。"
          options={[...COMPASS_8, "zero"]}
          anchor="probe"
          onCommit={props.onCommitDirection}
          onPreview={props.onPreview}
        />
      );
    } else if (learning.step === "observe" || learning.step === "transfer-observe") {
      const predicted = learning.step === "observe" ? learning.prediction : learning.transferPrediction;
      body = (
        <div className={styles.guidedForm}>
          <p className={styles.guidedPrompt}>你的預測是{COMPASS_LABEL[predicted.direction]}。現在逐層查看畫布上的證據。</p>
          {learning.reveal < 2 ? (
            <button type="button" onClick={props.onReveal} data-testid="reveal-next">看合電場</button>
          ) : learning.reveal < 3 ? (
            <button type="button" onClick={props.onReveal} data-testid="reveal-next">看分量</button>
          ) : (
            <>
              <Comparison
                answer={COMPASS_LABEL[predicted.direction]}
                model={modelDirection ? COMPASS_LABEL[modelDirection] : null}
                explanation={componentExplanation(field)}
              />
              <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">
                {learning.step === "observe" ? "說說原因" : "完成任務一"}
              </button>
            </>
          )}
        </div>
      );
    } else if (learning.step === "explain") {
      body = (
        <>
          <p className={styles.helperText}>對照測量點表格裡每個來源的 Eₓ、Eᵧ 正負號。</p>
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
            ? "兩顆等量正電荷左右對稱，測量點在中點。中點的合電場指向哪裡？"
            : "換個情境：四顆等量正電荷位於矩形四角，測量點在中心。中心的合電場是？"}
          hint={learning.step === "predict"
            ? "先比較左右兩顆源電荷在測量點造成的方向，再判斷它們是否抵消。"
            : "觀察對稱位置的源電荷如何成對抵消，再判斷中心的合電場。"}
          options={COMPASS_4_ZERO}
          anchor="probe"
          onCommit={props.onCommitDirection}
          onPreview={props.onPreview}
        />
      );
    } else if (learning.step === "observe" || learning.step === "transfer-observe") {
      const predicted = learning.step === "observe" ? learning.prediction : learning.transferPrediction;
      body = (
        <div className={styles.guidedForm}>
          <p className={styles.guidedPrompt}>你的預測是{COMPASS_LABEL[predicted]}。</p>
          {learning.reveal < 2 ? (
            <button type="button" onClick={props.onReveal} data-testid="reveal-next">看結果</button>
          ) : (
            <>
              <Comparison
                answer={COMPASS_LABEL[predicted]}
                model={modelDirection ? COMPASS_LABEL[modelDirection] : null}
                explanation={field.valid && field.isZero
                  ? learning.step === "transfer-observe"
                    ? "四顆等量源電荷在對稱位置的貢獻成對抵消，因此合電場為零（方向未定義，不是 0°）。"
                    : "兩顆源電荷的貢獻大小相等、方向相反，因此合電場為零（方向未定義，不是 0°）。"
                  : componentExplanation(field)}
              />
              <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">
                {learning.step === "observe" ? "動手找零場點" : "完成任務二"}
              </button>
            </>
          )}
        </div>
      );
    } else if (learning.step === "manipulate") {
      const s2 = setup.sources.find((source) => source.id === "s2");
      body = (
        <div className={styles.guidedForm}>
          <p className={styles.guidedPrompt}>把右側電荷的大小改變，再移動測量點尋找新的零場點。這一步先不移動源電荷。</p>
          {s2 ? (
            <label>右側電荷大小（nC）
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
        <p>探索任務 · {stepLabel(learning)}</p>
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
          >{ACTIVITY_TITLE[id].split("｜")[0]}</button>
        ))}
      </nav>
      <h2 id="guided-task-heading" ref={headingRef} tabIndex={-1} className={styles.guidedHeading}>{taskTitle(learning)}</h2>
      <TaskProgress state={learning} />
      {body}
      <div className={styles.guidedActions}>
        <button type="button" onClick={props.onRestart} data-testid="restart-activity" className={styles.iconButton}>
          <RotateCcw size={16} aria-hidden="true" />重新開始
        </button>
      </div>
    </section>
  );
}

function CompletePanel({ onExplore }: { readonly onExplore: () => void }) {
  return (
    <div className={styles.guidedForm}>
      <p className={styles.guidedPrompt} data-testid="activity-complete">任務完成。你可以保留這個配置，繼續自由探索。</p>
      <button type="button" className={styles.shareButton} onClick={onExplore} data-testid="explore-sandbox">繼續自由探索</button>
    </div>
  );
}

const CHANGE_EXPLANATION: Record<"c2" | "c3", string> = {
  c2: "電荷正負只改變力與加速度的方向；場 E 只看來源與位置，不受測試電荷影響，所以不變。",
  c3: "質量只出現在 a = F/m 裡；場 E 與力 F 都不依賴質量，所以只有加速度減半。",
};

function ActivityCBody(props: GuidedActivitiesProps & { readonly formKey: string }) {
  const { learning, setup, comparisonSetup } = props;
  if (learning.activity !== "C") return null;
  if (learning.step === "complete") return <CompletePanel onExplore={props.onExplore} />;
  const { stage } = learning;
  if (learning.step === "predict") {
    if (stage === "c1") {
      return (
        <DirectionForm
          key={props.formKey}
          prompt="源電荷與測試電荷都固定、測試電荷靜止。這顆正測試電荷的初始加速度指向哪裡？"
          hint="先看測試電荷位於源電荷的哪一側；正源電荷在該處的電場向外，正測試電荷的加速度與電場同向。"
          options={[...COMPASS_8, "zero"]}
          anchor="particle"
          onCommit={props.onCommitDirection}
          onPreview={props.onPreview}
        />
      );
    }
    if (stage === "c4") return <VelocityForm key={props.formKey} onCommit={props.onCommitVelocity} onPreview={props.onPreview} />;
    return (
      <ChangeForm
        key={props.formKey}
        prompt={stage === "c2" ? "把測試電荷改成負電荷（大小不變）。和原本相比：" : "把測試電荷質量加倍（電荷不變）。和原本相比："}
        options={stage === "c2" ? ["same", "reverse"] : ["same", "double", "half"]}
        onCommit={props.onCommitChange}
      />
    );
  }
  const readout = particleReadout(setup, initialRuntime(setup));
  const accel = accelerationCompass(readout);
  let verdict: React.ReactNode = null;
  if (stage === "c1" && learning.predictions.c1) {
    verdict = (
      <Comparison
        answer={COMPASS_LABEL[learning.predictions.c1]}
        model={accel ? COMPASS_LABEL[accel] : null}
        explanation="正測試電荷位於正源電荷左側；該處電場由源電荷向外，因此初始電力與加速度都向左。"
        mismatchGuidance="先看下方讀值：正測試電荷的電力與加速度會跟電場同方向嗎？"
      />
    );
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
        <>
          <FeedbackStatus
            match={rows.every((row) => predicted[row.key] === row.change)}
            matchMessage="你的三個判斷都和模型一致。"
            mismatchMessage="先比較下方讀值：哪個量不變？哪個量反向？"
          />
          <table className={styles.probeTable} data-testid="change-verdict">
            <caption>和上一個設定相比（由模型讀值判定）</caption>
            <thead><tr><th scope="col">量</th><th scope="col">你的預測</th><th scope="col">模型</th><th scope="col">判定</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const match = predicted[row.key] === row.change;
                return (
                  <tr key={row.key} data-testid={`change-${row.key}`} data-model={row.change}>
                    <th scope="row">{row.label}</th>
                    <td>{CHANGE_LABEL[predicted[row.key]]}</td>
                    <td>{row.change === "other" ? "其他" : CHANGE_LABEL[row.change]}</td>
                    <td className={match ? styles.judgmentMatch : styles.judgmentMiss}>{match ? "一致" : "不同"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.every((row) => predicted[row.key] === row.change)
            ? <p className={styles.feedbackExplanation}>關鍵：{CHANGE_EXPLANATION[stage]}</p>
            : <details className={styles.feedbackDetails}><summary>查看模型說明</summary><p>{CHANGE_EXPLANATION[stage]}</p></details>}
        </>
      );
    }
  } else if (stage === "c4" && learning.predictions.c4) {
    const velocityModel = compassOf({ x: setup.testParticle.vx_mps, y: setup.testParticle.vy_mps }, false);
    const velocityMatch = learning.predictions.c4.velocity === velocityModel;
    const accelerationMatch = learning.predictions.c4.acceleration === accel;
    verdict = (
      <>
        <section className={styles.comparisonCard} data-testid="prediction-verdict" data-match={velocityMatch && accelerationMatch ? "true" : "false"}>
          <FeedbackStatus match={velocityMatch && accelerationMatch} matchMessage="速度和加速度的預測都和模型一致。" mismatchMessage="先比較速度 v 和加速度 a：它們不必指向同一方向。" />
          <dl className={styles.comparisonGrid}>
            <div><dt>v：你的／模型</dt><dd>{COMPASS_LABEL[learning.predictions.c4.velocity]} ／ {COMPASS_LABEL[velocityModel]}</dd></div>
            <div><dt>a：你的／模型</dt><dd>{COMPASS_LABEL[learning.predictions.c4.acceleration]} ／ {accel ? COMPASS_LABEL[accel] : "未定義"}</dd></div>
          </dl>
          {velocityMatch && accelerationMatch
            ? <p className={styles.feedbackExplanation}>關鍵：v 是現在的方向；a 是速度接下來偏轉的方向。用「單步」或短暫播放觀察。</p>
            : <details className={styles.feedbackDetails}><summary>查看模型說明</summary><p>v 是粒子現在往哪裡走；a 是速度接下來會往哪裡偏，兩者可以不同方向。</p></details>}
        </section>
      </>
    );
  }
  return (
    <div className={styles.guidedForm}>
      <p className={styles.guidedPrompt}>用下方讀值比較 E、F、a：E 由來源與位置決定；F 依賴 q；a 依賴 q/m。</p>
      <ParticleReadoutLink />
      {verdict}
      <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">
        {stage === "c4" ? "完成任務三" : "下一步"}
      </button>
    </div>
  );
}
