# Lockstate.io

Lockstate.io is a browser-first prison management simulation built for long-lived, large-scale play without requiring installation. Players will be able to start locally, continue across devices through cloud saves, and expand a prison across a chunked world by purchasing additional land.

## Engineering direction

The project intentionally prioritizes durable architecture over rapid prototyping that would require later migrations.

Core platform:
- TypeScript strict mode
- Phaser 4.2.x
- Vite 8.2.x
- Cloudflare Workers Static Assets
- Supabase Auth/Postgres/Storage
- IndexedDB local-first persistence
- Dedicated Web Worker simulation kernel
- deterministic fixed-step simulation
- chunked sparse world
- hierarchical, budgeted navigation
- Blender -> pre-rendered 2D sprite atlas pipeline

## Product targets

- desktop, tablet and mobile web
- remappable controls with QWERTY/AZERTY-aware keyboard handling
- high-quality semi-realistic top-down visuals with visible object sides
- eight-direction character rendering
- very large prisons and stress testing up to several thousand active actors
- anonymous play with later account upgrade
- multiple prisons per account; five free save slots is the current product direction, with future optional paid expansion
- multi-device save conflict protection rather than silent last-write-wins overwrites

## Getting started

Required versions are Node.js 24.19.0 and pnpm 11.22.0.

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:benchmark
pnpm verify:deployment
pnpm dev
```

`pnpm verify:assets` validates the generated runtime atlases against the
authored art contract. It reads the PNGs, which live in Git LFS, so it needs the
`git-lfs` client and the content itself:

```bash
scripts/provision-git-lfs.sh   # installs git-lfs if missing; no-op if present
git lfs pull
pnpm verify:assets
```

See [`docs/ART_PIPELINE.md`](./docs/ART_PIPELINE.md) and
[ADR-0014](./docs/adr/0014-art-storage-and-runtime-asset-delivery.md), whose `Status`
is `Accepted` — it describes the pipeline the repository implements, and that
pipeline is now the approved one rather than a proposal it happens to match.

Production-like local preview:

```bash
pnpm build
pnpm preview
```

See [`docs/DEPENDENCY_POLICY.md`](./docs/DEPENDENCY_POLICY.md) for controlled dependency upgrades, [`docs/TESTING.md`](./docs/TESTING.md) for the executable testing contract, [`docs/BENCHMARKING.md`](./docs/BENCHMARKING.md) for repeatable performance evidence, [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for Cloudflare environments, dry-runs, custom-domain setup, cache policy, smoke tests and rollback, and [`docs/TRUSTED_SERVICES.md`](./docs/TRUSTED_SERVICES.md), [`docs/TELEMETRY.md`](./docs/TELEMETRY.md) and [`docs/LOCALIZATION.md`](./docs/LOCALIZATION.md) for the trust boundary, privacy controls and localization contract.

## Repository governance

Before making changes, read:
1. [`AGENTS.md`](./AGENTS.md) — canonical rules for all coding agents
2. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — runtime architecture
3. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — development order
4. [`docs/adr/`](./docs/adr/) — architectural decision records. Read the `Status` line of any ADR before treating it as settled. **Exactly one is `Proposed` — [0029](./docs/adr/0029-concurrent-room-use-claims.md), concurrent-use claims on a room** — and it is awaiting the owner's approval and is not binding, even though the change implementing it is in the tree. Every other ADR on disk is `Accepted`, several with a qualifier the document itself carries. [`docs/adr/STATUS-QUEUE.md`](./docs/adr/STATUS-QUEUE.md) §2 is the entry to read for 0029, and the sections after it record where an accepted decision and the code still disagree.

Claude Code uses `CLAUDE.md`. Google Antigravity uses `.agents/rules/`. Both defer to `AGENTS.md` so agent-specific instructions cannot drift apart.

## Current status

Pre-alpha foundation. The repository is establishing architecture, tooling, test/benchmark infrastructure and implementation contracts before gameplay systems are allowed to accumulate dependencies on unstable foundations.

## Development principle

A feature is not complete because it appears to work visually. It is complete only when its contracts are typed, tests pass, build succeeds, persistence implications are understood, performance-sensitive code has evidence, and relevant documentation is updated.
