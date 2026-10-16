type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 12;

export function checkRateLimit(key: string, now = Date.now()): { allowed: boolean; retryAfter: number } {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}