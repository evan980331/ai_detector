import { describe, expect, it } from "vitest";
import { textInputSchema } from "../lib/analysis/contracts";

describe("textInputSchema", () => {
  it("accepts text within the supported range", () => {
    expect(textInputSchema.safeParse({ text: "字".repeat(80) }).success).toBe(true);
  });

  it("rejects too-short, too-long, and extra-field requests", () => {
    expect(textInputSchema.safeParse({ text: "太短" }).success).toBe(false);
    expect(textInputSchema.safeParse({ text: "字".repeat(12_001) }).success).toBe(false);
    expect(textInputSchema.safeParse({ text: "字".repeat(80), apiKey: "unexpected" }).success).toBe(false);
  });
});