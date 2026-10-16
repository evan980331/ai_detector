import type { TextMetrics } from "@/lib/analysis/contracts";

const sentenceBreaks = /[.!?。！？；;\n]+/u;

export function measureText(text: string): TextMetrics {
  const sentences = text.split(sentenceBreaks).map((sentence) => sentence.trim()).filter(Boolean);
  const terms = [...new Intl.Segmenter("zh-TW", { granularity: "word" }).segment(text)]
    .filter((segment) => segment.isWordLike && Array.from(segment.segment).length >= 2)
    .map((segment) => segment.segment);
  const counts = new Map<string, number>();

  for (const term of terms) {
    const normalized = term.toLocaleLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const repeatedTerms = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([term, count]) => ({ term, count }));

  const sentenceLengths = sentences.map((sentence) => Array.from(sentence).length);
  const averageSentenceLength = sentenceLengths.length
    ? Math.round(sentenceLengths.reduce((sum, length) => sum + length, 0) / sentenceLengths.length)
    : 0;

  return {
    characterCount: Array.from(text).length,
    sentenceCount: sentences.length,
    averageSentenceLength,
    repeatedTerms,
  };
}