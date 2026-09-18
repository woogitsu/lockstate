# The `Proposed` ADR census, 2026-09-15

**What this is.** A classification of every ADR standing `Proposed` on `main`
at `e044a3e8`, into four buckets: *overtaken* (the decision is implemented, or
the problem dissolved), *waiting on the owner*, *waiting on work*, and
*genuinely open*.

**What it is not.** It is not a promotion and it proposes none. No `Status`
line is touched by the commit that adds this file, and moving one is the
owner's (`AGENTS.md`: never self-approve an ADR). This document exists so the
owner can rule on a list rather than on 44 separate documents.

## Correction, 2026-09-16: the count moved by one, and two of the sentences below are refuted

**This record is not re-anchored, because `docs/research/README.md` forbids it**
— *"when the code moves on, a record here does not become wrong, it becomes
older. Do not update one to match current `main`."* Everything below stands as
it was read at `e044a3e8`. What follows is the delta, marked in both directions
as `docs/AGENT_WORKFLOW.md` §4 requires. Each bucket and each refuted section
below carries its own dated note pointing back here, and no note rewrites the
sentence it corrects.

**The count, with the commit it is taken at, because a tally is the sentence
form that rots first.** Re-running the same extractor (the `statusStatement`
replication described under *How the 44 were derived*) over `docs/adr/` at
**`54adc87c`** — `main`, 2026-09-16, `chore(release): v0.0.646` — returns:
`git archive 54adc87c docs/adr | tar -x -C <dir>`, then the extractor over
`<dir>/docs/adr`, so the count is taken from the commit rather than from a
working tree:

```
TOTAL 109 accepted 66 proposed 43 other 0
```

