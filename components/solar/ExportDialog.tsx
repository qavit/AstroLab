"use client";

import Image from "next/image";
import { Download, Eye, FolderOpen, X } from "lucide-react";
import type { ExportMode, ExportTarget } from "@/models/solar";

type Props = {
  target: ExportTarget;
  mode: ExportMode;
  lineWidth: number;
  includeShadowTimes: boolean;
  preview: string;
  directoryName: string;
  onTargetChange: (target: ExportTarget) => void;
  onModeChange: (mode: ExportMode) => void;
  onLineWidthChange: (width: number) => void;
  onIncludeShadowTimesChange: (include: boolean) => void;
  onChooseDirectory: () => void;
  onSave: () => void;
  onClose: () => void;
};

export default function ExportDialog({
  target, mode, lineWidth, includeShadowTimes, preview, directoryName,
  onTargetChange, onModeChange, onLineWidthChange, onIncludeShadowTimesChange,
  onChooseDirectory, onSave, onClose,
}: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header>
          <div><Download size={19} /><strong id="export-title">匯出教材圖</strong></div>
          <button onClick={onClose} aria-label="關閉匯出"><X size={18} /></button>
        </header>
        <div className="export-body">
          <div className="export-options">
            <label><span>輸出內容</span>
              <select value={target} onChange={(event) => onTargetChange(event.target.value as ExportTarget)}>
                <option value="global">地心模型</option>
                <option value="local">觀察者模型</option>
                <option value="shadow">當日竿影圖</option>
              </select>
            </label>
            <label><span>呈現方式</span>
              <select value={mode} onChange={(event) => onModeChange(event.target.value as ExportMode)}>
                <option value="color">螢幕所見・彩色</option>
                <option value="grayscale">螢幕所見・灰階</option>
                <option value="line">黑白線稿</option>
              </select>
            </label>
            {mode === "line" && (
              <label><span>線條粗細 <b>{lineWidth}</b></span>
                <input type="range" min="1" max="4" step="1" value={lineWidth} onChange={(event) => onLineWidthChange(Number(event.target.value))} />
              </label>
            )}
            {target === "shadow" && (
              <label className="export-check">
                <input type="checkbox" checked={includeShadowTimes} onChange={(event) => onIncludeShadowTimesChange(event.target.checked)} />
                標記竿影時間
              </label>
            )}
            <div className="directory-choice">
              <span>輸出目錄</span>
              <button onClick={onChooseDirectory}><FolderOpen size={15} />{directoryName}</button>
            </div>
            <p>黑白線稿會保留太陽實心圓與外框，適合講義排版及影印。</p>
          </div>
          <div className="export-preview">
            <div><Eye size={14} />輸出預覽</div>
            {preview
              ? <Image src={preview} alt="即將輸出的教材圖預覽" width={960} height={600} unoptimized />
              : <div className="preview-loading">建立預覽中…</div>}
          </div>
        </div>
        <footer>
          <button onClick={onClose}>取消</button>
          <button className="primary-action" onClick={onSave}><Download size={15} />儲存 PNG</button>
        </footer>
      </section>
    </div>
  );
}
