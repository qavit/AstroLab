# AstroLab

互動式科學模型平台的第一版專案。首個模組「太陽、天球與竿影」把地心天球、觀察者天空、季節日行跡與竿影放在同一份同步狀態中。

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Structure

- `lib/science/solar.ts`: 純天文與座標計算
- `components/SolarLab.tsx`: 互動控制及同步 3D 視圖
- `docs/architecture.md`: 平台分層及下一階段整合方式

Current calculations use a classroom approximation for solar declination. A future precision mode can adopt Astronomy Engine without changing the view contract.
