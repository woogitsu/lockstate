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

## Repository governance

Before making changes, read:
1. [`AGENTS.md`](./AGENTS.md) — canonical rules for all coding agents
2. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — runtime architecture
3. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — development order
4. [`docs/adr/`](./docs/adr/) — accepted architectural decisions

Claude Code uses `CLAUDE.md`. Google Antigravity uses `.agents/rules/`. Both defer to `AGENTS.md` so agent-specific instructions cannot drift apart.

## Current status

Pre-alpha foundation. The repository is establishing architecture, tooling, test/benchmark infrastructure and implementation contracts before gameplay systems are allowed to accumulate dependencies on unstable foundations.

## Development principle

A feature is not complete because it appears to work visually. It is complete only when its contracts are typed, tests pass, build succeeds, persistence implications are understood, performance-sensitive code has evidence, and relevant documentation is updated.
