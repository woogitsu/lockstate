# Dependency and toolchain policy

Lockstate uses an explicitly pinned development toolchain so clean checkouts resolve to the same dependency graph on developer machines and CI.

## Supported toolchain

- Node.js `24.19.0` LTS, recorded in `.node-version` and enforced by CI.
- pnpm `11.22.0`, recorded in `packageManager` and activated through Corepack.
- Direct dependencies and devDependencies use exact versions; ranges and `latest` are not permitted.
- Transitive dependencies are fixed by the committed `pnpm-lock.yaml`.
- Dependency install scripts are denied by default. Only packages listed in `pnpm-workspace.yaml` under `allowBuilds` may execute build scripts.

## Install and verification

Use:

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` runs type checking, tests, and the production build. CI must use `--frozen-lockfile`; it must never repair or regenerate the lockfile silently.

## Upgrade process

Dependency changes are made in a dedicated, reviewable pull request or issue-bound commit:

1. Read release notes and migration guidance for every direct dependency being changed.
2. Prefer compatible patch releases. Minor or major changes require an explicit compatibility review; architecture-impacting changes require an ADR.
3. Update exact versions in `package.json`.
4. Regenerate `pnpm-lock.yaml` with the repository's pinned Node.js and pnpm versions.
5. Review changes to approved dependency build scripts; do not broaden `allowBuilds` without a concrete need.
6. Run a clean frozen install followed by `pnpm verify`.
7. Record behavior, security, deployment, or browser-compatibility risks in the pull request.

Emergency security updates may be expedited, but they still require a committed lockfile and passing verification. Automated dependency update tools may open pull requests; they may not merge changes without the normal quality gates.
