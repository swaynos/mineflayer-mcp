# testing/

Methodology documents for the `mineflayer-mcp` test campaign. These are
committed to the repo so contributors and observers can understand how the
project is tested and why the approach works the way it does.

| File | Contents |
|---|---|
| `novelty.md` | Deterministic 10-rule scoring system that decides whether a proposed test case is worth running |
| `gameplay-epics.md` | The 8 natural-gameplay themes driving the current test epoch, framed around the actor/observer pattern |
| `epoch-001-retrospective.md` | Post-mortem of the first 500-iteration test run — what was kept, what broke, what the loop got wrong |

## What lives here vs. elsewhere

- `testing/` — methodology docs (committed, public)
- `test/` — formal scenario specs and harness instructions (committed, public)
- `opencode/` — operational artifacts: iteration files, coverage index, issues ledger, deployment secrets (gitignored, local only)
