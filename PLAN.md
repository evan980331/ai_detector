# AI Writing Analysis and Editing Assistant

## Goal

Build a Traditional Chinese-first web app that accepts pasted text, reports an evidence-limited estimate of AI-writing signals, explains which passages or features influenced the estimate, and offers user-controlled edits for clarity, structure, tone, and correctness.

The editing workflow must not be designed or evaluated to evade AI detectors or misrepresent authorship. Detection output is an uncertain signal, not proof that a person or model wrote a text.

## Product Scope

### MVP

- Paste text into the browser; file upload is optional and deferred until text processing is stable.
- Analyze text on the server through the official Google Gen AI SDK, with the Gemini API key kept server-side.
- Return an estimated score with calibrated wording, uncertainty/limitations, and passage-level observations. Do not present the score as a definitive probability unless calibration data supports that interpretation.
- Offer revision suggestions for readability, coherence, grammar, and preserving the user's intended meaning. The user reviews and accepts changes; never silently replace their text.
- Do not retain submitted text by default, and never include it or credentials in logs.

### Later, only if validated

- Add DOCX/PDF import with explicit file size/type limits and temporary processing. Extract text and discard the original; do not persist uploads by default.
- Evaluate additional languages and academic-writing contexts separately before claiming support.
- Add optional local editing history only with clear user consent and a deletion path.

## Analysis Approach and Evidence

- Treat word/phrase frequency, sentence length and variation, punctuation, repetition, and other linguistic measurements as weak, contextual features. No single feature should determine a result.
- Human writing speed cannot be inferred from a pasted document. Only consider timing data when it is explicitly and voluntarily collected during an editing session, and do not use it as a standalone authorship test.
- Build evaluation sets with documented provenance, consent/licensing, human-written and model-generated samples, multiple genres, and Traditional Chinese coverage.
- Measure false-positive and false-negative rates, precision/recall, calibration, and performance by language and genre. Publish limitations and avoid claims that the tool can prove authorship.
- Keep model output separate from measured statistics. Label Gemini-generated explanations as model interpretations, not independent forensic evidence.

## Proposed Stack

- Next.js App Router, TypeScript, React, and Vercel deployment.
- Official `@google/genai` SDK, called only from server-side route handlers.
- Start with a text-only request/response workflow. Keep model access behind a small server module so provider details are not spread through UI code.
- Add automated unit tests for text preparation, score formatting, validation, and API error handling; add integration checks for the analysis route without requiring a real API key.

## Delivery Plan

1. **Foundation**: confirm product wording and limitations; initialize Next.js/TypeScript, linting, tests, `.gitignore`, and `AGENTS.md`.
2. **Text analysis MVP**: create the input/results workflow, server-side Gemini integration, request validation, rate/size limits, safe error messages, and privacy-preserving logs.
3. **Editing workflow**: show passage-level suggestions and a before/after comparison; let users accept or reject edits; constrain changes to clarity, coherence, grammar, and meaning preservation.
4. **Evaluation**: assemble a documented test corpus, assess language/genre performance and false positives, and revise score wording/calibration before public claims.
5. **Optional file input**: add DOCX/PDF extraction only after confirming Vercel runtime and request limits; test malformed, oversized, and unsupported files.
6. **GitHub and Vercel**: run checks, inspect the final diff, ensure secrets and private sample text are excluded, push the project to `evan980331/ai_detector`, connect that repository to Vercel, configure `GEMINI_API_KEY` as a server-side Vercel environment variable, and verify a production deployment. Do not commit `.env` files or API keys.

## Acceptance Criteria

- User can submit text and receive an understandable, appropriately qualified analysis result.
- User can inspect suggested edits and choose which to apply; original text remains recoverable during the session.
- API keys are only read by server-side code and never exposed in client bundles, logs, or Git history.
- Submitted text is not persisted by default.
- Tests cover invalid/empty/oversized input, API failures, and response formatting.
- Evaluation reports false-positive behavior and documented limitations before public claims are made.
- GitHub contains source and documentation only; Vercel has the required secret configured outside the repository.

## Initial File Layout

