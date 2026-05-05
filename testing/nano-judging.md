# testing/nano-judging.md — Epoch 5 Judge Rubric

Epoch 5 scoring dimensions:

1. **Tool selection correctness**
   - Did the model choose the correct first tool for the user intent?
2. **Argument correctness**
   - Were arguments well-formed and semantically aligned to the request?
3. **Intent fidelity**
   - Does the final answer/action satisfy the user request without drift?
4. **Latency**
   - Per-prompt tool round-trip latency recorded in milliseconds.

Target thresholds (NORTH-STAR):

- Tool selection accuracy: **>= 95%**
- Argument correctness: **>= 90%**
- Latency p95: **< 3000 ms**

`scripts/epoch5-judge.js` now supports two modes:

- `--dry-run`: deterministic local scoring for pipeline validation.
- live mode: calls OpenAI Responses API (`OPENAI_API_KEY`, optional
  `OPENAI_JUDGE_MODEL`) with a strict JSON-only rubric prompt.

Expected judge JSON payload:

```json
{
  "tool_selection_correct": true,
  "argument_correct": true,
  "intent_fidelity": 95,
  "rationale": "First tool and arguments align with intent."
}
```
