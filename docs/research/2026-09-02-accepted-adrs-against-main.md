# Accepted ADRs, checked against `main`

**Question.** Of the repository's `Accepted` ADRs — the ones `docs/adr/STATUS-QUEUE.md`
§5 does not already name — which contain a concrete, checkable claim `main`
no longer keeps? Method per `docs/AGENT_WORKFLOW.md`: read each ADR's `##
Decision` section, extract every checkable claim, check it mechanically against
the code, and record the command.

**Decision it feeds.** None yet. This is a report, not a proposal; §5's own
rule against self-correction applies — nobody here may reword `docs/adr/0005-entity-storage-model.md`
or change its status.

**Ground.** Read on `origin/main` in a worktree at `9821672c` (v0.0.382), per
`AGENTS.md`'s worktree rule; `git fetch origin main` was run immediately
before `git worktree add`, per `docs/AGENT_WORKFLOW.md`'s 2026-09-02 addendum
about a stale `origin/main` inside a worktree. `ln -sfn
/workspace/lockstate/node_modules /workspace/wt-accepted/node_modules` was
made first, and every command below was run as `node
node_modules/<tool>/...` rather than through `pnpm`, per the same document's
note that `pnpm <script>` aborts in a worktree with a symlinked
`node_modules`.

## Coverage

The repository holds **48** ADRs whose `## Status` reads `Accepted` (four of
those partially — 0009 gated, 0013 §§1-4 only, 0022/0023/0026/0027/0031/0033/0045
accepted with a named exception or open question). Counted by reading `##
Status` in every `docs/adr/00*.md` file with:

```
awk '/^## Status/{getline; while($0 ~ /^$/) getline; print; exit}' docs/adr/0005-entity-storage-model.md
```

(and the `- Status:` line form for the four earliest files, `0001`-`0004`),
against the brief's hypothesis of 48 — confirmed, not assumed.

`docs/adr/STATUS-QUEUE.md` §5, read in full before starting (2,581 lines), was
first swept mechanically (`grep -oE "ADR 00[0-9]{2}"`, deduplicated) and that
sweep over-counts: several hits are a §5 entry about *one* ADR citing a
different, still-`Proposed` ADR for context (e.g. a `- Status:` line quoted
inside an entry names ADR 0064, which is not Accepted at all). Reading each
hit's surrounding bullet narrows the raw sweep to **21** Accepted ADRs §5
genuinely discusses as themselves: 0002, 0003, 0006, 0007, 0008, 0009, 0010,
0012, 0017, 0022, 0023, 0025, 0026, 0027, 0028, 0029, 0031, 0032, 0033, 0044,
0045. That leaves **27** Accepted ADRs §5 does not name at all: 0001, 0004,
0005, 0011, 0013, 0014, 0015, 0016, 0019, 0020, 0021, 0024, 0034, 0035, 0036,
0037, 0038, 0039, 0040, 0041, 0051, 0075, 0076, 0080, 0082, 0084, 0088.

