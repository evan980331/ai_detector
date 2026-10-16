import { describe, expect, it } from "vitest";
import { measureText } from "../lib/analysis/text-metrics";

describe("measureText", () => {
  it("counts Chinese sentences, characters, and repeated terms descriptively", () => {
    const result = measureText("研究方法需要清楚說明。研究結果也需要清楚呈現！");
    expect(result.characterCount).toBe(23);
    expect(result.sentenceCount).toBe(2);
    expect(result.averageSentenceLength).toBe(11);
    expect(result.repeatedTerms).toContainEqual({ term: "需要", count: 2 });
  });

  it("returns empty-safe metrics without inferring authorship", () => {
    expect(measureText("")).toEqual({ characterCount: 0, sentenceCount: 0, averageSentenceLength: 0, repeatedTerms: [] });
  });
});