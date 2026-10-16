# Agent Rules

## Project Purpose

This project provides cautious AI-writing signal analysis and user-controlled editorial assistance. It must not be built, prompted, or evaluated to help users evade AI detectors or misrepresent authorship.

## Product and Analysis Rules

- Describe results as estimates with uncertainty, not proof of authorship or a definitive probability without calibration evidence.
- Explain relevant textual signals and limitations; do not treat word frequency, vocabulary, sentence patterns, or writing speed as conclusive evidence.
- Do not claim to infer writing speed from pasted text. Timing may only be used when explicitly and voluntarily recorded during an editing session.
- Revision features may improve clarity, coherence, grammar, tone, and meaning preservation. They must not optimize for bypassing a detector or disguising AI-generated text as human-written.
- Keep user review in control: show proposed changes and require the user to accept them.

## Privacy and Secrets

- Keep Gemini calls and credentials on the server. Never expose `GEMINI_API_KEY` to browser code.
- Use `.env.local` for local secrets and configure Vercel environment variables through its project settings. Commit only a placeholder `.env.example`.
- Never commit API keys, tokens, private writing samples, or `.env` files.
- Do not persist submitted text by default. Do not place submitted text or secrets in logs, analytics, or error messages.
- Validate input type and size before calling external services; handle provider errors without leaking credentials or submitted content.

## Engineering Rules

- Read relevant files and trace the existing code path before changing behavior.
- Make small, focused changes and run the narrowest relevant tests after each change.
- Preserve user text and existing behavior unless the user explicitly requests a change.
- Keep Gemini/provider logic in server-side modules, separate from UI components.
- Add tests for input validation, score/result formatting, and error handling when changing those paths.
- Do not make unsupported accuracy claims. Document evaluation dataset provenance, language/genre scope, and false-positive limitations.
- Do not commit or push unless the user explicitly asks to perform that operation in the current task.

## Deployment

- Deploy through the `evan980331/ai_detector` GitHub repository and Vercel only after tests and a diff review.
- Verify that no secrets or private text are included in the pushed changes.
- Configure `GEMINI_API_KEY` as a server-only Vercel environment variable and verify a production deployment without printing the value.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
