# CONTRIBUTING.md

Contribution guidelines for this repository.

Audience: human builders and agentic coders. The same rules apply to both.

## Development model

- `README.md` explains what the software does, for user-facing setup and operational usage.
- `SPEC.md` defines what is being tested next and why, for current contract, phases, and done criteria.
- `NORTH-STAR.md` defines long-term direction and decision principles, for strategic direction and architectural intent.
- `CONTRIBUTING.md` defines how changes are developed, validated, and reviewed, for shared builder workflow (human and agent), review,
  and iteration hygiene.


When documents disagree on implementation details, `SPEC.md` is authoritative
for the current execution cycle. `NORTH-STAR.md` remains the long-term compass.

## Required agent workflow

1. Work from an explicit objective (`SPEC.md` for scoped implementation loops).
2. Keep progress and verification evidence in `progress.txt` during execution.
3. Run automated verification relevant to the change.
4. Require peer review before declaring completion.

For agent-driven loops, `@autonomous` is the builder and `@peer-review` is the
required reviewer. Builder completion is blocked if peer review returns
blocking findings. Agent definitions and role contracts live in
`https://github.com/swaynos/cuddly-winner/tree/main/agents`.

## Testing and review expectations

- Do not weaken tests to force passing results.
- Add or update tests for behavior changes, or explicitly document why no behavior-level test applies.
- Keep deterministic checks preferred over subjective checks where possible.
- Record verification evidence in a structured way that matches the active test stack (what was run, pass/fail, and key outputs).

## `opencode/` iteration layout (current practice)

Current local structure for iterative runs:

- `opencode/iterations/<NNN>/`
  - `spec.md` (iteration objective)
  - `progress.txt` (checklist + running log)
  - `fingerprint.json` (novelty fingerprint)
  - `novelty.json` (score + rule booleans)
  - `run.json` (run artifact pointer/summary)
  - `judge.json` (judgment summary)
  - `peer-review.json` (review verdict + findings)
  - `result.json` (`PASS` / `BLOCK` / `STUCK` and reason)
- `opencode/iterations/INDEX.md` (chronological iteration index)
- `opencode/iterations/COVERAGE.json` (novelty coverage index)
- `opencode/iterations/RESUME.md` (resume pointer)
- `opencode/issues.md` (shared backlog of discovered problems across iterations; create it when first needed)
- `opencode/novelty.md` (shared scoring rubric used to judge whether a run produced meaningfully new behavior; create it when first needed)

Status note: files under `opencode/` besides `issues.md` and `novelty.md` are
generally treated as disposable iteration artifacts. This is an
observation of current practice, not a permanent rule.
