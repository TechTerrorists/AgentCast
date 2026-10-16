@AGENTS.md

## Claude Code notes
- `AGENTS.md` above is the canonical project guide. Put shared instructions there, not here, so Codex and opencode see them too.
- AgentCast itself drives Claude Code headlessly (`claude -p`) as its default LLM backend, on the user's subscription login. When working on `packages/llm`, test with `--restricted --strict-mcp-config` and never `--bare`.
