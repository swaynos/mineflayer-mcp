# SPEC.md

Active workstream: E1-E10 first-tool routing corpus (150 prompts).

## Objective

Add a new agent-routing evaluation corpus covering E1-E10 (150 prompts total)
to `test/agent/`, and make it a required part of `npm run test:agent`.

This workstream validates first-tool selection quality for:

1. Status/observe routing
2. Basic direct commands
3. Contextual observation and entity/block/world targeting
4. Multi-step intent first-action routing
5. Ambiguity resolution and tension prompts
6. Refusal boundaries where no tool call is expected

## Scope decisions

1. Corpus scope: all 150 prompts in one pass (E1-E10).
2. Acceptance threshold: global first-tool accuracy >= 90%.
3. E9 refusal contract: pass requires no tool call (response text can vary).
4. E10 ambiguity policy: enforce listed expected first tool as ground truth.
5. Fixture policy: include fixture-specific setup/assertions as mandatory.
6. Determinism policy: pin model and decoding settings for corpus gate.
7. Verification command: `npm run test:agent` is canonical.
8. Retry policy: retries allowed until success, but must be bounded by an
   implementation-defined cap/time limit to prevent non-terminating runs.

## Exit criteria

1. Corpus definitions for E1-E10 exist in `test/agent/` (150 prompts total),
   with expected first tool metadata and fixture requirements.
2. Test harness enforces fixed model + decoding settings for this corpus run.
3. Test harness evaluates first-tool routing and computes global accuracy.
4. Global corpus accuracy gate is enforced at >= 90% in CI/local runs.
5. E9 prompts assert zero tool call on pass.
6. E10 prompts assert exact match against listed expected first tool.
7. Fixture setup/assertions are implemented and exercised for relevant prompts.
8. Corpus execution is integrated into `npm run test:agent`.
9. `README.md` and `test/agent/README.md` document corpus usage and gating.
10. Validation passes with project workflow:
    - `docker compose -f docker-compose.dev.yaml up -d`
    - `npm run test:agent`

## Plan artifact

- Detailed gap-closure checklist is tracked in `test/agent/PLAN.md`.

## Status

Planned. Implementation pending.
