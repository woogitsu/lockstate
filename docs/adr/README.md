# Architecture Decision Records

This file is the index of every ADR in this directory, and the only recorded
statement of which numbers are taken. Adding an ADR means adding its row here
in the same commit — the number is not reserved until it appears below.

`tests/foundation/adr-numbering-contract.test.ts` enforces the mechanical part
of that: filenames are `NNNN-kebab-case.md`, each four-digit prefix is unique,
the number in the filename matches the number in the `# ADR…` heading, every
ADR has a parseable `Status`, and every relative link to an ADR from `docs/`
resolves to a file that exists. It does not check this table, so the table is
maintained by hand.

## Status values in this table

The `Status` column reproduces what each ADR's own document says, not a
normalised judgement. Two heading styles are in use — some ADRs carry a
`- Status:` bullet and others a `## Status` section — and several ADRs are
`Proposed` rather than `Accepted`. A `Proposed` ADR is awaiting the owner's
approval and is not binding, whether or not code already implements it.

Whether any `Proposed` ADR should be promoted is open issue #118's subject, not
this index's. Nothing here changes a status; this table only reports them.

| # | Title | Status |
| --- | --- | --- |
| [0001](./0001-core-platform.md) | Core platform and runtime boundaries | Accepted |
| [0002](./0002-cloudflare-static-assets.md) | Cloudflare Workers Static Assets delivery | Accepted |
| [0003](./0003-simulation-worker-protocol.md) | Versioned simulation worker protocol | Accepted |
| [0004](./0004-chunk-size-selection.md) | Chunk size selection and parcel decoupling | Accepted |
| [0005](./0005-entity-storage-model.md) | Entity Storage Model | Accepted |
| [0006](./0006-simulation-worker-adapter.md) | Simulation Worker Adapter Lifecycle | Accepted |
| [0007](./0007-navigation-work-budgets-and-flow-fields.md) | Navigation Work Budgets, Request Fairness and Flow-Field Sharing | Accepted |
| [0008](./0008-trusted-service-boundary.md) | Trusted Service Boundary and Threat Model for Product Features | Accepted |
| [0009](./0009-challenge-verification-strategy.md) | Bounded Verification Strategy for Challenges and Leaderboards | Accepted — implementation gated |
| [0010](./0010-telemetry-and-diagnostics-privacy.md) | Privacy-Controlled Telemetry and Crash Diagnostics | Accepted |
| [0011](./0011-localization-architecture.md) | Localization Architecture and Stable-ID Separation | Accepted |
| [0012](./0012-derived-identifier-reproducibility.md) | Reproducibility of Derived Simulation Identifiers | Proposed |
| [0013](./0013-free-tier-cloud-save-capacity.md) | Free-tier cloud-save capacity and where it is enforced | Proposed — pending human approval |
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Art storage, generated-versus-source policy and runtime asset delivery | Proposed |
| [0015](./0015-actor-identity-allocation.md) | Actor Identity Is Allocated, Not Derived | Proposed |
| [0016](./0016-migration-delivery-mechanism.md) | Which mechanism applies migrations, and to which project | Proposed — pending human approval |
| [0017](./0017-money-primary-resource-model.md) | Money Is the Primary Resource; Materials Are Procured | Proposed — pending human approval |
| 0018 | *Reserved by open PR #91 — not in this directory* | not merged, PR held |
| [0019](./0019-tile-ownership-under-overlapping-parcels.md) | What "owned" means for a tile under overlapping parcels | Accepted |
| [0020](./0020-deterministic-kernel.md) | Deterministic Kernel and Scheduler | Accepted |
| [0021](./0021-http-response-security-headers.md) | HTTP response security headers for the static-asset deployment | Proposed — pending human approval |

**Next free number: 0022.**

## 0018, claimed by work that has not merged

0018 is the one number with no file in this directory. It is listed above
because computing the next free number from `ls docs/adr/` alone would hand it
out a second time: open PR #91 adds `docs/adr/0018-construction-material-supply.md`.

That PR is held by an explicit owner decision. Because it is held, its number
may go stale: if it ever lands, its ADR should be renumbered to whatever the
next free number is at that time, and this table updated to match.

Do not reuse 0018 while #91 is open. If it is closed without merging, release
the number by editing this table in the same commit.

## Why 0004 appears once and the kernel ADR is 0020

Two ADRs were both numbered 0004: the chunk-size ADR (added in `cfa2b44`) and
the deterministic-kernel ADR (added in `aae2fbc`, 23 minutes later). Issue #117
records the collision, and that citations of "ADR 0004" elsewhere in the
repository had already split between the two documents depending on where they
were written.

The later-authored ADR moved, following the precedent set by `2edb75c`
("Renumber the art-storage ADR to 0014 after 0012 and 0013 were taken"). The
kernel ADR became 0020 rather than 0017 or 0018 because both were already
claimed: 0017 by PR #137 (open when the rename was made, merged since) and
0018 by PR #91, which is held. 0020 was the lowest number free without
coordinating with unmerged or held work. `0004` now means chunk-size only.
