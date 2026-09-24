import type { LearningState } from "../../models/electrostatic-learning.ts";

/**
 * Electrostatics-owned guided attention contract. From the learner's current state it derives the
 * one thing to look at now, where it is, and one sentence saying what to inspect. Presentation
 * only: it reads no model output and never decides what evidence is visible (EvidencePolicy does).
 * Instructions describe where to look, never what the answer is, so they are safe before commit.
 */
export type GuidedFocusTarget =
  | "task"
  | "probe-on-canvas"
  | "particle-on-canvas"
  | "probe-readout"
  | "particle-readout"
  | "source-control"
  | "time-controls";

export interface GuidedFocus {
  readonly target: GuidedFocusTarget;
  /** Canvas object that carries the persistent halo, if any. */
  readonly canvasAnchor: "probe" | "particle" | null;
  readonly instruction: string;
  /** Changes only when the learner reaches a new observation step. */
  readonly key: string;
}

function focus(target: GuidedFocusTarget, canvasAnchor: GuidedFocus["canvasAnchor"], instruction: string, key: string): GuidedFocus {
  return { target, canvasAnchor, instruction, key };
}

export function guidedFocusFor(learning: LearningState): GuidedFocus {
  const stage = "stage" in learning ? learning.stage : "";
  const reveal = "reveal" in learning ? learning.reveal : 0;
  const key = `${learning.activity}-${learning.step}-${stage}-${reveal}`;

  if (learning.activity === "A") {
    switch (learning.step) {
      case "predict":
      case "transfer-predict":
        return focus("task", "probe", "看畫布上的測量點，選出你預測那裡合電場指向的方向。", key);
      case "observe":
      case "transfer-observe":
        if (learning.reveal === 1) return focus("probe-on-canvas", "probe", "先看測量點旁兩顆來源電荷各自造成的電場方向。", key);
        if (learning.reveal === 2) return focus("probe-on-canvas", "probe", "再看兩支箭頭相加後的合電場。", key);
        return focus("probe-readout", "probe", "最後看測量讀值中的 Eₓ、Eᵧ 與方向，對照你的預測。", key);
      case "explain":
        return focus("probe-readout", "probe", "對照測量讀值表裡每個來源 Eₓ、Eᵧ 的正負號。", key);
      default:
        return focus("task", null, "任務完成。", key);
    }
  }

  if (learning.activity === "B") {
    switch (learning.step) {
      case "predict":
      case "transfer-predict":
        return focus("task", "probe", "看畫布上的測量點，預測它所在位置的合電場。", key);
      case "observe":
      case "transfer-observe": {
        const each = learning.step === "observe" ? "兩顆" : "四顆";
        return learning.reveal === 1
          ? focus("probe-on-canvas", "probe", `先看測量點旁${each}來源電荷各自造成的電場方向。`, key)
          : focus("probe-on-canvas", "probe", "再看這些貢獻相加後，測量點還剩下多少合電場。", key);
      }
      case "manipulate":
        return focus("probe-on-canvas", "probe", "拖曳測量點，找出合電場 |E| 接近 0 的位置；也可以先改變右側電荷大小再找。", key);
      default:
        return focus("task", null, "任務完成。", key);
    }
  }

  if (learning.step === "complete") return focus("task", null, "任務完成。", key);
  if (learning.step === "predict") {
    if (learning.stage === "c4") return focus("task", "particle", "注意向上的初速度 v，再預測軌跡與初始加速度 a。", key);
    if (learning.stage === "c1") return focus("task", "particle", "看畫布上的測試電荷，預測它一開始的加速度方向。", key);
    return focus("task", "particle", "想一想：測試電荷改變後，E、F、a 各會怎麼變？", key);
  }
  if (learning.stage === "c4") return focus("time-controls", "particle", "按播放，觀察速度方向怎麼改變。", key);
  if (learning.stage === "c1") return focus("particle-readout", "particle", "比較讀值裡 E、F、a 的方向。", key);
  return focus("particle-readout", "particle", "看比較表與測量讀值：E、F、a 哪個不變、哪個改變？", key);
}
