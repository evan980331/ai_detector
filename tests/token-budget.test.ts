import { describe, expect, it } from "vitest";
import { INPUT_TOKENS_PER_MINUTE, reserveInputTokens, TokenBudgetExceeded } from "../lib/security/token-budget";

describe("reserveInputTokens", () => {
  it("allows requests up to the rolling per-minute budget", () => {
    expect(() => reserveInputTokens("model-allow-test", 12_000, 1_000)).not.toThrow();
    expect(() => reserveInputTokens("model-allow-test", 13_000, 2_000)).not.toThrow();
  });

  it("rejects requests that would exceed the rolling minute and reports retry time", () => {
    reserveInputTokens("model-window-test", 16_000, 1_000);

    try {
      reserveInputTokens("model-window-test", 10_000, 11_000);
      throw new Error("Expected the token budget to reject the request.");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenBudgetExceeded);
      expect(error).toMatchObject({ reason: "window_full", retryAfter: 50 });
    }
  });

  it("rejects a single reservation larger than the configured budget", () => {
    try {
      reserveInputTokens("model-size-test", INPUT_TOKENS_PER_MINUTE + 1, 1_000);
      throw new Error("Expected the oversized request to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenBudgetExceeded);
      expect(error).toMatchObject({ reason: "request_too_large", retryAfter: 0 });
    }
  });
});