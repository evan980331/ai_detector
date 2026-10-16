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
3. Optionally set `GEMINI_MODEL`; the default is `gemini-flash-latest`.
4. Deploy and verify the homepage, `/api/analyze`, and `/api/revise` without exposing the key or submitted text in logs.

The current rate limit is process-local and best-effort; serverless instances do not share counters. Before broad public use, add a shared rate-limit service or suitable edge protection, plus monitoring that does not retain submitted text.

## Privacy

Submitted text is sent to Google Gemini only when the user requests analysis or edits. This app does not write the text to a database or log it intentionally. Review Google's API terms and privacy settings before using the app with sensitive or regulated material.