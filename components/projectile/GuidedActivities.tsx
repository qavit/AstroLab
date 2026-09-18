import type { ReactNode } from "react";
import { ArrowRight, Lightbulb, RotateCcw, X } from "lucide-react";
import type { CursorReadout, ProjectileReadout, ProjectileState } from "@/models/projectile";
import {
  advanceToExplanation,
  completeGuidedSession,
  revealNextHint,
  type GuidedSession,
  type ProjectileActivityId,
  type ProjectileLearningActivity,
} from "@/models/projectile-learning";

type GuidedActivitiesProps = {
  activities: readonly ProjectileLearningActivity[];
  session: GuidedSession;
  state: ProjectileState;
  model: ProjectileReadout;
  cursor: CursorReadout;
  componentChart: ReactNode;
  heightControl: ReactNode;
  onClose: () => void;
  onRestart: () => void;
  onSelectActivity: (id: ProjectileActivityId) => void;
  onPrediction: (choiceId: string) => void;
  onSessionChange: (session: GuidedSession) => void;
  onStartPlayback: () => void;
  onShowComponentChart: () => void;
  componentChartVisible: boolean;
};

const PHASE_LABELS = {
  predict: "預測",
  manipulate: "動手試",
  observe: "觀察與測量",
  explain: "解釋",
  complete: "完成",
} as const;

const EXPLANATION_CHOICES: Record<ProjectileActivityId, readonly string[]> = {
  apex: [
    "最高點代表垂直運動轉向，水平運動仍繼續",
    "最高點代表重力暫時消失",
    "最高點代表水平與垂直速度都為 0",
  ],
  complementary: [
    "互補角讓 sin(2θ) 相同，但垂直初速與滯空時間不同",
    "兩條路徑完全相同，所以同時落地",
    "高角度的水平速度更大，所以射程相同",
  ],
  elevated: [
    "原射程式假設發射與落地同高；額外下落時間改變了關係",
    "重力在 25 m 高處突然變小",
    "互補角只在速度剛好 20 m/s 時成立",
  ],
};

const EXPLANATIONS: Record<ProjectileActivityId, ReactNode> = {
  apex: (
    <p>垂直運動在最高點轉向，因此 <code>vᵧ = 0</code>；水平運動沒有停止，所以總速度通常不為 0。重力也沒有消失。</p>
  ),
  complementary: (
    <p><code>R = v₀² sin(2θ) / g</code>，而 <code>sin(60°) = sin(120°)</code>，所以射程相同；兩者的垂直初速不同，因此飛行時間不同。這依賴同高、真空與定重力假設。</p>
  ),
  elevated: (
    <p><code>R = v₀² sin(2θ) / g</code> 是在發射點與落地面同高時推導的。從高處出發多了下落時間，互補角等射程與 45° 最遠都不再是普遍規則。</p>
  ),
};

function Progress({ activities, session, onSelectActivity }: Pick<GuidedActivitiesProps, "activities" | "session" | "onSelectActivity">) {
  return (
    <ol className="guided-progress" aria-label="探索任務進度">
      {activities.map((item) => (
        <li key={item.id}>
          <button
            className={item.id === session.activityId ? "active" : ""}
            onClick={() => onSelectActivity(item.id)}
            aria-current={item.id === session.activityId ? "step" : undefined}
          >
            <span>{item.number}</span>{item.title}
          </button>
        </li>
      ))}
    </ol>
  );
}

function Prediction({ activity, onPrediction }: { activity: ProjectileLearningActivity; onPrediction: (choiceId: string) => void }) {
  return (
    <div className="guided-block">
      <p className="guided-question">{activity.question}</p>
      <div className="guided-choices" role="group" aria-label="你的預測">
        {activity.choices.map((choice) => (
          <button key={choice.id} onClick={() => onPrediction(choice.id)}>{choice.label}</button>
        ))}
      </div>
      <p className="guided-mask">先做預測，再揭曉模型的觀測結果。</p>
    </div>
  );
}

