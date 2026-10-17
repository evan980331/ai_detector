import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { textInputSchema } from "../analysis/contracts";
import { checkRateLimit, clientAddress } from "../security/rate-limit";
import { TokenBudgetExceeded } from "../security/token-budget";
import { classifyGeminiError, GeminiRequestError, type GeminiStage } from "../ai/gemini-error";

type Operation = "analyze" | "revise";

/**
 * Our own sentinel error codes are fixed uppercase constants, so they are
 * safe to log. Any other provider/model message may contain submitted text
 * and is never logged.
 */
function safeErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  return /^[A-Z][A-Z0-9_]{1,60}$/.test(error.message) ? error.message : undefined;
}

type ProviderFailure = {
  kind: "http" | "timeout" | "network" | "unknown";
  status?: number;
  retryable: boolean;
  attempts: number;
  stage?: GeminiStage;
  durationMs?: number;
};

function readProviderFailure(error: unknown): ProviderFailure {
  if (error instanceof GeminiRequestError) {
    return {
      kind: error.kind,
      status: error.status,
      retryable: error.retryable,
      attempts: error.attempts,
      stage: error.stage,
      durationMs: error.durationMs,
    };
  }
  return { ...classifyGeminiError(error), attempts: 1 };
}

function stageLabel(stage?: GeminiStage): string {
  if (stage === "countTokens") return "輸入 token 計數";
  if (stage === "generateContent") return "文字生成";
  return "服務請求";
}

/**
 * Maps a provider failure onto this API's own contract. The upstream Gemini
 * status is kept for messaging only; our response status stays distinct so
 * clients can tell rate limits (429), misconfiguration (503), upstream
 * failures (502) and timeouts (504) apart.
 */
function describeProviderFailure(failure: ProviderFailure, operation: Operation): {
  status: number;
  error: string;
} {
  const retryNote = failure.attempts > 1 ? `已自動重試 ${failure.attempts - 1} 次，` : "";

  if (failure.kind === "timeout" || failure.status === 408) {
    return {
      status: 504,
      error: `Gemini ${stageLabel(failure.stage)}逾時，${retryNote}請稍後再試；若持續發生，請確認網路與該模型的回應狀態。`,
    };
  }
  if (failure.kind === "network") {
    return {
      status: 502,
      error: `無法連線至 Gemini API，${retryNote}請稍後再試；若持續發生，請檢查伺服器的對外網路。`,
    };
  }

  const status = failure.status;
  if (status === 400) {
    return { status: 502, error: "Gemini API 拒絕此請求（400）；請確認模型名稱與 JSON 輸出設定。" };
  }
  if (status === 401 || status === 403) {
    return {
      status: 503,
      error: `Gemini API 認證失敗（${status}）；請確認伺服器已設定有效的 GEMINI_API_KEY，且該 key 可使用 Gemini API。`,
    };
  }
  if (status === 404) {
    return { status: 502, error: "找不到指定的 Gemini 模型（404）；請檢查 GEMINI_MODEL 是否為可用的模型名稱。" };
  }
  if (status === 429) {
    return {
      status: 429,
      error: `Gemini API 速率或配額限制（429），${retryNote}請稍後再試或檢查專案配額上限。`,
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      status: 502,
      error: `Gemini ${stageLabel(failure.stage)}失敗（HTTP ${status}）。${retryNote}請稍後再試；若持續發生，請查看 Google 官方服務狀態與該模型目前的可用性。文章內容不會寫入錯誤紀錄。`,
    };
  }

  const service = operation === "analyze" ? "分析" : "編輯";
  return { status: 502, error: `${service}服務暫時無法使用，請稍後重試。文章內容不會寫入錯誤紀錄。` };
}

function describeUnknownFailure(error: unknown, operation: Operation): {
  status: number;
  error: string;
} {
  if (error instanceof ZodError) {
    return { status: 502, error: "模型回傳格式無法驗證，請稍後重試。" };
  }
  const code = safeErrorCode(error);
  if (code === "GEMINI_NOT_CONFIGURED") {
    return { status: 503, error: "尚未設定 Gemini API key，請在本機 .env.local 或 Vercel 伺服器環境變數中設定。" };
  }
  if (code === "GEMINI_MODEL_INVALID") {
    return { status: 503, error: "GEMINI_MODEL 格式無效，請在伺服器環境變數中改為可用的模型名稱。" };
  }
  if (code === "TOKEN_COUNT_UNAVAILABLE") {
    return { status: 502, error: "Gemini 未回傳 token 計數，請稍後再試。文章內容不會寫入錯誤紀錄。" };
  }
  if (code === "EMPTY_MODEL_RESPONSE") {
    return { status: 502, error: "Gemini 回傳空白內容，請稍後再試。文章內容不會寫入錯誤紀錄。" };
  }
  const service = operation === "analyze" ? "分析" : "編輯";
  return { status: 502, error: `${service}服務暫時無法使用，請稍後重試。文章內容不會寫入錯誤紀錄。` };
}

/** Structured server-side diagnostics; never includes provider messages, the key, or the text. */
function logFailure(
  requestId: string,
  operation: Operation,
  error: unknown,
  failure: ProviderFailure | undefined,
): void {
  console.error(JSON.stringify({
    event: "text_endpoint_error",
    requestId,
    operation,
    errorName: error instanceof Error ? error.name : typeof error,
    errorCode: safeErrorCode(error),
    stage: failure?.stage,
    kind: failure?.kind,
    status: failure?.status,
    retryable: failure?.retryable,
    attempts: failure?.attempts,
    durationMs: failure?.durationMs,
  }));
}

const MISSING_KEY_ERROR = "尚未設定 Gemini API key，請在本機 .env.local 或 Vercel 伺服器環境變數中設定。";

export async function handleTextEndpoint<T>(
  request: Request,
  operation: Operation,
  processText: (text: string) => Promise<T>,
) {
  const requestId = crypto.randomUUID();
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

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: MISSING_KEY_ERROR, requestId }, { status: 503 });
  }

  try {
    return NextResponse.json(await processText(input.data.text));
  } catch (error) {
    if (error instanceof TokenBudgetExceeded) {
      const errorMessage = error.reason === "request_too_large"
        ? "這段文字超過單次 25,000 TPM 預算，請縮短內容後再試。"
        : "目前每分鐘輸入 token 預算已滿，請稍後再試。";
      const headers = error.retryAfter > 0 ? { "Retry-After": String(error.retryAfter) } : undefined;
      logFailure(requestId, operation, error, undefined);
      return NextResponse.json({ error: errorMessage, requestId }, { status: 429, headers });
    }

    const isGeminiFailure = error instanceof GeminiRequestError || classifyGeminiError(error).kind !== "unknown";
    const failure = isGeminiFailure ? readProviderFailure(error) : undefined;
    const described = failure
      ? describeProviderFailure(failure, operation)
      : describeUnknownFailure(error, operation);
    logFailure(requestId, operation, error, failure);
    return NextResponse.json({ error: described.error, requestId }, { status: described.status });
  }
}