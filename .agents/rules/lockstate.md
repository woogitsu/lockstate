# Lockstate repository rules

Read `/AGENTS.md` first. It is the canonical operating contract.

For Antigravity agents:
- Follow linked ADRs and issue dependencies before implementation.
- Preserve the simulation/rendering/persistence boundaries.
- Use TypeScript strict mode and do not weaken compiler settings.
- Complete acceptance criteria and tests before moving to the next issue.
- Prefer durable architecture over quick prototypes that require later migration.
