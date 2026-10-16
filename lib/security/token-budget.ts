export const INPUT_TOKENS_PER_MINUTE = 25_000;
export const TOKEN_BUDGET_WINDOW_MS = 60_000;

type Reservation = { timestamp: number; tokens: number };
type RejectionReason = "request_too_large" | "window_full";

const reservationsByModel = new Map<string, Reservation[]>();

export class TokenBudgetExceeded extends Error {
  constructor(
    readonly reason: RejectionReason,
    readonly retryAfter: number,
  ) {
    super("INPUT_TOKEN_BUDGET_EXCEEDED");
    this.name = "TokenBudgetExceeded";
  }
}

export function reserveInputTokens(model: string, tokens: number, now = Date.now()): void {
  if (!Number.isSafeInteger(tokens) || tokens <= 0) {
    throw new RangeError("Token reservations must be positive integers.");
  }
  if (tokens > INPUT_TOKENS_PER_MINUTE) {
    throw new TokenBudgetExceeded("request_too_large", 0);
  }

  const cutoff = now - TOKEN_BUDGET_WINDOW_MS;
  const reservations = (reservationsByModel.get(model) ?? [])
    .filter((reservation) => reservation.timestamp > cutoff);
  const usedTokens = reservations.reduce((sum, reservation) => sum + reservation.tokens, 0);

  if (usedTokens + tokens > INPUT_TOKENS_PER_MINUTE) {
    let excessTokens = usedTokens + tokens - INPUT_TOKENS_PER_MINUTE;
    for (const reservation of reservations) {
      excessTokens -= reservation.tokens;
      if (excessTokens <= 0) {
        const retryAfter = Math.max(1, Math.ceil((reservation.timestamp + TOKEN_BUDGET_WINDOW_MS - now) / 1000));
        throw new TokenBudgetExceeded("window_full", retryAfter);
      }
    }
    throw new TokenBudgetExceeded("window_full", 60);
  }

  reservations.push({ timestamp: now, tokens });
  reservationsByModel.set(model, reservations);
}