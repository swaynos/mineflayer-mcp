# mineflayer-mcp

## Problem
E7 entity-targeting passes when run in isolation but fails in the full suite because the implied-goal observe instruction fires on entity-verb prompts (hit/kill/chase/shoot/punch/pet). Entity-verb prompts need an explicit priority routing rule that fires before the implied-goal rule, sending them to attack/move/use rather than observe. E8 survival also needs urgency routing for panic/crisis prompts.

## Status
E7 loop in progress. E3 and E9 green. E8 queued after E7.

## Goals
- Add explicit entity-verb priority routing rule that fires before implied-goal observe.
- Restore E7 entity-targeting to 2 consecutive passes in both targeted and full-suite runs.
- Preserve E3 find-x and E9 refusal behavior.
- Then apply urgency/panic routing fix for E8 survival.

## Non-goals
- No all-at-once fixes across all epics.
- No threshold relaxation.
- No backend/tool/server changes unless routing-first approach is blocked.

## Constraints
- Loop scope: E7 entity-targeting first, then E8 survival.
- Promotion gate: 2 consecutive targeted passes.
- Verification: targeted-first, then full suite.
- No corpus threshold values lowered.

## Acceptance Criteria
1. `test/agent/entity-targeting.agent.test.js` passes in 2 consecutive targeted runs.
2. `test/agent/entity-targeting.agent.test.js` passes in the full `npm run test:agent` run.
3. `test/agent/find-x.agent.test.js` and `test/agent/refusal.agent.test.js` remain green.
4. No routing instruction change regresses any currently passing epic.

## Verification
```bash
docker compose -f docker-compose.dev.yaml up -d
node --test --test-concurrency=1 test/agent/entity-targeting.agent.test.js
node --test --test-concurrency=1 test/agent/entity-targeting.agent.test.js
node --test --test-concurrency=1 test/agent/find-x.agent.test.js
node --test --test-concurrency=1 test/agent/refusal.agent.test.js
npm run test:agent
```

## Implementation Checklist
- [ ] Add explicit entity-verb priority routing rule before implied-goal rule in callLLM instructions.
- [ ] Run targeted E7 test; require 2 consecutive passes.
- [ ] Verify E3 and E9 still pass after change.
- [ ] Run full suite; confirm E7 holds in full-suite context.
- [ ] Apply urgency/panic routing rule for E8 survival.
- [ ] Run targeted E8 test; require 2 consecutive passes.
- [ ] Run full suite; document remaining failures.
- [ ] Update progress.txt and SPEC.md for next loop.

## Change Log
- 2026-05-07: E3 complete. Implied-goal routing instruction added.
- 2026-05-07: E9 refusal fixes applied (structure build, player data, online list exclusions).
- 2026-05-07: E7 loop started. Root cause: implied-goal rule over-fires on entity-verb prompts in full suite context.
