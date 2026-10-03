"use client";
import LabInfoDialog from "../overlays/LabInfoDialog";
import TheoryNotes from "./TheoryNotes";
export default function ModelInfoOverlay({ onClose }: { onClose: () => void }) {
  return <LabInfoDialog title="靜電場的理論、模型與計算" onClose={onClose}><TheoryNotes /></LabInfoDialog>;
}
