# Lockstate repository rules

Read `/AGENTS.md` first. It is the canonical operating contract.

For Antigravity agents:
- Follow linked ADRs and issue dependencies before implementation.
- Preserve the simulation/rendering/persistence boundaries.
- Use TypeScript strict mode and do not weaken compiler settings.
- Complete acceptance criteria and tests before moving to the next issue.
- Prefer durable architecture over quick prototypes that require later migration.
- A new visual identity/HUD/voice direction was delivered 2026-09-13, vendored
  verbatim at `docs/design/2026-09-13-identity-v5/`. `docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md`
  is **Accepted by the owner**, in five rulings recorded in its Status block;
  two went against its recommendations, so read the block rather than the
  headline.
- Before touching `src/ui/`, read `docs/VISUAL_IDENTITY.md` first: it is the
  binding reading of that delivery and the gap against today's code.
