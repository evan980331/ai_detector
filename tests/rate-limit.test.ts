import { describe, expect, it } from "vitest";
import { checkRateLimit, clientAddress } from "../lib/security/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests up to the window limit, then blocks with a retry hint", () => {
    const key = "unit:rate-window";

    for (let index = 0; index < 12; index += 1) {
      expect(checkRateLimit(key, 1_000).allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(600);
  });

  it("starts a new window after the previous one expires", () => {
    const key = "unit:rate-expiry";

    expect(checkRateLimit(key, 1_000).allowed).toBe(true);
    expect(checkRateLimit(key, 1_000 + 10 * 60 * 1_000 + 1).allowed).toBe(true);
  });
});

describe("clientAddress", () => {
  it("uses the first forwarded address", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" },
    });
    expect(clientAddress(request)).toBe("203.0.113.9");
  });

  it("falls back when no forwarding header exists", () => {
    expect(clientAddress(new Request("http://localhost"))).toBe("unknown");
  });
});