# AGENTS.md

Operating rules for AI agents working in this repository.

## Secrets

- **Never commit secrets.** No tokens, API keys, passwords, private keys,
  `.env` files, OAuth credentials, session cookies, or any other sensitive
  material belongs in git history.
- If you find a secret in the working tree, stop and flag it to the human
  before doing anything else.
- Treat hostnames, internal paths, and user identifiers as secret-adjacent:
  keep them in local config that is gitignored, not in committed source.

## Commit & push discipline

- **Never `git commit` without explicit human permission.** A request to
  "fix X" or "add Y" is not permission to commit.
- **Never `git push` without explicit human permission.** This is separate
  from commit permission — ask again before pushing.
- **Never force-push, rewrite history, or bypass hooks** unless the human
  has explicitly asked for that specific action in that specific session.
- When in doubt, stop and ask.


## Required agent workflow

1. Work from an explicit objective (`SPEC.md` for scoped implementation loops).
2. Keep progress and verification evidence in `progress.txt` during execution.
3. Run automated verification relevant to the change.
4. Require peer review before declaring completion.

For agent-driven loops, `@autonomous` is the builder and `@peer-review` is the
required reviewer. Builder completion is blocked if peer review returns
blocking findings. Agent definitions and role contracts live in
`https://github.com/swaynos/cuddly-winner/tree/main/agents`.

## Tool usage policy

This section is the authoritative permission policy for all agents working
in this repository.

**Allowed without asking:**
- `python3` / `python` — preferred tool for local file maintenance, RCON
  operations, and fixture setup. Use Python scripts in preference to raw
  bash for anything non-trivial.
- `node`, `npm` — running MCP server, smoke tests, nano-smoke harness.
- Read-only `git` commands (`status`, `diff`, `log`, `branch`, `show`,
  `stash`).
- `git add`, `git rm` — staging changes (commit still requires approval).
- `curl`, `ngrok`, `kill`, `ps`, `ls`, `wc`, `head`, `which`, `brew`.

**Always ask (never auto-approve):**
- `ssh`, `scp` — remote shell / file transfer to any host.
- `git commit`, `git push`, `git rebase`, `git reset` — history-changing.
- `rm` — destructive local deletion.
- Any command not matched by an explicit allow rule.

**Never allowed:**
- `sudo` — privilege escalation. Never allowed under any circumstances.
  If a task requires `sudo`, output the exact command(s) to the user and
  ask them to run it manually, then wait for confirmation before proceeding.

**Practical guidance:**
- Connection details for remote hosts, RCON, and services live in `.env`
  (gitignored). Read them from there; never hardcode hostnames, ports, or
  credentials in scripts or source files.
- When RCON fixture setup is needed, write a Python script that sends RCON
  commands directly over TCP using values from `.env` — this avoids needing
  `ssh` approval for fixture work.
- For file operations in `/tmp/`, permission is pre-granted.
