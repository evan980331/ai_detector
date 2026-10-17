import { describe, expect, it, vi } from "vitest";
import {
  classifyGeminiError,
  GeminiRequestError,
  MAX_TOTAL_BACKOFF_MS,
  withGeminiStage,
} from "../lib/ai/gemini-error";

const noSleep = async (): Promise<void> => undefined;

function httpError(status: number): Error {
  return Object.assign(new Error('{"error":{"message":"provider private detail"}}'), { status });
}

function networkError(): TypeError {
  return Object.assign(new TypeError("fetch failed"), { cause: new Error("ECONNRESET") });
}

function timeoutError(): Error {
  return Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}

function asRequestError(error: unknown): GeminiRequestError {
  if (!(error instanceof GeminiRequestError)) {
    throw new Error(`Expected a GeminiRequestError, received ${error instanceof Error ? error.name : typeof error}.`);
  }
  return error;
}

describe("withGeminiStage", () => {
  it("retries countTokens after a transient 503 and runs the reservation hook", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ totalTokens: 128 });
    const beforeRetry = vi.fn();
    const sleep = vi.fn(noSleep);

    const result = await withGeminiStage("countTokens", request, {
      beforeRetry,
      sleep,
      random: () => 0.5,
    });

    expect(result).toEqual({ totalTokens: 128 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(beforeRetry).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it("retries generateContent after a transient 503 and runs the reservation hook", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ text: "{}" });
    const beforeRetry = vi.fn();
    const sleep = vi.fn(noSleep);

    const result = await withGeminiStage("generateContent", request, {
      beforeRetry,
      sleep,
      random: () => 0.5,
    });

    expect(result).toEqual({ text: "{}" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(beforeRetry).toHaveBeenCalledOnce();
  });

  it("fails within three attempts when 503 persists and keeps only safe diagnostics", async () => {
    const request = vi.fn().mockImplementation(async () => { throw httpError(503); });
    const beforeRetry = vi.fn();
    const sleep = vi.fn(noSleep);

    const failure = await withGeminiStage("generateContent", request, { beforeRetry, sleep })
      .catch((error: unknown) => asRequestError(error));

    expect(failure).toBeInstanceOf(GeminiRequestError);
    expect(failure).toMatchObject({
      name: "GeminiRequestError",
      stage: "generateContent",
      kind: "http",
      status: 503,
      retryable: true,
      attempts: 3,
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(beforeRetry).toHaveBeenCalledTimes(2);
    const diagnostics = asRequestError(failure);
    expect(diagnostics.durationMs).toBeGreaterThanOrEqual(0);
    expect(String(diagnostics.message)).not.toContain("provider private detail");
  });

  it("retries 429 up to the attempt limit and preserves the classification", async () => {
    const request = vi.fn().mockImplementation(async () => { throw httpError(429); });
    const sleep = vi.fn(noSleep);

    const failure = await withGeminiStage("generateContent", request, { sleep })
      .catch((error: unknown) => asRequestError(error));

    expect(failure).toMatchObject({
      name: "GeminiRequestError",
      kind: "http",
      status: 429,
      retryable: true,
      attempts: 3,
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404])("does not retry a non-transient %i error", async (status) => {
    const request = vi.fn().mockImplementation(async () => { throw httpError(status); });
    const sleep = vi.fn(noSleep);
    const beforeRetry = vi.fn();

    const failure = await withGeminiStage("generateContent", request, { sleep, beforeRetry })
      .catch((error: unknown) => asRequestError(error));

    expect(failure).toMatchObject({
      name: "GeminiRequestError",
      kind: "http",
      status,
      retryable: false,
      attempts: 1,
    });
    expect(request).toHaveBeenCalledOnce();
    expect(beforeRetry).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a transient network failure and recovers", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn(noSleep);

    await expect(withGeminiStage("generateContent", request, { sleep })).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("classifies timeouts separately and still bounds the retries", async () => {
    const request = vi.fn().mockImplementation(async () => { throw timeoutError(); });
    const sleep = vi.fn(noSleep);

    const failure = await withGeminiStage("countTokens", request, { sleep })
      .catch((error: unknown) => asRequestError(error));

    expect(failure).toMatchObject({
      name: "GeminiRequestError",
      stage: "countTokens",
      kind: "timeout",
      status: undefined,
      retryable: true,
      attempts: 3,
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("classifies exhausted network failures without a status", async () => {
    const request = vi.fn().mockImplementation(async () => { throw networkError(); });
    const sleep = vi.fn(noSleep);

    const failure = await withGeminiStage("generateContent", request, { sleep })
      .catch((error: unknown) => asRequestError(error));

    expect(failure).toMatchObject({ kind: "network", status: undefined, retryable: true, attempts: 3 });
  });

  it("does not retry an error it cannot judge as transient", async () => {
    const request = vi.fn().mockImplementation(async () => { throw new Error("unexpected shape"); });
    const sleep = vi.fn(noSleep);

    const failure = await withGeminiStage("generateContent", request, { sleep })
      .catch((error: unknown) => asRequestError(error));

    expect(failure).toMatchObject({ kind: "unknown", retryable: false, attempts: 1 });
    expect(request).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("keeps the total waiting time inside the configured backoff ceiling", async () => {
    const request = vi.fn().mockImplementation(async () => { throw httpError(503); });
    const sleeps: number[] = [];

    const failure = await withGeminiStage("generateContent", request, {
      sleep: async (milliseconds: number) => { sleeps.push(milliseconds); },
      random: () => 1,
    }).catch((error: unknown) => asRequestError(error));

    expect(failure).toMatchObject({ attempts: 3 });
    expect(sleeps).toEqual([1_500, 3_000]);
    const total = sleeps.reduce((sum, value) => sum + value, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BACKOFF_MS);
  });

  it("stops retrying once the stage time budget is nearly exhausted", async () => {
    const request = vi.fn().mockImplementation(async () => { throw httpError(503); });
    const sleep = vi.fn(noSleep);
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(39_000);

    const failure = await withGeminiStage("generateContent", request, { sleep, now })
      .catch((error: unknown) => asRequestError(error));

    expect(failure).toMatchObject({ name: "GeminiRequestError", attempts: 1, durationMs: 39_000 });
    expect(request).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("lets a budget rejection abort the retry instead of swallowing it", async () => {
    const budgetError = Object.assign(new Error("INPUT_TOKEN_BUDGET_EXCEEDED"), { name: "TokenBudgetExceeded" });
    const request = vi.fn().mockImplementation(async () => { throw httpError(503); });

    await expect(withGeminiStage("generateContent", request, {
      sleep: noSleep,
      beforeRetry: () => { throw budgetError; },
    })).rejects.toBe(budgetError);
    expect(request).toHaveBeenCalledOnce();
  });
});

describe("classifyGeminiError", () => {
  it("maps HTTP statuses to retryable or permanent failures", () => {
    expect(classifyGeminiError(httpError(503))).toEqual({ kind: "http", status: 503, retryable: true });
    expect(classifyGeminiError(httpError(429))).toEqual({ kind: "http", status: 429, retryable: true });
    expect(classifyGeminiError(httpError(404))).toEqual({ kind: "http", status: 404, retryable: false });
    expect(classifyGeminiError(httpError(401))).toEqual({ kind: "http", status: 401, retryable: false });
  });

  it("reads numeric, statusCode, and numeric-string status fields", () => {
    expect(classifyGeminiError({ statusCode: 500 })).toMatchObject({ kind: "http", status: 500, retryable: true });
    expect(classifyGeminiError({ status: "503" })).toMatchObject({ kind: "http", status: 503, retryable: true });
    expect(classifyGeminiError({ status: "UNAVAILABLE" })).toMatchObject({ kind: "unknown", retryable: false });
  });

  it("recognizes timeout, network, and unknown failures", () => {
    expect(classifyGeminiError(timeoutError())).toEqual({ kind: "timeout", retryable: true });
    expect(classifyGeminiError(Object.assign(new Error("Request timed out"), { name: "RequestTimeoutError" })))
      .toEqual({ kind: "timeout", retryable: true });
    expect(classifyGeminiError(networkError())).toEqual({ kind: "network", retryable: true });
    expect(classifyGeminiError(new Error("something else"))).toEqual({ kind: "unknown", retryable: false });
  });
});