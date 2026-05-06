# SPEC.md — mineflayer-mcp Implementation Contract

This file is the implementation contract for `mineflayer-mcp`.
`README.md` is the public face (what the software does); this file explains
**what we are testing next and why the process looks the way it does**.

Process and development workflow guidance lives in `CONTRIBUTING.md`.

---

## Where the project is, at a glance

**Epochs 1–3** validated the 30-tool behavioral surface through 752 iterations
using an actor/observer + RCON-oracle methodology. All five original milestones
(M1 observation, M2 movement, M3 world-write, M4 safety, M5 resources) are
complete.

**Epoch 4** consolidated the 30-tool surface to 9 tools behind action-enum
dispatchers for nano-tier model compatibility. Token footprint: ~1,600 tokens.
`assertCompleteness()` passes. Smoke test: 6/6.

**First live contact with `gpt-5-nano`** (2026-05-05): a single read-only
prompt ("What is your current position in Minecraft?") was sent via the
OpenAI Responses API with the MCP server wired as an `mcp` tool type.
`gpt-5-nano` correctly called `observe(target=position)`, received the bot's
coordinates from the live MCP server, and returned a coherent natural-language
answer. Plumbing works.

**Current status:** validated that the plumbing works; the model's
selection accuracy, argument correctness, and latency have not been measured
at any scale. That is what Epoch 5 addresses.

---

## Epoch 5 — Nano-Tier Validation

### Mission

Measure whether the 9-tool consolidated MCP surface works with `gpt-5-nano`
when driven by **realistic, player-grade prompts** — the kind of things a
real Minecraft player would actually say, not QA-engineered inputs.

Produce hard numbers for NORTH-STAR's three quantitative targets:

| Target | Threshold |
|---|---|
| Tool selection accuracy | ≥ 95% of straightforward scenarios |
| Argument correctness | ≥ 90% of calls |
| Latency p95 | < 3 seconds per tool round-trip |

Surface concrete failure modes for Epoch 6 to address.

### Why this is different from Epochs 1–3

Epochs 1–3 tested **the bot**: "does `dig(dx=0,dy=-1,dz=0)` dispatch
correctly?" That is a valuable but bounded question. It was answered.

Epoch 5 tests **the model-facing interface**: "will `gpt-5-nano` call the
right tool with the right args when a real user sends a natural-language
prompt?" That question was never asked before Epoch 5. The two failure
modes are completely different — prior epochs found bot-layer concurrency
bugs; Epoch 5 will find tool-description ambiguity and argument-schema
usability failures.

### Design decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Prompt authorship | External strong model (Gemini) researches Minecraft streamer corpora; generates prompt archetypes | Prompts that sound like how players actually talk surface real model failures; QA-authored prompts don't |
| Prompt styles | speedrun imperative, tutorial narrated, SMP/coop, hardcore urgent, viewer chat command | Each style has different linguistic properties; failure by style reveals description weaknesses |
| World state | RCON-reset fixtures per prompt | Deterministic starting state; reproducible reruns |
| Fixture complexity | Simple: tp + time/weather + inventory + nearby entity spawns | Achievable with RCON in <2s; no structure-building required |
| Oracle | RCON + NanoOracleBot (independent observer bot) | Recovers actor/observer pattern for world-state assertions |
| Scoring | OpenAI Responses judge (`OPENAI_JUDGE_MODEL`, default `gpt-5`) with fixed JSON template | Keeps Epoch 5 pipeline single-vendor and operationally simple while preserving structured rubric scoring |
| Model | `gpt-5-nano` via OpenAI Responses API + `type: mcp` tool | The primary NORTH-STAR target |
| Scope | Full 10 epics, ~150 prompts | Evidence at scale |
| Checkpoint | Hard stop after first 20 judged prompts; review before full run | Catch systemic failures before committing full cost |

### The 10 Epics

