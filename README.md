# AstroLab

互動式科學模型平台。這個 repo 是 **Kakau Lab** 平台的技術基礎與前身 —— `qavit/AstroLab` 這個名稱是歷史沿革，使用者看到的正式產品名稱是 **Kakau Lab**。Repo 改名是未來可選項，不是本階段（Stage 0）的 blocker。

首個模組「太陽、天球與竿影」把地心天球、觀察者天空、季節日行跡與竿影放在同一份同步狀態中；目前平台共有 8 個互動模型，見 `lib/labs/registry.ts`。

## Kakau Lab / Kakau Web 整合邊界

- **Kakau Web**（`https://kakau.tw`）：品牌、內容、資源與輕量原生 lab（例如雙點波源干涉 `https://kakau.tw/lab/interference`），扮演 SEO / 導客的角色。
- **Kakau Lab app**（本 repo，目標網域 `https://lab.kakau.tw`）：較重的互動科學模型、React 狀態應用、Three.js 與多視圖同步視覺化。

兩者是刻意分開的 runtime。「整合產品」不代表「整合 framework」——本階段不合併 runtime、不搬移模型、不重寫既有的 interference lab。目前 `kakau.tw/lab/interference` 的網址維持不變，不搬到 `lab.kakau.tw`。詳見 `docs/architecture.md`。

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Structure

- `lib/science/`: 純科學計算與座標轉換，不依賴 DOM 或渲染
- `lib/render/`: 與模型無關的 Three.js 基礎層（viewport、繪圖原件、拖曳、匯出）
- `lib/labs/registry.ts`: Kakau Lab 的 model registry —— 純資料，不 import React / lucide-react / Three.js
- `models/`: 各模型的狀態、預設值、時間演化與衍生量
- `components/`: 同步互動視圖與控制介面（`ModelCatalog.tsx` 完全由 registry render）
- `docs/architecture.md`: 平台分層、相依方向、各模型的設計取捨，以及 Kakau Lab / Kakau Web 的部署邊界

太陽模型的赤緯仍採課堂用的平滑近似式（全年誤差在 2° 以內）。需要真實星曆的部分改走 `lib/science/ephemeris.ts` —— 全平台唯一接觸 `astronomy-engine` 的檔案，由測試強制維持。

## Model registry

`lib/labs/registry.ts` 匯出 `LabManifest[]`，是 catalog 顯示、路由與未來跨產品聚合的唯一資料來源。Registry 本身是機器可讀的 pure data：icon、card art 等呈現細節一律以字串 key 儲存，由 `components/ModelCatalog.tsx` 這一層做字串到元件的 mapping。

長期而言，每個 Kakau Lab model 應該能交代：

- `assumptions`（模型假設了什麼）
- `approximations`（哪裡是近似而非精確解）
- `validity`（適用範圍）
- `verification`（如何驗證 / 有哪些不變量）

這四個欄位已經預留在 `LabManifest` 的型別中，但 Stage 0 沒有替既有 7 個模型補齊，屬於未來（Stage 0.1+）的工作，不是本階段的 blocker。
