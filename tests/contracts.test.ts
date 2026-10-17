import { describe, expect, it } from "vitest";
import { analysisResultSchema, revisionResultSchema, textInputSchema } from "../lib/analysis/contracts";

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

describe("analysisResultSchema", () => {
  const validAnalysis = {
    signalIndex: 42,
    summary: "這是一段帶有不確定性說明的摘要。",
    observations: [{ label: "句長變化", explanation: "句長分布集中。", strength: "low" as const, quote: "原文" }],
    disclaimer: "此分數不是機率。",
  };

  it("accepts a well-formed analysis payload", () => {
    expect(analysisResultSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it("rejects out-of-range scores and missing fields", () => {
    expect(analysisResultSchema.safeParse({ ...validAnalysis, signalIndex: 101 }).success).toBe(false);
    expect(analysisResultSchema.safeParse({ signalIndex: 0 }).success).toBe(false);
    expect(analysisResultSchema.safeParse({ ...validAnalysis, observations: [{ ...validAnalysis.observations[0], strength: "definite" }] }).success).toBe(false);
  });
});

describe("revisionResultSchema", () => {
  it("accepts a well-formed revision and rejects missing fields", () => {
    expect(revisionResultSchema.safeParse({ revisedText: "修改後的文字", changes: ["調整語句"] }).success).toBe(true);
    expect(revisionResultSchema.safeParse({ revisedText: "修改後的文字" }).success).toBe(false);
  });
});