| # | Name | Core question | Tool surface focus |
|---|---|---|---|
| 1 | Quick status reads | Does nano pick the right read-only tool for simple state questions? | `observe`, `status` |
| 2 | Single-verb actions | Does nano map a direct imperative to one correct tool call? | `chat`, `move`, `dig`, `place`, `use`, `inventory` |
| 3 | Implicit multi-step ("find X") | Does nano chain observation → reasoning → final answer? | `observe(blocks/entities/players)` + synthesis |
| 4 | Explicit multi-step ("do X then Y") | Does nano sequence tools and use outputs to inform next calls? | Any 2+ tool composition |
| 5 | Block-interaction disambiguation | Does nano pick the right tool among dig/place/use/inventory-open given overlapping semantics? | `dig`, `place`, `use(action=block)`, `inventory(action=open)` |
| 6 | Inventory reasoning | Does nano navigate the 7-action `inventory` enum correctly? | `inventory` |
| 7 | Entity targeting | Can nano extract entity IDs or usernames and pass them correctly? | `attack`, `move(follow)`, `move(look_at_player)`, `observe(entities)` |
| 8 | Survival response | Given world state, does nano infer the right survival action without explicit command? | `use(eat)`, `use(sleep)`, `move`, `attack` |
| 9 | Refusal / clarification | Does nano refuse impossible tasks instead of hallucinating tool calls? | Negative space — any tool call is suspect |
| 10 | Ambiguity traps | Given prompts between two reasonable tools, does the description layer disambiguate? | Cross-tool |

Target: ~15 prompts per epic → ~150 prompts total.

### Artifacts

**Committed to repo:**

| File | Contents |
|---|---|
| `testing/gameplay-epics-v2.md` | 10-epic descriptions with style intent and example prompts |
| `testing/prompt-library.md` | The live prompt corpus — style-tagged, fixture-noted, epic-tagged |
| `testing/nano-judging.md` | Judge template, dimensions, scoring rubric |
| `testing/epoch-005-retrospective.md` | Published post-epoch retrospective (sanitized) |

**Gitignored (under `opencode/epoch5/`):**

| Path | Contents |
|---|---|
| `corpus/<epic>/` | Prompt JSONs with fixture definitions |
| `runs/<ts>/` | Raw traces from nano (full Responses API JSON per prompt) |
| `judgments/<ts>/` | Judge outputs per prompt |
| `reports/<ts>/` | Aggregated reports |
| `corpus-research/` | Gemini research output, brief, intermediate artifacts |
| `epoch_005.md` | Full (unsanitized) retrospective |

### Scripts to build

| Script | Purpose |
|---|---|
| `scripts/epoch5-fixture-apply.js` | Apply a fixture JSON to the world via RCON |
| `scripts/epoch5-fixture-teardown.js` | Return bot to clean baseline after a prompt |
| `scripts/epoch5-run.js` | Main runner: fixture → nano call → trace capture |
| `scripts/epoch5-judge.js` | OpenAI judge: trace → scored judgment JSON |
| `scripts/epoch5-report.js` | Aggregate all runs + judgments into a summary report |

### Execution order

1. **Phase A** — Corpus production (Gemini research → prompt library → `testing/prompt-library.md`)
2. **Phase B** — Fixture production (materialize RCON setups per prompt)
3. **Phase C** — Build and validate runner (dry-run mode, 20-prompt checkpoint)
4. **Phase D** — Build judge pipeline
5. **Phase E** — Full 150-prompt run + judgment pass
6. **Phase F** — Aggregation, retrospective, recommendations for Epoch 6

### Risk register

| Risk | Mitigation |
|---|---|
| Corpus biased by generator's blind spots | Keep style diversity high and run periodic human spot-checks across epics to catch generator blind spots |
| Fixture infeasible for some prompts | Drop or simplify at Phase B; flag in corpus review |
| Judge bias toward particular answer shapes | Cross-check 10% of judgments with a second judge; investigate systematic disagreements |
| nano fails systemically on first 20 | 20-prompt checkpoint exists specifically to catch this before full-cost commitment |
| Local fixture setup drifts between runs | Re-apply fixture + teardown per prompt; keep Docker world deterministic |
| Local MCP endpoint mismatch | Use a single local HTTP MCP endpoint per run (`http://127.0.0.1:<port>/mcp`) and fail fast on health checks |
| Full-scope cost overrun | Back-of-envelope: nano (~$0.05/prompt) + judge (~$0.10/prompt) × 150 ≈ $20–30 total. Acceptable |

