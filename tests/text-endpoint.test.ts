import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleTextEndpoint } from "../lib/server/text-endpoint";
import { GeminiRequestError } from "../lib/ai/gemini-error";
import { TokenBudgetExceeded } from "../lib/security/token-budget";
import { analysisResultSchema } from "../lib/analysis/contracts";

const VALID_TEXT = "這是供 API 測試使用的繁體中文文章內容，長度超過八十個字的最低限制，用來確認錯誤處理路徑不會洩漏任何內容。".repeat(2);
const API_KEY = "AIzaTEST_ONLY_SECRET_KEY_DO_NOT_LEAK";

let addressCounter = 0;

function post(text = VALID_TEXT) {
  addressCounter += 1;
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.7.0.${addressCounter}`,
    },
    body: JSON.stringify({ text }),
  });
}

function geminiFailure(detail: Partial<ConstructorParameters<typeof GeminiRequestError>[0]> = {}) {
  return new GeminiRequestError({
    stage: "generateContent",
    kind: "http",
    status: 503,
    retryable: true,
    attempts: 3,
    durationMs: 1_500,
    ...detail,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Keep the structured failure log out of normal test output; the dedicated
  // diagnostics test below re-spies to assert on the payload.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("handleTextEndpoint", () => {
  it("returns a setup message when no API key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const processText = vi.fn();

    const response = await handleTextEndpoint(post(), "analyze", processText);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("尚未設定 Gemini API key");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(processText).not.toHaveBeenCalled();
  });

  it("rejects short and oversized text before invoking the model callback", async () => {
    const processText = vi.fn();

    const shortResponse = await handleTextEndpoint(post("太短"), "analyze", processText);
    expect(shortResponse.status).toBe(400);

    const longResponse = await handleTextEndpoint(post("字".repeat(12_001)), "analyze", processText);
    expect(longResponse.status).toBe(413);

    expect(processText).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before invoking the model callback", async () => {
    const processText = vi.fn();
    addressCounter += 1;
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.0.${addressCounter}` },
      body: "{ not json",
    });

    const response = await handleTextEndpoint(request, "analyze", processText);

    expect(response.status).toBe(400);
    expect(processText).not.toHaveBeenCalled();
  });

  it("returns the model result unchanged on the success path", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);
    const payload = { signalIndex: 42, summary: "摘要", observations: [], disclaimer: "聲明", metrics: {} };

    const response = await handleTextEndpoint(post(), "analyze", async () => payload);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(payload);
  });

  it("returns a generic upstream error without leaking text or error details", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);
    const privateText = "private sample content";

    const response = await handleTextEndpoint(post(), "analyze", async () => {
      throw new Error(`provider failed ${privateText}`);
    });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).not.toContain(privateText);
    expect(body).not.toContain("provider failed");
  });

  it("maps a raw 401 to a configuration error status without exposing details", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const response = await handleTextEndpoint(post(), "analyze", async () => {
      throw Object.assign(new Error("private provider detail"), { status: 401 });
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("認證失敗");
    expect(body).toContain("GEMINI_API_KEY");
    expect(body).not.toContain("private provider detail");
  });

  it("identifies a token-count 503 with stage, status, and retry count", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const response = await handleTextEndpoint(post(), "analyze", async () => {
      throw geminiFailure({ stage: "countTokens" });
    });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain("輸入 token 計數");
    expect(body).toContain("HTTP 503");
    expect(body).toContain("已自動重試 2 次");
    expect(body).not.toContain("API key");
  });

  it("reports a persistent generation 503 without blaming quota or claiming checks", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const response = await handleTextEndpoint(post(), "analyze", async () => {
      throw geminiFailure();
    });
    const raw = await response.text();
    const body = JSON.parse(raw) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).toContain("文字生成");
    expect(body.error).toContain("HTTP 503");
    expect(body.error).toContain("已自動重試 2 次");
    expect(body.error).toContain("稍後再試");
    expect(body.error).not.toContain("Google AI Studio");
    expect(body.error).not.toMatch(/配額不足|已檢查/);
    expect(raw).not.toContain(API_KEY);
  });

  it("answers upstream rate limiting with our own 429", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const response = await handleTextEndpoint(post(), "analyze", async () => {
      throw geminiFailure({ status: 429 });
    });
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toContain("429");
    expect(body.error).toContain("配額");
    expect(body.error).toContain("已自動重試 2 次");
  });

  it("answers timeouts with 504 and network failures with 502", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const timeoutResponse = await handleTextEndpoint(post(), "analyze", async () => {
      throw geminiFailure({ kind: "timeout", status: undefined });
    });
    expect(timeoutResponse.status).toBe(504);
    expect((await timeoutResponse.json()).error).toContain("逾時");

    const networkResponse = await handleTextEndpoint(post(), "analyze", async () => {
      throw geminiFailure({ kind: "network", status: undefined });
    });
    expect(networkResponse.status).toBe(502);
    expect((await networkResponse.json()).error).toContain("連線至 Gemini API");
  });

  it("points at GEMINI_MODEL for a 404 and at request setup for a 400", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const notFound = await handleTextEndpoint(post(), "analyze", async () => {
      throw geminiFailure({ status: 404, retryable: false, attempts: 1 });
    });
    expect(notFound.status).toBe(502);
    expect((await notFound.json()).error).toContain("GEMINI_MODEL");

    const badRequest = await handleTextEndpoint(post(), "analyze", async () => {
      throw geminiFailure({ status: 400, retryable: false, attempts: 1 });
    });
    expect(badRequest.status).toBe(502);
    expect((await badRequest.json()).error).toContain("400");
  });

  it("keeps the dedicated token-budget handling with Retry-After", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const windowFull = await handleTextEndpoint(post(), "analyze", async () => {
      throw new TokenBudgetExceeded("window_full", 42);
    });
    expect(windowFull.status).toBe(429);
    expect(windowFull.headers.get("Retry-After")).toBe("42");
    expect((await windowFull.json()).error).toContain("token 預算已滿");

    addressCounter += 1;
    const tooLarge = await handleTextEndpoint(post(), "analyze", async () => {
      throw new TokenBudgetExceeded("request_too_large", 0);
    });
    expect(tooLarge.status).toBe(429);
    expect((await tooLarge.json()).error).toContain("25,000 TPM");
  });

  it("keeps failed model output schema validation safe and classified", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);
    let modelOutputError: unknown;
    try {
      analysisResultSchema.parse({ signalIndex: 0 });
    } catch (caught) {
      modelOutputError = caught;
    }

    const response = await handleTextEndpoint(post(), "analyze", async () => {
      throw modelOutputError;
    });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain("模型回傳格式無法驗證");
    expect(body).not.toContain(VALID_TEXT.slice(0, 30));
  });

  it("labels revise failures for the editing flow", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);

    const response = await handleTextEndpoint(post(), "revise", async () => {
      throw new Error("unexpected shape");
    });

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("編輯服務暫時無法使用");
  });

  it("logs safe diagnostics without the API key, provider message, or article text", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const marker = "私人段落標記內容";

    const response = await handleTextEndpoint(post(`${VALID_TEXT}${marker}`), "analyze", async () => {
      throw geminiFailure({ durationMs: 1_234 });
    });
    const raw = await response.text();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedRaw = String(logSpy.mock.calls[0]?.[0]);
    const logged = JSON.parse(loggedRaw) as Record<string, unknown>;
    expect(logged).toMatchObject({
      event: "text_endpoint_error",
      operation: "analyze",
      stage: "generateContent",
      kind: "http",
      status: 503,
      retryable: true,
      attempts: 3,
      durationMs: 1_234,
    });
    expect(logged.requestId).toMatch(/^[0-9a-f-]{36}$/u);

    for (const forbidden of [API_KEY, marker, "provider private"]) {
      expect(loggedRaw).not.toContain(forbidden);
      expect(raw).not.toContain(forbidden);
    }
  });

  it("applies the per-client rate limit with a Retry-After hint", async () => {
    vi.stubEnv("GEMINI_API_KEY", API_KEY);
    const processText = vi.fn(async () => ({ ok: true }));
    addressCounter += 1;
    const url = "http://localhost/api/analyze";
    const headers = { "Content-Type": "application/json", "x-forwarded-for": `10.8.0.${addressCounter}` };
    const send = () => new Request(url, { method: "POST", headers, body: JSON.stringify({ text: VALID_TEXT }) });

    let lastResponse: Response | undefined;
    for (let index = 0; index < 13; index += 1) {
      lastResponse = await handleTextEndpoint(send(), "analyze", processText);
    }

    expect(processText).toHaveBeenCalledTimes(12);
    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.headers.get("Retry-After")).toBeTruthy();
  });
});