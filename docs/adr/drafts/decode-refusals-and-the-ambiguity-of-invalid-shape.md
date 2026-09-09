# ADR draft: what a *decode* refusal says, and the one code that says two things

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`), and this one pre-commits to
> being renumbered without argument, along with every citation of it added by
> the same branch — including the one in
> `src/persistence/local/repository.ts`, which names this file by path rather
> than by number for exactly that reason.

## Status

**Proposed.** One half of what it describes is already implemented, on the
branch that carries this file, and the other half is the question it exists to
ask. That split is the whole point of the document and is set out under
"What this draft asks for" below.

The order — implementation ahead of the record — is the one
[ADR 0065](../0065-what-happens-to-a-save-this-build-cannot-read.md) took for
the same reason, in its own words: *"the defect is live rather than
hypothetical, and this document is what the branch should be judged against."*

## Context

ADR 0065 decided what happens to a save this build cannot read, and it decided
it at **one** boundary: the restore layer. Its table is over
[ADR 0063](../0063-what-a-refused-restore-says-and-whose-fault-it-is.md)'s three
reasons — `unsupported-by-this-build` is quarantined, `damaged-payload` is
deleted, `restore-code-fault` costs the generation nothing — and
`SessionController.loadPrison` has honoured that since #432.

**There is a second boundary, with a taxonomy of its own, and ADR 0065 says
nothing about it.** `decodeSaveEnvelope` refuses a save with one of six codes,
and `docs/PERSISTENCE.md`'s error taxonomy already gives each its meaning:

| Code | What the taxonomy says it means |
| --- | --- |
| `invalid-shape` | not an object, no numeric `saveSchemaVersion`, or fails its declared version's schema |
| `unsupported-version` | the version is newer than the latest this build knows about |
| `no-migration-path` | a declared or intermediate version has no registered schema or migration |
| `migration-produced-invalid-output` | a migration step ran and its output failed the destination schema — *"a bug in the migration, not the input"* |
| `migration-step-threw` | a step threw instead of returning, so there was no output for a schema to reject |
| `checksum-mismatch` | it parses and migrates cleanly and the checksum does not match — corruption |

`PrisonSaveRepository.loadCurrent` read none of it. Every generation its
recovery walk passed over on the way to one that decoded was collected as
`confirmedInvalid` and handed to `recoverToGeneration`, which **deletes**. So a
save written by a newer build — refused `unsupported-version`, the one code
whose meaning is *"a reader exists, because it wrote these bytes"* — was
destroyed the moment an older readable generation was found, and so was a save
this build's own migration chain had merely failed on.

That is not an oversight nobody had noticed; it is written down.
`src/persistence/migration.ts` says of its own error union that
`PrisonSaveRepository.loadCurrent` *"treats any `ok !== true` alike"*, as a
statement about why adding a new arm is safe. It was safe for the panel, which
ends in a `default:`. It was not safe here.

### Why this is a decision and not a patch

ADR 0065's argument is about **evidence, not certainty**, and it transfers to
`unsupported-version` without modification: a save declaring a
`saveSchemaVersion` this build has never heard of makes the "a reader exists"
claim more directly than a refused restore can, because the version number is
the writer's own statement of which build wrote it.

But the taxonomies are not the same shape. ADR 0063's has three arms and ADR
0065 ruled on all three. This one has six, two of which have no counterpart at
the restore layer at all, and **one of which is genuinely ambiguous** — which
is the reason this document exists rather than a paragraph in a commit message.

## The four outcomes this branch implements

Named in code as `DecodeRefusalVerdict`
(`src/persistence/local/repository.ts`), and mapped exhaustively over the six
codes so a seventh cannot inherit a fallback:

| Outcome | Codes | What happens to the generation |
| --- | --- | --- |
| `record-absent` | (the id is retained and nothing answers to it) | dropped from the window; there are no bytes either way |
| `undecodable-content` | `checksum-mismatch`, `invalid-shape` | deleted, once a later generation has decoded — unchanged |
| `unsupported-version` | `unsupported-version` | quarantined, through the mechanism ADR 0065 already built |
| `no-verdict` | `no-migration-path`, `migration-produced-invalid-output`, `migration-step-threw` | nothing at all |

Three of those four need no new decision, and the reasons are short:

1. **`unsupported-version` is ADR 0065 decision 1 applied where its own
   argument already reaches.** It spends the same one quarantine slot, under
   the same bound (decision 3) and the same exemption from the retention budget
   (decision 4), through the same `quarantineGeneration`. No second store, no
   new field, no schema change — the decode layer simply becomes a second
   caller of a mechanism that exists.
2. **The migrator faults are #431's rule, one boundary earlier.** #431 ruled
   that an exception out of *our own* restore code reaches no verdict about the
   save, and `SessionController.loadPrison` implements that by not adding such
   a generation to the set anything may retire. A migration step that throws,
   or one whose output fails the destination schema, is the identical
   situation: the taxonomy's own row calls the second *"a bug in the migration,
   not the input"*. A build must not delete a player's save on the strength of
   its own bug.
3. **`no-migration-path` is grouped with them rather than with the version
   mismatch**, because it describes a gap in *this build's chain* and not a
   reading of the bytes. It therefore takes the outcome that asserts least —
   nothing — rather than competing for a quarantine slot ADR 0065 allocated to
   the verdict with a demonstrated reader behind it.

## What this draft asks for: `invalid-shape` is ambiguous, and the branch declines to decide it

`invalid-shape` is left in `undecodable-content`, which is exactly where it was
before this change. **That is a decision declined, not taken**, and it is the
question this document puts to the owner.

`docs/PERSISTENCE.md` records the ambiguity, and does so about the repository's
own release practice rather than about a hypothetical:

- **An optional field added without a format bump.** The save sections are
  `.strict()`, so a build that predates the field refuses a save carrying it —
  `Both builds refuse it; only the diagnosis differs.`
  (verbatim in `docs/PERSISTENCE.md`) — where a version bump would have
  produced `unsupported-version` for the same save.
- **A widened enum, also without a bump.** ADR 0061 added `'departed'` to a
  contraband item's state and `SAVE_SCHEMA_VERSION` stayed 5. An older build
  reading a save that has recorded a departure refuses it as `invalid-shape`.

So the same code covers a save whose bytes a newer build reads perfectly and a
save that is genuinely malformed, and nothing at the decode boundary separates
them. Three options, with their real costs:

**A. Leave it deleted (what the branch does).** Costs the player the save in
the added-field and widened-enum cases above — which are the cases this
repository's own release practice produces, and the ones a rollback or a cached
bundle actually hits. Buys certainty that a window cannot fill with malformed
copies, since `invalid-shape` is also the code for a truncated write.

**B. Quarantine it, like `unsupported-version`.** Keeps the save in the two
cases that matter. Costs: the quarantine slot is **one per prison** (ADR 0065
decision 3), and the two verdicts would then compete for it on the same walk —
which is the exact allocation problem ADR 0065 §1 settled by pointing at the
demonstrated reader. It would also let a genuinely corrupt record hold that
slot indefinitely, and `invalid-shape` is the arm most likely to be produced by
real corruption.

**C. Split the code.** Distinguish, at the throw sites, "this payload violates
a structural invariant" from "this payload carries a key or a value this
version's schema does not admit". Only the second is the future-build case, and
it is decidable at the check: an unknown key or an out-of-enum value against a
`.strict()` closed schema is a different fact from `updatedAt < createdAt`. ADR
0065 already named this shape as the taxonomy's tuning knob — its own reversal
clause is *"move that throw site"*, one line at the check that owns the
meaning. Cost: it is a change to `save-schema.ts`'s error reporting rather than
to a policy, it touches every version schema, and `describeImportResult` and
`docs/PERSISTENCE.md`'s taxonomy table both move with it.

**This draft recommends C and does not implement it.** B trades the case with a
demonstrated reader for the case without one, which is the trade ADR 0065
refused; A is the status quo and loses saves the repository's own release
practice creates. C is the only option that gives each half of `invalid-shape`
the outcome its evidence supports — but it is a change to the decode contract,
not to a retention policy, and `AGENTS.md` puts that in an ADR rather than in
implementation code.

## Consequences

**Positive**

- A save a newer build wrote survives a load, an export and a downgrade on this
  build, in the same bounded slot ADR 0065 already costed.
- A defect in our own migration chain no longer costs the player the save it
  failed on, which closes #431's rule at the boundary that was still open.
- The decode taxonomy becomes load-bearing rather than descriptive, which is
  the sentence ADR 0065 wrote about ADR 0063's.

**Negative**

- A generation refused with a `no-verdict` code is re-walked on every load
  until ordinary retention evicts it. That is a decode attempt, not a worker
  start — the cheaper half of the price ADR 0065 §6 already accepted — and it
  is unbounded in *time* rather than in cost.
- The pointer may be left naming a generation this build refused, where before
  it was always healed onto one that decoded. Nothing reads it as a promise
  that the generation is readable — the walk is newest-first regardless — but
  it is one more place where "current" does not mean "loadable".
- `invalid-shape` keeps two meanings and one behaviour until this document is
  ruled on.

## Open questions

1. **Which of A, B and C for `invalid-shape`?** The subject of this draft.
2. **Should a decode-layer quarantine and a restore-layer quarantine share the
   one slot?** They do today, because there is one mechanism and one slot. A
   prison could plausibly hold one save refused for its version at decode and
   another refused at restore, and the newer wins by ADR 0065 decision 3
   without anyone having decided that the two are comparable.
3. **`no-migration-path` is unreachable in production** — schemas 1 through 5
   and every step between them are registered, so neither of its two throw
   sites can fire. It is classified here on its meaning rather than on
   observed behaviour, and `docs/PERSISTENCE.md`'s example for it (version
   `0`) is refuted by the code. Measured over `decodeSaveEnvelope` directly:
   declared `0`, `-1` and `1.5` all come back `invalid-shape`, because a
   declared version below 1 is refused before any schema lookup happens; `6`
   and `99` come back `unsupported-version`. No declared version produces
   `no-migration-path`. That row of the taxonomy table is the one to correct,
   and this draft does not correct it — `docs/PERSISTENCE.md` is not the file
   this branch owns.