### Environment requirements

New env vars needed (add to `.env`, add placeholders to `.env.example`):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | nano Responses API calls (already present) |
| `EPOCH5_MCP_URL` | Local MCP endpoint for Epoch 5 runner (for example `http://127.0.0.1:8080/mcp`) |
| `OPENAI_JUDGE_MODEL` | Judge model for `scripts/epoch5-judge.js` (default `gpt-5`) |
| `OPENAI_BASE_URL` | Optional Responses API base URL override for local/testing gateways |
| `RCON_HOST` | RCON for fixture setup/teardown |
| `RCON_PORT` | RCON port |
| `RCON_PASSWORD` | RCON password |

### Implementation status (current)

Implemented in-repo:

- `scripts/epoch5-fixture-apply.js` and `scripts/epoch5-fixture-teardown.js`
- `scripts/epoch5-run.js` (dry-run and live nano path)
- `scripts/epoch5-judge.js` (dry-run and live OpenAI judge path)
- `scripts/epoch5-report.js`
- Epoch 5 docs: `testing/gameplay-epics-v2.md`, `testing/nano-judging.md`, `testing/epoch-005-retrospective.md`
- Automated tests: `test/epoch5.test.js`

Scope still remaining for Epoch 5 completion:

1. Materialize full prompt corpus JSONs under `opencode/epoch5/corpus/` for all 10 epics.
2. Execute the 20-prompt checkpoint run and review results before full-scale pass.
3. Run full judged dataset (target ~150 prompts) and produce per-epic coverage of at least 10 judged prompts.
4. Publish finalized `testing/epoch-005-retrospective.md` with findings and Epoch 6 recommendations.

### What "done" looks like

Epoch 5 is complete when:

1. All 10 epics have ≥ 10 judged prompts each.
2. A summary report exists with per-epic and overall numbers.
3. NORTH-STAR's three numeric targets are either confirmed met or confirmed
   not met with specific evidence of where and why.
4. `testing/epoch-005-retrospective.md` is published.
5. Recommendations for Epoch 6 are written (tool-description rewrites,
   schema changes, or tool re-consolidations — whatever the evidence supports).

---

## Future epochs (directional, not committed)

- **Epoch 6** — Address the top failure modes from Epoch 5. Likely:
  tool-description rewrites, possible re-consolidation, possible schema
  changes. Re-run affected epics to confirm improvement.
- **Epoch 7** — Advanced gameplay: PVP, redstone, Nether/End.
- **Epoch 8** — Multi-server split: domain-specific MCP servers (3–6 tools
  each), composable at the agent runtime.

---

## Design commitments (non-negotiable, all epochs)

1. **No ghost tools.** `assertCompleteness()` must pass at every point.
2. **No chat-as-command.** World edits use mineflayer APIs exclusively.
3. **Errors carry codes.** `normalizeError()` handles all throw shapes.
4. **Stdout is sacred.** Logs go to stderr only.
5. **One bot, many sessions.** HTTP entrypoint never spawns per-session.
6. **Tools do; resources observe.**

---

## Where to look

| If you want to know... | Read... |
|---|---|
| What the software does | `README.md` |
| How to develop changes | `CONTRIBUTING.md` |
| What tools & resources exist | `README.md` § Current surface |
| The testing methodology | `testing/novelty.md` |
| The gameplay epics (Epochs 2–3) | `testing/gameplay-epics.md` |
| The prompt corpus (Epoch 5) | `testing/prompt-library.md` |
| The judge rubric (Epoch 5) | `testing/nano-judging.md` |
| Epoch 1 retrospective | `testing/epoch-001-retrospective.md` |
| Epoch 5 retrospective | `testing/epoch-005-retrospective.md` (published post-epoch) |
| Local deployment specifics | `opencode/context/local/spec.md` (gitignored) |
| Every bug ever found | `opencode/issues.md` (gitignored) |