function Hints({ session, hints, onChange }: { session: GuidedSession; hints: readonly string[]; onChange: (next: GuidedSession) => void }) {
  return (
    <div className="guided-hints">
      {hints.slice(0, session.hintLevel).map((hint, index) => <p key={hint}><b>提示 {index + 1}</b>{hint}</p>)}
      {session.hintLevel < hints.length && (
        <button onClick={() => onChange(revealNextHint(session, hints.length))}><Lightbulb size={14} /> 顯示提示 {session.hintLevel + 1}</button>
      )}
    </div>
  );
}

function Assumptions({ equalHeight = false }: { equalHeight?: boolean }) {
  return (
    <div className="guided-assumptions" aria-label="模型假設">
      <b>本任務的模型假設</b>
      <span>定值向下重力 · 質點 · 真空 · 水平落地面{equalHeight ? " · 發射與落地同高" : ""}</span>
    </div>
  );
}

export default function GuidedActivities(props: GuidedActivitiesProps) {
  const { activities, session, state, model, cursor } = props;
  const activity = activities.find((item) => item.id === session.activityId) ?? activities[0];
  const partner = model.complementary;
  const partnerPeak = partner ? Math.max(...partner.samples.map((sample) => sample.point.y)) : 0;
  const prediction = activity.choices.find((choice) => choice.id === session.prediction)?.label;

  const completeExplanation = (choice: string) => props.onSessionChange(completeGuidedSession(session, choice));
  const continueToNext = () => {
    if (activity.number < 3) props.onSelectActivity(activities[activity.number].id);
    else props.onClose();
  };

  return (
    <aside className="projectile-side guided-side" data-open="true" aria-labelledby="guided-title">
      <div className="projectile-side-inner guided-inner">
        <div className="guided-head">
          <div><span>探索任務 {activity.number} / 3</span><h2 id="guided-title">{activity.title}</h2></div>
          <button onClick={props.onClose} aria-label="離開探索任務"><X size={16} /></button>
        </div>

        <Progress activities={activities} session={session} onSelectActivity={props.onSelectActivity} />

        <div className="guided-phase" aria-live="polite">
          <span>{PHASE_LABELS[session.phase]}</span>
          {session.phase === "predict" && <Prediction activity={activity} onPrediction={props.onPrediction} />}

          {session.phase !== "predict" && prediction && <p className="guided-prediction"><b>你的預測</b>{prediction}</p>}

          {activity.id === "apex" && session.phase === "manipulate" && (
            <div className="guided-block">
              <p className="guided-question">用下方的時間游標，把拋體移到軌跡最高點附近。</p>
              <p>先看軌跡，也可以打開速度–時間圖找 <code>vᵧ</code> 穿過 0 的位置。判定範圍會保留一些容差，不需要剛好停在單一像素。</p>
              <button onClick={props.onShowComponentChart}>{props.componentChartVisible ? "收合分量圖" : "顯示分量圖"}</button>
              {props.componentChartVisible && <div className="guided-chart">{props.componentChart}</div>}
              <Hints
                session={session}
                onChange={props.onSessionChange}
                hints={["最高點和哪一個速度分量有關？", "看看速度–時間圖中 vᵧ 在哪裡穿過 0。", "可以用 tₐₚₑₓ = vᵧ₀ / g 估計時間。"]}
              />
            </div>
          )}

          {activity.id === "apex" && session.phase === "observe" && (
            <div className="guided-block">
              <p className="guided-question">你已到達最高點附近。比較兩個速度分量：</p>
              <dl className="guided-measures">
                <div><dt>vₓ</dt><dd>{cursor.velocity.x.toFixed(2)} m/s</dd></div>
                <div><dt>vᵧ</dt><dd>{cursor.velocity.y.toFixed(2)} m/s</dd></div>
                <div><dt>總速率</dt><dd>{cursor.acceleration.speed.toFixed(2)} m/s</dd></div>
                <div><dt>向下加速度</dt><dd>{state.gravity.toFixed(2)} m/s²</dd></div>
              </dl>
              <div className="guided-chart">{props.componentChart}</div>
              <button className="primary" onClick={() => props.onSessionChange(advanceToExplanation(session))}>我看到了，繼續 <ArrowRight size={14} /></button>
            </div>
          )}

          {activity.id === "complementary" && session.phase === "observe" && (
            <div className="guided-block">
              <p className="guided-question">兩顆球共用同一個時鐘。播放後注意落點與到達時間。</p>
              <button className="primary" onClick={props.onStartPlayback}>從起點同時播放</button>
              {partner && (
                <div className="guided-table-wrap">
                  <table className="guided-table">
                    <thead><tr><th>觀測量</th><th>30°</th><th>60°</th></tr></thead>
                    <tbody>
                      <tr><th>射程</th><td>{model.groundRange.toFixed(2)} m</td><td>{partner.range.toFixed(2)} m</td></tr>
                      <tr><th>飛行時間</th><td>{model.duration.toFixed(2)} s</td><td>{partner.duration.toFixed(2)} s</td></tr>
                      <tr><th>最高點</th><td>{model.apex.point.y.toFixed(2)} m</td><td>{partnerPeak.toFixed(2)} m</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              <Assumptions equalHeight />
              <button onClick={() => props.onSessionChange(advanceToExplanation(session))}>整理觀測並解釋 <ArrowRight size={14} /></button>
            </div>
          )}

          {activity.id === "elevated" && session.phase === "manipulate" && (
            <div className="guided-block">
              <p className="guided-question">把發射高度 <code>h</code> 從 0 拉到 25 m；其他條件保持不變。</p>
              {props.heightControl}
              <p className="guided-live">目前高度 <b>{state.height.toFixed(1)} m</b> · 目標 25.0 m</p>
              <Hints
                session={session}
                onChange={props.onSessionChange}
                hints={["只改變發射高度，觀察兩個落點是否仍重合。", "比較兩條軌跡多出的下落時間與水平位移。"]}
              />
            </div>
          )}

          {activity.id === "elevated" && session.phase === "observe" && partner && (
            <div className="guided-block">
              <p className="guided-question">落點已分開。這個特定設定中，30° 的水平射程較遠。</p>
              <dl className="guided-measures">
                <div><dt>30° 射程</dt><dd>{model.groundRange.toFixed(2)} m</dd></div>
                <div><dt>60° 射程</dt><dd>{partner.range.toFixed(2)} m</dd></div>
                <div><dt>30° 時間</dt><dd>{model.duration.toFixed(2)} s</dd></div>
                <div><dt>60° 時間</dt><dd>{partner.duration.toFixed(2)} s</dd></div>
                <div className="wide"><dt>模型算出的最佳角 θ*</dt><dd>{model.optimalAngle.toFixed(1)}°（不再是 45°）</dd></div>
              </dl>
              <Assumptions />
              <button className="primary" onClick={() => props.onSessionChange(advanceToExplanation(session))}>比較假設，繼續 <ArrowRight size={14} /></button>
            </div>
          )}

          {session.phase === "explain" && (
            <div className="guided-block">
              <p className="guided-question">哪一個說法最能解釋剛才的觀測？</p>
              <div className="guided-choices" role="group" aria-label="你的解釋">
                {EXPLANATION_CHOICES[activity.id].map((choice) => <button key={choice} onClick={() => completeExplanation(choice)}>{choice}</button>)}
              </div>
            </div>
          )}

          {session.phase === "complete" && (
            <div className="guided-block guided-complete">
              <p className="guided-prediction"><b>你的解釋</b>{session.explanation}</p>
              <div className="guided-conclusion"><b>模型顯示……</b>{EXPLANATIONS[activity.id]}</div>
              {activity.id === "elevated" && (
                <div className="guided-free"><b>★ 改一條假設看看</b><p>離開任務後，可以開啟羽球阻力、切換月球重力、查看全部分量圖，或試試階梯落點。</p></div>
              )}
              <button className="primary" onClick={continueToNext}>{activity.number < 3 ? "下一個任務" : "回到自由探索"} <ArrowRight size={14} /></button>
            </div>
          )}
        </div>

        <div className="guided-footer">
          <button onClick={props.onRestart}><RotateCcw size={14} /> 重新開始此任務</button>
          <span>進度只保留在這次瀏覽中</span>
        </div>
      </div>
    </aside>
  );
}
