# AstroLab

互動式科學模型平台的第一版專案。首個模組「太陽、天球與竿影」把地心天球、觀察者天空、季節日行跡與竿影放在同一份同步狀態中。

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Structure

- `lib/science/`: 純科學計算與座標轉換，不依賴 DOM 或渲染
- `lib/render/`: 與模型無關的 Three.js 基礎層（viewport、繪圖原件、拖曳、匯出）
- `models/`: 各模型的狀態、預設值、時間演化與衍生量
- `components/`: 同步互動視圖與控制介面
- `docs/architecture.md`: 平台分層、相依方向及各模型的設計取捨

太陽模型的赤緯仍採課堂用的平滑近似式（全年誤差在 2° 以內）。需要真實星曆的部分改走 `lib/science/ephemeris.ts` —— 全平台唯一接觸 `astronomy-engine` 的檔案，由測試強制維持。
