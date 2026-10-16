import { z } from "zod";

export const MAX_TEXT_CHARACTERS = 12_000;
export const MIN_TEXT_CHARACTERS = 80;

export const textInputSchema = z.object({
  text: z.string().trim().min(MIN_TEXT_CHARACTERS).max(MAX_TEXT_CHARACTERS),
}).strict();

export const observationSchema = z.object({
  label: z.string().min(1).max(60),
  explanation: z.string().min(1).max(500),
  strength: z.enum(["low", "moderate"]),
  quote: z.string().max(240).optional(),
});

export const analysisResultSchema = z.object({
  signalIndex: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(700),
  observations: z.array(observationSchema).max(5),
  disclaimer: z.string().min(1).max(400),
});

export const revisionResultSchema = z.object({
  revisedText: z.string().min(1).max(20_000),
  changes: z.array(z.string().min(1).max(180)).max(6),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema> & { metrics: TextMetrics };
export type RevisionResult = z.infer<typeof revisionResultSchema>;

export type TextMetrics = {
  characterCount: number;
  sentenceCount: number;
  averageSentenceLength: number;
  repeatedTerms: { term: string; count: number }[];
};