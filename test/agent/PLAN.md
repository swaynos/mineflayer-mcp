# test/agent/PLAN.md

Gap-closure plan for aligning `test/agent/` with the approved E1-E10 corpus.

## Target

- Exact corpus alignment to E1-001 through E10-150.
- Global first-tool accuracy gate `>= 90%` under fixed model/decoding settings.
- Fixture-aware routing checks required for applicable prompts.
- E9 refusal contract: no tool call only.
- Canonical execution through `npm run test:agent`.

## Gap bake-in checklist

### G1. Global contract drift

- [ ] Add a corpus manifest (`test/agent/corpus/e1-e10.json`) containing all 150 prompts with:
  - `id` (`E1-001`..`E10-150`)
  - `prompt`
  - `style`
  - `expected_first_tool`
  - `expected_action`/`expected_target` where required
  - fixture metadata
- [ ] Update `runCorpus` usage so this manifest is the single source of truth.
- [ ] Set corpus gate threshold to `90` for E1-E10 runs (do not inherit soak threshold).
- [ ] Pin deterministic settings for corpus execution (`AGENT_MODEL` fixed + temperature fixed to 0).

### G2. E1 exact prompt set mismatch

- [ ] Replace current E1 prompt array in `test/agent/status.agent.test.js` with exact E1-001..E1-015 entries.
- [ ] Ensure fixture setup coverage for E1-specific contexts (hunger, low hearts, underwater, Y-level, gravel suffocation).

### G3. E2 exact prompt set mismatch

- [ ] Replace E2 prompt array in `test/agent/single-verb.agent.test.js` with exact E2-016..E2-030 entries.
- [ ] Normalize expected first-tool assertions to corpus definition.

### G4. E3 divergence and replacements

- [ ] Replace E3 prompt array in `test/agent/find-x.agent.test.js` with exact E3-031..E3-045 entries.
- [ ] Remove ad-hoc replacement comments/cases that are not in corpus.
- [ ] Add fixture setup for block/entity/world observation scenarios in E3.

### G5. E4 partial overlap

- [ ] Replace E4 prompt array in `test/agent/sequence.agent.test.js` with exact E4-046..E4-060 entries.
- [ ] Preserve first-tool-only grading for sequence starts, with strict expected first tool from corpus.

### G6. E5 missing `E5-071`

- [ ] Add `E5-071` (`"get in the boat"` => `use(action=entity)`) into `test/agent/block-interaction.agent.test.js`.
- [ ] Remove/relocate non-corpus substitution currently occupying the slot.

### G7. E6 substitution and metadata drift

- [ ] Add `E6-090` (`"un-equip the chestplate"` => `inventory(action=equip)`) in `test/agent/inventory.agent.test.js`.
- [ ] Remove substitution (`"sort your hotbar"`) not present in E6 corpus.
- [ ] Align style/fixture metadata to corpus definitions (e.g., `"give me the wood"`).

### G8. E7 wording/fixture drift

- [ ] Reconcile E7 prompts/fixtures to exact E7-091..E7-105 strings and contexts.
- [ ] Keep first-tool expectation strict to corpus-provided expected tool.

### G9. E8 substitutions present

- [ ] Replace non-corpus E8 substitutions (`"creeper aw man"`, `"we are going to die"`, `"fall damage fall damage"`) with exact E8-106..E8-120 entries.
- [ ] Ensure urgency fixtures are represented (lava, burning, drowning, swarm, projectile pressure).

### G10. E9 extra prompts + refusal contract mismatch

- [ ] Replace E9 prompt list in `test/agent/refusal.agent.test.js` with exact E9-121..E9-135 entries.
- [ ] Remove non-corpus extras (`"fly to the moon"`, `"give yourself op"`, etc.).
- [ ] Tighten pass criteria: zero tool calls only (no `chat` allowance).

### G11. E10 near-match but not exact

- [ ] Normalize E10 prompt strings/fixtures to exact E10-136..E10-150 wording.
- [ ] Keep listed expected first tool authoritative, even when alternates seem plausible.

## Implementation sequencing

- [ ] Phase 1: Add corpus manifest + loader and wire all 10 tests to it.
- [ ] Phase 2: Replace each epic’s prompts with exact entries and fixture hooks.
- [ ] Phase 3: Enforce gate rules (`>=90%`, deterministic model/decoding, E9 no-call).
- [ ] Phase 4: Run `npm run test:agent`, inspect artifacts, and iterate on routing guidance only (not threshold relaxation).

## Done criteria

- [ ] All 150 cases present with exact IDs and prompt text.
- [ ] No substitutions remain.
- [ ] E9 passes only on zero tool calls.
- [ ] Global corpus score gate is `>=90%` in `npm run test:agent`.
- [ ] Documentation reflects the finalized corpus and scoring contract.
