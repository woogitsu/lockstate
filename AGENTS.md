# Lockstate Agent Operating Contract

This file is the canonical operating contract for AI coding agents working in this repository. `CLAUDE.md` and `.agents/rules/` must point back to these rules instead of diverging from them.

## Product principle
Lockstate.io is a long-lived browser simulation project. Optimize for architectural correctness, maintainability, determinism, testability, performance headroom and player experience. Do not choose a shortcut merely because it is faster, cheaper, or easier for an agent.

## Mandatory stack
- TypeScript in strict mode from the first implementation.
- Phaser 4 for world rendering.
- Vite 8 for local development and production builds.
- Cloudflare Workers Static Assets for production delivery.
- Supabase for auth, metadata, cloud persistence and future trusted services.
- IndexedDB for local-first persistence and recovery.
- Dedicated Web Worker for the simulation kernel once simulation work begins.
- No PHP backend and no server-authoritative simulation in the MVP architecture.

## Architectural boundaries
1. Rendering is not simulation. Phaser must never become the source of truth for game state.
2. Simulation state must be serializable, versioned and deterministic.
3. The main thread owns rendering, browser UI and input orchestration.
4. The simulation worker owns simulation ticks and authoritative in-session game state.
5. Persistence consumes explicit snapshots; persistence code must not reach into renderer internals.
6. Content definitions belong in data modules, not hard-coded condition chains.
7. Every persistent format must have a version and migration strategy before release.
8. World storage is chunked. Never introduce a giant monolithic map matrix as the long-term representation.
9. Pathfinding must be budgeted and hierarchical. Never run unrestricted full-map A* per agent per frame.
10. Input must support remapping, QWERTY/AZERTY and touch/pointer interaction.

## How this work is carried out
`docs/AGENT_WORKFLOW.md` is the operating *method* that accompanies this
contract: how work is picked up between sessions, how it is split across several
agents at once, and what evidence a finding needs before it is reported. This
file governs what an agent may do; that one governs how. Where they disagree,
this file wins.

The parts of it that are rules rather than advice:
- An implementing agent takes its own git worktree before it touches anything.
- Parallelise across unrelated surfaces, serialise within one. Name each agent's
  surface, and the others', in its brief.
- **Nothing may exist only in the container.** A session dies without warning
  and takes every unpushed change with it, so every agent commits *and pushes*
  after its first coherent chunk rather than at the end, and a coordinator runs
  `scripts/wip-sweep.sh` beside them instead of relying on them to. See
  `docs/AGENT_WORKFLOW.md` §2.
- ADR numbers are assigned centrally, after drafts return. A number is not
  reserved until it appears in `docs/adr/README.md`.
- A test proves nothing until the production code has been mutated and that test
  watched going red. Report both outputs.
- Never report a result you did not obtain, and open every `file:line` you cite.
- Correcting the brief you were given is expected. "Already fixed, here are the
  numbers" is doing the job.

## The owner's standing mandate, and the four things it does not cover

Recorded 2026-08-27, in the owner's own words: *"pracuj autonomicznie cały czas
… jak potrzebujesz decyzji to rób research i wybieraj jakościowo, nie tanio.
Żeby gra była fajna i super, a nie po taniości zrobiona. Cena nie gra roli."*

So, unless a rule below says otherwise:

- **Decide rather than ask.** Where a choice is genuinely open, research it,
  choose, and record why — in an ADR when it is architecture, in the commit
  message when it is not. Coming back with a question you could have answered
  by reading the code is not caution, it is the work undone.
- **Cost is not a constraint, and quality is the deliverable.** Token use, API
  spend and elapsed time do not justify a worse answer. The Product principle
  above already said this about shortcuts; this says it about effort.
- **Playability counts as correctness here.** A change that is right in every
  test and makes the game duller has not succeeded. Say so when you see it.

**Four things stay the owner's, and no mandate above reaches them.** Each is
outward-facing or unrevertable, which is the whole reason:

1. **A server-side execution surface.** Do not add `main` to `wrangler.jsonc`
   and do not create a Worker. This project has never run server code; ADR 0002
   rejected an entry point deliberately, and ADR 0046's telemetry ingest is the
   first thing that would need one. `docs/DEPLOYMENT.md` carries the nine-item
   pre-merge checklist that has to be worked and approved first.

   **Released by the owner on 2026-09-03, for ADR 0046's ingest and for
   nothing else.** The paragraph above is left as it stands rather than
   rewritten, because it is the reservation that was released and a reader
   needs to see what was given up. The decision was put to the owner as three
   options — prepare the change for review without merging it, leave the
   surface blocked, or build it and merge it — and they answered:

   > Zbuduj i zmerguj

   ("Build it and merge it.") **That is the owner's decision and not a
   recommendation of this repository's**, which is why it is recorded here in
   their words with the date on it, per `docs/AGENT_WORKFLOW.md` §3's rule that
   an implementing agent does not approve its own work.

   **What the release covers, exactly.** One `main` in `wrangler.jsonc` and the
   Worker module it names, carrying the telemetry ingest ADR 0046 describes.
   It is not a general licence to run server code: a second route, a second
   handler, or any server-side behaviour that is not that ingest is back inside
   this reservation and comes to the owner on its own terms. `src/worker/`'s
   entry point states the same limit in its own docblock, with the threat model
   for what it accepts from the open internet.

   **What was not released, and is still owed.** Items 2 and 3 below are
   untouched, and the ingest needs both before it stores anything: the
   `telemetry_events` table, its insert function and the dedicated
   least-privilege database role are `supabase/migrations/`, and the two Worker
   variables that would configure a destination are deploy configuration. Until
   those land the endpoint refuses every batch, which is why merging the entry
   point changes no behaviour on `lockstate.io`.

   **HALF OF THAT IS NO LONGER OWED, AND THE PARAGRAPH ABOVE IS KEPT RATHER
   THAN REWRITTEN BECAUSE IT IS THE STATE THIS DOCUMENT DESCRIBED FOR A DAY.**
   The migration landed on 2026-09-04 in
   `supabase/migrations/20260904090000_create_telemetry_events.sql`, authorised
   by the owner as four objects plus retention: the `telemetry_ingest` role
   (`:152`), the `telemetry_events` table (`:203`),
   `record_telemetry_events(p_events jsonb)` (`:568`) and the retention pair
   (`telemetry_retention_runs` at `:759`, `enforce_telemetry_retention()` at
   `:951`). **Item 2 was not thereby released** — a further migration is still
   the owner's, and this one was authorised individually.

   **The conclusion still holds and now holds for a different reason, which is
   why a reader must not stop at the premise.** The endpoint still refuses every
   batch, but because `LOCKSTATE_TELEMETRY_INGEST_PATH` is unbound — the Worker
   reads it at `src/worker/telemetry-ingest-route.ts:12`, and that binding is
   deploy configuration, item 3, untouched. **So an agent who checks the
   sentence above, finds the migration present, and infers the endpoint is live
   would be wrong.** Retention additionally needs `pg_cron` enabled from the
   Supabase panel and the scheduled call made there; until that happens
   `enforce_telemetry_retention()` is a function nothing invokes.
