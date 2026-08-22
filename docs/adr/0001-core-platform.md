# ADR-0001: Core platform and runtime boundaries

- Status: Accepted
- Date: 2026-08-22

## Context
Lockstate is a new browser simulation expected to evolve for years. The project explicitly prefers durable architecture over fast prototypes that later require migrations.

## Decision
Use:
- Phaser 4.2.x for world rendering,
- TypeScript strict mode,
- Vite 8.2.x,
- Cloudflare Workers Static Assets as the production delivery target,
- Supabase for Auth, Postgres metadata, Storage and future trusted edge capabilities,
- IndexedDB for local-first persistence,
- a Dedicated Web Worker for the deterministic simulation kernel,
- pnpm for dependency management.

The simulation, renderer, browser UI and persistence layers remain separate modules with typed boundaries.

## Consequences
Positive:
- no planned Phaser 3 -> 4 migration,
- no planned JavaScript -> TypeScript migration,
- no planned Pages -> Workers migration,
- simulation can scale independently of rendering,
- local play remains resilient to network loss,
- trusted server-side features can be added later without relocating the core game loop.

Costs:
- larger up-front architecture effort,
- worker message contracts must be designed early,
- save schema/migrations and benchmark infrastructure are required before feature velocity accelerates.

These costs are intentionally accepted.