```text
ai detector/
├── AGENTS.md
├── PLAN.md
├── README.md
├── .env.example                 # Placeholder names only; no real credentials
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # Text input and analysis results
│   ├── globals.css
│   └── api/
│       ├── analyze/route.ts     # Server-side analysis endpoint
│       └── revise/route.ts      # Editorial revision endpoint, not detector evasion
├── components/
│   ├── text-editor.tsx
│   ├── analysis-summary.tsx
│   ├── passage-feedback.tsx
│   └── revision-review.tsx
├── lib/
│   ├── ai/gemini.ts             # SDK client and server-only prompt calls
│   ├── analysis/                # Feature extraction, score interpretation, schemas
│   ├── text/                    # Normalization and input validation
│   └── security/                # Limits and safe error/log helpers
├── tests/
│   ├── unit/
│   └── api/
├── docs/
│   ├── evaluation.md            # Dataset provenance, metrics, limitations
│   └── deployment.md            # GitHub/Vercel setup and verification
└── public/
```

Optional file parsing should be added under `lib/files/` with focused tests if and when that scope is approved. Do not add upload storage by default.

## 2026-10-17：Gemini HTTP 503 診斷與修復紀錄

### 計畫

第一階段（失敗路徑追查）→ 第二階段（有界重試）→ 第三階段（錯誤分類與診斷）→ 第四階段（模型與環境設定）→ 第五階段（自動化測試）→ 第六階段（test/lint/build 驗收與實測）→ 第七階段（Git 管理）。以下依證據強度分為「程式碼已確認」「有證據支持的判斷」「仍無法驗證」三類。

### 第一階段：追查結果

#### 程式碼已確認的事實

1. **模型設定**：`lib/ai/gemini.ts` 以 `resolveModel()` 決定模型，預設 `gemini-3.1-flash-lite`，`GEMINI_MODEL` 未設或空白時回退預設；`.env.example` 與 `docs/deployment.md` 與此一致。修改後新增格式檢查（無效格式 → `GEMINI_MODEL_INVALID` 設定錯誤），未更動正式預設模型。
2. **每次請求的 Gemini 呼叫**：`analyze` 與 `revise` 各為 `countTokens`（預算計數）→ `reserveInputTokens` 扣減 → `generateContent`（生成），兩階段各自包在 `withGeminiStage(stage, …)` 中，錯誤會帶 stage 傳遞；生成重試前會再次扣減 token 預算。
3. **SDK 行為（讀取 node_modules/@google/genai 2.30.0 原始碼確認）**：預設**不做傳輸層重試**（`apiCall` 中 `if (!retryOptions) return runFetch();`）；重試須經 `httpOptions.retryOptions` 明確開啟，開啓時預設 5 次（含首次）、1s→60s 指數退避、jitter、可重試碼 `[408,429,500,502,503,504]`；**預設無用戶端 timeout**，須以 `httpOptions.timeout` 設定；HTTP 失敗以帶數字 `status` 的 `ApiError` 拋出。
4. **HEAD 版本缺陷（已提交版本）**：`withGeminiStage` 只包一次呼叫**無任何重試**；`safeProviderMessage` 對所有 `GeminiRequestError` 一律回「請查看 Google AI Studio 的用量與模型狀態後重試」，其意義 400/401/404/429 分支實際上為死碼（SDK 錯誤必在中間層被包成 `GeminiRequestError`）；`GeminiRequestError` 丟失原始錯誤訊息（隱私正確）但也丟失可分類資訊，不做分型。
5. **對外狀態碼**：原本所有上游/未知錯誤一律回 `502`；前端 `requestJson` 只顯示 `error` 文字；上游 503 顯示為 502 回應中的文字，前端無從區分錯誤類別。非 JSON 的平台錯誤頁會讓前端顯示 JSON 解析錯誤原文。
6. **環境設定方式**：本機 `.env`（已 gitignore）提供 `GEMINI_API_KEY`；`.env.example` 僅範本值 `add_your_key_to_.env.local`；部署依 `docs/deployment.md` 在 Vercel 專案設定注入（伺服器端）。key 缺失時 `handleTextEndpoint` 先行攔截回 503 設定訊息，`getClient()` 為備援（修改後同時攔截範本值）。
7. **基線測試覆蓋**：15 tests，涵蓋缺 key、輸入長度、generic 錯誤不洩漏與 token-count 503 訊息；**未覆蓋** 429/400/401/404 分類、timeout/network、重試行為、rate limit、token 預算端到端、成功路徑與日誌隱私。

#### 有證據支持的判斷

