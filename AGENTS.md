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
