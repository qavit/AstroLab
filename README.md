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

## Deployment

Kakau Lab 部署為一個自管的 Cloudflare Worker，名稱 `kakau-lab`。`wrangler.jsonc` 是唯一的部署設定來源：`vite.config.ts` 以 `configPath` 指向它，所以 dev 跑的 runtime 與 `wrangler deploy` 上線的設定是同一份。

### 首次設定（每台機器一次）

```bash
npx wrangler login     # 開瀏覽器登入 Cloudflare，不需要把 token 放進指令或檔案
npx wrangler whoami    # 確認帳號；若有多個帳號，設定 CLOUDFLARE_ACCOUNT_ID
```

### 部署

```bash
npm run deploy
```

**必須用 `npm run deploy`，不要直接跑 `npx vinext deploy`。** `vinext deploy` 會直接呼叫 Vite builder，不會經過 `npm run build`，因此 `prebuild` 的 MathJax 複製步驟不會執行；`npm run deploy` 的 `predeploy` hook 補上這一步。少了它，Model 07 的理論筆記在正式環境不會顯示任何數學式（`public/mathjax/` 是 gitignored 的建置產物，乾淨 clone 上並不存在）。`tests/deploy-config.test.mjs` 會擋住這個回歸。

不上傳、只驗證設定與打包產物：

```bash
npm run deploy:dry                  # 只生成/檢查設定檔
npx wrangler deploy --dry-run       # 完整打包但不上傳（不需要 Cloudflare 認證）
```

### 驗證

部署後 Cloudflare 會回一個 `https://kakau-lab.<subdomain>.workers.dev` 網址。最小驗收：catalog 回 200 且顯示 8 個模型、01–07 各自載入、Model 08 連到 `https://kakau.tw/lab/interference`、Model 07 的 `/projectile/notes` 數學式有算繪。

### Rollback

```bash
npx wrangler deployments status         # 目前線上是哪一版
npx wrangler deployments list           # 最近 10 次部署與其 version ID
npx wrangler rollback <version-id>      # 回到該版本；省略 ID 則回到前一版
```

Cloudflare 保留既有版本，rollback 不需要重新建置。另一條路是 checkout 上一個已知良好的 commit 再跑一次 `npm run deploy`。

### 備註

- `compatibility_date` 釘選在 `2026-05-15`，對應安裝的 `workerd 1.20260515.1`，也就是所有 dev/build 實際跑過的 runtime。升級時應同步調整並重測。
- 目前沒有宣告 D1／R2／KV 等 binding，因為這個應用不需要持久化狀態。
- 沒有宣告 Cloudflare Images binding：`next/image` 僅用於匯出預覽且帶 `unoptimized`，不會走影像最佳化端點；要啟用時需先在帳號開通 Cloudflare Images，再於 `wrangler.jsonc` 加上 `images` binding。
- `.openai/hosting.json` 是早期 OpenAI Site Creator 部署留下的歷史檔案，**已不參與任何生產設定**，保留僅為記錄。

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
