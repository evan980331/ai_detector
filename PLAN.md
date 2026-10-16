# AI Writing Analysis and Editing Assistant

## Goal

Build a Traditional Chinese-first web app that accepts pasted text, reports an evidence-limited estimate of AI-writing signals, explains which passages or features influenced the estimate, and offers user-controlled edits for clarity, structure, tone, and correctness.

The editing workflow must not be designed or evaluated to evade AI detectors or misrepresent authorship. Detection output is an uncertain signal, not proof that a person or model wrote a text.

## Product Scope

### MVP

- Paste text into the browser; file upload is optional and deferred until text processing is stable.
- Analyze text on the server through the official Google Gen AI SDK, with the Gemini API key kept server-side.
- Return an estimated score with calibrated wording, uncertainty/limitations, and passage-level observations. Do not present the score as a definitive probability unless calibration data supports that interpretation.
- Offer revision suggestions for readability, coherence, grammar, and preserving the user's intended meaning. The user reviews and accepts changes; never silently replace their text.
- Do not retain submitted text by default, and never include it or credentials in logs.

### Later, only if validated

- Add DOCX/PDF import with explicit file size/type limits and temporary processing. Extract text and discard the original; do not persist uploads by default.
- Evaluate additional languages and academic-writing contexts separately before claiming support.
- Add optional local editing history only with clear user consent and a deletion path.

## Analysis Approach and Evidence

- Treat word/phrase frequency, sentence length and variation, punctuation, repetition, and other linguistic measurements as weak, contextual features. No single feature should determine a result.
- Human writing speed cannot be inferred from a pasted document. Only consider timing data when it is explicitly and voluntarily collected during an editing session, and do not use it as a standalone authorship test.
- Build evaluation sets with documented provenance, consent/licensing, human-written and model-generated samples, multiple genres, and Traditional Chinese coverage.
- Measure false-positive and false-negative rates, precision/recall, calibration, and performance by language and genre. Publish limitations and avoid claims that the tool can prove authorship.
- Keep model output separate from measured statistics. Label Gemini-generated explanations as model interpretations, not independent forensic evidence.

## Proposed Stack

- Next.js App Router, TypeScript, React, and Vercel deployment.
- Official `@google/genai` SDK, called only from server-side route handlers.
- Start with a text-only request/response workflow. Keep model access behind a small server module so provider details are not spread through UI code.
- Add automated unit tests for text preparation, score formatting, validation, and API error handling; add integration checks for the analysis route without requiring a real API key.

## Delivery Plan

1. **Foundation**: confirm product wording and limitations; initialize Next.js/TypeScript, linting, tests, `.gitignore`, and `AGENTS.md`.
2. **Text analysis MVP**: create the input/results workflow, server-side Gemini integration, request validation, rate/size limits, safe error messages, and privacy-preserving logs.
3. **Editing workflow**: show passage-level suggestions and a before/after comparison; let users accept or reject edits; constrain changes to clarity, coherence, grammar, and meaning preservation.
4. **Evaluation**: assemble a documented test corpus, assess language/genre performance and false positives, and revise score wording/calibration before public claims.
5. **Optional file input**: add DOCX/PDF extraction only after confirming Vercel runtime and request limits; test malformed, oversized, and unsupported files.
6. **GitHub and Vercel**: run checks, inspect the final diff, ensure secrets and private sample text are excluded, push the project to `evan980331/ai_detector`, connect that repository to Vercel, configure `GEMINI_API_KEY` as a server-side Vercel environment variable, and verify a production deployment. Do not commit `.env` files or API keys.

## Acceptance Criteria

- User can submit text and receive an understandable, appropriately qualified analysis result.
- User can inspect suggested edits and choose which to apply; original text remains recoverable during the session.
- API keys are only read by server-side code and never exposed in client bundles, logs, or Git history.
- Submitted text is not persisted by default.
- Tests cover invalid/empty/oversized input, API failures, and response formatting.
- Evaluation reports false-positive behavior and documented limitations before public claims are made.
- GitHub contains source and documentation only; Vercel has the required secret configured outside the repository.

## Initial File Layout

```text
ai detector/
├── AGENTS.md
├── PLAN.md
├── README.md
├── .env.example                 # Placeholder names only; no real credentials
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # Text input and analysis results
│   ├── globals.css
│   └── api/
│       ├── analyze/route.ts     # Server-side analysis endpoint
│       └── revise/route.ts      # Editorial revision endpoint, not detector evasion
├── components/
│   ├── text-editor.tsx
│   ├── analysis-summary.tsx
│   ├── passage-feedback.tsx
│   └── revision-review.tsx
├── lib/
│   ├── ai/gemini.ts             # SDK client and server-only prompt calls
│   ├── analysis/                # Feature extraction, score interpretation, schemas
│   ├── text/                    # Normalization and input validation
│   └── security/                # Limits and safe error/log helpers
├── tests/
│   ├── unit/
│   └── api/
├── docs/
│   ├── evaluation.md            # Dataset provenance, metrics, limitations
│   └── deployment.md            # GitHub/Vercel setup and verification
└── public/
```

Optional file parsing should be added under `lib/files/` with focused tests if and when that scope is approved. Do not add upload storage by default.