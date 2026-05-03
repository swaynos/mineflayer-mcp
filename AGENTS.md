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
