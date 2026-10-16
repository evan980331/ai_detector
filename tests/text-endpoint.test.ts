import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTextEndpoint } from "../lib/server/text-endpoint";

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
});