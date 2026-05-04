# NORTH-STAR.md — Project Objectives

This document captures the long-term direction of `mineflayer-mcp`.
It is not a backlog, not a spec, not a README. It is the answer to
"what are we building toward and why?"

---

## Primary objective

**A Minecraft MCP server that works reliably with the cheapest
frontier models available.**

The target consumer is `gpt-5-nano` — the smallest, cheapest model
in the OpenAI frontier lineup. It features a 400k total context
window (272k input, 128k output). If the MCP server works well with
nano-tier models, it works everywhere. The reverse is not true: a
server that requires Claude 200k or GPT-4-turbo to select tools
correctly is not a useful product at scale.

### What "works" means

1. **Tool selection accuracy.** The model picks the right tool on the
   first attempt, without confusion between similar tools, in ≥95%
   of straightforward gameplay scenarios.
2. **Argument correctness.** The model fills tool arguments correctly
   without needing re-prompting, in ≥90% of calls.
3. **Token budget.** The full tool surface (schemas + descriptions)
   should fit within ~8k tokens. With a 272k input window on
   `gpt-5-nano`, this is <3% of available context — leaving room
   for rich conversation history, system prompts, and multi-turn
   reasoning. The constraint is not capacity but clarity: tool
   descriptions must be terse enough that the model doesn't lose
   signal in the noise.
4. **Latency.** A single tool call round-trip (model decision +
   MCP call + response) completes in under 3 seconds p95.

---

## Design principles

### Fewer tools, richer verbs

The single most impactful decision for nano-tier compatibility is
**tool count**. Every tool in the `tools/list` response consumes
tokens and creates selection-ambiguity surface. The target is:

- **≤ 12 tools** exposed to the model at any given time.
- Each tool is a meaningful verb that covers a category of action,
  not a single atomic operation.
- Complex operations are expressed as arguments to a broader tool,
  not as separate tools.

Example: instead of 6 separate tools (`open_container`, `take_item`,
`deposit_item`, `close_container`, `equip_item`, `drop_item`), expose
one `inventory` tool with an `action` enum. The schema is slightly
richer, but the model only has to decide "I need to do an inventory
thing" — not choose between 6 ambiguous options.

### Descriptions are for the model, not for humans

Every tool description must be written as if the reader is a
nano-tier model with limited reasoning budget. This means:
- Short, unambiguous, distinct from every other tool description.
- No overlapping verbs across tools.
- No jargon the model hasn't been trained on.
- The first sentence should be sufficient to disambiguate from all
  other tools.

### Split-ready architecture

The codebase must be structured so that splitting into multiple
domain-specific MCP servers is a refactor, not a rewrite.

**Future state (directional, not committed):**

```
mineflayer-mcp-observe     — world state, position, health, entities
mineflayer-mcp-move        — navigation, look-at, follow
mineflayer-mcp-interact    — build, dig, attack, activate, use items
mineflayer-mcp-inventory   — equip, drop, containers, craft
mineflayer-mcp-survive     — eat, sleep, safety behaviors
```

Each would be a standalone MCP server with 3–6 tools, composable at
the agent runtime level. An agent that only needs movement doesn't
load the full 30-tool surface.

**Today's action:** keep all tools in one server but structure the code
so that splitting is a file-boundary change, not a logic-rewrite.
`src/tools.js` should evolve toward `src/tools/*.js` modules grouped by
domain, with a central registry that composes them.

### Token cost is a first-class constraint

Every byte in the `tools/list` response has a per-call cost. When
designing tool schemas:
- Omit `description` fields on properties that are self-explanatory
  from the name.
- Keep enum value lists short — if there are 20 block types, don't
  enumerate them in the schema; let the model figure it out from
  context.
- Prefer `type: "string"` with a good description over
  `type: "string", enum: [...]` with a long list.

---

## Secondary objectives (in priority order)

### 1. Full casual survival-gameplay coverage

The server should support the entire natural loop of survival
Minecraft: observe → move → gather → craft → build → fight → eat →
sleep → explore. As of Epoch 3 completion, this is achieved with 30
tools. The next step is to consolidate those 30 into ~10–12 without
losing any capability.

### 2. Observable, verifiable behavior

Every tool call should produce a response that is independently
verifiable via RCON or a second bot. The actor/observer testing
pattern from Epochs 2–3 should remain viable at any tool count.

### 3. Zero ghost tools, zero silent failures

The `assertCompleteness()` invariant is non-negotiable. No tool is
advertised that doesn't dispatch. No tool silently succeeds when the
server rejects the action (Issue #005 taught us this — reach checks
must be client-side).

### 4. Deployable anywhere with zero config

The Docker Compose + `.env` pattern should be all a new user needs.
Clone, `docker compose up`, `cp .env.example .env`, run. No secrets
in source, no hardcoded hostnames.

---

## What this document is NOT

- Not a backlog. It doesn't have "issues" or "stories."
- Not a spec. It doesn't have acceptance criteria or exit conditions.
- Not a README. It doesn't explain how to run the software.

It is the compass. When there's a design disagreement ("should we add
a 13th tool or consolidate two existing ones?"), this document answers
it: **consolidate, because nano-tier accuracy degrades with count.**
