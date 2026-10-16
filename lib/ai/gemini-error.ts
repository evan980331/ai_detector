export type GeminiStage = "countTokens" | "generateContent";

export class GeminiRequestError extends Error {
  constructor(
    readonly stage: GeminiStage,
    readonly status?: number,
  ) {
    super("GEMINI_REQUEST_FAILED");
    this.name = "GeminiRequestError";
  }
}

export async function withGeminiStage<T>(
  stage: GeminiStage,
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? error.status
      : undefined;
    throw new GeminiRequestError(stage, typeof status === "number" ? status : undefined);
  }
}