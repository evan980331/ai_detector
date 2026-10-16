# Evaluation and Limitations

## Current status

This MVP has no validated authorship-classification dataset, calibration study, or published performance results. The 0-100 model signal index is an uncalibrated descriptive estimate, not a probability that text was AI-generated. Do not use it as evidence for academic, employment, or disciplinary decisions.

Deterministic text metrics (character count, sentence count, average sentence length, and repeated terms) describe the submitted text only. They are not AI indicators by themselves. Gemini observations are model-generated interpretations, not independent measurements.

Writing speed cannot be inferred from pasted text. This application does not collect keystroke timing or editing-session duration.

## Evaluation required before stronger claims

- Use human-written and model-generated texts with documented source, consent/licensing, language, genre, and generation date/model.
- Keep author/source identities out of the model prompt and prevent train/evaluation leakage where feasible.
- Report false-positive and false-negative rates, precision, recall, calibration, and confidence intervals.
- Break down results by language, genre, text length, editing level, and model family; include Traditional Chinese samples.
- Test paraphrased and mixed-authorship text without turning the evaluation into an evasion benchmark.
- Document dataset limitations and refresh results when models or prompts change.

Until that work exists, label all scores as experimental and emphasize uncertainty and context.