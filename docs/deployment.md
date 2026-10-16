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
3. Optionally set `GEMINI_MODEL`; the default is the stable `gemini-3.1-flash-lite` model.
4. Deploy and verify the homepage, `/api/analyze`, and `/api/revise` without exposing the key or submitted text in logs.

The app counts each full prompt with Gemini `countTokens` and reserves a conservative 512-token overhead against a 25,000 input-token rolling 60-second budget per model. This in-memory budget is per running server instance; Vercel serverless instances do not share counters, and Gemini's project quota remains the final global enforcement. For a strict app-wide cap across concurrent instances, configure a shared atomic store (for example Redis) before broad public use. The existing request-count limiter is also process-local.

## Privacy

Submitted text is sent to Google Gemini only when the user requests analysis or edits. This app does not write the text to a database or log it intentionally. Review Google's API terms and privacy settings before using the app with sensitive or regulated material.