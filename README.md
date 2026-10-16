# 字間

繁體中文 AI 寫作訊號分析與編輯輔助工具。分析結果是未校準的模型觀察，不是作者身分鑑定；編輯建議以清晰度、連貫性、文法與原意保留為目標。

## 本機執行

需求：Node.js 20 或更新版本。

1. 安裝依賴：`npm install`
2. 複製 `.env.example` 為 `.env.local`，設定 `GEMINI_API_KEY`。API key 只在伺服器端使用，勿提交至 Git。
3. 啟動：`npm run dev`
4. 開啟 `http://localhost:3000`

沒有 API key 時，介面仍可瀏覽，但分析與編輯 API 會回覆未設定提示。

## 驗證

- `npm test`
- `npm run lint`
- `npm run build`

## 部署

部署流程與環境變數設定請見 [docs/deployment.md](docs/deployment.md)。評估限制與資料集規範請見 [docs/evaluation.md](docs/evaluation.md)。