2. **`supabase/migrations/`.** An applied migration is history. Propose new
   migration content in an ADR or an issue instead. Rollback is not automated.

   **OFFERED INSIDE THIS RESERVATION, AND DECLINED, 2026-09-21.** This entry
   exists for the reason reservation 3's dead-glob-segment entry gives: a
   reservation that was *asked about and not released* leaves no trace
   anywhere else, so the next session would otherwise spend the owner's
   attention re-asking a question this file can just answer.

   #355 (`fix/340-343-close-prison-id-oracles`, still a draft, waiting on the
   owner reading the SQL) adds a `create_prison()` collision handler that
   catches `unique_violation`, reads `GET STACKED DIAGNOSTICS
   constraint_name`, and answers the safe, indistinguishable `42501` refusal
   only when that name is `'prisons_pkey'`; anything else falls through to a
   bare `raise;` that re-exposes the raw `23505` and its row-existence
   `DETAIL` — the #343 oracle the migration exists to close. Two ways of
   hardening that discrimination were drafted and put to the owner as options
   against the migration already under review, byte-for-byte:

   - **An explicit re-raise.** Name the one other constraint the handler
     expects (`prisons_owner_slot_unique`) and fail loudly on anything else,
     rather than silently re-raising it unchanged.
   - **A runtime catalog lookup.** Resolve `prisons`'s primary key by querying
     `pg_index`/`pg_constraint` at call time instead of comparing against the
     literal `'prisons_pkey'`, so a rename cannot silently reopen the branch.

   Both change bytes in `20260826090000_close_prison_id_existence_oracles.sql`
   (under `supabase/migrations/`, not cited rooted here because it is #355's
   own unmerged file and does not exist on `main`), which is this
   reservation's, mid-review, so they were drafted rather than built. Offered those two, plus "nothing in the migration — the tests are
   enough," the owner chose:

   > Nic w migracji — wystarczą testy (zalecane)

   ("Nothing in the migration — the tests are enough.") Weaker provenance, as
   usual for a ruling recorded here: the label of an option this session wrote
   from the drafted proposal, not a sentence the owner typed. **The migration
   stays byte-for-byte what was under review**, apart from the one-token dead
   test-file reference in its own header comment the owner separately
   authorised the same day (*"Poprawić przed czytaniem"* — "correct it before
   the read").

   **What made the question worth asking at all**, verified directly against a
   scratch PostgreSQL 16.13 database rather than argued: a bare `create unique
   index ... on t(col)`, with no surrounding `ADD CONSTRAINT`, never gets a row
   in `pg_constraint`, yet a colliding insert against it still raises
   `duplicate key value violates unique constraint "<that index's own
   name>"`, and `GET STACKED DIAGNOSTICS constraint_name` reports that name
   exactly as it would a real constraint's. So a bare unique index added to
   `prisons` later would reach `create_prison()`'s untested fallthrough
   exactly as a rename or an added constraint would, and an inventory read
   only from `pg_constraint` cannot see it.

   **No constraint on `prisons` has ever been renamed**, checked against both
   routes a rename can take: an explicit `rename constraint`, and a
   drop-and-recreate under a new name. `prisons_pkey` and
   `prisons_owner_slot_unique` were both established once, at
   `20260822190100_create_prisons.sql`, and neither has moved since.

   **That sentence was first written wider than the evidence, and is
   corrected here rather than rewritten, on this file's own habit of showing
   rot instead of hiding it.** It first read "no constraint in this schema has
   ever been renamed" — repo-wide, unqualified, checked with a `grep -i
   rename` across `supabase/migrations/`. That is false at that width:
   `supabase/migrations/20260824100000_bind_challenge_evidence_to_payload.sql:266`
   and
   `supabase/migrations/20260824100000_bind_challenge_evidence_to_payload.sql:268`
   drop `challenge_submissions_unique_evidence` and
   `challenge_submissions_unique_evidence_digest` together, in the same
   migration, over the same columns plus one — a semantic rename by
   drop-and-recreate, with no `rename` keyword anywhere in it, so a `grep`
   for `rename` cannot see it. The finding is not that renames do not happen
   in this schema; one already has, on a neighbouring table, by exactly the
   route that grep is blind to. What holds, checked against both routes, is
   only the narrower claim above: `prisons` specifically has had neither.

   **That narrower fact is what makes detection rather than prevention a
   reasonable trade today, not "this cannot happen."** It stops being one the
   day a future migration drops and re-adds `prisons_pkey` or
   `prisons_owner_slot_unique` under a new name, for any reason of its own,
   unrelated to this hardening question — the pgTAP assertion below still
   catches that before merge, as a name it no longer recognises, but the
   "hasn't happened yet" half of today's trade is gone and the option this
   reservation declined is worth asking again.

   **What is in place instead is detection, not prevention.**
   `supabase/tests/010_constraint_inventory.test.sql` gained a second pgTAP
   assertion, pinning `prisons`'s unique *indexes* (`pg_index`/`pg_class`,
   `indisunique`) by name rather than by count — a count is satisfied by
   swapping one unique index for another, which is exactly the silent case
   this exists to catch — alongside its existing `pg_constraint`-based
   assertion. Red-before/green-after was confirmed by hand: adding a bare
   decoy unique index on `prisons` turned the new assertion red, listing the
   decoy by name; dropping it returned the suite to green. This fails `pnpm
   verify:sql` before such a migration can merge into `main`. It changes
   nothing at runtime — a bare unique index added and reviewed without ever
   running that suite would still reach the same fallthrough — and it is a
   test file, not a migration, so it needed no ruling and is already on
   #355's branch.
3. **Deploy configuration** — `public/_headers`, `.github/workflows/deploy.yml`,
   the Cloudflare or Supabase dashboards. Nothing in this repository can read
   back what those dashboards hold, so a change there cannot be verified here.

   **NARROWLY RELEASED ON 2026-09-06, FOR ONE CHANGE IN ONE FILE.** Asked how
   to unblock object art, the owner answered:

   > Przyjmij drugą ścieżkę i odblokuj ci.yml

   ("Accept the second lane and unblock `ci.yml`.") The option carrying that
   answer named exactly what it authorised, and the release is that and nothing
   wider:

   > Tym samym autoryzujesz JEDNĄ zmianę w `.github/workflows/ci.yml`:
   > rozszerzenie filtra LFS i asercji dekodowania o nową ścieżkę.

   ("You are thereby authorising ONE change in `.github/workflows/ci.yml`:
   extending the LFS filter and the decode assertion to the new path.")

   **What the release covers, exactly.** The `browser` job's
   `git lfs pull --include=` filter and the `Assert the environment sheets
   decoded` step that follows it, extended to cover the published path ADR 0100
   defines. Nothing else in that file: not a second job, not a second workflow,
   not `deploy.yml`, and not the runner selectors, which were authorised
   separately on 2026-09-05.

   **Why it had to be released before any agent could draw an object.** The
   decode step derives its ids from `src/rendering/assets/environment-sprites.ts`
   by grep and then requires each to exist under
   `public/game-content/source-art/`, failing closed with an error whose own
   text says `add '<id>' to the --include filter above`. So a sprite published
   anywhere else fails seven browser specs, and the fix was inside a reserved
   file — which made this a decision the owner had to take rather than a patch
   an agent could write. ADR 0100 records the reading in full.

   **A SECOND, NARROWER RELEASE INSIDE THE SAME RESERVATION, 2026-09-07 — three
   glob segments on one line, and the reason it had to be asked at all is the
   part worth reading.** The 2026-09-06 release above was granted in the
   owner's words as *"JEDNĄ zmianę"* (one change), so whether appending to that
   same filter a second time was covered or was a new decision is a question
   the words do not settle, and an agent guessing either way would be guessing
   about a file it may not touch. It was put to the owner, who answered:

   > Tak — dopisz trzy globy, nic więcej

   ("Yes — append the three globs, nothing more.") **Against a summary rather
   than the full text**, and the summary carried the mechanism and the limit
   in the same breath, verbatim:

   > Filtr `git lfs pull --include=` to dosłowna lista pięciu ścieżek, nie
   > wildcard `rendered.*` — więc każdy nowy sprite trzeba tam wpisać z nazwy,
   > inaczej CI ściąga wskaźnik LFS zamiast pliku i krok dekodujący pada z
   > własnym komunikatem „add '<id>' to the --include filter above". Ten plik
   > jest Twój.
   >
   > Autoryzujesz DOKŁADNIE trzy segmenty doklejone do listy w linii 516:
   > bench, desk, locker. Żadnego drugiego joba, żadnej innej linii, żadnego
   > `deploy.yml`.

   **THE FINDING THAT FORCED IT, WHICH REFUTES WHAT THE INTEGRATOR HAD ASSUMED
   AND WRITTEN INTO A BRIEF.** The 2026-09-06 release is recorded above as
   covering "the `browser` job's `git lfs pull --include=` filter and the
   `Assert the environment sheets decoded` step", and #1050 made the *decode
   assertion* generic: it greps `renderedArtId: '...'` out of
   `environment-sprites.ts` and needs no edit for any number of new ids, ever.
   **The `--include=` filter beside it is not generic and never was.** It is a
   literal comma-separated list of specific globs; `rendered.` is a filename
   prefix inside each entry, not a wildcard over them.
   `public/game-content/**/*.png` is LFS-tracked (`.gitattributes:4`) and CI's
   checkout is pointer-only outside what that list names, so an unnamed id's
   file is never fetched and the decode step then fails closed with its own
   instruction. **Two halves of one release, one generic and one not — and the
   integrator briefed an agent that neither needed touching. The agent read
   the file and refuted it.**

   The rejected alternative is recorded because it will be proposed again:
   replacing the list with a `rendered.*` pattern would end these decisions
   permanently, and #1050 established that the list's literalness is
   deliberate and fails closed — a wider pattern also fetches art nothing
   draws, which is the rule that lane exists to enforce. The owner was offered
   it and chose the narrow change.

   **`public/_headers`, `wrangler.jsonc`, `deploy.yml` and both dashboards are
   untouched by this**, and the sentence above about dashboards not being
   readable from here still holds for all of them.

   **A THIRD RELEASE INSIDE THE SAME RESERVATION, 2026-09-08 — ONE NUMBER ON
   ONE LINE, AND IT IS THE FIRST THAT IS NOT ABOUT ART.** The `browser` job
   stopped finishing: measured from the Actions API, the step *"Run the
   real-browser suite"* took **13m 00s and passed all 420 tests** on runner
   `woogitsu-wsl-DOM-NEW-02` (run 34155439633, 2026-09-07 20:22Z) and was
   **cancelled at 29m 44s having reached 46 of 420** on `woogitsu-linux-06`
   (run 34196112204, 2026-09-08 06:56Z). The same slowdown is visible outside
   this job and outside Chromium — `verify`'s *"Verify project"* step is 17s on
   `woogitsu-wsl-DOM-NEW-03` and 102s on `woogitsu-linux-01` — with `assets` as
   the control, since it ran on the `linux-*` pool in both and moved 11s to
   14s. The owner was shown that and chose, from four clickable options, the
   one labelled:

   > Podnieść `timeout-minutes` do ~90

   ("Raise `timeout-minutes` to ~90.")

   **What the release covers, exactly.** The `browser` job's own
   `timeout-minutes`, 30 → 90, and nothing else in the file: not `verify`'s 30,
   not `assets`'s 20, not a job, not a step, not the evidence upload's
   `if: failure()`, not the runner selectors, not `deploy.yml`.

   **The provenance is weaker than the two releases above and is recorded as
   such.** Those quote words the owner typed. This quotes the label of an
   option this session wrote and the owner clicked — their decision, not their
   sentence. The distinction matters here because the same session authored the
   option and then acted on it.

   **The option said, before they chose it, that it is necessary and not
   sufficient**, and that disclosure is part of what was authorised: four specs
   exhaust `test.slow()`'s own 180s per-test cap on this pool and fail rather
   than cancel, so a bigger job budget lets the job *report* them instead of
   being killed mid-suite. It does not turn them green. Issue #1008 carries
   them; `5a761322` cut the first by making the work smaller rather than the
   budget bigger, which stays the method.

   **THAT SENTENCE IS WRONG ABOUT THE NUMBER AND ABOUT THREE OF THE FOUR, AND
   THE RUN THAT PROVED IT IS THE ONE THIS RELEASE MADE POSSIBLE.** Run
   34215508642's `browser` job, the first on this pool ever allowed to reach the
   end, finished in **41.3 minutes: 422 passed, 1 failed.** The one failure is
   `#331`, at `app-shell.spec.ts:6119` on `page.setViewportSize`, still
   `Test timeout of 180000ms exceeded` — and still over the cap *after* option C
   cut it from 174 s to 132 s locally. The other three all passed, comfortably:
   `#88` in **2.5 m**, `zones a room and admits a prisoner (#411)` in **2.4 m**,
   `takes a room back (#411)` in **2.6 m**. So did
   `a pending delivery is on the panel with the fold shut (#285, #703)`, in
   **22.7 s**, which an earlier partial run had recorded as a red at 23.6 s.

   **Where the wrong claim came from, because the mistake is instructive.** All
   five "reds" were read off a job that was *cancelled at test 46 of 420* while
   the pool was saturated. A starved partial run is not a sample of a finished
   one, and four of its five failures did not survive the job being allowed to
   finish. The estimate built on the same partial run — that the remaining 374
   tests were "on the order of a hundred minutes" — was out by 2.4 times.

   **THAT LAST SENTENCE IS WRONG TWICE, AND THE SECOND WAY IS THE INTERESTING
   ONE.** It compares an estimate of the **remainder** against the **whole**
   suite's 41.3 minutes, which are different quantities. Tests 47–423 of the
   finished run took **20.2 minutes**, so the estimate was out by **5 times**,
   not 2.4.

   And the cause is not mainly the truncation this paragraph blames. **The
   suite is front-loaded**: tests 47–423 average **3.2 s** against the first
   46's **27.5 s**, so the same rate method applied to the *finished* run's own
   tests 26–46 still predicts 81 minutes against the real 20.2 — out by 4 times
   with no truncation involved at all. Finishing the job fixes the **failure
   list** and barely touches the **rate**. Those are two separate mistakes and
   this entry had merged them: a truncated run is not a sample of a finished
   one, *and* a prefix is not a sample of a suite. `docs/AGENT_WORKFLOW.md` §3
   carries both, separately, and the second was found only because that pass
   re-derived the arithmetic instead of taking this paragraph's word for it.

   **The release still bought exactly what it was for**, and rather more than
   the sentence above claimed: not "the job now reports four failures" but "the
   job now reports at all", and what it reported is that this tree has **one**
   browser failure rather than five. The suite needs 41.3 minutes on this pool
   against 13 on the retired one — **3.2 times**, not the ~6 the `verify` step
   shows, so the slowdown is not one uniform factor either.

   **FIVE MORE CORRECTIONS TO THIS ENTRY, 2026-09-08, FROM AN AUDIT OF EVERY
   WORKFLOW'S HOST ASSUMPTIONS (issue #1089).** They are listed because four of
   the five are figures this entry states.

   1. **The runner is `woogitsu-linux-03`, not `woogitsu-host-03`.**
      `woogitsu-host-03` is the runner's *install directory* in the log path
      (`/home/matma/actions-runner/woogitsu-host-03/_work/...`); the API's
      `runner_name` is `woogitsu-linux-03`. **This session had already
      corrected exactly this confusion once today, on PR #1073, and then made
      it again** — the log path is the more visible of the two and the API
      field is the authoritative one.
   2. **The slowdown is about 4x, not the 6 quoted above.** That figure came
      from three hand-picked samples, 17s against 102-142s, and it took the
      extremes of both. Over n=40 WSL and n=30 linux samples of the same
      "Verify project" step the ranges are **15-23s** and **51-142s, median
      ~75s**. The browser suite's own ratio is 3.2x. There is no single factor.
   3. **The `assets` control is weaker than this entry presents it.** Both of
      its samples -- 11s and 14s -- were taken on `linux-*`, so it shows that
      the same pool is stable day to day, which is worth something, and it does
      **not** isolate the pool change, which is what it was offered as. The
      audit reports `assets` at 4-6s on the retired pool, i.e. it slowed too;
      that figure is the audit's and is not re-derived here.
   4. **The pool is at least twelve hosts**, `01`-`06` and `08`-`12` observed,
      not the ten this entry implies.
   5. **A root cause this entry did not have**: the new hosts have **no
      passwordless sudo**. `scripts/provision-postgres.sh` says so out loud on
      `woogitsu-linux-11` -- *"needs root or passwordless sudo"* -- which is
      also why several provisioning scripts can no longer repair a host they
      previously could.

   **A SIXTH CORRECTION, 2026-09-08 17:35Z, AND IT IS TO THE ONE FAILURE THIS
   ENTRY KEPT.** Both halves of *"the one failure is `#331`, at
   `app-shell.spec.ts:6119` on `page.setViewportSize`"* are wrong, in different
   ways, and both were found before this entry merged.

   1. **`#331` is intermittent on this pool, not a standing red.** Run
      34251663361's `browser` job -- the second ever allowed to finish, on the
      *unmodified* base commit `97058984`, `#331`'s own code identical to the
      run above -- came back **`423 passed (39.5m)`**. Two finished runs, one
      red on `woogitsu-linux-02` (41m20s) and one green on `woogitsu-linux-03`
      (39m31s). So *"still over the cap"* holds for one host on one run and not
      for the pool, and **"a finished run is not a sample of a pool" is the
      same lesson as this entry's own, one level up**: it was written as though
      finishing the job had settled the failure list, when finishing it once
      settles it once.
   2. **`:6119` is where the clock stopped, not where the time went.** The
      failing run's retained trace, laid out step by step (PR #1093):
      `page.setViewportSize` at that line **started at 179.8 s and took
      0.12 s**, and the click after it also completed. 124.4 s of the 180 --
      **69%** -- went to the keyboard wall-ordering loop far earlier in the
      test. Playwright attributes a test timeout to whatever call is in flight
      when the budget runs out, and every reading of that coordinate as a
      location of *cost*, this entry's included, was reading a timestamp as a
      diagnosis.

   Neither correction touches the 90-minute budget, which is measured against a
   whole-suite 41.3 and 39.5 minutes and is right on both.

   **A SEVENTH, AND IT CORRECTS THE SIXTH'S FRAMING RATHER THAN ITS FACTS —
   THEN CLOSES THE ENTRY, BECAUSE #1093 MERGED AND SETTLED IT.** Both sentences
   above are true and the pair of runs it names invites a reading that is not:
   that the host is the variable. It is not.

   Two more `browser` jobs finished, and the pass/fail split stopped tracking
   the host on the first of them: run 34251254994 went **green on
   `woogitsu-linux-02`**, the host of both reds. Nor does it track machine load
   — that run was the **fastest whole suite of the four** (35.6m) and is also
   the one where `#331` came closest to the cap. So the durations of the test
   itself were read out of each log, against neighbours that share the file and
   the helper. `#331`'s code is byte-identical across all four:

   | run | host | suite | **`#331`** | `#411` zones | `#411` back | handback | `#703` | |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   | 34215508642 | linux-02 | 41.3m | **>3.0m** | 2.4m | 2.6m | 2.7m | 2.2m | RED |
   | 34251663361 | linux-03 | 39.5m | **2.1m** | 1.5m | 2.2m | 2.5m | 2.3m | green |
   | 34252025170 | linux-02 | 42.0m | **>3.0m** | 1.9m | 2.1m | 2.6m | 2.0m | RED |
   | 34251254994 | linux-02 | 35.6m | **3.0m** | 1.7m | 2.2m | 2.2m | 1.9m | green |

   **The variance is the test's own, not the machine's.** Between the two green
   runs `#331` moved 2.1m → 3.0m, **+43%**, while no neighbour moved more than
   15% and `Slow test file: app-shell.spec.ts` moved 21.3m → 20.7m, under 3%.
   And the right statement is sharper than "intermittent": `#331` recorded
   **at or over its 3.0-minute cap on three of the four**, so the one
   comfortable pass is the outlier and a green on it certified nothing.

   **Settled by the fix, on the fifth finished run.** `#1093` cut the keyboard
   wall-ordering loop — `withTabKey` holding Shift across a run of hops, and an
   `orderAt` viewport for the one caller whose subject is not the keyboard
   route — and merged as `8a35167b`. Its own `browser` job (run 34257095253,
   `423 passed`, 35.6m): **`#331` 1.5m**, against 3.0m and worse before.
   Neighbours 1.7 / 1.8 / 2.1 / 1.8m and the file 21.3m → **18.6m**, because
   `withTabKey` reaches every focus walk in it. The margin against the cap is
   90 s where it was seconds or nothing.

   That also settles `#1093`'s own stated weakest claim — that a 375x812 order
   loop exploits a software rasteriser CI's pool might not have, and so might
   buy less there. It bought the same factor on the pool as in the container.


   **What was declined by not being asked.** Routing `browser` back to the
   faster pool is not available from this file: every job's `labels` in the API
   is the generic `runs-on: self-hosted`,
   so `runs-on` cannot tell the two pools apart until a label exists on the
   runner side, which is host configuration and outside this repository
   entirely.

   **A FOURTH RELEASE INSIDE THE SAME RESERVATION, 2026-09-09 — ONE STEP IN
   THE `verify` JOB, AND IT IS THE FIRST THAT ADDS A GATE RATHER THAN WIDENING
   OR RESIZING ONE.** Measured on `main` at `450c9819` and reported in #1083:
   `tests/perf/` has its own Vitest config, `docs/TESTING.md` gave the command,
   and nothing in this repository invoked it — no `package.json` script, no CI
   step. Three files, 35 tests, passing, read by `tsc` and executed by nobody.
   The owner was shown that and chose, from the options put to them, the one
   labelled:

   > Dodaj bramkę w CI

   ("Add a gate in CI.")

   **What the release covers, exactly.** One step in the `verify` job that runs
   the measurement harness through its own config, and nothing else in the
   file: not a second step, not a second job, not `verify`'s `timeout-minutes:
   30`, not `assets`'s 20, not `browser`'s 90, not the runner selectors, not
   `deploy.yml`, and no workflow other than `.github/workflows/ci.yml`.

   **The provenance is the weaker kind, and is recorded as such — the same
   distinction the 2026-09-08 entry above draws about itself.** The 2026-09-06
   and 2026-09-07 releases quote sentences the owner typed. This one quotes the
   label of a clickable option the integrator wrote and the owner chose: their
   decision, not their words. Read it as authorising the step that label
   describes and nothing wider, and put anything wider to them on its own
   terms.

   **Why the step names the harness's own config, which is the part an agent
   would otherwise simplify away.** `tests/perf/vitest.perf.config.ts` sets
   `testTimeout: 900_000` where the root `vitest.config.ts` sets `5_000`, and
   #1083 records what the five-second budget does to these files: **six
   `Test timed out in 5000ms` failures that are not defects.** Re-measured on
   this tree with `--testTimeout=5000` and nothing else changed: **12 of the 35
   failed, every one of them that same timeout** — a bigger number than #1083's
   on a container four agents were sharing, which is the point rather than a
   discrepancy, since the count tracks the machine and not the code. So folding
   these files into `pnpm test` is not a tidier version of this release, it is
   a red gate. `tests/foundation/ci-configuration-contract.test.ts` pins the
   step and the `test:perf` script to each other, so removing either one fails
   before CI does.

   **A FIFTH RELEASE INSIDE THE SAME RESERVATION, 2026-09-10 — ONE GUARD LINE
   IN `branch-gc.yml`, AND IT IS THE FIRST THAT BUYS A SENTENCE RATHER THAN A
   BEHAVIOUR.** #1089's audit found `python3` assumed by two jobs and
   provisioned by nothing in this repository, in the class it calls *untested*:
   both are `workflow_dispatch`-only and neither had run since the pool changed
   (`branch-gc.yml` 2026-09-03, `delete-branches.yml` 2026-08-30). It cannot be
   provisioned from here — installing it needs root and the `woogitsu-linux-*`
   pool has no passwordless sudo, proved on job 101846181533 — so the issue's
   own recommendation is *"host provisioning, plus (owner's call) a one-line
   `command -v python3 || { echo "::error::…"; exit 1; }` guard so the failure
   names the host step rather than printing `127`"*. The owner was asked and
   chose, from the options put to them, the one labelled:

   > Zrób obie linijki

   ("Do both lines.")

   **What the release covers, exactly.** One `command -v python3` guard in
   `.github/workflows/branch-gc.yml`, in front of the heredoc that already
   ran there, and nothing else in that file or any other workflow: not
   `curl`, not `tar`, not a second job, not any `timeout-minutes`, not the
   runner selectors, not `version.yml`'s `npm`, not `deploy.yml`.

   **The provenance is the weaker kind, exactly as the 2026-09-08 and
   2026-09-09 entries above record of themselves**: the label of a clickable
   option the integrator wrote and the owner chose, not a sentence they typed.

   **AND THE SECOND CLAUSE OF THIS ENTRY'S OWN OPENING PARAGRAPH IS WRONG,
   FOUND HOURS AFTER THE GUARD SHIPPED AND CORRECTED HERE RATHER THAN
   THERE.** It says the change cannot be provisioned from here because
   *"installing it needs root and the `woogitsu-linux-*` pool has no
   passwordless sudo, proved on job 101846181533"*. The first half holds. The
   second half is a true measurement **about a pool this repository no longer
   runs on**, and the guard's own error message asserted it to an operator
   before anybody checked.

   Read off `runner_name` for every job of the four most recent completed
   runs: the pool is **`lockstate-wsl-DOM-NEW-01`, `-02` and `-03`**, and the
   runner user is **`mateusz`** rather than `matma`. So #1089's opening
   premise — *"The WSL2 runner pool was retired on 2026-09-07 and everything
   moved to `woogitsu-linux-*`"* — no longer describes the machine, and
   **every figure in the 2026-09-08 and 2026-09-09 entries above is measured
   on hosts that are not the ones running CI today.** Those entries are left
   exactly as they stand: what they authorise did not change, and a reader
   needs to see which pool each figure came from.

   **Whether this pool grants passwordless sudo is untested, which is the
   honest position and not a smaller version of the old claim.** Every
   `scripts/provision-*.sh` short-circuits here — a `verify` job on
   `lockstate-wsl-DOM-NEW-*` prints `[provision-postgres] packages already
   present (postgresql-18 + pgTAP)` and `role mateusz already usable` — so
   nothing has reached an elevation path to find out. The guard's message and
   both source comments now claim only that the step needs root, which no job
   here has.

   **The correction was in scope and this says why, because the boundary is
   narrow.** The release authorises one guard in that file; rewording the
   message *inside that guard* is the same guard, not a second change. Nothing
   else in `branch-gc.yml` moved.

   **AND THE QUESTION THEY ANSWERED CARRIED A FALSE PREMISE, WHICH IS WHY THE
   RELEASE IS NARROWER THAN THE PERMISSION GIVEN.** The option said "both
   lines" because the question named `branch-gc.yml` **and**
   `delete-branches.yml` as the two workflow files needing a guard. Checked
   after the answer and before the edit: **`delete-branches.yml` contains no
   `python3` at all.** It runs `bash deletebranches.sh`, and #1089's own audit
   row cites `deletebranches.sh:107` rather than the workflow. So the second
   guard went into the shell script, which is ours under the standing mandate
   and needed no release — the owner authorised more than was required, and
   only the `branch-gc.yml` half of it was used. Recorded rather than quietly
   banked, because a release read back later as covering two workflow files
   would be wider than what was actually asked for.

   **What the guard is worth, stated without inflation.** In
   `deletebranches.sh`, `set -euo pipefail` already makes a missing `python3`
   fail the script rather than leave `open_heads` empty — which matters,
   since an empty list would leave every open pull request's head branch
   unprotected. **So the guard adds no safety there. It adds a sentence.**
   `tests/foundation/ci-configuration-contract.test.ts` pins both call sites,
   because neither job runs in CI and every other gate in the repository would
   stay green if a later edit removed them.

   **A NEW NARROW RELEASE ON 2026-09-23, FOR THE FIRST NEW STAGE-7 RENDERS.**
   The owner was offered two clickable options: *"Tak — dopisz tylko te dwa
   globy"* or *"Nie — pozostaw partię na gałęzi"*. They chose:

   > Tak — dopisz tylko te dwa globy

   This is the weaker provenance: the option label was written by the agent,
   then selected by the owner, rather than typed by the owner. It authorises
   exactly two comma-separated segments on the `browser` job's existing
   `git lfs pull --include=` line in `.github/workflows/ci.yml`:

   - `public/game-content/source-art/rendered.fixture.shower.head.*.png`
   - `public/game-content/source-art/rendered.fixture.cell.waste_bin.*.png`

   No other line, job, workflow, dashboard or asset id is released. The
   `fixture.cell.sink` Blender render is source art only and has no published
   sprite or glob; `object.sink` still has no buildable path.

   **A SECOND NARROW RELEASE ON 2026-09-23, FOR THE WOODEN STORAGE RACK.**
   The owner was offered two clickable options: *"Tak — dopisz tylko ten glob
   (zalecane)"* or *"Nie — pozostaw gałąź bez tej zmiany"*. They chose:

   > Tak — dopisz tylko ten glob (zalecane)

   This is the weaker provenance: the option label was written by the agent,
   then selected by the owner. It authorises exactly one comma-separated
   segment on the `browser` job's existing `git lfs pull --include=` line in
   `.github/workflows/ci.yml`:

   - `public/game-content/source-art/rendered.furniture.storage.rack.wooden.*.png`

   No other CI line, job, workflow or asset id is released by this decision.

   **A THIRD NARROW RELEASE ON 2026-09-23, FOR THE WOODEN CHAIR.**
   The owner was offered two clickable options: *"Tak — dopisz tylko ten
   glob"* or *"Nie — zostaw gałąź bez zmiany"*. They chose:

   > Tak — dopisz tylko ten glob

   This is the weaker provenance: the option label was written by the agent,
   then selected by the owner. It authorises exactly one comma-separated
   segment on the `browser` job's existing `git lfs pull --include=` line in
   `.github/workflows/ci.yml`:

   - `public/game-content/source-art/rendered.furniture.chair.wooden.*.png`

   No other CI line, job, workflow or asset id is released by this decision.

   **A FOURTH NARROW RELEASE ON 2026-09-23, FOR THE DINING TABLE.**
   The owner was offered two clickable options: *"Tak — dopisz tylko ten
   glob"* or *"Nie — pozostaw tę partię na gałęzi"*. They chose:

   > Tak — dopisz tylko ten glob

   This is the weaker provenance: the option label was written by the agent,
   then selected by the owner. It authorises exactly one comma-separated
   segment on the `browser` job's existing `git lfs pull --include=` line in
   `.github/workflows/ci.yml`:

   - `public/game-content/source-art/rendered.furniture.dining.table.wooden.*.png`

   No other CI line, job, workflow or asset id is released by this decision.
4. **Anything that reaches a player as a promise the code does not keep.** A
   locale key with no implementation behind it is the defect that forced the
   telemetry decision; do not add one, in any tree.

   **Partly released by the owner on 2026-09-04: the CHOICE OF WORDS is ours
   now; the requirement that a sentence be TRUE is not.** Until that date this
   reservation was read strictly, and the reading was wider than the words
   above: agents and the integrator reported *what a sentence must convey* and
   authored none, so every player-visible string waited on the owner. Four such
   sentences were waiting when the release came (#901, #903, #904, #893), and
   two more had just been found by playing — a FUNDS badge asserting the state
   owed a prison money it did not owe (#913), and one all-clear sentence
   serving both a handled incident and an expired one.

   Asked which words each should carry, the owner answered twice, to two
   different questions, in the same direction:

   > Sam decyduj zawsze, jak zacznę grać to ujednolicimy

   ("Decide yourself, always; when I start playing we will unify them.")

   > Wybierz sam a potem się ujednolici sposób pisania

   ("Choose yourself, and afterwards the way it is written will be unified.")

   **What the release covers, exactly: choosing the wording.** It does not
   touch the reservation's actual subject, which is the *promise*. A sentence
   we now write ourselves must still be true of the code that renders it, and
   the way to establish that is to open that code — the two findings that
   prompted the release were both false sentences, not badly worded ones. So
   the rule that replaces "ask the owner" is **verify, then write**, and a
   string whose truth cannot be established still does not ship.

   **What we owe the owner in exchange.** They said the wording will be
   *unified* once they play, which is only possible if they can find what we
   wrote. Every string authored under this release is therefore recorded — in
   the commit that lands it and in the pull request body, quoted verbatim
   alongside the code opened to prove it true — so the harmonising pass is one
   reading rather than an excavation.

   The paragraph above this release is left exactly as it stood, for the same
   reason reservation 1's is: it is the rule that was relaxed, and a reader
   needs to see what was given up.

**Merging publishes.** `deploy.yml` fires on CI completion and its `staging` job
publishes on every merge to `main`, and `lockstate.io` is attached by hand to
that Worker — so a merge updates the public site with no further approval gate
(`docs/DEPLOYMENT.md`, "What currently serves lockstate.io"). Merge green,
ordinary increments under the mandate. Anything touching the four above goes to
the owner with the evidence, not to `main`.

> **THE CLAUSE ABOUT `lockstate.io` IS FALSE AND HAS BEEN SINCE THE EVENING IT
> WAS WRITTEN. It is kept rather than rewritten, per `docs/AGENT_WORKFLOW.md`
> §4's rule about marking both directions, and because what it got wrong is
> instructive: it is the paragraph that tells an agent what a merge costs.**
>
> A merge publishes to **`https://lockstate-staging.matmaxalez94.workers.dev/`**
> and **not** to `lockstate.io`. The section this paragraph cites says so
> itself, and has since 2026-08-27: *"`lockstate.io` does not receive the
> deploy, and that is deliberate — the owner has it switched off."* — recorded
> there in the owner's own words, *"Nikt nie gra, tylko ja znam tę domenę.
> Lockstate.io ma wyłączony deploy, to nie błąd."*
>
> **Dated, because the interval is the point.** The paragraph above landed in
> `9a391bb1` at 2026-08-27 20:10:02Z. `b8a642eb` — *"Correct the lockstate.io
> note: the domain's deploy is off on purpose, not broken"* — landed at
> 20:19:56Z and did not touch this file. **Nine minutes and fifty-four
> seconds**, and then sixteen days.
>
> **It is wrong in the expensive direction, which is why it is worth a block
> rather than a clause.** It overstates what a merge does, so an agent reads
> every green merge as a publication to a domain players could reach, and buys
> caution with a false premise. `docs/DEPLOYMENT.md` already warns that *"Any
> sentence below or in an ADR that treats a merge as 'updating the public site'
> is describing the arrangement, not today"* — and that warning could not reach
> this sentence, because this sentence is neither below it nor in an ADR. **A
> warning scoped to where its author expected the error is not a warning.**
>
> Nothing else in the paragraph moves: a merge still publishes without a further
> gate, green ordinary increments are still merged under the mandate, and
> anything touching the four reservations above still goes to the owner.

## What the owner has delivered from outside this repository

Design and direction material the owner makes elsewhere and hands over is kept
under `docs/design/`, one dated subdirectory per delivery, **verbatim and never
edited** — `docs/design/README.md` carries that rule and the reason for it. A
delivery is evidence of what the owner asked for on a date; an edited copy is
no longer that. Corrections to a delivery are written outside it.

**The 2026-09-13 visual identity delivery.** A ZIP of five prototype
iterations, an interactive design prototype, a full specification, a
twenty-article product constitution, an audit and a world illustration, at
`docs/design/2026-09-13-identity-v5/`. It arrived with this instruction, in the
owner's own words:

> z gpt 6 wygenerowałem nowy styl, wygląd, sposób komunikacji, przedstawiania,
> nowa identyfikacja wizualna, itp itd, wyślij plik na repo, zapoznaj się z nim,
> napisz kompletny rozbudowany plan wdrożenia, zmodyfikuj wszystkie pliki bazowe
> repo, żeby nigdy nie zaginęło po zakończeniu tej sesji

("with gpt 6 I generated a new style, look, way of communicating, of presenting,
a new visual identity, etc. etc., put the file on the repo, read it, write a
complete extensive implementation plan, modify all the base repo files so it is
never lost after this session ends.")

Three documents read it, and they are the ones to open rather than the delivery
itself:

- `docs/VISUAL_IDENTITY.md` — what the direction binds, what it explicitly does
  not, and the measured gap against today's interface.
- `docs/IDENTITY_V5_ROLLOUT.md` — the nine-stage plan, with the owner-reserved
  steps named.
- `docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md` — the
  decision record.

The nine stages are tracked as issues under epic #1155, with the five open
decisions collected in #1165; `docs/IDENTITY_V5_ROLLOUT.md` carries the map
between the two. Stage 0, an inventory of every HUD surface that exists today,
gates every other stage and needs no decision from the owner.

**THAT INSTRUCTION WAS NOT AN ACCEPTANCE, AND THE PARAGRAPH IS KEPT IN ITS
ORIGINAL FORM BELOW BECAUSE THE DISTINCTION IT DRAWS OUTLIVES THE DAY IT WAS
WRITTEN.** "Put it on the repo and write a plan" is a different sentence from
"adopt these twenty articles as product rules", and the next delivery will
arrive with the same ambiguity.

**The five decisions were then put to the owner and answered the same day, and
ADR 0112 is Accepted.** In short: the constitution binds, as a product contract
subordinate to this file; the light palette is the default theme with the dark
one kept; the navigation moves to the delivery's five sections **now**, without
waiting for the inventory; the type scale goes to **15 / 13 / 11** and article 8
of the constitution is amended to 15 px rather than excepted; the world
illustration stays a reference and production prompts for tiles and objects are
commissioned beside it. Two of those went against the recommendation. **Read
that ADR's Status block rather than this summary** — it carries each ruling, its
provenance, and the one residual ambiguity.

**What did not change is the thing an agent is likeliest to over-read.** The
constitution binding does not make the delivery's sample numbers real, its build
loop a design, or its `localStorage` save a pattern; and article 5 binding makes
the *truth* of a player-visible sentence more constrained, not less — the fourth
reservation below still governs it.

**And the four reservations above are untouched by it.** Nothing in this
delivery reaches a server surface, a migration or deploy configuration, and the
fourth reservation is the one it presses hardest against: the delivery's
constitution makes *"every sentence is true"* its fifth article, which is a
demand on the code, not on the copywriting. The wording of a player-visible
string has been ours since 2026-09-04; its truth has not.

## Instructions recorded that are not releases

An instruction from the owner that changes nothing inside the four reservations
still has to survive the session it was given in. It is recorded here, in their
words and dated, in the same shape as a release — the difference being stated
rather than left for a reader to infer.

**The runner selector, 2026-09-13.** Told what the workflows currently ask for,
the owner answered:

> runnery to po prostu self hosted i tak ustaw wszędzie

("the runners are just self-hosted, so set it that way everywhere.") **Every
`runs-on:` on disk already read `self-hosted` when that was said** — the label
lists went in `80b54a97` — so no workflow file moved, and this is not a release
inside reservation 3. What it bought is a gate: `tests/foundation/ci-configuration-contract.test.ts`
now carries a "runner selector contract" that reads every `runs-on:` in
`.github/workflows/` and fails on anything that is not the bare selector,
watched going red on a mutation before it was believed. The two pre-existing
pins covered one job each, in `version.yml` and `deploy.yml`, and neither could
see the others.

**Why a label list is the thing being kept out, rather than a preference being
expressed.** A label list is a claim about which machines exist, and those
claims have rotted here three times: this file and `CLAUDE.md` between them
carry `woogitsu-host-*`, `woogitsu-linux-*` and `lockstate-wsl-DOM-NEW-*`, each
correct when written. A job pinned to a label nothing carries does not fail
loudly — it queues.

**FOUR RULINGS ON 2026-09-19, AND ALL FOUR SHARE THE WEAKER PROVENANCE.** They
were put to the owner as clickable options **written by the integrating
session**, in Polish, and the owner chose one from each. **What is recorded
below is therefore the label of an option this session authored and the owner
picked, not a sentence the owner typed** — the same distinction the 2026-09-08,
2026-09-09 and 2026-09-10 entries above draw about themselves, and the same one
ADR 0112's Status block draws about four of its five. Read each as authorising
what its label says and nothing wider, and put anything wider to the owner on
its own terms.

None of the four is a release inside the four reservations, which is why they
are here rather than above. Two of them accept or amend an ADR; where they do,
the ADR carries the ruling in its own conventions and is the document to open.

**1. ADR 0111 — how a room instance's rectangle reaches the render side.** The
question was which of that document's four transport options to take: it was
`Proposed`, its own Status block said *"Nothing below is accepted"*, and it
blocked the Option A the owner had already accepted in ADR 0097 on 2026-09-05.
They chose:

> Rozszerzyć world w migawce geometrii (rekomendacja ADR-a)

("Extend `world` in the geometry snapshot (the ADR's recommendation).") That is
ADR 0111's Option A and the one its own Decision section recommends. **Recorded
in that ADR's Status block**, which now carries an Accepted state above the
`Proposed` one it keeps, on ADR 0112's pattern. It authorises the transport and
nothing drawn with it: ADR 0111 decision 3 already says that publishing a
rectangle licenses no mark, and that limit is part of what was accepted.

**2. ADR 0103 decision 6 — the gang membership split, amended.** The finding put
to the owner: whether a session ever sees gang retaliation is decided by the
parity of two entity ids. Of 12 seeds, 7 reach a tier-3 pair; of those 7, 3 draw
a same-gang pair and retaliate **never**, and the other 4 lock the whole prison
down every 4,800 ticks **forever**. Both outcomes are the mechanism failing, in
opposite directions. Decision 6 is one the owner accepted on 2026-09-08, so
changing it is theirs. They chose:

> Obie naraz

("Both at once.") — that is, change the member split **and** cool the cadence,
rather than either alone. **Recorded as an amendment in ADR 0103's decision 6**,
dated, in that document's own in-section correction form. **No code changed
with it.** The implementation is separate work and is deliberately not in the
commit that records this, because a ruling and its implementation in one diff is
a diff nobody can review as either.

**3. Issue #933 — the first-cell instruction, corrected in place.** The sentence
a newcomer is given names one of a Cell's four requirements and omits the
toilet, which is the requirement that makes the room a Cell at all. The sentence
is **the owner's own, written 2026-09-03**, and reservation 4's 2026-09-04
release does not reach it in the way that matters: the choice of words has been
ours since that date, but the requirement that the sentence be *true* is still
theirs, and this sentence is theirs in both senses. Asked whether to correct it
in place or to add a corrected sentence beside it, they chose:

> Poprawić Twoje zdanie w miejscu

("Correct your sentence in place.") **This is a deliberate departure from this
repository's usual habit**, which is to keep a superseded text visible and mark
it — the habit `docs/AGENT_WORKFLOW.md` §4 asks for and which this file follows
in every block above that says "kept rather than rewritten". **The option said
so before the owner chose it**, so the departure is what was authorised rather
than a side effect of it. It is scoped to that one sentence: it is not a licence
to overwrite a superseded text anywhere else, and the reservation's truth
requirement is untouched — whatever replaces it is still verified against the
room catalogue before it ships, and quoted verbatim in the commit and the pull
request body under the 2026-09-04 release's terms.

**4. The sixth navigation section — #1292 unparked.** #1292 had been a draft
since 2026-09-17 waiting on one question its own body asks the owner: *"May the
navigation carry a sixth section at all?"* — the 2026-09-13 delivery names five,
ADR 0112 decision 3 ruled those five, and the ruling that authorised a sixth was
recorded only in a source docblock. Asked directly, the owner chose:

> Tak, szósta sekcja wchodzi

("Yes, the sixth section goes in.") So the navigation may carry a section the
delivery does not name, the five ruled titles being unchanged by it. **This
answers only the first of the two questions #1292 puts to the owner**; the
second, about a sector id on screen, was not asked and is not answered here.
**It unparks the pull request and merges nothing** — the four browser specs its
body reports red are still red, and the row-and-column budget above the 720 px
break is still the open decision that body names.

**A FIFTH RULING LANDED THE SAME DAY, AND THE HEADING ABOVE STILL SAYS FOUR
BECAUSE IT WAS WRITTEN BEFORE THIS ONE.** It is left standing rather than
corrected, on the habit `docs/AGENT_WORKFLOW.md` §4 asks for and which every
block above follows; what a reader needs is that **five** rulings of
2026-09-19 are recorded in this section, and that this one shares the weaker
provenance the heading describes — a clickable option **written by the
integrating session**, in Polish, which the owner picked. Not a sentence they
typed. It authorises what its label says and nothing wider.

**5. `docs/adr/STATUS-QUEUE.md`'s dated §3 pass accounts, excluded from the
anchor-staleness counting.** The question put to the owner was what to do about
a per-document budget that counts an append-only archive as if it were live
prose. #1321 had established, with evidence, that roughly a third of that
document's unverified anchors sit in §3 entries whose coordinates the file has
itself ruled must not move — *"Neither points where it says any more, and
neither should be moved"* — so the gate offered them no compliant remedy at all:
quoting them is impossible, re-aiming them is forbidden by the record, and
raising the budget is forbidden by the gate. Being per document did not keep the
cost there either: #1308 and #1318 both went red on line arithmetic in a third
file with nothing to do with their subject. They chose:

> Wyłączyć datowaną sekcję 3 z liczenia

("Exclude the dated section 3 from the counting.") **It is read as narrowly as
it is written.** *Dated* §3 is what it names, so the undated
`## 3. Still outstanding` section, the document's header and §§1-2, 4-6 stay
counted, and no other document in the corpus is touched by it. It is not a
licence to exclude a second document, a second section, or a whole file: the
one precedent it rests on, `docs/research/`, was itself argued from that
directory's own README rather than assumed.

**No budget was raised to implement it, and the document's row was lowered.**
`tests/foundation/documentation-anchor-quotation-contract.test.ts` carries the
exclusion, keyed off the document's own heading shape rather than a line range,
and that document's row falls from 300 to the exact measured count of its live
sections. `ANCHOR_STALENESS_BUDGET_MERGES` and `ANCHOR_STALENESS_BUDGET_COMMITS`
in the sibling gate are a different mechanism and were not touched: this ruling
reaches what is *counted*, never how much is *allowed*.

**THE SENTENCE ABOVE WAS FALSE OF THE DIFF THAT FIRST CARRIED IT, AND IT IS
LEFT STANDING RATHER THAN CORRECTED IN PLACE.** The habit is the one
`docs/AGENT_WORKFLOW.md` §4 asks for and that `CLAUDE.md`'s preamble
demonstrates at length; breaking it here, in the entry that records a ruling
*about* an archive whose records must not be re-aimed, would be the worst
available place to break it.

**What it claimed.** That the ruling reaches what is counted and never how much
is allowed.

**What the first revision of the diff did.** It set
`docs/adr/STATUS-QUEUE.md`'s row to **123**, the exact count its live sections
measure. But the row was not previously equal to its count either: at
`36503522` it allowed **300** against **236** counted, and #1321 had left those
**64** there on purpose, in its own words, *"because lowering it to the new
count would hand the headroom straight back"*. Setting the row to 123 therefore
spent the whole of that reserved headroom — it changed how much is allowed, by
64, inside the commit whose prose says it does not. That tightening was
**voluntary and measurable**: with the exclusion in place and the row left at
300, the gate is green. The owner ruled on counting and was never offered the
tightening.

**What the diff does now.** The row is **187**, derived rather than picked:
300 - 113 = 187, the 113 being the anchors the ruling removes from counting, so
the pre-ruling slack of 64 is carried across the change (187 - 123 = 64) rather
than spent. The whole of the ruling's win is banked as budget retired and none
of it as slack removed, which is what makes the standing sentence true as
written. `tests/foundation/documentation-anchor-quotation-contract.test.ts`
pins the derivation in an assertion, so a later editor who lowers the row to
the live count fails rather than drifts — and that matters because **a budget
can never be raised**, so headroom not preserved at that commit cannot be
recovered afterwards.

**Why it is recorded here and not only in the pull request.** The failure mode
was not arithmetic. It was a prose claim and a diff written in the same change
by the same session, neither checked against the other — the same failure mode
this document's `CLAUDE.md` counterpart records six times against itself, and
the check that would have caught it is the cheap one: read the sentence against
the diff it ships with.


**TWO FURTHER RULINGS ON 2026-09-19 — THE SIXTH AND THE SEVENTH — AND NEITHER
HEADING ABOVE HAS BEEN CORRECTED.** The first says four and the entry after it
says five, each true when written and each left standing, because a count
rewritten in place is a count whose earlier value nobody can see. `CLAUDE.md`'s
preamble is this repository's standing demonstration of what that costs: of the
six mistakes it records against itself it sorts them *"two on one side and four
on the other"*, the four being wrong **numbers** rather than wrong claims about
how wide a permission ran.

**The numbering here is load-bearing and was nearly got wrong.** These two were
drafted as the fifth and the sixth by a session that had checked this file and
found four — while an agent it had itself dispatched was adding the fifth on a
branch. The collision was caught by reading that agent's diff rather than this
file, which is the same check `docs/AGENT_WORKFLOW.md` §4 asks for and the same
failure mode `CLAUDE.md` records twice: a number written once and never re-read
against the document it describes. **Ruling 5 is the exclusion of
`docs/adr/STATUS-QUEUE.md`'s dated §3 from anchor counting**, recorded in the
entry immediately above this one.

They share the weaker provenance the block above describes — clickable options
**written by the integrating session**, in Polish, one chosen from each. **What
is recorded below is the label of an option this session authored and the owner
picked, not a sentence the owner typed.** Read each as authorising what its
label says and nothing wider.

**6. ADR 0095 — the held number goes onto a pull request.** `docs/adr/README.md`
has carried *"0095 remains held and still not on disk"* through six successive
audit entries. The work sits on the branch
`measure/893-coverage-and-response-draw-from-one-pool`, last committed
2026-09-03, with no pull request — and `deletebranches.sh` does not protect it,
so a branch-cleanup run would have destroyed the only copy and settled the
question in the one direction nobody chose. Offered that, releasing the number,
or merely protecting the branch and deciding later, the owner chose:

> Otworzyć PR z tej gałęzi

("Open a PR from that branch.") **It authorises a pull request and no merge**,
and the number stays taken. Accepting ADR 0095 is a separate decision and still
theirs. ADR 0096's own row in that README records that it *"Takes 0096 over a
held 0095"* and cites this exact branch, so whatever 0095 decides has to be read
against a document that already superseded its subject matter — which is the
first thing its pull request has to say.

**7. The dead glob segment in `ci.yml` — offered inside reservation 3, and
DECLINED.** This entry exists because a reservation that was *asked about and
not released* leaves no trace anywhere else, and the next session would
otherwise spend the question again. The `browser` job's `git lfs pull
--include=` list names eight path segments. Measured against `09384b9f`, seven
of them match exactly one file each under `public/game-content/source-art/` and
`rendered.furniture.cell.locker.variants` matches **none**. Offered the deletion
of that one segment, leaving it, or first checking whether locker art is
planned, the owner chose:

> Zostawić

("Leave it.") **Reservation 3 is untouched and nothing in `.github/workflows/`
moved.** The reading that makes the choice cheap is the one the option carried:
a `git lfs pull` whose glob matches nothing does not fail, it fetches nothing.
The 2026-09-07 entry above establishes that the list fails closed on an id
**absent from it** — the decode step's own error says `add '<id>' to the
--include filter above` — not on one that is present and unused. So the segment
costs nothing while it waits, and if locker art is ever published it is already
named.

**A SIXTH RELEASE INSIDE RESERVATION 3, 2026-09-20 — ONE `if:` CONDITION ON
THE `browser` JOB'S EVIDENCE UPLOAD, AND IT IS THE FIRST THAT ANSWERS A
QUESTION THE FILE ITSELF HAD WRITTEN DOWN AS OPEN.** The step named
`Upload the browser suite's failure evidence` in `.github/workflows/ci.yml`
ran `if: failure()`. `failure()` is false for a cancellation, so a job that is
cancelled rather than failed uploaded nothing. That stopped being theoretical
on 2026-09-19: the runner `lockstate-wsl-DOM-NEW-03` died at roughly 21:54Z
during PR #1313's `browser` job (run 35468216836, attempt 1, job
105967436033). Read off the API rather than taken from a brief: the suite step
concluded **cancelled**, the evidence step concluded **skipped**, and the log
blob was never finalized (`BlobNotFound`) — a red job with no log and no
artifact, whose diagnosis had to be reconstructed from scheduler behaviour.
The owner was asked and chose, from three clickable options, the one labelled:

> `failure() || cancelled()` (zalecane)

("`failure() || cancelled()` (recommended).")

**What the release covers, exactly.** That one `if:` condition on that one
step, from `failure()` to `failure() || cancelled()`, and nothing else in the
file: not a second step, not a second job, not any `timeout-minutes`, not the
`git lfs pull --include=` filter, not `retention-days`, not
`if-no-files-found`, not the runner selectors, not `deploy.yml`, not
`wrangler.jsonc`, not `public/_headers`, and neither dashboard.

**The provenance is the weaker kind, exactly as the 2026-09-08, 2026-09-09 and
2026-09-10 entries and all five rulings of 2026-09-19 record of themselves**:
the label of a clickable option the integrating session wrote and the owner
picked, not a sentence they typed. Read it as authorising the condition that
label spells and nothing wider.

**The chosen condition is a third option the file's own comment does not
consider, and that is the part worth reading.** The long comment above that
step poses the choice as `failure()` versus `always()` and prices `always()`
at an empty artifact on every green run — which is why the 2026-09-08 release
raised the job's `timeout-minutes` instead of touching the condition. The
owner chose neither: `failure() || cancelled()` uploads whenever there is
something to look at and is still false on green, so that cost is not paid.
**The superseded sentence — "it stays here as the open question it has been
since this comment was written" — is kept in the file with the correction
appended beneath it**, on the habit `docs/AGENT_WORKFLOW.md` §4 asks for,
rather than edited away.

**The weakest claim in this entry, named here rather than left for a reader to
find.** `cancelled()` is documented as true when the *workflow run* was
cancelled. It is therefore certain for the concurrency-group case and for an
explicit cancel, and **unverified for the 2026-09-19 runner-death case that
motivated the question**: that run was not cancelled as a whole — attempt 2 of
it concluded `success` — and a job whose runner disappears may end in a state
where neither `failure()` nor `cancelled()` is true and the step is skipped
again. The change is strictly wider than what it replaces and costs nothing on
a green run, so it is worth having on either reading; it is not proof that the
lost evidence would have survived.

**A gate moved with it, in the same commit, and moving it was ours.**
`tests/foundation/ci-configuration-contract.test.ts` already pinned this
condition to the literal `failure()`, so the workflow edit turned it red — the
contract working. Its assertion now pins `failure() || cancelled()` and its
superseded comment is kept above the correction in the same form. Adding and
re-aiming that assertion is not inside reservation 3: the test file is ours,
and what it pins is the owner's ruling rather than a choice this session made.


**AND THAT ENTRY WAS SUPERSEDED WITHIN THE HOUR BY A SECOND RULING THE SAME
DAY — BOTH ARE RECORDED, AND THE FIRST IS NOT ROLLED BACK OUT OF THE RECORD.**
The condition shipped is **`always()`**. The entry above is kept whole because
the first ruling **happened**, was acted on, and was superseded for a reason a
later reader needs: **the question it answered carried a false premise, and the
premise came from the integrating session rather than from any document.**
`AGENTS.md`'s 2026-09-10 `branch-gc.yml` entry is the precedent for this shape
— *"the owner authorised more than was required, and only half of it was
used"* — and this follows it.

**The premise, named exactly.** The integrating session framed
`failure() || cancelled()` to the owner as the condition that catches the
runner-death case of 2026-09-19, without first checking what `cancelled()` is
true of. The agent that implemented the first ruling flagged that it could not
verify it and wrote the caveat into the workflow, the test and this document.
The caveat was then checked against the API and it holds decisively.

**The measurement, for job 105967436033 (run 35468216836, attempt 1,
`browser`, runner `lockstate-wsl-DOM-NEW-03`).** The job concluded
**`failure`**; the step `Run the real-browser suite` concluded **`cancelled`**;
the step `Upload the browser suite's failure evidence` concluded **`skipped`**.
The job ended `failure` and the upload was still skipped, so step-level
`failure()` evaluated **false** — a *cancelled step* is not a failed one. And
the run was never cancelled as a whole: attempt 2 of it concluded `success`, so
`cancelled()` was false too. **The condition ruled on earlier that day would
have skipped this step exactly as `failure()` did.** The 2026-09-19 shape is a
cancelled step inside a live run, and neither guard reaches it.

**The second finding, which removed the stated cost of `always()`.** The
workflow comment had priced an unconditional upload at "an empty artifact on
every green run" since the day it was written, and the step itself carries
`if-no-files-found: ignore`: with an empty `test-results/` the action creates
**no artifact at all**. The real cost on a green run is a few seconds and a log
line. Every argument on this step for eleven days — including the 2026-09-08
decision to raise `timeout-minutes` rather than touch the condition — had been
weighing a cost this step does not pay.

**THE SECOND FINDING IS FALSE, AND IT IS KEPT ABOVE BECAUSE IT WAS PUT TO THE
OWNER AS PART OF THE QUESTION THEY ANSWERED.** It was read out of
`actions/upload-artifact`'s documented behaviour, not off a run, and the first
run to execute this step under `always()` refutes it: run 35514269512, head
`70b9bbf0`, `browser` job **success** — and an artifact created anyway,
`browser-failure-35514269512-1`, **27,416 bytes**. `test-results/` is not empty
on a green run, so `if-no-files-found: ignore` never engages and the green-run
cost is a small artifact per run rather than a log line.

**The ruling stands, for a reason that is no longer the reason it was given.**
About 27 KB per green run against a seven-day retention is on the order of a
megabyte: cheap, not free. What the refutation kills is the claim that the
narrower guards cost nothing to give up; what survives untouched is the
measured fact that neither of them fires on the shape that loses the evidence,
which is the half the decision actually rests on.

**Both mistakes on this line arrived by the same route and it is the route to
watch.** The first was a condition put to the owner without checking what it
evaluates to; the second was a cost written into three files as measured fact
when it had been read from a vendor's documentation — and it was written *in
the same pass that corrected the first*. A correction is not evidence that the
corrected text is now sound. The check that caught this one was a single API
call against a run that had already finished.

**The ruling.** Put both findings to the owner, who chose, from three clickable
options, the one labelled:

> Zmień na `always()` (zalecane)

("Change it to `always()` (recommended).")

**What this release covers, exactly — unchanged in breadth from the entry
above, only in value.** That one `if:` condition on that one step, now
`always()`, and nothing else in `.github/workflows/ci.yml`: not a second step,
not a second job, not any `timeout-minutes`, not the `git lfs pull --include=`
filter, not `retention-days`, not `if-no-files-found`, not the runner
selectors, not `deploy.yml`, not `wrangler.jsonc`, not `public/_headers`, and
neither dashboard.

**The provenance is the weaker kind, as the first ruling's is and as every
release in this reservation since 2026-09-08 records of itself**: the label of
a clickable option the integrating session wrote and the owner picked, not a
sentence they typed.

**What this costs the owner that the first ruling did not, stated plainly
rather than left implicit.** They ruled twice on one line in one day, and the
second ruling existed only because the first question was mis-framed here. That
is the cost of putting a condition to someone without first checking what it
evaluates to, and it is recorded so the next session pays the check instead.


**A RULING ON 2026-09-21 — HOW THE SECURITY SECTION NAMES THE PLACE AN
INCIDENT IS IN. IT IS NOT A RESERVATION RELEASE, AND IT IS RECORDED HERE
BECAUSE ITS PROVENANCE IS THE WEAKER KIND.** The Security section merged in
#1292 rendered an incident row as *"Assault in security-sector.prison"* /
*"Napaść w sektorze security-sector.prison"*. The sentence is **true**, so
reservation 4 was never engaged: it was the only place in the HUD a player saw
an internal id, and it read as debug output rather than as a false promise.

Offered four options, the owner chose:

> Nazwać stopniem, jak blok wyżej (zalecane)

("Name it by its grade, like the block above.") **The provenance is the weaker
kind, as every ruling in this document since 2026-09-08 records of itself**:
the label of a clickable option the integrating session wrote and the owner
picked, not a sentence they typed.

**What it authorises, exactly.** Extending the `hud/incidents` projection's
row with the sector's grade name key — a projection change, ours — and
rendering that grade word where the id is today, **falling back to the id**,
which is character for character what the sectors block one element up already
does. **It does not authorise a new player-visible string**, and none was
needed: `hud.security-section.incident-row` is `'{type} in {sector}'` and
`'{type} w sektorze {sector}'`, both unchanged, and `{sector}` is a parameter
whose argument is what moved.

**What the owner gave up, and they were told before choosing.** A grade is
**not a place**. *"Assault in General"* names the grade, and two sectors of the
same grade are indistinguishable on screen. `docs/HUD_PROJECTIONS.md` gaps 16
and 23 are why nothing better exists — no projection publishes what is in a
sector — and ADR 0036's sector is derived rather than drawn, so nobody ever
authored a word for it. `DEFAULT_SECURITY_SECTOR_ID` is an id chosen for save
stability, which is the whole reason it was on screen.

**The cheap check this ruling's implementation did pay, named because the
entries above it exist to say when one was skipped.** The brief it was given
asserted that `security-panel.ts` already preferred `sector.gradeLabelKey`
over the id and that `IncidentRow` carried `sectorId` alone. Both were opened
and both held — but the same brief's commit and the shared checkout were at
different revisions, and the file the grep first ran against did not contain
the panel at all. Read a premise against the tree the work will ship from, not
against whichever checkout is nearest.


**THREE FURTHER RULINGS ON 2026-09-21, ALL THREE OF THE WEAKER PROVENANCE, AND
THE FIRST OF THEM ANSWERS A QUESTION THE OWNER WAS ASKED ON A FALSE PREMISE.**
They were put as clickable options **written by the integrating session**, in
Polish, one chosen from each. **What is recorded below is the label of an
option this session authored and the owner picked, not a sentence they typed.**
Read each as authorising what its label says and nothing wider. The heading of
the entry above says "A RULING" in the singular and is left standing; a heading
rewritten in place is a heading whose earlier value nobody can see.

**8. The last three chrome-row combinations of the 200% zoom sweep are folded
into the deferred zero-sum set.** Offered folding them, keeping them as
separate work, or settling the vertical budget outright, the owner chose:

> Złóż do odroczonych (zalecane)

("Fold them into the deferred set.") It covers `1024x768@175%`,
`390x844@150%` and `375x812@150%`. No number moves: `KNOWN_FAILING` in
`tests/browser/ui-200-percent-zoom-sweep-ratchet.spec.ts` stays at twelve
entries, which is a ceiling and may be lowered but never raised.

**THE PREMISE THE OWNER WAS GIVEN WAS THIS SESSION'S AND IT WAS WRONG.** They
had earlier been told that four chrome-row combinations were a real local
defect separable from the nine rail-budget collapses. Measured, one of the
four was: `375x812@125%`, closed by `observeChromeRowOverflow`. The other
three were re-measured directly and every way of giving the chrome row more
room trades their REACHABLE fault for an OVERFLOWING fault on `.hud__aside` —
the nine's budget reached through a different door. So the question the owner
answered was framed by a claim that had not been measured when it was made,
and the answer they gave is the one that survives the measurement. **This is
the same failure mode the entries above record against this document's
`CLAUDE.md` counterpart: a claim written once and never re-read against the
thing it describes.**

**A further correction belongs here because it concerns how a ruling is
attributed.** The ratchet spec had written that *the owner's* ruling read the
thirteen as nine plus four. It did not; that split was this session's premise,
put to them as fact. Corrected in place by marking. **A ruling's record must
not absorb the framing the ruling was given in.**

**9. Stage 7 of the identity rollout proceeds one release request per batch,
and NO GLOB WAS RELEASED.** Offered a per-batch request, releasing the whole
stage-7 `--include=` list up front, or deferring stage 7 entirely, the owner
chose:

> Jedna prośba na partię (zalecane)

("One request per batch.") **This authorises a method, not an edit.
Reservation 3 is untouched and nothing in `.github/workflows/` moved.** Each
batch is still a separate release, still needs the owner's own dated words,
and is still bounded to the `git lfs pull --include=` list in the `browser`
job of `.github/workflows/ci.yml`.

**Superseded on 2026-09-23 for future art globs by ruling 31 below.** This
paragraph records the earlier decision and the batches released under it;
the owner has since given standing permission to append needed art globs to
this exact `browser` LFS include list without asking for each batch.

**The first batch was researched and there is none, which is why this entry
records a method with no spend against it.** The research is at
`docs/research/2026-09-21-what-stage-7s-first-glob-request-would-have-to-name.md`.
Three findings decide it. The already-committed Blender renders that could
ship without Blender were examined against the object catalogue by an earlier
pass and none survived its legibility bar. The paths that would take new art
are blocked in code rather than in art: terrain has no caller that sets a
tile's material, and the edge writer defines exactly two numeric edge kinds,
so a second wall or door kind has nowhere to key on. And the art stage 7
actually owes — seven catalogued objects with no art of any kind — needs
Blender 5.2.1 modelling, which neither this environment nor CI has.

**So stage 7 is blocked on the owner in a way the rollout plan did not say.**
Not on a reservation release: on art that no agent can produce. A generated
image cannot substitute, and that is a ruling already on the record rather
than a preference — the renderer satisfies the aspect checks by construction
and a generated image would satisfy them by luck, unreproducibly.

**A finding worth carrying, because it is the kind that fails closed and
silently.** The `--include=` list is a literal list of specific globs and not
a pattern over them, as the 2026-09-07 entry records. Each segment is itself a
glob over the content hash, so **re-rendering an already-named id needs no
release; only a new id does.** And the decode assertion is generic while the
list is not — it reads the ids out of the sprite manifest at run time — so a
batch's release must be computed from the manifest change rather than from
what is in the art directory. The list and the manifest agree exactly at the
time of writing, so nothing is half-released.

**10. Polish plural agreement is choice of words, and therefore ours.** The
identity rollout's stage 6 carries messages whose count placeholder is flat,
so Polish reads the wrong noun form for most values. Offered treating plural
selection as ours, returning the strings to the owner to read, or building the
selector and migrating nothing, the owner chose:

> Nasze — to wybór słów (zalecane)

("Ours — it is a choice of words.")

**This is a reading of the 2026-09-04 partial release of reservation 4, not a
new release, and the limit that release set is untouched.** The reasoning the
option carried, and which the ruling rests on: the *number* in the sentence
comes from the simulation and does not change; only the word agreeing with it
does. So the grammatical form is inside "the choice of words is ours" and the
truth of the sentence stays the owner's.

**What it does not authorise.** Not a new claim, not a changed number, not a
sentence that says something the code does not do. **Every player-facing
string authored under it is still quoted verbatim in the commit message and in
the pull request body, beside the code that proves it true** — that
requirement is the surviving half of reservation 4 and this ruling does not
touch it.


**TWO RULINGS ON 2026-09-22, BOTH OF THE WEAKER PROVENANCE, AND NEITHER
HEADING ABOVE IS CORRECTED.** They were put as clickable options **written by
the integrating session**, in Polish, one chosen from each. **What is recorded
below is the label of an option this session authored and the owner picked, not
a sentence they typed** -- the distinction every entry in this document since
2026-09-08 draws about itself. Read each as authorising what its label says and
nothing wider.

**The numbering was checked against this file before it was used, because the
last pass through this section nearly got it wrong.** Read at the time of writing, the
rulings of 2026-09-19 and 2026-09-21 ran 1 to 10 with no gap and no repetition,
so the numbers below are 11 and 12. That reading is dated on purpose: it is a
statement about the file as it stood, not a standing claim about the highest
number in it.
The entry above headed *"THE NUMBERING HERE IS LOAD-BEARING AND WAS NEARLY GOT
WRONG"* records what the check is for: a number drafted from a stale reading
while another agent added one on a branch. The branches open at the time of
writing were read as well as this file, which is the half of that check the
earlier pass had missed.

Neither of these is a release inside the four reservations, which is why they
are here.

**11. ADR 0122 -- a pressable message row with no action-verb label is an
acceptable delivery of the delivery's `Akcja` column.** That document's §7
reserved one question to the owner and answered nothing else: whether the row
being the press is an acceptable delivery, or whether the labelled button must
arrive at the horizontal-budget price its §5b measures -- the corner past the
width the owner's own 2026-09-01 ruling set, or the four-line-box property
`tests/browser/ui-alerts-column.spec.ts` gates. It was reserved because it is
about whether a promise is made to a player at all, which is the fourth
reservation and the half of it the 2026-09-04 partial release did not release.
Offered the row without the verb, the labelled button at that price, or no
action for now, the owner chose:

> Naciskany wiersz, bez czasownika (zalecane)

("A pressable row, without the verb.") So the message row itself becomes the
press and leads to the place, and no action-verb label is owed.

**What it authorises, exactly.** The affordance and its absence of a label,
and the reading of the delivery's table that goes with it: the table's third
column is not a list of buttons this repository owes. **It authorises no new
player-visible string** -- a row that is pressable and says nothing new says
nothing new -- and none was needed. **It releases no reservation**: the
requirement that a player-visible sentence be true is the surviving half of the
fourth and is untouched, and any wording that does change still goes through
the 2026-09-04 release's terms, quoted verbatim in the commit message and the
pull request body beside the code that proves it true.

**What it does not decide, named because the ADR's recommendation is four
bullets and the ruling reaches one of them.** It does not decide the
worker-protocol change that document identifies as the first step -- the
optional location member on the refusal and event payloads -- nor the
sequencing that puts it ahead of any affordance, nor the instruction not to
widen the HUD corner for this, nor the instruction to say nothing to the player
until the press works. Those stay that document's own proposals, and its status
keyword is unchanged for that reason. **The measurement it asks for is also
still owed**: whether a pressable row inside a scroll container behaves on a
touch device is a browser run nobody has taken, and the document names it as
its own weakest claim.

**12. Which vendored copy of the `Akcja` table binds -- `projekt.md`.** ADR
0122 found the table vendored **twice** inside the 2026-09-13 delivery with
material differences and neither copy marked as superseding the other: the copy
under `DOKUMENTACJA/` heads the column `Akcja`, and the copy inside the patch
under `HISTORIA/ZMIANY/` heads it `Działanie`. Offered either copy, or
checking the dates and deciding without the owner, they chose:

> `projekt.md` jest wiążący (zalecane)

("`projekt.md` binds.") So the copy under `DOKUMENTACJA/` is operative and the
one under `HISTORIA/ZMIANY/` is a historical record, which is what that
directory's own name says it is.

**The delivery is not annotated, and that is not a detail.** The vendored
directory is never edited, so the mark that one copy is history lives in ADR
0122's §1b and here. A reader of the patch gets no warning from the patch.

**Both copies were re-read cell by cell before this was recorded, and the
ADR's own description of them was thin in three particulars.** The differences
it names all hold -- the column heads, `Brak` against `Bez dodatkowej akcji`,
the `Brak wyposażenia` row present in one table only, the `Funkcja
niedostępna` row present in the other only. What it missed: a second differing
cell, where one copy calls the situation `Konflikt lokalny` and the other
`Zapis odmówiony` above the same message and the same action; that the row
missing from the patch's table has its whole content in the patch's prose ahead
of it, so the ask is not missing from the delivery even where the row is; and
that the two captions are different sentences, the historical one being the
**stronger** -- it requires a working button where the binding one requires
proof in code. That last one argues against ruling 11 rather than for it, and
it is recorded in both documents for that reason. All three are corrections to
a description, not to a ruling: the ruling picks a copy, and the copy is the
same copy whatever the count of differing cells.

**A RULING ON 2026-09-23, OF THE WEAKER PROVENANCE.** It was put as a
clickable option **written by the integrating session**, in Polish. **What is
recorded below is the label of an option this session authored and the owner
picked, not a sentence they typed.** Read it as authorising what its label
says and nothing wider.

**The numbering was checked before it was used.** At the time of writing, the
rulings of 2026-09-19 to 2026-09-22 in this file ran 1 to 12 with no gap. Every
remote branch's copy of this file was also read, and none carries a 13. That
is a statement about the file and the branches as they stood, not a standing
claim.

It is not a release inside the four reservations, which is why it is here.

**13. ADR 0104: a placement the simulation refuses is not the player's latest
action.** #1370 marks the status strip's Undo unavailable when a press would
do nothing. That exposed the problem: a wall refused on its content was still
registered on the undo history, as a dead transaction.
- Undo went dim over a live wall that two presses would still take back.
- The refused placement also reset the newer-action flag, so the second press
  could reverse a wall placed before a hire. That was measured through the
  real kernel: the loss ADR 0104 option 2 exists to stop.

Refused objects were already kept out of the history. Offered three choices:
- keep refused placements out of the history (option A);
- treat a refused placement as a newer action, so the next Undo refuses;
- change nothing for now, ship #1370's mark as it stood, and file the two-press
  hole separately;

the owner chose:

> Opcja A (zalecane)

("Option A (recommended).") So a `PlaceBuildOrder` the simulation refuses opens
no transaction, leaves the redo stack alone, and leaves the newer-action flag
alone.

**What it authorises, exactly.** That reading of option 2's *"the newest
accepted player command"*: the newest command that changed something. It also
authorises the one change a player can see, which is that redo survives a
refused placement. It is recorded as ADR 0104's *"Amendment, 2026-09-23"*,
beside that document's own Status block.
- **No player-visible string** is authorised or needed.
- **No save-format change** is involved. The snapshot's shape is untouched,
  and a save written before the amendment can still carry a dead transaction,
  which #1370's availability getter still answers.
- **It does not decide ADR 0104's open question 2**, about a stale redo.

**FOURTEEN FURTHER RULINGS ON 2026-09-23, ALL OF THE WEAKER PROVENANCE, AND
THE HEADING OF THE ENTRY ABOVE STILL SAYS "A RULING" IN THE SINGULAR.** That
heading is left standing. A heading rewritten in place is a heading whose
earlier value nobody can see. All fourteen were put as clickable options
**written by the integrating session**, in Polish, one chosen from each. **What
is recorded below is the label of an option that session authored and the
owner picked, not a sentence the owner typed.** Every entry in this section
since 2026-09-08 draws the same distinction about itself. Read each as
authorising what its label says and nothing wider. Each ruling is also posted
in English as a comment on its issue, and those comments were read for the
wording below.

**The numbering was checked before it was used.** At the time of writing, the
rulings of 2026-09-19 to 2026-09-23 in this file ran 1 to 13 with no gap. Every
one of the 514 remote branches' copies of this file was also read, and none
carries a 14 or higher. That is a statement about the file and the branches as
they stood, not a standing claim.

**None of the fourteen is a release inside the four reservations.** Rulings
22, 23 and 24 touch reservations 2 and 3 and release nothing in either, and
each says so in its own entry. Where a ruling accepts or amends an ADR, the ADR
carries it in its own conventions and is the document to open.

**14. The starting treasury is 100 000
([#641](https://github.com/matmaxalez/lockstate/issues/641)).** The owner's
ruling of 2026-08-30 was to raise the opening balance, and it left the figure
open. Offered figures, they chose:

> 100 000 (zalecane)

("100 000 (recommended).") That is the waste-multiplier measurement's
recommendation: the smallest balance of those measured that keeps the
drag-wall trap outside ordinary drawing, at about four screenfuls. **It sets a
number and moves none here.** `TREASURY_STARTING_BALANCE_MINOR_UNITS` is still
`25_000` at `src/simulation/economy/treasury.ts:203`. **Its docblock at
`:185-188` says the owner decided *"to keep 25,000"*, and that sentence is
false.** It was already false after 2026-08-30. It is left alone on purpose, so
that an implementation agent changes the constant and its docblock in one
commit. The overdraft floor at `:295` derives from the constant and moves with
it (#976).

**15. The product name is spelled `LockState.io` everywhere a player sees it
([#703](https://github.com/matmaxalez/lockstate/issues/703)).** #703's ruling 8
of 2026-08-31 said the product stops spelling its own name two ways, and it
left which spelling wins to the owner. They chose:

> LockState.io

That is the spelling `'brand.wordmark'` already carries. `index.html`'s
`<title>` and its `description` meta still read `Lockstate.io`, and they are the
player-visible spellings to change. **Code identifiers, package names and the
repository name are not affected.** Neither is anything in deploy
configuration: a spelling there is reservation 3's, and it is reported rather
than touched. This is a choice of words inside the 2026-09-04 partial release
of reservation 4. The sentence stays true because only the spelling moves.

**16. The mid-game should force money choices; research the levers first and
move no numbers ([#962](https://github.com/matmaxalez/lockstate/issues/962)).**
They chose:

> Tak — zbadaj dźwignie (zalecane)

("Yes, research the levers (recommended).") **This authorises research and no
balance change.** Candidate levers, for example room upkeep and running costs,
are measured over simulated days against ruling 14's new balance. The numbers
go back to the owner as options before any value moves.

**17. The withheld grant also gets a strip badge visible without hovering
([#890](https://github.com/matmaxalez/lockstate/issues/890)).** #1302 built the
description half: `stateIncomeWithheldTodayMinorUnits` on the status strip,
carried as a description only. The remaining question was loudness. They
chose:

> Tak, znaczek na pasku (zalecane)

("Yes, a badge on the strip (recommended).") So a badge beside the earnings
chip shows whenever the field is above zero. Its width is measured against
#719's strip budget. Any string it adds is quoted verbatim, beside the code
that makes it true, under the 2026-09-04 release's terms.

**18. ADR 0095 decision 1 is accepted; decisions 2 and 3 stay rejected
([#893](https://github.com/matmaxalez/lockstate/issues/893)).** They chose:

> Akceptuj decyzję 1 (zalecane)

("Accept decision 1 (recommended).") **Recorded in ADR 0095's Status block.**
The coverage read model publishes a response-and-search reserve, and
`describeStaffCoverage` gains a rung between `Covered` and `Understaffed`. No
simulation behaviour changes. **One thing is left open, and the ADR's block
names it:** the reserve figure's definition. Decision 1 recommends the ceiling
constant and also says it does not choose, and the label names neither.

**19. ADR 0090 is accepted
([#788](https://github.com/matmaxalez/lockstate/issues/788)).** They chose:

> Akceptuj (zalecane)

("Accept (recommended).") **Recorded in ADR 0090's Status block.** This is the
daily `ClassificationEarlyWarningSystem` that raises a tier only upward and
never above `Medium`, and it leaves the pace to `High` unchanged. **It accepts
a mechanism already on `main`** (#798, `75a3797b`). The comment on #788 says
*"then implemented"*, and that is not needed: nothing is owed to the code.

**20. ADR 0092: the rest, as recommended
([#557](https://github.com/matmaxalez/lockstate/issues/557)).** They chose:

> Pozostałe wg rekomendacji

("The rest as recommended.") **The label names no decision, so ADR 0092's
Status block tabulates all eight.** Accepted now: decision 1 (the post stays
on the sector), 5 (an unreachable post is kept and reported), 6 (the index is
clamped, with its own drop-if-unreachable clause), 7 (without the route gesture
that 2026-09-02's ruling 4 replaced), and 8 without its already overtaken
duty-shift bullet. **The five rulings of 2026-09-02 stand**, including the
rejection of decision 2's `redefine`. The #557 comment lists *"a route is
stored as ordered waypoints"* among the decisions accepted now. Decision 4's
storage was already confirmed on 2026-09-02, so that clause adds nothing. The
open questions are not decisions and stay open.

**21. ADR 0052 and ADR 0054 are accepted, and the review pass was declined
([#535](https://github.com/matmaxalez/lockstate/issues/535)).** #535 decision 8
of 2026-08-29 accepted both on condition of a review pass reported to the
owner. Offered that pass as the recommended option, they chose instead:

> Akceptuj oba

("Accept both.") **So the owner waived their own condition.** The acceptance
does not show it was met, and both Status blocks say so. One disagreement in
the record is noted there and not resolved. A review of both was posted on
#535 on 2026-08-29. #703's comments of 2026-08-31 say neither document had one.
ADR 0052 also carries a dated note on what ADR 0100 and ADR 0112 decision 5
have overtaken: the sheet count, and its open question about furniture art.
The decision itself is unchanged. ADR 0054 carries a note that no later ADR
overtakes any of its decisions.

**22. The owner reads PR #355's SQL themselves
([#343](https://github.com/matmaxalez/lockstate/issues/343),
[#355](https://github.com/matmaxalez/lockstate/pull/355)).** They chose:

> Przeczytam SQL sam

("I will read the SQL myself.") **Reservation 2 is untouched, and this is not
a release inside it.** `supabase/migrations/` stays the owner's, #355 merges
only by the owner, and nothing merges because of this ruling. What it settles
is who reads the SQL. The permitted help is a short summary on #355 to make the
read quicker. #355's own 2026-09-12 reading records that merging it as it stood
would turn `verify:sql` red on two assertions that pin the defect on purpose.
That is part of what the owner will be reading.

**23. The owner checks the hosted staging migrations in the Supabase panel
([#342](https://github.com/matmaxalez/lockstate/issues/342)).** They chose:

> Sprawdzę w panelu sam

("I will check in the panel myself.") **Reservations 2 and 3 are untouched,
and neither is released.** Nothing runs against the hosted project from here.
That includes a `dry_run` of `migrate-database.yml`, which #342's triage had
named as the one action that would settle it. When the owner reports what is
applied, the documents record it with the date.

**24. ADR 0002 Q9: production is a separate `lockstate` Worker on
`lockstate.io`, switched on later
([#274](https://github.com/matmaxalez/lockstate/issues/274)).** They chose:

> Osobny „lockstate”, później

("A separate `lockstate`, later.") **Recorded as ADR 0002's *"Amendment,
2026-09-23"*.** The topology moves to match that ADR. The ADR is not rewritten
to match the topology. `lockstate-staging` stays staging. **Reservation 3 is
untouched and nothing is released inside it.** No `wrangler.jsonc`, workflow,
`public/_headers` or dashboard change is authorised, and no dispatch of the
`production` job. Moving the domain onto `lockstate` is the owner's, when they
switch it on.

**25. Admitted prisoners arrive with prior incidents, and an ADR comes before
any code ([#540](https://github.com/matmaxalez/lockstate/issues/540)).** They
chose:

> Tak, z historią (zalecane)

("Yes, with a history (recommended).") **This authorises an ADR and no code.**
It covers a seeded, deterministic, tier-dependent draw of prior incidents, how
that draw feeds classification and gang membership (ADR 0121), and what it
means for saves and for the intake queue (#594). `ADMISSION_REQUEST =
{ priorIncidents: 0 }` at `src/main.ts:1190` stays until that ADR is decided.
It answers the question ADR 0090 lists under *"What this does not decide"*,
item 2.

**26. Constitution article 6 covers refusals, so each refusal leaves a row in
the message history ([#985](https://github.com/matmaxalez/lockstate/issues/985)).**
Article 6 says warnings do not disappear because a newer event arrived, and
that the event history stays available. Today `RefusalLog.record` replaces the
standing refusal, and a second refusal deletes the first with no trace. They
chose:

> Tak, odmowy do historii

("Yes, refusals into the history.") **This is a reading of an article ADR 0112
decision 1 made binding.** The band still shows only the current refusal and
keeps ADR 0091's lifetime rules. What changes is that the history keeps each
one. The design is owed against ADR 0084, ADR 0091 and `docs/HUD_PROJECTIONS.md`
gap 34 before the code is written.

**27. `remove-wall` and `remove-object` count as one route for retiring the
refusal band only
([#1270](https://github.com/matmaxalez/lockstate/issues/1270)).** They chose:

> Tak, jedna trasa (zalecane)

("Yes, one route (recommended).") **Recorded as ADR 0091's *"Amendment,
2026-09-23"*.** A decided outcome of `RemoveWall`'s object arm now retires a
standing `remove-wall` refusal under option F. The amendment reads *"one
route"* as both directions. #492's keying, `RefusalLog` and its guarding tests
are unchanged. The ADR's *"Kills the measured contradiction"* bullet, false for
the object arm as #1270 measured, is kept with a dated mark.

**TWO MORE RULINGS OF 2026-09-23, ASKED AFTER THE FOURTEEN ABOVE, SAME WEAKER
PROVENANCE.** Each was put as a clickable option written by the integrating
session, in Polish, and the owner picked one. Before these were numbered, this
file was read at `57118f11` and ran 1 to 27 with no gap. That is a statement
about the file at that commit, not a standing claim.

**28. Crowding accelerates need decay, and the riots it adds stay
([#586](https://github.com/matmaxalez/lockstate/issues/586)).** The only ruling
comment on #586 (2026-08-29) was **written by an agent and posted from the
owner's account**; the sentence it quotes is the design corpus's. The owner was
told that, and was shown the built mechanism:
- safety decays at an extra slope of 40 and hygiene at an extra slope of 8
  whenever prisoners outnumber beds (`accommodationCapacityOf`);
- the strip's "Covered" becomes "Overcrowded";
- nothing is lost up to about 115 % of beds, and about an eighth of daily
  earnings is lost from day 5 at 125 %.

They were also shown the side effect through the existing needs-to-incidents
coupling. With 16 prisoners in 8 beds and 2 guards, riots went from 0 to 5 over
10 days; staffed to the requirement, they stayed at 0. They chose:

> Scal, bunty zostają (zalecane)

("Merge, the riots stay (recommended).") **This confirms the mechanism, the
numbers as built, and the incident side effect**, where the 2026-08-29 comment
alone could only be read as authorising the mechanism. The strings it ships are
wording under the 2026-09-04 release, and are quoted verbatim in that pull
request.

**29. A save carries a walk in progress, so that save, restore and continue is
the same game as continuing
([#1373](https://github.com/matmaxalez/lockstate/issues/1373)).** Measured on
`ceb6865e`, 41 of 41 saves taken while a prisoner was travelling restored to a
permanently different prison, and 0 of 24 saves without a traveller did. The
cause is `PrisonerOperationsRuntime.loadSnapshot` resetting every `travelling`
prisoner to `idle`, the trade-off ADR 0059 records and leaves as its open
question 3. They chose:

> Zapisuj marsz (zalecane)

("Save the walk (recommended).") **This answers ADR 0059's open question 3 with
its option 5**, and is recorded there by the change that implements it. It
authorises a save-format addition. The field is optional, so an older save
restores exactly as it does today. It does not decide whether
`SAVE_SCHEMA_VERSION` moves; ADR 0038's rule does. It is not a reservation
release: nothing under `supabase/migrations/` is involved.

**30. The Stage-7 art must be visually rich and modelled from multi-angle
concepts (2026-09-23).** After seeing the first furniture and fixture renders,
the owner supplied three Prison Architect screenshots and wrote:

> czekaj, trzeba ten wygląd poprawić, wygeneruj w gpt 2.5 wizualizacje pod różnymi kątami jak trzeba i na podstzwie tego w blenderze rób, bo to za brzydko wygląda to co robisz, to ma być ładne jak prison architekt

The owner then replied *"super jest"* to the new dining-table concept. This is
direct user wording, not a clickable-option label. It establishes a visual
quality correction and the concept-to-Blender workflow for this batch. The
available image-generation tool does not expose its backend model version, so
the committed concept provenance does not claim it used GPT 2.5. The reference
screenshots guide richness and readability; the assets remain original. This
feedback does not release any additional `ci.yml` glob, PR or merge beyond the
individually recorded releases above.

**31. Standing permission to append the art LFS globs needed as work proceeds
(2026-09-23).** For the new cell bed the owner was offered *"Tak — dopisz tylko
ten glob"* or *"Nie — zostaw model bez publikacji"* and chose:

> Tak — dopisz tylko ten glob

This releases exactly
`public/game-content/source-art/rendered.furniture.cell.bed.single.variants.*.png`
in the `browser` job's `git lfs pull --include=` list in `.github/workflows/ci.yml`.
Immediately afterwards, without a further multiple-choice prompt, the owner
wrote:

> daję ci odgórną zgodę żeby wszystko dopisywać na bieżąco, bez pytania

In the context of the immediately preceding LFS-glob request, this gives
standing permission to append the specific art globs needed by later Stage-7
batches to that same `browser` include list without another per-batch request.
The exact words are direct user wording, not an agent-written option; the
preceding clickable choice has the weaker provenance used for such choices
elsewhere in this file. The standing permission does not name another CI job,
another workflow edit, a pull request, a merge, or another owner reservation.


## Required workflow for every issue
Before coding:
- Read the issue, linked ADRs and relevant docs.
- Inspect existing implementation before proposing a new abstraction.
- State assumptions in the PR when requirements are underspecified.

Before completion:
- Run typecheck, tests and production build.
- Add or update tests for behavior introduced.
- Update docs/ADRs when a contract changes.
- Include performance evidence for performance-sensitive systems.
- Do not silently broaden scope.

## Prohibited behavior
- Do not replace approved technologies without an ADR and explicit human approval.
- Do not add a dependency for trivial functionality.
- Do not put secrets, service-role keys or production credentials in client code.
- Do not disable TypeScript strictness to make errors disappear.
- Do not mark an issue complete while acceptance criteria remain unverified.
- Do not copy Prison Architect code, assets, text, UI layouts or protected content. Research may inform mechanics, but Lockstate must have its own implementation and identity.
- Do not optimize for token use, API cost or shortest implementation when doing so reduces engineering quality.

## Definition of done
A change is done only when it is correct, typed, tested, documented where necessary, buildable, reviewable and consistent with the architecture.
