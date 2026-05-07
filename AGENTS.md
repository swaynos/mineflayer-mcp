# AGENTS.md

Operating rules for AI agents working in this repository.

## Secrets

- Never commit secrets (`.env`, API keys, passwords, tokens, private keys).
- If a secret is found in the tree, stop and flag it.

## Commit and push discipline

- Never `git commit` without explicit human permission.
- Never `git push` without explicit human permission.
- Never force-push, rewrite history, or bypass hooks unless explicitly requested.

## Required workflow

1. Work from an explicit objective (`SPEC.md` when present).
2. Add or update tests in `test/` for behavior changes.
3. Run required automated verification (see `CONTRIBUTING.md`).
4. Require peer review before declaring completion.

For agent-driven loops, `@autonomous` is the builder and `@peer-review` is the
required reviewer. Builder completion is blocked if peer review returns
blocking findings. Agent definitions and role contracts live in
`https://github.com/swaynos/cuddly-winner/tree/main/agents`.

## Validation commands

```sh
# Step 0: start the project-owned Docker stack (always required)
docker compose -f docker-compose.dev.yaml up -d

# Step 1: deterministic world checks (always required before declaring done)
npm test

# Step 2: agent behavior checks (required when touching user-facing surface)
npm run test:agent
```

Never declare completion from `{ ok: true }`. An assertion must prove world, bot, or
MCP-client-visible change via RCON or a real MCP client call.

## Tool usage policy

Allowed without asking:

- `python3` / `python`
- `node`, `npm`
- Read-only `git` commands (`status`, `diff`, `log`, `branch`, `show`)
- `git add`, `git rm`
- `curl`, `kill`, `ps`, `ls`, `wc`, `head`, `which`

Always ask:

- `ssh`, `scp`
- `git commit`, `git push`, `git rebase`, `git reset`
- `rm`
- Any command not explicitly allowed above

Never allowed:

- `sudo`