1. 使用者收到的字串與 HEAD `safeProviderMessage` 的 `GeminiRequestError` 分支完全同構（stage=`文字生成`、`HTTP 503`）⇒ 503 來自上游 `generateContent`，且實際發生在**已部署版本無重試**的情況下（HEAD 無任何重試層，SDK 預設也無重試）。
2. Google 官方文件：`503 UNAVAILABLE` = 服務過載或容量不足，建議指數退避後重試；`429` = 速率/配額限制，兩者應分類處理；無文件支持「模型名稱錯誤會回 503」（無效模型通常為 `404`）。
3. 模型名稱有效性：官方 models 頁面目前列出 `gemini-3.1-flash-lite` 為可用穩定模型（外部文件查證）。本機 dev 實測（見第六階段）以預設模型成功取得 200。

#### 仍無法驗證的假設（需正式環境或權限）

1. 使用者當時 503 的上游根因（服務過載、專案/區域容量、間歇性故障）無法從本機重現或證明。
2. Google AI Studio 用量、配額、即時模型狀態：本專案無讀取權限，**未查證**；已在文件改為由使用者依驗證步驟自行確認。
3. Vercel 正式環境的 `GEMINI_API_KEY`/`GEMINI_MODEL` 實際值與正式部署是否仍回 503：本機無法存取，**未查證**。

### 第二～四階段：設計決策

- **單一重試層**：SDK 傳輸層重試保持預設關閉（原始碼確認其為 opt-in），重試只在 `withGeminiStage` 一層，避免疊加放大呼叫量；同時取得 stage、次數、token 扣減與總時間上限的完整控制。
- **重試參數**：最多 3 次嘗試（原始 1 次＋重試 2 次）；退避 1s → 2s、抖動 `[0.5, 1.5]`；單階段總等待 ≤ 5s；單階段時間預算 40s（< 路由 `maxDuration` 45s）；SDK `httpOptions.timeout` 每次嘗試 15s。
- **可重試**：HTTP `408/429/500/502/503/504`、timeout、網路連線錯誤；**不可重試**：`400/401/403/404`、無法判定型別的錯誤（保守不重試）。
- **安全限制不退化**：rate limit、輸入驗證、JSON Schema 驗證、25k TPM token 預算皆保留；生成重試前重新扣減預算，預算拒絕會中止重試並回既有 429 訊息（測試覆蓋）。
- **錯誤分類與對外狀態碼**：上游 429→`429`；上游 401/403 或設定錯誤→`503`；timeout→`504`；其餘上游（含持續 503）或模型輸出未通過 schema→`502`；輸入驗證 400/413、本機 rate limit 429 維持原狀。
- **診斷**：伺服器端單行結構化 `text_endpoint_error` 日誌（requestId、operation、stage、kind、status、retryable、attempts、durationMs、安全的 errorName/errorCode）；錯誤回應附同 `requestId`。不寫入金鑰、provider 原始訊息、文章內容。
- **前端**：沿用既有 error banner；`requestJson` 改為容忍非 JSON 錯誤頁，改顯分類後的安全訊息（413/429/503/504 各有 fallback 文案）。
- **設定檢查**：key 空白或為 `.env.example` 範本值 → 503 設定錯誤；`GEMINI_MODEL` 格式無效 → 503 設定錯誤（僅驗證存在與字元格式，不暴露金鑰）。

### 第五～六階段：驗收結果（實際執行，2026-10-17）

| 命令 | 結果 |
| --- | --- |
| `npm test` | exit 0：6 個測試檔、**48 tests 全部通過**（新增 gemini-error 18、text-endpoint 16、rate-limit 4、contracts 補充 3） |
| `npm run lint` | exit 0，無錯誤無警告 |
| `npm run build` | exit 0：Compiled successfully、TypeScript 檢查通過、`/api/analyze` 與 `/api/revise` 為動態路由 |
| 本機 `npm run dev` 實測 | `POST /api/analyze` → **200**（應用程式碼 6.4s，回傳完整 JSON 分析）；`POST /api/revise` → **200**（6.9s，回傳 revisedText/changes）；dev 日誌 grep 金鑰/文章 **0 筆** |

測試全部使用 mock/stub，未以測試反覆呼叫真實 API；唯一真實呼叫為上表兩次人工實測。前端元件層（瀏覽器渲染）未新增自動化測試：專案未安裝 jsdom/testing-library，錯誤字串由 endpoint 層測試覆蓋；瀏覽器端 fallback 文案未經 UI 自動化驗證。

