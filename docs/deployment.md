# GitHub and Vercel Deployment

## Local readiness

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Review `git diff` and confirm `.env.local`, API keys, and private writing samples are not included.
3. Create `.env.local` from `.env.example` for local testing. Never commit it.

## GitHub

The target repository is `evan980331/ai_detector`. Connect the local repository to that existing empty GitHub repository, then push the reviewed source. Do not replace or rename its remote if one is already configured.

## Vercel

1. Import `evan980331/ai_detector` into Vercel.
2. Add `GEMINI_API_KEY` in Vercel project settings for the required deployment environments. Keep it server-only; do not prefix it with `NEXT_PUBLIC_`.
3. Optionally set `GEMINI_MODEL`. When unset or empty the code defaults to the stable `gemini-3.1-flash-lite` model id; whitespace-only values also fall back to the default, and a malformed value is rejected with a configuration error rather than being sent upstream.
4. Deploy and verify the homepage, `/api/analyze`, and `/api/revise` without exposing the key or submitted text in logs.

The app counts each full prompt with Gemini `countTokens` and reserves a conservative 512-token overhead against a 25,000 input-token rolling 60-second budget per model. This in-memory budget is per running server instance; Vercel serverless instances do not share counters, and Gemini's project quota remains the final global enforcement. For a strict app-wide cap across concurrent instances, configure a shared atomic store (for example Redis) before broad public use. The existing request-count limiter is also process-local.

### Gemini error handling and retries

- All Gemini calls run through one bounded retry layer (`withGeminiStage`). The official `@google/genai` SDK retries only when `httpOptions.retryOptions` is set; this project keeps that opt-in disabled, so a request never retries in two layers at once.
- Retryable failures: HTTP `408`, `429`, `500`, `502`, `503`, `504`, client timeouts, and connection/network errors. HTTP `400`, `401`, `403`, `404` and any error that cannot be judged transient are never retried.
- Each stage (token counting and text generation) allows at most two retries after the first attempt, with exponential backoff (1s, 2s) and jitter, a total waiting ceiling of 5 seconds, and a 40-second stage time budget (below the route's 45-second `maxDuration`). Each attempt is bounded by a 15-second client-side timeout. Every generation retry re-reserves the input token budget; a budget rejection aborts the retry and returns the existing 429 budget message.
- This API maps upstream failures onto its own contract: upstream `429` → `429`, auth (upstream `401`/`403`) or missing/invalid configuration → `503`, upstream timeouts → `504`, everything else upstream (including a persistent `503`) → `502`. Retry and validation limits stay at their configured values.
- Failures are logged server-side as a single structured `text_endpoint_error` line (request id, operation, stage, error kind, upstream status, retryable flag, attempts, duration) and the same request id is returned in error responses. These logs never contain the API key, provider messages, or submitted text.

### Manual verification after deployment

1. Confirm `GEMINI_API_KEY` is set for the target environment, is non-empty, and is not the `.env.example` placeholder value. Never print its value.
2. Confirm `GEMINI_MODEL` is either unset (default `gemini-3.1-flash-lite`) or equals a model id listed at https://ai.google.dev/gemini-api/docs/models.
3. Check model availability without echoing the key: `curl -s -o /dev/null -w '%{http_code}\n' -H "x-goog-api-key: $GEMINI_API_KEY" "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite"` → expect `200`.
4. POST a sample text (80+ characters) to `/api/analyze` and `/api/revise`; both should return `200` with JSON.
5. On any failure, read the `text_endpoint_error` entries in the Vercel function logs and quote the returned `requestId` when reporting the issue. Use Google AI Studio or the Google Cloud status page to check live usage, quota, and model availability — this app cannot verify them on its own.

## Privacy

Submitted text is sent to Google Gemini only when the user requests analysis or edits. This app does not write the text to a database or log it intentionally. Review Google's API terms and privacy settings before using the app with sensitive or regulated material.