So: **44 `Proposed` at `e044a3e8`, 43 at `54adc87c`.** Both numbers are true of
the commit named beside them and neither is true on its own. The sets differ by
exactly one member, computed by diffing the two extractions rather than by
reading the diff: **ADR 0091** left, in `d4cca21e` (merged as `b0356b66`,
#1253). Nothing entered, and no other document's leading status word moved.

**The bucket arithmetic at `54adc87c` is 30 / 7 / 6 = 43.** Bucket 1 is
untouched, so *"30 are already built"* is unchanged as a number and its
denominator is now 43 rather than 44 — 0091 was a bucket 2 document and bucket 2
is the bucket that lost it.

**ADR 0091 decision 2 was ruled, and then built, after this census was taken.**
The section *"ADR 0091 decision 2: why it has stood longest"* opens *"It was
never put to the owner"* and that sentence is refuted: it was put to the owner
and ruled on **2026-09-16**, option F — *a decided outcome of the SAME route
retires the refusal band*. The census's second claim about it, that decision 2
*"remains unimplemented today (VERIFIED)"*, is refuted too: `routeDecidedSince`
landed in `563ed7fc` and is read in six files under `src/`. Both corrections
are marked at the section itself rather than only here.

**ADR 0116 was ruled the same day and the ruling is NOT on `main` at
`54adc87c`, which is why it is still inside the 43.** The owner ruled option 2 —
a construction-completion event, graded `'info'`, routed `'log-only'`, counted
rather than repeated — on 2026-09-16; the `Status` block carrying it is on the
unmerged branch `agent/0116-dossier`, and `docs/adr/0116-whether-a-finished-object-is-an-event.md`
at `54adc87c` still reads *"Proposed, 2026-09-15. Not self-approved, and it
implements nothing."* When that branch merges the count goes to **42** and
bucket 3 to five. Bucket 3's own row for 0116 — *"never put to the owner"* — is
refuted as of 2026-09-16 regardless of where the file sits.

**A third ruling of 2026-09-16 touches nothing here, and that is worth stating
rather than leaving a reader to check.** Constitution article 8 was amended so
that ADR 0112 decision 4's amendment carries all three of its numbers
(15 / 13 / 11). ADR 0112 is `Accepted` and was never among the 44; its only
appearance below is as an example of a `Status` block holding two states, which
still holds.

**Claim tiers used below**, in the sense `docs/research/README.md` defines:

- **VERIFIED** — a file under `src/` or `tests/` was opened at the coordinate
  cited and the mechanism the ADR decides was found there.
- **REFERENCE** — production code cites the ADR by number in an assertion about
  what the code now does, and that assertion was read, but the mechanism itself
  was not traced end to end.
- **ABSENT** — a grep for the decision's own named symbol returned nothing under
  `src/`, and where the ADR names a socket, the socket was opened and found
  unsupplied.

## Second correction, 2026-09-17: the count moved by one again, to 42, exactly as the correction above predicted

**Re-run at `33c02a12`** — `main`, 2026-09-17, `chore(release): v0.0.652` — with
the same replicated `statusStatement` extractor over `docs/adr/`:

```
TOTAL 109  accepted 67  proposed 42  other 0
```

**The set difference was computed rather than read off a diff**, by extracting
`docs/adr/` at both commits (`git archive <sha> docs/adr | tar -x -C <dir>`) and
diffing the two `Proposed` lists: the single member that left is **ADR 0116**,
and nothing entered. So the correction above — *"When that branch merges the
count goes to 42 and bucket 3 to five"* — is **confirmed**, by the arithmetic
rather than by having said it. `agent/0116-dossier` merged as `d1f3bf7c`
(#1265) and `docs/adr/0116-whether-a-finished-object-is-an-event.md:19` now
reads:

> **Accepted, 2026-09-16, by the repository owner: option 2 — a
> construction-completion event, graded `'info'`, routed `'log-only'`.**

**Three counts, three commits, and none of them is true without its commit:**

| commit | date | `Proposed` | `Accepted` | buckets |
| --- | --- | --- | --- | --- |
| `e044a3e8` | 2026-09-15 | **44** | 65 | 30 / 8 / 6 / 0 |
| `54adc87c` | 2026-09-16 | **43** | 66 | 30 / 7 / 6 / 0 |
| `33c02a12` | 2026-09-17 | **42** | 67 | 30 / 7 / 5 / 0 |
| `eeda2e53` | 2026-09-18 | **42** | 67 | 30 / 7 / 5 / 0 |

> **Third correction, 2026-09-18: the fourth re-derivation is the first that
> does not move, and the row above is kept in the same table rather than given
> a section of its own.** Re-run at `eeda2e53` (`main`, `chore(release):
> v0.0.661`) with the same replicated `statusStatement` extractor, over an
> extraction of the commit rather than a working tree
> (`git archive eeda2e53 docs/adr | tar -x -C <dir>`): `TOTAL 109 accepted 67
> proposed 42 other 0`. The two `Proposed` sets were diffed member by member
> and are **identical** — nothing left and nothing entered across 53 commits.
>
> **A count that stopped moving is the weaker reading and the check that makes
> it the stronger one is named here**: an extractor that silently stopped
> matching would also return the previous number. The set diff is what rules
> that out, because it would have returned 42 members on one side and 0 on the
> other rather than 42 against 42.
>
> **Both absences in the two bullets below were re-opened at `eeda2e53` rather
> than carried from `33c02a12`, and both coordinates still hold**:
> `docs/adr/0115-…:14` still reads *"**Proposed.** Nothing here is decided and
> no code implements it."*, and `docs/adr/0042-…:5` still reads
> *"**Proposed. Not accepted, and deliberately not self-approved.**"* PR #1275,
> which carries ADR 0115's acceptance, is **still open** as this is written,
> so the census's 42 and its bucket-3 count of five are both true of `main`
> today; what a reader must not do is infer from the ruling that the count has
> already moved.
>
> **One sentence immediately below this block is a tally and the row above
> made it wrong by one.** *"Bucket 1 has not moved across any of the three"*
> was written against a three-row table and the table now has four rows. It is
> left as it stands and corrected here rather than edited, because it is the
> §4 example this document keeps walking into: **bucket 1 has not moved across
> any of the four**, and the sentence saying so will need this note again the
> next time a row is added. A subject would have survived where the tally did
> not — *bucket 1 has not moved since the census was taken*.

Bucket 1 has not moved across any of the three. Bucket 4 is still empty, and
that is still a result rather than an unchecked box.

**Two of the 2026-09-16 rulings did NOT move a `Status` line, which a reader
would otherwise assume, so both are stated as absences with the commit that
establishes them.**

- **ADR 0115 is still `Proposed` at `33c02a12`**, and is still inside the 42.
  It reads *"**Proposed.** Nothing here is decided and no code implements
  it."* at `docs/adr/0115-where-the-prisoner-roster-lives-and-what-the-manage-rail-can-afford.md:14`.
  The owner ruled option 4 on 2026-09-16 and the record moving `Status` to
  `Accepted` is held by **PR #1275**, which was **open and conflicting**
  (`mergeable_state: dirty`) when this was checked on 2026-09-17. Bucket 3's
  row for 0115 therefore stands unchanged as a count and is refuted as a
  *question*: it is answered and unrecorded, which is a different state from
  the one bucket 3 is named for.
- **ADR 0042's `Status` deliberately does not move.** The 2026-09-16 ruling on
  it was about how the document is *treated* — it is live, and a below-the-pin
  anchor naming live code is re-aimed rather than frozen — not about accepting
  it. It reads *"**Proposed. Not accepted, and deliberately not
  self-approved.**"* at `docs/adr/0042-attaching-consequences-to-the-simulation-loop.md:5`. A ruling
  that leaves a status word alone is invisible to this census's extractor by
  construction, which is the shape `docs/AGENT_WORKFLOW.md` §4 warns about:
  the pass sees the keyword, not the decision.

**Eleven of the census's 66 `path:N` spans were dead, and every one of them
died before this merge rather than because of it.** All 66 were re-opened at
`33c02a12` and read against what the census says they show; 55 hold.

**How the eleven were found is the part worth carrying, because two cheaper
checks each missed most of them.** Diffing each cited line between the
branch's own last commit and `33c02a12` flagged **one**, because a coordinate
that was already dead on the branch is identical on both sides and therefore
invisible to a diff. Scanning for anchors that now land on a blank line flagged
the **same one**, because a stale coordinate usually lands on some other real
line rather than on nothing. What found all eleven was re-reading each line
against **`e044a3e8`, the commit the census was taken at** — the only baseline
at which every one of these coordinates was, by construction, correct. A
citation check needs the commit the citation was written at, not the last
commit the document was touched at.

| cited | verbatim at `e044a3e8` | live at `33c02a12` |
| --- | --- | --- |
| `docs/HUD_PROJECTIONS.md:534` | *"- **And what makes the main thread ask is the clock heartbeat, not the counts.**"* | **`:559`** |
| `src/persistence/save-schema.ts:404` | *"    sentenceLengthTicks: z.array(uint32Schema),"* | **`:413`** |
| `src/persistence/save-schema.ts:449` | *"    check('sentenceLengthTicks', value.sentenceLengthTicks);"* | **`:458`** |
| `src/persistence/save-schema.ts:507` | *"\* [ADR 0074](../../docs/adr/0074-what-a-restored-room-that-recorded-no-rectangle-is.md)"* | **`:516`** |
| `src/persistence/save-schema.ts:1410` | *"\*   and the restore reads the rectangle back off it (ADR 0074). The field stays"* | **`:1420`** |
| `src/persistence/save-schema.ts:1274` | *"\* ADR 0054 exists to rule out. It is a shape defect either way -- nothing"* | **`:1284`** |
| `src/ui/hud/build-panel.ts:2432` | *"     \* The revision (ADR 0107) this row's last publication read for \`orderId\`"* | **`:2447`** |
| `src/ui/hud/build-panel.ts:2872` | *"     \* \"what the queue still needs, whole\". ADR 0081 decision 2 funds one whole"* | **`:2887`** |
| `src/ui/hud/projection.ts:928` | the line ending *"since ADR 0064 the state withholds part of the"* | **`:939`** |
| `src/ui/hud/projection.ts:1233-1235` | *"\* (#703 ruling A, ADR 0083 §2), so a purchase this thread refuses on money has"* | **`:1244-1246`** |
| `src/ui/hud/view-model.ts:347` | the ADR 0083 link line of the `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` doc comment, whose line above reads *"(\`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS\`, #703 ruling A of 2026-08-31,"* | **`:374`** |
| `src/ui/hud/view-model.ts:833` | *"   \* This order's revision as of this publication (ADR 0107), carried"* | **`:860`** |
| `src/ui/hud/view-model.ts:1848` | the ADR 0048 link line opening that doc comment's citation | **`:1895`** |

(Thirteen rows for eleven spans: two of the spans name two coordinates each.)

**Every row is a coordinate move and not a finding move.** In each case the
sentence or symbol the census cites still exists, unchanged, at the new line —
re-derived by `grep -n` on the quoted text rather than by offsetting from
anything. No bucket, no tier and no count in this document changes because of
them. Each is marked in place beside the original number rather than
overwritten (`docs/AGENT_WORKFLOW.md` §4).

**The one with a name attached** is bucket 1's row for **ADR 0086**, whose
`docs/HUD_PROJECTIONS.md:534` is singled out below because its killer is a
commit this census already talks about.

- **It was live when the census was taken.** At `e044a3e8` and at the census's
  own commit `bd396861`, line 534 of that file reads
  *"- **And what makes the main thread ask is the clock heartbeat, not the
  counts.**"*.
- **It died at `563ed7fc`** — *"feat(hud): the refusal band retires on a decided
  outcome of the same route (ADR 0091 decision 2, option F)"*, the same commit
  the first correction above credits with refuting two of this census's
  sentences. It inserted 25 lines above the anchor, so the sentence is
  unchanged and only its coordinate moved.
- **It is `docs/HUD_PROJECTIONS.md:559` at `33c02a12`**, verbatim:

  > - **And what makes the main thread ask is the clock heartbeat, not the counts.**

- **The row is marked rather than rewritten** (`docs/AGENT_WORKFLOW.md` §4),
  so a reader can see that the finding it supports — ADR 0086 option E shipped,
  tier VERIFIED — never depended on the number.

**What this cost, and why it is worth stating.** The first correction, written
on 2026-09-16, re-derived the *count* against `563ed7fc`'s merge and did not
re-open the *coordinates*. The same commit had broken one. A count check and an
anchor check are two passes, and running one is not evidence about the other —
which is the same shape as §4's *"a delta pass is blind to a claim that was
already false when its window opened"*, one level in.

**Re-run once more at `725aad40`**, after #1279 merged the same day: the count
is **unchanged at 109 / 67 / 42**, and all thirteen repinned coordinates above
still read back verbatim. #1279 touches `src/ui/hud/hud.css`, `hud.ts`,
`layout-shell.ts` and `overview-panel.ts`, none of which this census cites.

**And once more at `c9b4a7f7`** — `main`, 2026-09-17, after #1230 merged: the
count is **still 109 / 67 / 42**, re-derived the same way
(`git archive c9b4a7f7 docs/adr | tar -x -C <dir>`, then the replicated
`statusStatement` extractor over `<dir>/docs/adr`), and all thirteen
coordinates still read back verbatim. #1230 is the one merge since this census
was taken that touches a file it cites: it added 184 lines to
`docs/HUD_PROJECTIONS.md`, **all of them below `:559`**, so ADR 0086's row
keeps the coordinate the second correction gave it —

> - **And what makes the main thread ask is the clock heartbeat, not the counts.**

That is a near miss rather than a clean bill: the same file, the same
document-under-active-edit shape that killed `:534` in the first place, and the
only reason the number held is where the insertion landed.

**What this second correction is evidence of, beyond its own number.** The
first correction was written on 2026-09-16 and predicted a number for a merge
that had not happened; the merge happened and the number is right. A census
that names the commit it was taken at and states what will move it is
re-runnable by the next reader in one command — which is the whole difference
between this and a tally.

## How the 44 were derived

The status word was re-derived by replicating `statusStatement` from
`tests/foundation/adr-status-reference-contract.test.ts:174` — the `- Status:`
bullet where one exists, otherwise the **first paragraph** under `## Status` —
over all of `docs/adr/`:

```
TOTAL 109 accepted 65 proposed 44 other
```

Two of the 44 (0064, 0067) carry the older `- Status:` bullet rather than a
`## Status` heading; they are still the only two, as `STATUS-QUEUE.md` records.

## The counts

| bucket | count |
| --- | --- |
| 1. Overtaken — implemented in full, `Status` never moved | **30** |
| 2. Overtaken in part — some decisions built, others not | **8** |
| 3. Waiting on the owner — nothing built, the question is theirs | **6** |
| 4. Genuinely open — the ADR has not settled its own question | **0** |

**The table is taken at `e044a3e8` and totals 44.** At `54adc87c` it is
**30 / 7 / 6 = 43**, bucket 2 having lost ADR 0091 to `Accepted`. See the
correction of 2026-09-16 above.

**Bucket 4 is empty, and that is a result rather than a gap.** Every one of the
44 states a decision and argues it; what none of them has is a signature. The
nearest thing to an unsettled document is ADR 0110 decision 1, which
deliberately declines to pick a containment rule and routes the choice to the
owner — that is a document refusing to decide something it says is not its to
decide, not one that failed to.

**The headline finding is bucket 1's size.** Two thirds of the `Proposed` board
is code that is already running. This is not 30 oversights: it is the recorded
practice of writing the ADR *after* the branch, which ADR 0063's own Status
states as a method — *"The implementation landed on `agent/431-restore-refusal-reasons`
ahead of this document, deliberately and for the reason ADR 0038 gives for the
same order: the defect is live rather than hypothetical, and this document is
what the branch should be judged against."* The consequence is that `Proposed`
in this corpus does not mean "not built". It means "not signed".

## Bucket 1 — overtaken: the decision is implemented

| ADR | evidence | tier |
| --- | --- | --- |
| 0043 Account session states | `AccountSessionState` union, `src/ui/account/account-session.ts:53-62`; decision 1 cited at `:156`, decision 4 at `src/ui/account/cloud-slot-availability.ts:25` | VERIFIED |
| 0048 What a sector's occupants are | 29 files under `src/` cite it; `src/ui/hud/view-model.ts:1848` (**dead; live at `:1895`**), `src/ui/hud/messages.ts:883,897`, `src/ui/hud/staff-panel.ts:51` (*"Since ADR 0048, a …"*) | REFERENCE |
| 0049 What a prison that cannot make payroll owes | arrears carried as history, `src/simulation/runtime/session-systems.ts:429,981`; `src/simulation/presentation/status-strip-projection.ts:135` | REFERENCE |
| 0050 When a sentence ends | decision 2 at `src/simulation/prisoners/room-instance-registry.ts:1245` and `src/simulation/runtime/new-session.ts:528`; decision 4 at `src/simulation/prisoners/discharge-system.ts:79`, `new-session.ts:1495` | REFERENCE |
| 0052 Drawing the world with the source-art sheets | decision 2's typed manifest is `src/rendering/assets/environment-sprites.ts`; the painter is `src/rendering/world/environment-art.ts`, whose `:63` records that *"ADR-0052's own consequence 'Adding art for a new object is a row in a data module' … is now true"* | VERIFIED |
| 0053 Who may stand a security post | `src/content/staff-role-catalog.ts:12,42,123`; the post refusal at `src/simulation/protocol/commands.ts:648` | REFERENCE |
| 0054 What a prisoner's day is made of | decision 1's room-gating read back by `src/simulation/incidents/sector-risk.ts:62`; `src/persistence/save-schema.ts:1274` (**dead; live at `:1284`**); `src/simulation/protocol/commands.ts:763` | REFERENCE |
| 0056 Keeping a player's orders in order | `src/ui/simulation-commands.ts:50,218`; `:567` — *"would only reopen the inversion ADR 0056 closed"* | REFERENCE |
| 0057 What a riot does to a prisoner's day | `src/simulation/runtime/new-session.ts:614`; `src/simulation/incidents/trigger-system.ts:430`; `src/simulation/incidents/incident.ts:285` | REFERENCE |
| 0059 How an actor gets from one tile to the next | the locomotion store and its render feed: `src/rendering/feed/actor-extrapolation.ts:21`, `actors-from-delta.ts:35`, `actors-from-snapshot.ts:74`; 20 files under `src/` | REFERENCE |
| 0061 What the prison produces on its own | `incidents.escape-attempt-opened` producer and its alert entry, `src/ui/simulation-events.ts:570,1299`; 20 files under `src/` | VERIFIED |
| 0062 Who gets the room when more want it than it seats | the three-pass ordering, `src/simulation/prisoners/action-system.ts:526` (*"Pass 3 — the idle, by descending `needUrgency`"*), with `:82` and `:637` | VERIFIED |
| 0063 What a refused restore says | `'unsupported-by-this-build'` decided at the check and handled at the boundary: `src/persistence/session/session-controller.ts:623,820`, `src/persistence/local/repository.ts:131` | VERIFIED |
| 0064 What an unmet need costs a prison | `src/ui/hud/projection.ts:468,928` (**`:928` dead; live at `:939`**), `src/ui/hud/messages.ts:87` — *"since ADR 0064 the state withholds part of the prisoner-day grant per unmet need"* | REFERENCE |
| 0065 What happens to a save this build cannot read | `quarantineGeneration` / `releaseQuarantinedGeneration`; `src/persistence/local/generation-policy.ts:18,29` states decision 2 by number | VERIFIED |
| 0067 What an assault costs its instigator | `src/simulation/prisoners/sanction-system.ts:12`, wired at `prisoner-operations-runtime.ts:276` | VERIFIED |
| 0068 Classifying a pending room's enclosure on the client | the synchronous host query the decision names: `classifyArea` at `src/ui/hud/rooms-panel.ts:206`, asked once per rectangle at `:918`, with `pendingEnclosure` at `:1385` | VERIFIED |
| 0069 How long a prisoner is held for | `sentenceLengthTicks` as a per-prisoner array in the save envelope, `src/persistence/save-schema.ts:404,449` (**dead; live at `:413,458`**); read at `src/simulation/presentation/prisoner-projection.ts:751` | VERIFIED |
| 0070 Dismissing a staff member | `DismissStaff` consumed at `src/simulation/runtime/session-commands.ts:1025`, keyed by `dismissStaffSupersessionKey` at `:1060`; the roster reader at `src/ui/simulation-staff-roster.ts:19` | VERIFIED |
| 0071 What bounds a room whose activity consumes no object | `concurrentUseCapacityFor` in `src/simulation/objects/room-capacity.ts`; decision 4's import ban stated at `src/content/room-catalog.ts:74` | VERIFIED |
| 0073 Who orders a contraband search | `SearchSystem` wired at `src/simulation/runtime/new-session.ts:1153,1181` and `session-systems.ts:1061`. **The ADR's own Status block already says so**: *"Implemented, 2026-08-29, on `agent/552-contraband-search` — Part 1 and Part 2 Option A, on the owner's instruction to implement under this document."* | VERIFIED |
| 0074 What a restored room that recorded no rectangle is | `src/persistence/save-schema.ts:507,1410` (**dead; live at `:516,1420`**) (*"the restore reads the rectangle back off it (ADR 0074)"*), `src/persistence/save-migrations.ts:271` | REFERENCE |
| 0077 When a route stops being valid | the `canCross` socket the decision requires: `src/simulation/locomotion/locomotion.ts`, `src/simulation/security/guard-locomotion.ts:8`, `src/simulation/navigation/traversal.ts:80` | VERIFIED |
| 0078 What keeps a prisoner safe | `safety` is a member of `NEED_IDS` (`src/simulation/prisoners/needs.ts:11`) with the decided decay recorded at `:53-57` | VERIFIED |
| 0079 A sentence long enough to be a history | `src/simulation/runtime/new-session.ts:466`, `src/simulation/prisoners/needs.ts:78`, `src/simulation/contraband/introduction.ts:120` | REFERENCE |
| 0081 Whether a purchase may be partly filled | decision 2 (per order) at `src/simulation/presentation/construction-projection.ts:174` — *"ADR 0081 decision 2 funds one whole order at a time"* — and `src/ui/hud/build-panel.ts:2872` (**dead; live at `:2887`**) | REFERENCE |
| 0083 What opens the negative balance | `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` (`src/ui/hud/view-model.ts:347` (**dead; live at `:374`**), `messages.ts:1488`) and `escalatedDiversionRateBasisPoints` (`src/simulation/economy/loans.ts`) | VERIFIED |
| 0086 What refreshes a pulled HUD readout | Option E (recommended) shipped: `tests/foundation/hud-refresh-cadence-contract.test.ts` exists and owns the sentence, and `docs/HUD_PROJECTIONS.md:534` states it (**dead since `563ed7fc`; live at `docs/HUD_PROJECTIONS.md:559`** — see the repin note under the second correction) — *"And what makes the main thread ask is the clock heartbeat, not the counts."* | VERIFIED |
| 0090 Medium as a warning, not a skipped step | `src/simulation/prisoners/classification-early-warning-system.ts` exists, with `EARLY_WARNING_TIER_CEILING` at `src/simulation/prisoners/classification.ts:249` | VERIFIED |
| 0107 What a stale build-order cancellation is refused for | the revision counter the decision invents: `BuildOrderSource.revisionOf` at `src/simulation/presentation/construction-projection.ts:131`, carried per publication at `src/ui/hud/view-model.ts:833` (**dead; live at `:860`**) and read at `src/ui/hud/build-panel.ts:2432` (**dead; live at `:2447`**) | VERIFIED |

## Bucket 2 — overtaken in part

Eight documents where the `Status` line is right about the document and wrong
about part of it, or right about part and stale about the rest. **These are the
ones a sweep would get wrong**, and the reason this census is a list of
decisions rather than a list of documents.

| ADR | built | not built | evidence |
| --- | --- | --- | --- |
| 0042 Attaching consequences to the loop | steps 1–4 | steps 5, 6 | Step 1 marked *"Landed 2026-08-27"* in the ADR itself; step 3 cited by name in nine files (`src/simulation/runtime/new-session.ts`, `worker/state-machine.ts`, `protocol/types.ts`, …); step 4's mean-over-`NEED_IDS` at `new-session.ts:1401-1405`. Step 5 is blocked on ADR 0026 questions 1–3 by its own text; step 6 is roadmap Phase 9. |
| 0046 Shipping the telemetry pipeline | the client half, the Worker route, the migration | the ingest path binding | `src/services/telemetry/events.ts:54,58`. The endpoint still refuses every batch because `LOCKSTATE_TELEMETRY_INGEST_PATH` is unbound — deploy configuration, `AGENTS.md` reservation 3. |
| 0047 Raising a building on open ground | decision 6 only | decisions 1–5 | The ADR says so in place: *"**Landed as slice 0, issue #448.** This decision — and only this decision — is implemented."* Confirmed at `src/simulation/construction/system.ts:499` and `tests/integration/edge-of-owned-land-room.test.ts:11`. |
| 0085 The HUD corner and the status strip | decision 1 | decision 2 | `src/ui/hud/hud.css:400,429,660,669,676,694` implement decision 1 **and record a deliberate deviation from its literal text**. No chip-priority or wrap mechanism exists for decision 2; the ADR's own text says *"neither ships with this ADR"*. |
| 0087 Whether a refusal is an event or a condition | decision 2 | decisions 1, 3, 4 | `PrisonCondition`, `computeStandingPrisonConditions` (`src/simulation/presentation/status-strip-projection.ts`) and `InsolvencyRungSystem` (`src/simulation/economy/insolvency-rung-system.ts`) all exist. Decision 2 alone carries an owner ruling (#767, 2026-09-01). |
| 0089 How a host refusal names its reason | nothing of the recommendation | Option 2 | **The clearest "problem dissolved" case on the board.** The H4 example the whole document argues from was fixed on 2026-09-03 in the shape the ADR argues *against*: `HostRefusalReason` gained `'no-room-to-hold-anybody'` (`src/ui/host-refusal.ts:69`) and `refusalMessageKey` a second `if` (`src/ui/hud/projection.ts:1233-1235` (**dead; live at `:1244-1246`**)), with the sentence at `src/content/default-locale-en.ts:2369`. The ADR's own Status block records this. What survives is only the class argument for a `Record`. |
| 0091 What clears the refusal band | decision 1 | decision 2 | See the section below. |
| 0092 Who decides where a guard stands | decision 3 of 8 | the other 7 | The ADR's own Status: *"**Decision 3 landed on `main` in `4a53d292` (pull request #825).** … it is the only one that has been built. Nothing else here has a line of code behind it: no command, no `SetSectorPost`, no control a player can press."* |

**0091 left this bucket on 2026-09-16**, by being accepted: it is no longer
`Proposed` at `54adc87c` and so is no longer a member of this census's
population at all. The row above is kept as it was read at `e044a3e8`. Seven
rows remain at `54adc87c`.

## Bucket 3 — waiting on the owner

| ADR | the question, in one sentence |
| --- | --- |
| 0066 What a navigation tick may cost | What share of a 50 ms tick may navigation have, and on what reference hardware — a player-visible performance promise, reserved by `AGENTS.md`'s fourth exclusion. (Decision 4, suspend-and-resume, is also decided and unbuilt: *"The branch that carried this document changed no file under `src/`."*) |
| 0094 Which names a prison draws from | May the authored name pools be put into a session, given that decision 2 reaches the save envelope and decision 3 changes the validator guarding it. **ABSENT confirmed**: nothing outside `src/simulation/identity/` imports `name-pools`, and `src/simulation/runtime/new-session.ts` still does not draw from them. |
| 0110 What security sector a room is in | Do security sectors get a drawn extent (the player-facing gesture ADR 0036 declined), or does the room's security grade stay absent. **ABSENT confirmed**: `RoomProjectionOptions.sectorIdByRoomInstanceId` exists as an optional socket and `src/simulation/worker/projection-catalog.ts:75` states it is *"left absent, so a room's security grade is absent rather than guessed"*. |
| 0111 How a room instance's rectangle reaches the render side | Does the rectangle ride the geometry pull (recommended) rather than the HUD projection. Nothing under `src/` implements it; the owner's only ruling here is the filing of 0110 and 0111 as two documents. |
| 0115 Where the prisoner roster lives | Which of the Regime-panel splits stage 5 owes; the ADR says outright *"Nothing here is decided and no code implements it"* and carries a section titled *"Why this is not ours to decide"*. |
| 0116 Whether a finished object is an event | Should object completion produce an alert at all, given §4's noise number. *"Not self-approved, and it implements nothing … there is no ruling behind it at all."* Weakest provenance on the board: an agent brief, never put to the owner. |

**0116 was ruled on 2026-09-16 and the row above is refuted in its last
clause.** *"An agent brief, never put to the owner"* was true when it was
written and stopped being true that day: the owner chose option 2 — a
construction-completion event, graded `'info'`, routed `'log-only'`, counted
rather than repeated. The document is still `Proposed` on `main` at `54adc87c`
because the branch carrying the ruling has not merged, and nothing under `src/`
implements it either way, so the rest of the row stands.

## Bucket 4 — genuinely open

**Empty.** See the note under "The counts".

## ADR 0091 decision 2: why it has stood longest

> **REFUTED ON 2026-09-16, ONE DAY AFTER THIS SECTION WAS WRITTEN. The
> sentences below are kept exactly as they were read at `e044a3e8`, and the
> correction is at the end of the section rather than in place of them.** Both
> of this section's load-bearing claims — that the decision was never put to the
> owner, and that it remains unimplemented — are now false.

**It was never put to the owner.** ADR 0091 landed `Proposed` on 2026-09-02 and
`docs/adr/STATUS-QUEUE.md` — the owner-facing queue, whose §2 is where an ADR
waiting on a ruling gets a row — records its arrival and its *absence* from that
queue in the same sentence:

> §2 STILL HOLDS EIGHT ENTRIES at `9b8c8e85`, and all four places that count
> them agree for the fourth consecutive anchor. Nothing was filed and nothing
> was deleted: 0091 arrived `Proposed` with no §2 row, and it is the window's
> only arrival, so there was no exemption to distinguish from a delinquency this
> time.

So the answer is not that the owner is slow on it, and not that the decision is
hard. Decision 2 is a one-line ask — *does the corner's sentence retire on any
decided outcome, or only on another refusal* — and the document recommends
option D and prices it. It has stood thirteen days because **no mechanism carried
it to the owner**: the queue's own bookkeeping noticed the gap, described it as a
delinquency rather than an exemption, and filed nothing.

**Decision 2 remains unimplemented today** (VERIFIED). `src/ui/hud/hud.ts:1290-1296`
still states the status-quo lifetime the ADR calls option A:

> It does **not** auto-dismiss. A message that clears itself on a timer is a
> race against how fast the player reads, and there is no press to acknowledge
> it -- so a host refusal stays until the same action later succeeds, and a
> simulation refusal until another replaces it or the session ends, which are
> the first moments each sentence stops being true.

There is no band-only "last decided outcome" state anywhere under `src/` — the
second state option D requires. A grep for it returns nothing.

**Decision 1 of the same document is shipped**, which is why the document is in
bucket 2 rather than bucket 3.

### Correction, 2026-09-16: it was put to the owner, ruled, and built

**Ruled.** ADR 0091's `Status` block at `54adc87c` reads *"**Accepted,
2026-09-16, by the repository owner, for decision 2 (option F: a decided outcome
of the SAME route retires the band).**"* — that is, neither of the two states
the section above frames the ask as (*"does the corner's sentence retire on any
decided outcome, or only on another refusal"*), but the third one: the same
**route**. Option D, which this section records the document as recommending,
was declined, and the block records that it was declined twice and on what
ground. The provenance is the weaker kind this repository distinguishes: a
clickable option an agent session wrote, *"F — ta sama trasa (zalecane)"*, not
a sentence the owner typed.

**So the diagnosis above was right about the mechanism and wrong about the
outcome.** No `STATUS-QUEUE.md` §2 row ever carried it — that gap is real and
this section's reading of it stands — but a dossier pass carried it to the owner
directly, which is a second route to a ruling that the section did not consider
and that the queue's bookkeeping cannot see. *"It has stood thirteen days"* was
true for one more day.

**Built.** *"Decision 2 remains unimplemented today (VERIFIED)"* and *"There is
no band-only 'last decided outcome' state anywhere under `src/` — a grep for it
returns nothing"* are both refuted. `routeDecidedSince` landed in `563ed7fc` and
`grep -rn "routeDecidedSince" src/` returns sixteen lines in six files:
`src/simulation/protocol/types.ts:1525` (the wire field),
`src/simulation/refusals/refusal-log.ts:237-241` (where the flag is set, and set
monotonically), `src/simulation/worker/state-machine.ts:599`,
`src/ui/hud/view-model.ts:1685`, `src/ui/simulation-alerts.ts:452` (forwarded,
not acted on — the list keeps its row) and `src/ui/hud/hud.ts:1731`, where a
notice carrying the flag is treated as no notice at all.

**The quoted paragraph is still there, and that is the part of this section that
aged well.** `src/ui/hud/hud.ts` still carries the *"It does **not**
auto-dismiss"* text this section quotes — a quoted sentence is the durable
citation and a `file:line` is not — and it is now followed in the same docblock
by *"**The last clause was the whole of the rule until 2026-09-16 and is now one
of three, and it is kept rather than rewritten because it is the rule that
moved.**"*

## Which ADRs carry two states in one `Status` block

The trap the brief names is real and it is not rare. Twelve of the 44 `Proposed`
documents assert a second state inside the same `Status` block — a ruling, a
landing, or an implementation — and a reader who stops at the leading word gets
each of them wrong. **Every one of these was read in full** for this census:

| ADR | leading state | the second state in the same block |
| --- | --- | --- |
| 0073 | `Proposed, 2026-08-29` | *"**Implemented, 2026-08-29, on `agent/552-contraband-search`** … The status line above is deliberately left where it is."* |
| 0081 | `Proposed, 2026-08-31` | two owner rulings, #703 rulings 9 and 12, recorded in place of the recommendations |
| 0083 | `Proposed, 2026-08-31` | two owner rulings on §2 and §3, *"recorded in place of their recommendations"* |
| 0085 | `Proposed, 2026-09-01` | *"Addendum, 2026-09-01, decision 1 only"* — the owner ruled the direction |
| 0087 | `Proposed … for decisions 1, 3 and 4` | *"Decision 2 is amended, and the amendment is signed"* |
| 0089 | `Proposed, 2026-09-02` | a 2026-09-06 citation re-anchor saying the example was fixed in a different shape |
| 0090 | `Proposed, 2026-09-02` | the owner's #788 ruling quoted verbatim; only the mechanism is proposed |
| 0091 | `Proposed … for decision 2` | *"Decision 1 needed no ADR and is already implemented on this branch"* |
| 0092 | `Proposed, 2026-09-02` | *"Decision 3 landed on `main` in `4a53d292`"* |
| 0107 | `Proposed` | *"The DIRECTION this document designs against was ruled by the owner on 2026-09-10"* |
| 0110 | `Proposed, 2026-09-12` | *"The owner did rule on the scope, and only on the scope."* |
| 0111 | `Proposed, 2026-09-12` | the same scope ruling, *"covers only the filing"* |

**Twelve at `e044a3e8`; eleven of them are still `Proposed` at `54adc87c`.**
0091's row is the one that moved — its block now leads `Accepted, 2026-09-16`
and keeps the prior state below it, so it changes which side of this table it
belongs on rather than leaving it.

Two more carry the split outside the `Status` block, where an extractor reading
the first paragraph will never see it:

- **0047** — `Status` says `Proposed`; decision 6's own section says *"**Landed
  as slice 0, issue #448.** This decision — and only this decision — is
  implemented."*
- **0112** — the case the brief names. Leading state `Accepted`; the block keeps
  *"Proposed, 2026-09-13. Not self-approved."* below it, labelled as the prior
  state.

**A mechanical detector over the whole corpus flags many more, and most are
false positives.** Scanning each `## Status` section (not just its first
paragraph) for any of the four status words returns 46 files, but the commonest
hit is the phrase *"Not accepted"* — 0042, 0046, 0048, 0050, 0061 and 0062 all
trip it while asserting exactly one state. The twelve above were separated from
those by reading, not by the regex.

## Scope: where the line was drawn, and what was left

- **All 44 were classified**, at `e044a3e8`. None is unexamined. The
  population is 43 at `54adc87c`; see the correction of 2026-09-16 at the top.
- **The evidence is not uniform, and the tier column says which is which.** 18
  rows are VERIFIED (a named symbol opened under `src/`); 12 are REFERENCE
  (production code asserts by ADR number what it now does, and that assertion
  was read at the coordinate cited, but the mechanism was not traced end to
  end). Bucket 3's ABSENT findings are uneven: 0094 and
  0110 were confirmed by grepping the decision's own named symbol
  (`name-pools`, `sectorIdByRoomInstanceId`); 0111, 0115 and 0116 rest on their
  own Status text plus a zero-reference count (no file under `src/` or `tests/`
  cites any of the three).
- **What was deliberately not done.** No ADR's *correctness* was assessed — a
  decision can be implemented and wrong, and that is a different pass. No
  GitHub issue was read; the classification rests on the tree.
- **The REFERENCE rows are the weak half.** A docblock saying *"since ADR 0064
  the state withholds part of the prisoner-day grant"* is production code making
  a claim about itself, which is good evidence and not proof: this repository's
  own §4 says a document rots and a comment is a document. Twelve rows would be
  upgraded by opening the mechanism; none was found contradicted.

## Weakest claim, and what would change my mind

**Weakest claim: that bucket 1 is "overtaken" rather than merely "built".** The
census equates *the mechanism exists under `src/`* with *the decision is
implemented*, and for a multi-decision ADR that can be true of one decision and
false of the document. Bucket 2 exists because eight documents were caught
failing exactly that test — so the honest reading is that **bucket 1 may be
over-full and bucket 2 under-full**, and the thing that would move an ADR
between them is decision-by-decision tracing of the 12 REFERENCE rows.

**What would change my mind about bucket 4 being empty:** one ADR whose own
Decision section ends without a recommendation. I found none, but I read
Decision sections in full only for those I had reason to doubt.

**What would change my mind about ADR 0091 decision 2:** a §2 row for it
anywhere in `STATUS-QUEUE.md` that my reading missed —
`grep -c "0091" docs/adr/STATUS-QUEUE.md` returns **30** and none of the ones
read is a queue entry, but that file is 22,633 lines and its entries are prose
rather than rows.