### 第七階段：Git

- 僅提交與本任務相關的檔案；`.freebuff/`、`.env`、`.devserver.log`、`tsconfig.tsbuildinfo` 不納入。
- 依 `AGENTS.md` 不推送、不部署、不修改正式環境設定。commit hash 與最終工作目錄狀態在交付回報中列出。

### 未完成/待使用者事項

1. 正式（Vercel）環境變數與生產端 503 是否復現需依 `docs/deployment.md` 的 Manual verification 步驟人工查證；本機無法存取。
2. Google AI Studio 用量、配額與模型即時狀態未查證（需帳號權限）。
3. UI 層「再試一次」按鈕未實作：目前重試在伺服器端完成，重試耗盡後需由使用者重新送出。
4. 若要跨 Vercel serverless 實例共用 rate limit/token 預算，仍需共用儲存（如 Redis），本次未變更。

## 2026-10-17：P0 提交確認、驗收與部署準備

### 本階段範圍

只做修正提交的確認、驗收、推送與部署準備；未開始任何 UI 改版、付費功能、資料庫變更或新依賴。

### Git 檢查

- 分支 `master`，起始 HEAD `2b7446c`（完整 hash `2b7446c692116f703da8b7fe4f4a118dd3959fb7`），當時相對 `origin/master` ahead 1（尚未推送）。
- `git show --stat 2b7446c` 確認包含 11 個檔案：有界重試與錯誤分類（`lib/ai/gemini-error.ts`）、timeout 與模型設定檢查（`lib/ai/gemini.ts`）、對外狀態碼分類與結構化診斷（`lib/server/text-endpoint.ts`）、前端安全 fallback（`components/editor-workspace.tsx`）、測試 4 檔、`PLAN.md`、`.env.example`、`docs/deployment.md`；逐點 grep 確認重試常數、分類函式、`text_endpoint_error` 診斷與 `httpOptions.timeout` 均在 commit 內。
- 未追蹤：`.devserver.log`（本機 dev server 暫存日誌）、`.freebuff/`（平台資料）——刻意不納入提交；`.env` 持續被 ignore，全程未輸出任何金鑰。

### 本階段驗收（實際重新執行）

| 命令 | 結果 |
| --- | --- |
| `npm test` | exit 0：6 個測試檔、48 tests 全部通過 |
| `npm run lint` | exit 0，無錯誤 |
| `npm run build` | exit 0：編譯與 TypeScript 檢查通過，`/api/analyze`・`/api/revise` 為動態路由 |

### 推送與部署

- 授權：使用者在本階段明確授權推送必要提交；`AGENTS.md` 要求部署前通過測試與 diff 檢查（已完成）。
- 推送：`git push origin master`；推送後以 `git ls-remote` 核對遠端 hash（實際結果見交付回報）。
- 部署：本專案部署流程為 GitHub → Vercel。本機未連結 Vercel 專案（無 `.vercel/`），無法從本機確認部署狀態或對應 commit → **標記為未驗證**，需使用者於 Vercel 儀表板確認（若已連接 Git 集成，push 會自動觸發部署）。本階段未在本機執行部署指令，未修改任何正式環境變數。

### 手動測試清單

見交付回報（8 項：分析成功、修改成功、輸入驗證提示、載入狀態、暫時性 503 有限重試後恢復、持續失敗時的分類與下一步、窄螢幕排版、開發者工具/伺服器日誌隱私檢查）。其中「暫時性 503 自動恢復」在沒有實際 503 的情況下**尚未實際觸發驗證**（刻意不對正式 API 施加故障或大量請求）。

### 本階段未驗證／已知限制

1. 正式（Vercel）部署是否成功、對應 commit、正式環境的 `GEMINI_API_KEY`/`GEMINI_MODEL`：需使用者確認。
2. Google AI Studio 用量、配額與模型即時狀態：需帳號權限，未查證。
3. 前端 DOM 層自動化測試仍缺（專案無 jsdom）；錯誤字串已由 endpoint 層測試覆蓋。
4. 可選強化（依本階段停止條件未執行）：`requestJson` 在「HTTP 200 但 body 非 JSON」時目前回傳空物件，極端情況下會讓結果面板存到空資料；建議後續改為拋出安全訊息並補測試。