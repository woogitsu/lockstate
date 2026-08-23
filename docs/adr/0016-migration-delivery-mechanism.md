# ADR 0016: Which mechanism applies migrations, and to which project

## Status

**Proposed — pending human approval.** Not accepted.

The owner has asked for migrations to be applied automatically rather than
by hand. That preference is taken as given and is **not** what this ADR asks
approval for. What needs a decision is the part the preference does not
settle: automatic application is irreversible, so *which project* it may
reach, and what happens to the gate that currently exists to stop exactly
this.

A reviewer is being asked to sign off on one thing: **staging is applied
automatically, production is not, and the two are different Supabase
projects.**

## Context

Two mechanisms can apply `supabase/migrations/` to a hosted project, and the
repository currently assumes only one of them exists.

### The mechanism the repository documents

`.github/workflows/migrate-database.yml` carries this in its header, and it
is the reason the workflow is shaped the way it is:

> `supabase db push` applies migrations to a live project and is not
> reversible. Attaching it to a merge would mean any pull request could
> alter production data as a side effect of being merged.

It therefore runs only on `workflow_dispatch`, only through a GitHub
Environment, only after the operator types the target project ref back as
confirmation, and it defaults `dry_run` to true. `docs/DEPLOYMENT.md`
restates the same policy in its "Automated deployment" table: migrations are
"manual dispatch only", gated by "environment approval **and** a typed
project ref".

### The mechanism now being introduced

Supabase's GitHub integration has a **Deploy to production** option which
automatically deploys changes when you push or merge to the production
branch, running the migrations under `supabase/migrations/`.
Per-pull-request preview branches require the Pro plan; deploying on merge
does not, so this is available to the project as it stands today.

That is precisely "attaching it to a merge" — the thing the workflow header
names and refuses. The two mechanisms are not complementary as written;
enabling the second silently repeals the policy the first exists to enforce,
and leaves `docs/DEPLOYMENT.md` asserting something untrue.

### What makes the risk asymmetric

The schema is not in a steady state. `docs/DEPLOYMENT.md` records that the
SQL "has never been applied to a hosted project", and issue #20's real-stack
verification found that a fresh Supabase project no longer grants the Data
API roles table privileges by default — a discovery only possible by running
against a real project. There will be more such discoveries, and each one is
a migration written against an assumption that turned out to be false.

Applying those automatically to a **disposable** project is how they get
found. Applying them automatically to a project holding player saves is how
they get found too late. Migration rollback is not automated
(`docs/DEPLOYMENT.md`, "Rollback"), so "too late" has no undo.

## Decision

### 1. The GitHub integration is connected, and owns **staging only**

The Supabase GitHub integration is connected to `matmaxalez/lockstate` with
**Deploy to production** enabled, pointed at the `lockstate` project.
Merging to `main` applies migrations to it without further approval.

This is safe for that project and for no other, because the `lockstate`
project **is** the staging target: it holds no player data, its `staging`
environment already carries the deploy secrets, and it is the project
`docs/DEPLOYMENT.md` means by "target a disposable project first".

### 2. Production is a **separate Supabase project**, and the integration is never pointed at it

This is the load-bearing half of the decision, and it is a constraint on the
future rather than a description of today: there is currently only one
Supabase project, so "the integration is connected" and "production is
protected" are compatible only for as long as that stays true.

When a production project is created, it must be a distinct project ref, and
the GitHub integration must not be reconfigured to point at it. Production
migrations continue to run through `migrate-database.yml` with
`target: production` — environment approval plus the typed project ref.

Recorded as a constraint precisely because nothing enforces it mechanically.
Supabase's integration has one target; pointing it at production is a
two-click change in a dashboard, with no code review and no trace in this
repository. The only defence is that it is written down as forbidden.

### 3. `migrate-database.yml` stays, unchanged in behaviour

It is not redundant, and it is not deleted:

- It is the **only** path to production (§2).
- It remains available for staging as a recovery path — for applying a
  migration without a merge, or for re-running after the integration fails.
  `supabase db push` skips already-applied migrations, so the two mechanisms
  reaching the same project is idempotent, not destructive.
- Its `dry_run` mode (`supabase migration list` against the live project) is
  the only way to *inspect* the divergence between repository and project
  without changing anything, and that is worth keeping regardless of who
  applies.

Its header comment is amended to say what is now true: the merge-triggered
path exists, deliberately, for staging, and the workflow is what stands
between a merge and production.

### 4. Staging no longer needs `SUPABASE_ACCESS_TOKEN` or `SUPABASE_DB_PASSWORD` for ordinary operation

Once the integration owns staging migrations, Supabase authenticates itself
through its own GitHub App and does not use these secrets. They are needed in
the `staging` environment only to run `migrate-database.yml` against staging
— the recovery path in §3 — and in `production` for every migration.

Stated because the practical consequence is the reverse of the obvious one:
choosing automation *reduces* the number of credentials that must exist, and
a credential that does not need to exist is the cheapest one to secure.

## Alternatives considered

- **Connect the integration and delete `migrate-database.yml`.** Rejected:
  it is the production path (§2). Deleting it would leave the dashboard
  toggle as the only mechanism, and therefore the only thing standing between
  a merge and a production database.
- **Refuse automation and keep everything manual.** Rejected: the owner has
  decided otherwise, and the argument against automation is an argument about
  *production* specifically. Nothing about applying migrations to a
  disposable project on merge is dangerous — it is how they get exercised at
  all, and the alternative has been that they were never applied to a hosted
  project.
- **Automate production too, behind required reviewers.** Rejected: GitHub
  Environment reviewers gate *workflows*, and the Supabase integration is not
  a workflow. There is no approval step to attach to it. Automating
  production would mean automating it with no gate at all.
- **Point the integration at production and use staging only through the
  workflow.** Rejected as exactly inverted: it puts the ungated mechanism on
  the irreversible target and the gated one on the disposable target.
- **Use Supabase preview branches per pull request.** Not available — the
  project is on the free plan and per-PR branching requires Pro. Worth
  revisiting if the plan changes: it would let a migration be exercised
  against a real project *before* merge, which is strictly better than
  exercising it on merge.

## Consequences

- `docs/DEPLOYMENT.md`'s "Automated deployment" table is wrong until updated:
  migrations to staging are no longer "manual dispatch only".
- A merge to `main` becomes capable of changing a hosted database. Reviewing
  a pull request that touches `supabase/migrations/` is now reviewing a
  deployment, and should be treated as one.
- The safety of the arrangement rests on a fact about Supabase project
  topology (§2) that lives outside this repository and that no test can
  assert. If a future operator repoints the integration, nothing here will
  notice.
- `docs/CLOUD_SAVE.md`'s account of how schema reaches a project needs the
  same amendment.
