# Both shapes, measured together: ADR 0080's review draw beside a non-zero `priorIncidents`

**Date:** 2026-08-30
**Tree:** branch `agent/677-weapons-unreachable`, with ADR 0080's implementation
(`ee4c0b6`, and its fixture half `3bf9505`) **in force** for every run below.
**Question put to this record:** the owner's ruling of 2026-08-30 on
[#677](https://github.com/matmaxalez/lockstate/issues/677) took **both** shapes —
the review that raises a prisoner into tier 3 asks what they are carrying, *and*
`priorIncidents` moves off zero — and then named what was missing:

> Every figure in ADR 0080 was taken with `priorIncidents` pinned at 0.
> **Nothing has measured the two mechanisms together**, and they are not
> additive in the direction that matters ... The property that made ADR 0080
> safe — *a well-run prison cannot tell it happened*, 0 → 0 weapons on four
> seeds — was measured at priors 0 and **may not survive** a distribution that
> admits tier-2 prisoners as the norm.

**PLACEHOLDER-SUMMARY**

---

## 0. How to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line, or the number was
  produced by running the real kernel in this worktree and pasted.
- **DERIVED** — arithmetic over VERIFIED constants, written out so it can be
  checked without a run.
- **UNKNOWN** — could not be established.

Prose from other documents is quoted rather than cited by line
(`docs/AGENT_WORKFLOW.md` §4). Every table below is machine-generated from the
harness's own JSON output, which is reproduced in §9.

---

## 1. Method, and the three things this harness is not

**Every run is the real kernel driven by real commands** —
`createNewSimulationRuntime(seed)`, `packCommand`, `kernel.submitCommand`,
`while (kernel.tick < n) kernel.step()` — over 300 in-game days (720,000 ticks)
or 600 where stated. No wall clock is read anywhere in the loop, so contention
makes a run slower and cannot make it different.

`priorIncidents` is varied **on the `AdmitPrisoner` command**, which
`admitPrisonerSchema` has always accepted (`z.number().int().min(0).max(MAX_PRIOR_INCIDENTS)`,
`src/simulation/protocol/commands.ts:270`). — VERIFIED.

So, three things this is not:

1. **It is not an implementation, and nothing is wired.** `src/main.ts:899`
   still reads `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;` on
   this branch — VERIFIED — and no file under `src/` was touched for this
   record. ADR 0017 decision 5 puts the value with
   [#29](https://github.com/matmaxalez/lockstate/issues/29) and the owner's own
   ruling says the magnitude is *"deliberately not mine"*.
2. **It is not the determinism cost.** The harness draws `priorIncidents` on
   its own `Xoshiro128StarStar`, seeded off the run seed and ordered against
   nothing. A real implementation draws on a **registered named stream inside
   the command boundary**, ordered against the sentence and classification
   draws — which is a fingerprint change and a stream registration, exactly as
   ADR 0080's *"A distribution is also new state"* says. The *statistics* of the
   intake tier are the same either way, and the statistics are what is being
   priced here.
3. **It is not a browser run.** These are kernel runs. What a player *sees* of a
   confiscated weapon is unchanged and is still nothing: no `src/ui/` module
   renders a contraband category.

**The prison shapes are the ones ADR 0080 measured**, rebuilt command-for-command:

| shape | cells | guards | amenities | admissions |
| --- | --- | --- | --- | --- |
| **well built** | 40, each with a bed and a toilet | 8 | shower, canteen, yard, furnished | 1 every 2 days — 149 over 300 days |
| **under built** | 12, bed and toilet | 2 | shower, canteen, yard, furnished | 1 every 2 days — 149 over 300 days |
| **neglected** | 12 bare cells | 0 | none | 1 per day — 299 over 300 days |

**Which producer minted each item is recorded, and that is what makes the
interaction question answerable.** `introduceContrabandOnIntake` writes
`provenance.introducedAtTick` and `provenance.sourceId` (the holder's entity id)
at both call sites, and the intake call site runs at the prisoner's
classification tick, which `classifiedAtTickOf` recovers from two persisted
fields. An item whose `introducedAtTick` equals its holder's classification tick
came in **at intake**; anything later came from **the review ADR 0080 armed**. A
review cannot fire on the classification tick — it needs 24,000 ticks of tenure
— so the two cases cannot collide. Across all runs the count of items that could
not be attributed to a tracked holder is **0**.

**Contention, stated rather than assumed** (`docs/AGENT_WORKFLOW.md` §2,
[#667](https://github.com/matmaxalez/lockstate/issues/667)): the machine has
four cores; load average moved between 1.3 and 5.6 while these ran, and the only
things running were this record's own two harness processes. No other agent's
Playwright or vitest run was live at any point —
`ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"` was empty before
the first run started. Nothing above is a timing measurement.

## 2. The harness reproduces ADR 0080's published numbers exactly

ADR 0080's harness did not survive its session, so this one is a
reconstruction — which makes reproducing its published figures the first thing
worth doing, and the only honest way to claim the rest of this record is
comparable to it. At `priorIncidents: 0`, 300 in-game days, ADR 0080's own four
seeds:

| prison | ADR 0080's "decision" column | this harness |
| --- | --- | --- |
| well built, seed `0x0cc0` | 19 contraband, 0 weapons, 0 escapes, 0 riots, 0 ever tier 3 | **19 / 0 / 0 / 0 / 0** |
| well built, seed `0x51a7` | 29 / 0 / 0 / 0 / 0 | **29 / 0 / 0 / 0 / 0** |
| well built, seed `0x2f19` | 27 / 0 / 0 / 0 / 0 | **27 / 0 / 0 / 0 / 0** |
| well built, seed `0x77aa` | 14 / 0 / 0 / 0 / 1 | **14 / 0 / 0 / 0 / 1** |
| under built, seed `0x0cc0` | 74 contraband, 15 weapons, 13 escapes, 105 riots, 138 ever tier 3 | **74 / 15 / 13 / 105 / 138** |
| neglected, seed `0x0cc0` | 145 / 18 / 56 / 148 / 283 | **145 / 18 / 56 / 148 / 283** |

Every figure matches. — VERIFIED.

