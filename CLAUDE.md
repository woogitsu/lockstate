# Claude Code instructions for Lockstate

`AGENTS.md` is the canonical agent contract for this repository and MUST be read before implementation work.
`docs/AGENT_WORKFLOW.md` is the operating method that accompanies it — how work continues across sessions, how it is split across several agents, and what evidence a finding needs. Read it before dispatching agents.

Additional Claude-specific rules:
- Use repository docs and ADRs as the source of truth.
- Prefer small reviewable commits tied to GitHub Issues.
- Do not invent replacement architecture when an ADR already exists.
- When an issue affects simulation determinism, persistence format, worker boundaries, rendering architecture, security, or deployment, inspect the relevant architecture document first.
- If a necessary architectural decision is genuinely absent, create or propose an ADR instead of silently deciding inside implementation code.
- Do not trade correctness or maintainability for reduced token usage or fewer tool calls.
