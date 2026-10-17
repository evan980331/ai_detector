export type GeminiStage = "countTokens" | "generateContent";
export type GeminiErrorKind = "http" | "timeout" | "network" | "unknown";

/**
 * Client-side timeout passed to the SDK through `httpOptions.timeout`
 * (milliseconds, per attempt). Mirrored here so the retry loop can keep a
 * single stage-wide time budget: every attempt is bounded by this timeout.
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 15_000;

/** Initial attempt plus at most two additional retries. */
export const MAX_GEMINI_ATTEMPTS = 3;
/** First retry delay in milliseconds, before jitter is applied. */
const INITIAL_DELAY_MS = 1_000;
const BACKOFF_FACTOR = 2;
/** Hard ceiling on the sum of all sleeps inside one stage. */
export const MAX_TOTAL_BACKOFF_MS = 5_000;
/**
 * Wall-clock ceiling for one stage (attempts plus waiting). Keeps the
 * worst case inside the route's `maxDuration` (45s on Vercel).
 */
export const GEMINI_STAGE_TIME_BUDGET_MS = 40_000;

/** 408/429/5xx are the statuses Google documents as worth retrying. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type GeminiErrorClass = {
  kind: GeminiErrorKind;
  status?: number;
  retryable: boolean;
};

/**
 * Safe diagnostics kept after a failure. Never carries the provider message,
 * the request body, or the submitted text.
 */
export class GeminiRequestError extends Error {
  readonly stage: GeminiStage;
  readonly kind: GeminiErrorKind;
  readonly status?: number;
  /** Whether this failure kind/status is transient, even if retries are exhausted. */
  readonly retryable: boolean;
  readonly attempts: number;
  readonly durationMs: number;

  constructor(detail: {
    stage: GeminiStage;
    kind: GeminiErrorKind;
    status?: number;
    retryable: boolean;
    attempts: number;
    durationMs: number;
  }) {
    super("GEMINI_REQUEST_FAILED");
    this.name = "GeminiRequestError";
    this.stage = detail.stage;
    this.kind = detail.kind;
    this.status = detail.status;
    this.retryable = detail.retryable;
    this.attempts = detail.attempts;
    this.durationMs = detail.durationMs;
  }
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidates = [
    "status" in error ? error.status : undefined,
    "statusCode" in error ? error.statusCode : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isInteger(candidate)) return candidate;
    if (typeof candidate === "string" && /^\d{3}$/.test(candidate)) return Number(candidate);
  }
  return undefined;
}

const TIMEOUT_NAMES = new Set(["TimeoutError", "AbortError", "RequestTimeoutError"]);
const TIMEOUT_MESSAGE = /timed?\s?out|timeout/i;
const NETWORK_MESSAGE = /(fetch failed|network|socket|econnreset|enotfound|eai_again|etimedout|epipe|connection)/i;

/**
 * Decides what kind of failure this is and whether it is transient.
 * Unknown errors are deliberately not retryable: we only retry when the
 * failure can reasonably be judged temporary.
 */
export function classifyGeminiError(error: unknown): GeminiErrorClass {
  const status = readStatus(error);
  if (status !== undefined) {
    return { kind: "http", status, retryable: RETRYABLE_STATUSES.has(status) };
  }

  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";

  if (TIMEOUT_NAMES.has(name) || TIMEOUT_MESSAGE.test(message)) {
    return { kind: "timeout", retryable: true };
  }
  if (name === "TypeError" || NETWORK_MESSAGE.test(message)) {
    return { kind: "network", retryable: true };
  }
  return { kind: "unknown", retryable: false };
}

type RetryOptions = {
  /** Runs before each retry; used to re-reserve the input token budget. */
  beforeRetry?: () => void;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  /** Overrides the stage time budget (mainly for tests). */
  timeBudgetMs?: number;
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Runs one Gemini stage with a single, bounded retry layer.
 *
 * The official `@google/genai` SDK (2.30.0) only retries when
 * `httpOptions.retryOptions` is explicitly configured; this project keeps
 * that opt-in disabled, so this wrapper is the only retry layer per request
 * and the call count cannot multiply across layers.
 */
export async function withGeminiStage<T>(
  stage: GeminiStage,
  request: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const timeBudgetMs = options.timeBudgetMs ?? GEMINI_STAGE_TIME_BUDGET_MS;
  const startedAt = now();
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? wait;
  let attempts = 0;
  let waitedMs = 0;

  for (;;) {
    attempts += 1;
    try {
      return await request();
    } catch (error) {
      const failure = classifyGeminiError(error);
      const elapsedMs = now() - startedAt;
      const delayMs = Math.round(INITIAL_DELAY_MS * BACKOFF_FACTOR ** (attempts - 1) * (0.5 + random()));

      const mayRetry =
        failure.retryable &&
        attempts < MAX_GEMINI_ATTEMPTS &&
        waitedMs + delayMs <= MAX_TOTAL_BACKOFF_MS &&
        elapsedMs + delayMs + GEMINI_REQUEST_TIMEOUT_MS <= timeBudgetMs;

      if (!mayRetry) {
        throw new GeminiRequestError({
          stage,
          kind: failure.kind,
          status: failure.status,
          retryable: failure.retryable,
          attempts,
          durationMs: elapsedMs,
        });
      }

      options.beforeRetry?.();
      waitedMs += delayMs;
      await sleep(delayMs);
    }
  }
}