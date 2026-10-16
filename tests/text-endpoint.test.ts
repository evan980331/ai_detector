import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTextEndpoint } from "../lib/server/text-endpoint";
import { GeminiRequestError } from "../lib/ai/gemini-error";

afterEach(() => vi.unstubAllEnvs());

describe("handleTextEndpoint", () => {
  it("returns a setup message when no API key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const processText = vi.fn();
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "這是供 API 測試使用的繁體中文文章內容，長度已經超過八十字的最低限制，並且確保在未設定 Gemini key 的情況下不會呼叫外部服務。".repeat(2) }),
    });

    const response = await handleTextEndpoint(request, "analyze", processText);

    expect(response.status).toBe(503);
    expect(processText).not.toHaveBeenCalled();
  });

  it("rejects short text before invoking the model callback", async () => {
    const processText = vi.fn();
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "太短" }),
    });

    const response = await handleTextEndpoint(request, "analyze", processText);

    expect(response.status).toBe(400);
    expect(processText).not.toHaveBeenCalled();
  });

  it("returns a generic upstream error without leaking text or error details", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-placeholder");
    const privateText = "private sample content";
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "這是供 API 測試使用的繁體中文文字，長度超過最低字數限制，以確認錯誤處理不會洩漏文章內容或外部服務細節。".repeat(2) }),
    });

    const response = await handleTextEndpoint(request, "analyze", async () => {
      throw new Error(`provider failed ${privateText}`);
    });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).not.toContain(privateText);
    expect(body).not.toContain("provider failed");
  });

  it("shows a safe authentication hint without exposing provider error details", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-placeholder");
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "這是供 API 測試使用的繁體中文文章內容，長度已經超過八十字的最低限制，確認 API 認證失敗時只回傳安全提示。".repeat(2) }),
    });

    const response = await handleTextEndpoint(request, "analyze", async () => {
      throw Object.assign(new Error("private provider detail"), { status: 401 });
    });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain("認證失敗");
    expect(body).not.toContain("private provider detail");
  });

  it("identifies a token-count 503 without returning raw provider details", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-placeholder");
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "這是供 API 測試使用的繁體中文文章內容，長度已經超過八十字的最低限制，確認 token 計數服務失敗時可以顯示階段和 HTTP 狀態。".repeat(2) }),
    });

    const response = await handleTextEndpoint(request, "analyze", async () => {
      throw new GeminiRequestError("countTokens", 503);
    });
    const body = await response.text();

    expect(body).toContain("輸入 token 計數");
    expect(body).toContain("HTTP 503");
    expect(body).not.toContain("API key");
  });
});