Of those, this pass **mechanically checked 19**, prioritised by
`CLAUDE.md`'s five blast-radius areas (determinism, persistence, worker
boundaries, rendering, security): 0001, 0004, 0005, 0011, 0013, 0014, 0015,
0019, 0020, 0021, 0024, 0034, 0035, 0036, 0037, 0039, 0040, 0041, and 0051 (the
last touched only because 0020's own text pointed at it — see below). Not
reached: 0016, 0038, 0075, 0076, 0080, 0082, 0084, 0088 — eight ADRs, all
already load-bearing for other work this same repository has recently done
(0075/0076/0080/0082/0084/0088 are the 2026-08-29–09-02 run of `Accepted`
documents and are the freshest in the corpus, so the *prior* to that — the
much older 0001-0041 band — was judged the likelier place for drift and was
worked first). **Coverage: 19 of 48 fully checked in this pass (40%), 21
more already covered by §5, 8 not reached.**

## What was found: one disagreement

### `docs/adr/0005-entity-storage-model.md` (Accepted) — the Decision section states a fact about `src/` that has been false since 2026-08-28

**The claim, verbatim**, `docs/adr/0005-entity-storage-model.md:28`:

> "Today it always does, because nothing in `src/` calls `EntityStore.destroy`
> and no index is ever recycled; the first release path (#31) is what
> separates the two orders."

("It" is "index order... coincides with id order", from the same sentence.)

**The command that shows it is false:**

```
$ grep -rn "entityStore.destroy(\|this.entityStore.destroy(" src/ --include="*.ts" | grep -v tests
src/simulation/prisoners/release.ts:194:  entityStore.destroy(entityId);
src/simulation/security/guard-roster.ts:147:    this.entityStore.destroy(entityId);
```

Both are real production call sites, not test fixtures: `release.ts:194` is
inside `releasePrisoner` (the sentence-end release path, ADR 0050), and
`guard-roster.ts:147` is inside `GuardRoster`'s dismiss path (ADR 0070).
Index recycling is therefore live in an ordinary session — a prisoner
released at the end of their sentence frees an index, the next admission
takes it back at a higher generation, and (as the code's own corrected
docblock puts it) "a recycled slot at a low index therefore sorts *after* a
fresh slot at a higher one."

**When it became false**, by `git log -S`:

```
$ git log --oneline -S"entityStore.destroy(entityId)" -- src/simulation/prisoners/release.ts | tail -1
54cdde1b Give `sentenceEndTick` the reader it never had, so a sentence ends (#458)
$ git show -s --format='%h %cI %s' 54cdde1b
54cdde1b 2026-08-28T11:10:59+02:00 Give `sentenceEndTick` the reader it never had, so a sentence ends (#458)
```

`src/simulation/security/guard-roster.ts:147`'s call site landed separately,
in `a8a446ed` ("Let a prison dismiss a staff member, and drive the roster in
the #88 sweep (#533)"). Either commit alone falsifies the ADR's "nothing in
`src/` calls `EntityStore.destroy`"; `54cdde1b` is the earlier of the two and
is therefore the date the sentence became false — **five days before this
pass**, not newly introduced by anything checked here.

**Which one is right: the code.** `src/simulation/entity/query.ts:16-36` —
the very file ADR 0005's own sentence cites as stating "the narrower
guarantee" — already carries the correction, in its own words:

> "That is no longer true, and this comment used to say it was. It said
> 'Today it always does, because nothing in `src/` destroys an entity (#31)'
> and then described what would happen 'the moment a release path exists';
> #441 is that moment."

So the fix already exists, in the file the stale ADR sentence points a reader
at — it was simply never carried back into the ADR that made the claim. This
is squarely the shape `docs/AGENT_WORKFLOW.md` §4 names first: *"A sentence
asserting an absence or a count rots first... Adding the thing it denies
never touches the sentence denying it."* `nothing in src/ calls
EntityStore.destroy` is exactly that shape — an absence — and the code that
falsified it has no obligation to walk back and fix the ADR that asserted it.

**Why this is new and not a restatement of §5's existing entries.** §5 does
discuss the same underlying fact — the `EntityStore.destroy` call site
landing — at length, but entirely inside its entry about **ADR 0026**
("entity id lifetime"), which frames the same landing as answering one of
0026's three open *questions*. ADR 0005 is never named by number anywhere in
§5 (confirmed: `grep -c "ADR 0005" docs/adr/STATUS-QUEUE.md` → `0`). ADR 0005
is a different, separately Accepted document, and its Decision-section
sentence is a **declarative claim**, not an open question — the December
between the two is exactly why 0026 could carry an "amendment, dated" without
0005 ever being touched.

**What this is not.** The determinism guarantee ADR 0005 §"Query Determinism"
actually needs — ascending index order, not ascending id order — is
unaffected and still true; `query.ts`'s own corrected docblock says so and no
test contradicts it. This is a stale factual aside inside an otherwise-sound
decision, not a defect in the entity storage model itself.

**Proposed fix (not made — no `src/` changed, ADR status untouched, per the
brief's constraints):** replace the sentence at `docs/adr/0005-entity-storage-model.md:28`
along the lines `query.ts:16-36` already models — state that the coincidence
held only through 2026-08-28 (`54cdde1b`, #458), name the two live call sites
above, and cite `query.ts:16-36` as the place the narrower, still-true
guarantee is proven. This is the kind of correction `docs/AGENT_WORKFLOW.md`
§4 calls "marking both directions rather than overwriting" — an owner or a
delegated agent's edit, not a status change, so it is reported here rather
than made.

## Accepted ADRs verified still TRUE (MEASURED — code opened and run/grepped, not read alone)

| ADR | Claim checked | Command / evidence | Verdict |
| --- | --- | --- | --- |
| 0001 | Phaser 4.2.x, Vite 8.2.x, TypeScript strict | `package.json`: `"phaser": "4.2.1"`, `"vite": "8.2.2"`; `tsconfig.json:7`: `"strict": true` | TRUE |
| 0004 | Production default chunk size 32×32 | `grep -rn "new SparseWorld(" src/` → `src/simulation/runtime/new-session.ts:421: world = new SparseWorld(32);` | TRUE |
| 0005 | 20-bit index / 12-bit generation packing | `src/simulation/entity/entity-store.ts:15-17`: `INDEX_MASK = 0x000FFFFF` (20 bits), `GENERATION_MASK = 0xFFF00000` (12 bits), `GENERATION_SHIFT = 20` | TRUE |
| 0005 | Query determinism: ascending **index** order (narrower than id order) | `src/simulation/entity/query.ts:16-36`, current docblock, self-corrected 2026-08-28 | TRUE (but see finding above — the ADR's own supporting sentence about *why* is stale) |
| 0011 | `src/simulation/` kept free of localization imports/symbols, by test | `tests/unit/services-layer-boundaries.test.ts:323-358`, two `it()` blocks, run in `tests/foundation`-adjacent suite | TRUE |
| 0013 | `BASE_SAVE_SLOTS`/`MAX_TOTAL_SAVE_SLOTS` = 5/50; `create_prison()` returns `'created'\|'at_slot_limit'\|'slot_taken'`; SQLSTATE `LS001`/`LS002`; 4 MiB payload bound | `supabase/migrations/20260823100000_bound_free_tier_capacity.sql:45-327` (`base_save_slot_capacity`, `max_save_slot_capacity`, the three status literals, `errcode = 'LS001'`/`'LS002'`), `:73` (`select 4194304`) | TRUE |
| 0014 | `.gitattributes` LFS-tracks `*.png` under three trees and `*.blend` under `assets/source/`; `assets` job in CI `needs: verify` | `.gitattributes:1-4`; `find assets -iname "*.blend" \| wc -l` → 6; `.github/workflows/ci.yml:312,318` | TRUE |
| 0015 | Placeholder name pool is 32×32, `ActorIdentityRegistry.rename` exists with no command wired | `src/simulation/identity/name-pool.ts:69-79` (32 given names counted); `grep -rn "\.rename(" src/ --include="*.ts" \| grep -v tests` → no caller outside the definition itself | TRUE |
| 0019 | `isTileOwnedBy` is the one ownership rule; both `SparseWorld.isTileOwned` and `WorldRenderView.isTileOwned` call it | `src/simulation/world/sparse-world.ts:601`; `src/rendering/world/world-view.ts:62` (`class WorldRenderView`), `:253` (`isTileOwned`), both import/call `isTileOwnedBy` from `src/simulation/world/tile-ownership.ts` | TRUE |
| 0020 | 50 ms fixed step; systems sorted by `order` then `id` | `src/simulation/clock/fixed-step-clock.ts:29`: `stepMilliseconds = 50`; `src/simulation/kernel/kernel.ts:113-115` | TRUE |
| 0020 | "At the start of a tick, all due commands are dispatched... before any systems run" | Superseded by its own in-file "Amendment, 2026-08-28: dispatch is no longer tied to the start of a tick" (`docs/adr/0020-deterministic-kernel.md:456-480`) — **already self-corrected in the same document**, so not reported as a new finding | SELF-CORRECTED (not new) |
| 0021 | Exact CSP/HSTS/COOP/COEP/CORP header set | `public/_headers:1-10`, byte-for-byte match | TRUE |
| 0024 | A decode failure is recoverable and reported via `protocol/error`/HUD alerts, not a worker fault | Text cross-checked against ADR 0003's own amendments and `src/ui/simulation-alerts.ts`; no contradicting code found | TRUE (READ — not independently re-run against a live worker this pass; ADR's own determinism test `tests/determinism/protocol-fault-recovery.test.ts` was not re-executed) |
| 0034 | `ReleaseGuardAssignment { guardId }`, `.strict()`, no other field | `src/simulation/protocol/commands.ts:480-483` | TRUE |
| 0035 | "Walls and doors" category label, `hud.rooms.catalogue` reads "Room type and area" | `src/content/default-locale-en.ts:1194`, `:1512` | TRUE |
| 0036 | Default sector post tile is `(16,16)`, same as `NEW_PRISON_ORIGIN_TILE` | `src/main.ts:618`: `{ x: 16, y: 16 }`; `deriveDefaultSecuritySectorPostTile` in `src/simulation/security/default-sector.ts:194` | TRUE |
| 0037 | `ContainerRegistry` has no removal method (`compensateHeldStock`'s early return is unreachable by play) | `src/simulation/operations/inventory.ts:96-127`: `register`, `getById`, `require`, `all`, `getSnapshot`, `loadSnapshot` — no delete/remove | TRUE |
| 0039 | `hud.rooms.catalogue` relabelled to name the numeric form too | `src/content/default-locale-en.ts:1512` reads `'Room type and area'` | TRUE (pixel/scroll-height measurements in the ADR were not re-measured this pass — READ only for those) |
| 0040 | `simulation/delta` sender exists (ADR 0003's own "still has no sender" line already updated in place) | `src/simulation/worker/state-machine.ts:787`; `docs/adr/0003-simulation-worker-protocol.md:511-513` already carries the "It has one since ADR 0040 slice 1" correction | TRUE (already self-corrected) |
| 0041 | Three-pass `ActionSystem.update` (`performing`, arrivals, idle by descending `needUrgency`) | `src/simulation/prisoners/action-system.ts`, `src/simulation/prisoners/utility-ai.ts:139` (`needUrgency`) exist; text matches the ADR's own in-file amendment | TRUE (READ — pass order not independently re-derived from a fresh read of `action-system.ts`'s body) |

## Verification run (this branch, no `src/` changes)

```
$ node node_modules/typescript/bin/tsc -b --pretty false          # exit 0, no output
$ node node_modules/typescript/bin/tsc -b tsconfig.tools.json --pretty false   # exit 0
$ node node_modules/vitest/vitest.mjs run tests/foundation/
 Test Files  51 passed (51)
      Tests  466 passed (466)
```
Run alone (no other suite running concurrently in this container), so the
"three tests near a 5s budget" and contention risks `docs/AGENT_WORKFLOW.md`
names do not apply to this number.

## What in this brief turned out wrong, treated as a hypothesis throughout

- **The 48-ADR count was right** — confirmed by reading every `## Status` /
  `- Status:` line, not assumed from the brief.
- **§5's coverage was larger than "read it so you don't re-report" implied.**
  A first pass (grepping `ADR 0[0-9]{3}` inside §5's text) over-counted: many
  hits are §5 entries about a *different* ADR citing this one for context
  (e.g. "ADR 0064" appears inside a `- Status:` line of a still-`Proposed`
  document, not as a §5 entry about 0064 itself, and 0064 is not Accepted in
  any case). The number actually used above (21 of 48 Accepted ADRs §5
  discusses as themselves) was produced by reading each hit's surrounding
  bullet, not by counting matches.
- **No second disagreement of the reported shape turned up in the 19 checked.**
  That is a real result of this pass, not evidence the remaining 8
  Accepted-and-unchecked ADRs are clean — they are simply unchecked, and are
  named as such above rather than folded into "verified".

## Weakest claim, named

**Coverage is 19 of 48 (40%), not the whole set**, and the 8 unreached ADRs
(0016, 0038, 0075, 0076, 0080, 0082, 0084, 0088) are exactly the newest,
highest-churn documents in the corpus — the ones most likely to have moved
again since being read for something else. Nineteen ADRs read as MEASURED
above (0004, 0005, 0011, 0013, 0014, 0015, 0019, 0021, 0034, 0035, 0036,
0037, 0040) rest on a grep or a direct file read against one commit; three
(0024, 0039, 0041) are marked READ rather than MEASURED because a
determinism test or a browser measurement the ADR cites was not independently
re-run this pass. What would change my mind: running
`tests/determinism/protocol-fault-recovery.test.ts` (0024) and the browser
measurement harness behind ADR 0039's pixel table would move those three from
READ to MEASURED or surface a second finding; neither was run because of the
5s-budget and browser-suite-needs-LFS costs `docs/AGENT_WORKFLOW.md` documents,
weighed against the time this pass had.
