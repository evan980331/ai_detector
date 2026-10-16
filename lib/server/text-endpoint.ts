import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { textInputSchema } from "../analysis/contracts";
import { checkRateLimit, clientAddress } from "../security/rate-limit";
import { TokenBudgetExceeded } from "../security/token-budget";

type Operation = "analyze" | "revise";

function safeProviderMessage(error: unknown, operation: Operation): string {
  if (error instanceof ZodError) return "模型回傳格式無法驗證，請稍後重試。";

  const status = typeof error === "object" && error !== null && "status" in error
    ? error.status
    : undefined;

  if (status === 400) return "Gemini API 拒絕此請求（400）；請確認模型名稱與 JSON 輸出設定。";
  if (status === 401 || status === 403) return "Gemini API 認證失敗；請確認 GEMINI_API_KEY 有效，且該 key 可使用 Gemini API。";
  if (status === 404) return "找不到指定的 Gemini 模型（404）；請檢查 GEMINI_MODEL 設定。";
  if (status === 429) return "Gemini API 額度或速率限制已達上限（429）；請稍後再試或檢查 Google AI Studio 用量。";
  if (typeof status === "number" && status >= 500) return "Gemini API 目前服務異常，請稍後再試。";

  const service = operation === "analyze" ? "分析" : "編輯";
  return `${service}服務暫時無法使用，請稍後重試。文章內容不會寫入錯誤紀錄。`;
}

export async function handleTextEndpoint<T>(
  request: Request,
  operation: Operation,
  processText: (text: string) => Promise<T>,
) {
  const limit = checkRateLimit(`${operation}:${clientAddress(request)}`);
  if (!limit.allowed) {
    return NextResponse.json({ error: "請求次數過多，請稍後再試。" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 50_000) return NextResponse.json({ error: "請求內容過大。" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請提供有效的 JSON 內容。" }, { status: 400 });
  }

  const input = textInputSchema.safeParse(body);
  if (!input.success) {
    const tooLong = input.error.issues.some((issue) => issue.code === "too_big");
    return NextResponse.json({ error: tooLong ? "文字超過 12,000 字上限。" : "請輸入至少 80 字的文章內容。" }, { status: tooLong ? 413 : 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "尚未設定 Gemini API key，請在本機 .env.local 或 Vercel 伺服器環境變數中設定。" }, { status: 503 });
  }

  try {
    return NextResponse.json(await processText(input.data.text));
  } catch (error) {
    if (error instanceof TokenBudgetExceeded) {
      const errorMessage = error.reason === "request_too_large"
        ? "這段文字超過單次 25,000 TPM 預算，請縮短內容後再試。"
        : "目前每分鐘輸入 token 預算已滿，請稍後再試。";
      const headers = error.retryAfter > 0 ? { "Retry-After": String(error.retryAfter) } : undefined;
      return NextResponse.json({ error: errorMessage }, { status: 429, headers });
    }
    return NextResponse.json({ error: safeProviderMessage(error, operation) }, { status: 502 });
  }
}