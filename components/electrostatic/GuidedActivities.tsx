"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import {
  accelerationCompass,
  changeOf,
  COMPASS_4_ZERO,
  COMPASS_8,
  componentVerdicts,
  probeCompass,
  trajectoryTurn,
  type ActivityId,
  type AExplanation,
  type BExplanation,
  type CFlipPrediction,
  type Change,
  type Compass,
  type ComponentVerdict,
  type CTrajectoryPrediction,
  type DirectionPrediction,
  type LearningState,
  type TrajectoryTurn,
} from "../../models/electrostatic-learning.ts";
import { initialRuntime, particleReadout, probeReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { PredictionMarker } from "./guidedPrediction.ts";
import { guidedProgress, subtaskHeading } from "./guidedProgress.ts";
import { guidedFocusFor } from "./guidedFocus.ts";
import { formatValue } from "./ProbePanel";
import { Tex } from "@/components/math/MathJax";
import CompassChooser from "./CompassChooser";
import styles from "./ElectrostaticFieldLab.module.css";

const COMPASS_LABEL: Record<Compass, string> = {
  E: "→ 向右", NE: "↗ 右上", N: "↑ 向上", NW: "↖ 左上", W: "← 向左", SW: "↙ 左下", S: "↓ 向下", SE: "↘ 右下", zero: "零場",
};
const CHANGE_LABEL: Record<Change, string> = { same: "不變", reverse: "反向", double: "加倍", half: "減半" };
const TRAJECTORY_LABEL: Record<TrajectoryTurn, string> = { left: "向左偏轉", straight: "維持直線", right: "向右偏轉" };

const ACTIVITY_TAB: Record<ActivityId, string> = { A: "1 合場方向", B: "2 對稱", C: "3 場與運動" };
const ACTIVITY_NAME: Record<ActivityId, string> = { A: "合場方向", B: "對稱", C: "場與運動" };
const ACTIVITY_NUMBER: Record<ActivityId, number> = { A: 1, B: 2, C: 3 };

export interface GuidedHandlers {
  readonly onCommitDirection: (prediction: DirectionPrediction) => void;
  readonly onCommitChange: (prediction: CFlipPrediction) => void;
  readonly onCommitTrajectory: (prediction: CTrajectoryPrediction) => void;
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
      <div className={styles.choiceGrid} data-count={props.options.length}>
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

function TrajectoryGlyph({ turn }: { readonly turn: TrajectoryTurn }) {
  const path = turn === "left" ? "M48 62 C48 43 42 25 18 12"
    : turn === "right" ? "M48 62 C48 43 54 25 78 12"
      : "M48 62 L48 12";
  return (
    <svg viewBox="0 0 96 72" role="img" aria-label={TRAJECTORY_LABEL[turn]}>
      <path className={styles.trajectoryGuide} d="M48 64 L48 48" />
      <path className={styles.trajectoryPath} d={path} />
      <circle className={styles.trajectoryStart} cx="48" cy="62" r="3" />
    </svg>
  );
}

/** C4 makes the upward initial velocity an explicit condition. The learner predicts qualitative
 * curvature and initial acceleration; the Canvas keeps v and a visually distinct. */
function TrajectoryForm(props: { readonly onCommit: (p: CTrajectoryPrediction) => void; readonly onPreview: (markers: readonly PredictionMarker[]) => void }) {
  const [trajectory, setTrajectory] = useState<TrajectoryTurn | null>(null);
  const [acceleration, setAcceleration] = useState<Compass | null>(null);
  useEffect(() => {
    props.onPreview([{ anchor: "particle", compass: "N", label: "v" }]);
    return () => props.onPreview([]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseAcceleration = (value: Compass) => {
    setAcceleration(value);
    props.onPreview([
      { anchor: "particle", compass: "N", label: "v" },
      { anchor: "particle", compass: value, label: "a" },
    ]);
  };
  return (
    <form className={styles.guidedForm} onSubmit={(event) => { event.preventDefault(); if (trajectory && acceleration) props.onCommit({ trajectory, acceleration }); }}>
      <p className={styles.guidedPrompt}>現在給測試電荷一個<strong>向上的初速度</strong>。你預測接下來的軌跡會怎麼偏轉？剛開始的加速度又朝哪裡？</p>
      <fieldset className={styles.controlGroup}>
        <legend>軌跡預測</legend>
        <div className={styles.trajectoryChoiceGrid}>
          {(Object.keys(TRAJECTORY_LABEL) as TrajectoryTurn[]).map((turn) => (
            <label key={turn} className={styles.trajectoryChoice}>
              <input type="radio" name="predict-trajectory" value={turn} checked={trajectory === turn} onChange={() => setTrajectory(turn)} data-testid={`predict-trajectory-${turn}`} />
              <TrajectoryGlyph turn={turn} />
              <span>{TRAJECTORY_LABEL[turn]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <CompassChooser legend="初始加速度方向 a" name="predict-acceleration" directions={COMPASS_8} value={acceleration} onChange={chooseAcceleration} />
      <p className={styles.helperText}>只判斷初期往哪一側彎，不需要猜精確曲線。</p>
      <button type="submit" className={styles.shareButton} disabled={!trajectory || !acceleration} data-testid="commit-prediction">提交答案</button>
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
      <FeedbackStatus match={match} matchMessage="你的選擇和模型一致。" mismatchMessage={mismatchGuidance ?? "看下面兩欄：你的方向和模型的方向差在哪裡？"} />
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
  return <a className={styles.readoutLink} href="#particle-panel-title" data-testid="particle-readout-link">查看測量讀值：E、F、a</a>;
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

/** 2-2: start from the already-broken symmetry, hunt for the new zero, and only then explain. */
function BManipulate(props: {
  readonly field: ReturnType<typeof probeReadout>;
  readonly setup: ElectrostaticSetup;
  readonly onSourceMagnitude: (id: string, magnitude_nC: number) => void;
  readonly onExplainB: (explanation: BExplanation) => void;
}) {
  const [explaining, setExplaining] = useState(false);
  const s1 = props.setup.sources.find((source) => source.id === "s1");
  const s2 = props.setup.sources.find((source) => source.id === "s2");
  return (
    <div className={styles.guidedForm}>
      <p className={styles.guidedPrompt}>
        現在左側電荷是 {s1 ? formatValue(s1.q_C / 1e-9, "nC") : "—"}、右側是 {s2 ? formatValue(s2.q_C / 1e-9, "nC") : "—"}，對稱被打破了。
        拖曳測量點，找出合電場最接近 0 的位置。
      </p>
      <LiveMagnitude field={props.field} />
      {s2 ? (
        <div className={styles.guidedMagnitudeControl}>
          <label htmlFor="guided-s2-magnitude">想試試別的？調整右側電荷大小</label>
          <span className={styles.guidedMagnitudeField}>
            <input
              id="guided-s2-magnitude"
              type="number" min="1" max="5" step="0.5"
              value={Math.abs(s2.q_C) * 1e9}
              onChange={(event) => props.onSourceMagnitude("s2", Number(event.target.value))}
              aria-label="右側電荷大小（nC）"
              data-testid="guided-s2-magnitude"
            />
            <span aria-hidden="true" data-testid="guided-s2-unit">nC</span>
          </span>
        </div>
      ) : null}
      {explaining
        ? <BExplainForm onSubmit={props.onExplainB} />
        : <button type="button" className={styles.shareButton} onClick={() => setExplaining(true)} data-testid="found-zero">我找到了，說明原因</button>}
    </div>
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
      <RadioGroup legend="原本的中點為什麼不再是零場點？" name="explain-b" options={Object.keys(labels) as BExplanation[]} labels={labels} value={value} onChange={setValue} />
      <button type="submit" className={styles.shareButton} disabled={!value} data-testid="submit-explanation">提交說明，換個情境</button>
    </form>
  );
}

/** Task-card hero for B's manipulation: the model's own |E| for the current probe position. */
function LiveMagnitude({ field }: { readonly field: ReturnType<typeof probeReadout> }) {
  if (!field.valid) {
    return <div className={styles.heroReadout} data-testid="guided-live-e" data-state="invalid"><span>合電場大小</span><small>測量點太靠近源電荷（灰色核心內），移出後才有讀值。</small></div>;
  }
  return (
    <div className={styles.heroReadout} data-testid="guided-live-e" data-state={field.isZero ? "zero" : "nonzero"}>
      <span>合電場大小</span>
      <p className={styles.heroLine}><Tex>{"|\\vec E| ="}</Tex> <strong data-testid="guided-live-e-value">{formatValue(field.magnitude_N_per_C, "N/C")}</strong></p>
      <small>{field.isZero ? "已達零場：方向未定義。" : "讓這個數字越接近 0 越好。"}</small>
    </div>
  );
}

function stepLabel(state: LearningState): string {
  if (state.activity === "C") {
    return state.step === "complete" ? "完成" : state.step === "predict" ? "先預測" : "看結果";
  }
  return {
    predict: "先預測", observe: "看結果", explain: "說明原因", manipulate: "動手找規律",
    "transfer-predict": "先預測", "transfer-observe": "看結果", complete: "完成",
  }[state.step];
}

function TaskProgress({ state }: { readonly state: LearningState }) {
  const { stages, current, total } = guidedProgress(state);
  const progressKind = state.activity === "C" ? "小題" : "情境";
  return (
    <nav className={styles.taskProgress} aria-label={`任務 ${ACTIVITY_NUMBER[state.activity]}：${ACTIVITY_NAME[state.activity]}進度`} data-testid="task-progress" data-activity={state.activity} data-stage={current} data-count={total}>
      <ol style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {stages.map((label, index) => {
          const position = index + 1;
          return (
            <li
              key={label}
              aria-current={position === current ? "step" : undefined}
              aria-label={`${label}，第 ${position} 個${progressKind}，共 ${total} 個`}
              data-current={position === current ? "true" : "false"}
              data-complete={position < current ? "true" : "false"}
            >
              <span className={styles.progressNode} aria-hidden="true" />
              <span className={styles.progressLabel} aria-hidden="true">{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function GuidedActivities(props: GuidedActivitiesProps) {
  const { learning, setup } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  /* Heading focus moves only when a NEW subtask/context starts (tab switch, 1-1 → 1-2, restart),
   * never for reveals inside the same subtask. */
  const subtaskKey = `${learning.activity}-${guidedProgress(learning).current}`;
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [props.focusToken, subtaskKey]);

  const focus = guidedFocusFor(learning);
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
          <p className={styles.guidedPrompt}>你的預測是{COMPASS_LABEL[predicted.direction]}。</p>
          {learning.reveal < 2 ? (
            <button type="button" onClick={props.onReveal} data-testid="reveal-next">看合電場</button>
          ) : learning.reveal < 3 ? (
            <button type="button" onClick={props.onReveal} data-testid="reveal-next">看 x、y 分量</button>
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
          <p className={styles.helperText}>對照下方分量表裡每個來源 Eₓ、Eᵧ 的正負號。</p>
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
      body = <BManipulate key={formKey} field={field} setup={setup} onSourceMagnitude={props.onSourceMagnitude} onExplainB={props.onExplainB} />;
    } else {
      body = <CompletePanel onExplore={props.onExplore} />;
    }
  } else {
    body = <ActivityCBody {...props} formKey={formKey} />;
  }

  return (
    <section className={styles.guidedPanel} aria-labelledby="guided-task-heading" data-testid="guided-panel" data-activity={learning.activity} data-step={learning.step}>
      <nav className={styles.activityTabs} aria-label="引導活動">
        {(["A", "B", "C"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-current={learning.activity === id ? "step" : undefined}
            className={learning.activity === id ? styles.activeButton : undefined}
            onClick={() => props.onSwitch(id)}
            aria-label={`任務 ${ACTIVITY_NUMBER[id]}：${ACTIVITY_NAME[id]}`}
            data-testid={`activity-${id}`}
          >{ACTIVITY_TAB[id]}</button>
        ))}
      </nav>
      <div className={styles.headingRow}>
        <h2 id="guided-task-heading" ref={headingRef} tabIndex={-1} className={styles.guidedHeading} data-testid="guided-subtask">{subtaskHeading(learning)}</h2>
        <span className={styles.phaseChip} data-testid="guided-phase">{stepLabel(learning)}</span>
      </div>
      <TaskProgress state={learning} />
      <p className={styles.focusInstruction} data-testid="guided-focus" data-focus-target={focus.target} data-focus-key={focus.key}>
        <span className={styles.focusBadge}>現在看這裡</span>{focus.instruction}
      </p>
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
    if (stage === "c4") return <TrajectoryForm key={props.formKey} onCommit={props.onCommitTrajectory} onPreview={props.onPreview} />;
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
        mismatchGuidance="先看測量讀值：正測試電荷的電力與加速度會跟電場同方向嗎？"
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
            mismatchMessage="先比較測量讀值：哪個量不變？哪個量反向？"
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
    const trajectoryModel = trajectoryTurn(
      { x: setup.testParticle.vx_mps, y: setup.testParticle.vy_mps },
      readout.valid ? readout.acceleration_mps2 : { x: 0, y: 0 },
    );
    const trajectoryMatch = learning.predictions.c4.trajectory === trajectoryModel;
    const accelerationMatch = learning.predictions.c4.acceleration === accel;
    const mismatchMessage = accelerationMatch && !trajectoryMatch
      ? "你已判斷出加速度向左。當速度持續增加左向分量時，路徑還會保持直線嗎？"
      : trajectoryMatch && !accelerationMatch
        ? "軌跡偏轉已判斷正確；再看測試電荷左側的電場與初始加速度方向。"
        : "先分開判斷：速度決定當下運動方向；加速度決定速度如何改變。";
    verdict = (
      <>
        <section className={styles.comparisonCard} data-testid="prediction-verdict" data-match={trajectoryMatch && accelerationMatch ? "true" : "false"}>
          <FeedbackStatus match={trajectoryMatch && accelerationMatch} matchMessage="軌跡偏轉與初始加速度都和模型一致。" mismatchMessage={mismatchMessage} />
          <dl className={styles.comparisonGrid}>
            <div><dt>軌跡：你的／模型</dt><dd>{TRAJECTORY_LABEL[learning.predictions.c4.trajectory]} ／ {TRAJECTORY_LABEL[trajectoryModel]}</dd></div>
            <div><dt>初始 a：你的／模型</dt><dd>{COMPASS_LABEL[learning.predictions.c4.acceleration]} ／ {accel ? COMPASS_LABEL[accel] : "未定義"}</dd></div>
          </dl>
          {trajectoryMatch && accelerationMatch
            ? <p className={styles.feedbackExplanation}>關鍵：v 決定當下運動方向；a 決定速度如何改變。初速度向上、加速度向左，所以軌跡逐漸向左彎。</p>
            : <details className={styles.feedbackDetails}><summary>查看關鍵關係</summary><p>初速度向上；向左的加速度會讓速度逐漸增加左向分量，因此路徑向左彎。</p></details>}
        </section>
      </>
    );
  }
  const CObservePrompt: Record<"c1" | "c2" | "c3", string> = {
    c1: "用測量讀值比較 E、F、a 的方向。",
    c2: "和上一個設定相比，E、F、a 哪個不變、哪個反向？",
    c3: "和上一個設定相比，E、F、a 哪個不變、哪個改變？",
  };
  if (stage === "c4") {
    /* 3-4 is about v, a and the bending path: play first, then compare with the prediction. */
    const played = props.runtime.macroSteps > 0;
    return (
      <div className={styles.guidedForm}>
        <p className={styles.guidedPrompt}>v 決定當下往哪走；a 會持續改變 v。播放看看，軌跡接下來會怎麼變。</p>
        {played ? verdict : <p className={styles.helperText} data-testid="c4-play-first">按播放（或 +0.1s）看看軌跡，再和你的預測比較。</p>}
        {played ? (
          <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">完成任務三</button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.guidedForm}>
      <p className={styles.guidedPrompt}>{CObservePrompt[stage]}</p>
      <ParticleReadoutLink />
      {verdict}
      <button type="button" className={styles.shareButton} onClick={props.onAdvance} data-testid="advance">下一步</button>
    </div>
  );
}
