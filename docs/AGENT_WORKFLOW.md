# How agents work in this repository

`AGENTS.md` is the operating contract: *what* an agent may and may not do. This
document is the operating *method*: how work is picked up, split across several
agents, verified and handed on. Where the two disagree, `AGENTS.md` wins.

Everything below was paid for by a failure in this repository. Nothing here is
taste.

---

## 1. Continuous work, not one-shot sessions

Lockstate is worked on in long sessions that outlive any single turn. A
scheduled routine fires hourly into the working session and tells it to continue
in order. That routine is the reason a session does not need to be told again
what it was doing.

**What the routine asks for, in order:**

1. **Collect what has landed.** Read finished agents' reports, *verify their
   load-bearing claims* rather than accepting them, merge their work, update the
   task list.
2. **Do not interrupt agents still running.** Work on something disjoint, or end
   the turn with one sentence of state.
3. **If nothing is in flight, take the next item.** Task list first, then the
   standing continuation issue, then audit findings.
4. **Check the gates every time:** CI on `main`, CI on open pull requests, and
   whether the `STATUS-QUEUE` anchor is approaching its staleness budget. A red
   `main` or a merge conflict is work *now*, not "waiting on review".
5. **Do not merge and do not open a pull request without the owner asking.**
6. **If there is genuinely nothing to do, say so in one sentence and stop.** Do
   not invent work, and do not restate findings already recorded.

**A routine is not a licence to act unattended on anything irreversible.** It
resumes work already in scope. Deleting branches and anything touching a hosted
service remain the owner's call, exactly as `AGENTS.md` says.

**Amended 2026-08-27.** Merging is no longer on that list, and the sentence
above used to put it there. Under the owner's standing mandate (`AGENTS.md`,
"The owner's standing mandate") a green, ordinary increment may be merged
without asking — *and merging publishes to `lockstate.io`*, so what makes it
safe is the four exclusions that mandate keeps, not the merge being harmless.
Both directions are marked rather than overwritten, because the reason merging
was reserved has not gone away; only the permission has changed.

---

## 2. Working as several agents

Parallel agents work well here, and the failures have never come from the count.
They came from a shared tree and from shared ADR *numbers*.

**The rules that make it work:**

- **Every implementing agent gets its own git worktree as its first action.**
  Agents that share a checkout collide; agents in worktrees do not.
- **Serialise within a feature area, parallelise across unrelated ones.** Two
  agents in the persistence layer will conflict on more than files — they will
  conflict on the design. Two agents in `benchmarks/` and `.github/workflows/`
  will not.
- **Name each agent's surface, and the other agents' surfaces, explicitly in its
  brief.** An agent that does not know what is out of bounds will wander into it
  reasonably.
- **Investigating agents should be read-only on the repository** and write to
  their own scratchpad. Most decision work needs no repository write at all.
- **The scratchpad root is shared.** Give every agent its own subdirectory and
  tell it to scope its globs there or to the repository. A probe that globbed the
  scratchpad root once collected other agents' files and reported a file count
  that was not this repository's.
- **Assign ADR numbers centrally, after the drafts come back.** Two agents took
  `0034` within an hour, each having correctly enumerated the open pull requests
  first — the number is not reserved until it is in `docs/adr/README.md`. Have
  drafts carry a placeholder and pre-commit, in the ADR text, to being
  renumbered.
- **Never `git add -A`, and never leave a scratch file under `tests/`.** A stray
  probe has broken `pnpm verify` collection more than once.

---

### What the 2026-08-27 session cost, in mechanics

Eight agents ran in parallel that day. None of these is taste; each was paid for.

- **`pnpm <script>` does not work in a worktree** whose `node_modules` is a
  symlink outside the project root — pnpm's pre-run check aborts with
  `ERR_PNPM_UNSAFE_MODULES_DIR`. Four agents hit it independently. Call the
  binaries the scripts wrap:
  `node /workspace/lockstate/node_modules/typescript/bin/tsc -b --pretty false`,
  `node /workspace/lockstate/node_modules/vitest/vitest.mjs run <files>`.
  - **`git worktree add` does not create that symlink.** It creates no
    `node_modules` at all, and every import then fails to resolve in a way that
    looks like the branch is broken. Make it yourself, first thing:
    `ln -sfn /workspace/lockstate/node_modules <worktree>/node_modules`.
  - **Git LFS: check which of your trees has the bytes, and do not assume the
    direction. On 2026-09-04 it was the opposite of what this bullet said, in
    both trees.** One command settles it and it is the same command either way:
    `file public/assets/actors/actor.guard.base.idle.png`. `ASCII text` is a
    pointer; `PNG image data, 260 x 3104` is the art.
    - Measured that day, in a fresh `git worktree add` off `origin/main` and in
      `/workspace/lockstate` side by side: **the worktree had the art and the
      primary checkout had the pointers.** `git lfs ls-files` names 62 paths and
      **0** of them were pointers in the worktree. `node
      tooling/validate-runtime-atlas.mjs public/assets/actors` — which is what
      `verify:assets` runs — printed *"Validated 10 clip atlases"* and exited 0
      there, and exited 1 in the primary checkout with *"actor.staff.base.idle.png
      is a Git LFS pointer, not image data"* and a line like it for every atlas.
      `app-shell.spec.ts`'s art test therefore has its bytes in a worktree.
    - **A THIRD STATE, measured 2026-09-05: NEITHER tree has the art, and the
      `git lfs checkout` that fixes it is FREE.** `file` returns `ASCII text` in
      a fresh worktree **and** in `/workspace/lockstate`; `git lfs ls-files`
      names 62 paths and all 62 are pointers in both. So the two bullets above
      have now each been the truth of one container and the falsehood of
      another, which is the whole argument for running the `file` check instead
      of reading either of them.
      - **The remedy costs one second and no bandwidth**, which is the part
        neither the bullets nor the session-start hook say and the part that
        matters: `git lfs checkout` in the tree you are working in printed
        `Checking out LFS objects: 100% (62/62), 93 MB | 0 B/s, done.` in
        **1.07s**. `0 B/s` is not a rounding artefact — **the objects are
        already in `.git/lfs` (54 MB) and nothing is fetched.** Immediately
        after it, `node tooling/validate-runtime-atlas.mjs public/assets/actors`
        printed *"Validated 10 clip atlases"* and **exited 0**.
      - **The session-start hook says the opposite about the cost**, and it is
        the sentence to disbelieve: *"To get the real bytes: bash
        scripts/provision-git-lfs.sh && git lfs pull (metered bandwidth -- that
        is why this hook leaves it to you)."* `git lfs pull` would fetch;
        `git lfs checkout` materialises what is already local. **Neither the
        provisioning script nor the network is needed.** So `verify:assets` and
        `app-shell.spec.ts`'s art test are one second away in any tree, and the
        standing advice that they are an unfixable baseline in this container is
        withdrawn.
      - **The mechanism, which the bullet below quotes the keys of and not the
        values of — and that is exactly how it got the direction wrong.**
        `/etc/gitconfig` sets `smudge = git-lfs smudge --skip -- %f` and
        `process = git-lfs filter-process --skip`. **`--skip` means no checkout
        in this container smudges anything, `git worktree add` included.** Read
        the values, not the key names.
    - **Why, and why it is not a repository fact.** `filter.lfs.smudge`,
      `filter.lfs.process` and `filter.lfs.required` are set in
      **`/etc/gitconfig`** — system scope, put there when git-lfs was installed
      in the container image, and *not* by this repository. Its provisioning
      script says so in its own header:
      `DOES NOT TOUCH GIT FILTER CONFIGURATION.`
      (verbatim in `scripts/provision-git-lfs.sh`). So a checkout in this container runs
      the smudge filter, `git worktree add` included, and gets real bytes. The
      primary checkout's working tree was materialised without that and nothing
      has re-smudged it since — **and that half is false as of 2026-09-05: the
      filters carry `--skip`, so no checkout in this container smudges and the
      bytes come from `git lfs checkout` or not at all** — which is an
      observation about one container's filesystem, not a diagnosis, and §3's rule about state this repository
      cannot read back applies: `/etc/gitconfig` is not in git, so the next
      image can move this in either direction. **That is exactly why the durable
      advice is the `file` check and not a direction.**
    - **This bullet said the reverse — *"`git worktree add` does not run the Git
      LFS smudge filter either … A worktree gets LFS pointer files where the main
      checkout has images"*, with `git lfs checkout` as the fix to run first
      thing — and it is kept because the integrator repeated it in brief after
      brief on 2026-09-04 and it cost agents work.** It was measured on
      2026-08-27, when it was presumably true of that container. It is not an
      error of reasoning; it is a bare direction outliving the environment that
      produced it, which is what §4 is about. Running `git lfs checkout` in a
      worktree is still harmless and still the fix when the `file` check says
      pointer.
    - **The session-start hook does not cover you**, in either direction. It
      reports *"Git LFS content looks present"* about the checkout it looked at
      and says nothing about any other tree — on 2026-09-04 that sentence was
      false of the very checkout it ran in.
    - **Why it is worse than the symlink trap, which fails loudly:** a browser
      run in a worktree loses *every actor sprite* — ten atlases fail with
      `Failed to process file: image "…"` and
      `InvalidStateError: The source image could not be decoded` — **and
      passes anyway**, because the simulation lives in the worker and does not
      care whether anything was drawn. Measured on 2026-08-30 by a playtest
      that ran green with no actors on screen
      (`docs/research/2026-08-30-does-a-prison-survive-being-reopened.md`).
      Anything you conclude about rendering from a worktree run is worthless
      and will not tell you so.
  - The same pre-run check used to break the **browser** suite from a worktree,
    invisibly. `tests/browser/playwright.config.ts` started its web server with
    `pnpm exec vite`; pnpm shelled out to `pnpm install`; the install refused;
    and Playwright reported exactly one line — `Process from config.webServer
    was not able to start. Exit code: 1` — with every spec failing under it,
    which reads like a broken harness. Fixed on 2026-08-28: that config now
    resolves Vite's bin from its own `package.json` and runs it on the current
    `process.execPath`, so no package manager is in the path. If you are on a
    branch cut before that change, `pnpm --config.verify-deps-before-run=false
    exec vite …` is the escape hatch.
- **`vitest.config.ts` sets `environment: 'node'` and there is no jsdom.** Code
  that touches `document` is therefore unreachable from `pnpm test` *at all* —
  not merely untested. A mutation there survives because nothing could observe
  it. The answer is to extract the decision into a pure function, not to report
  a survivor: that is how `orderPrisonsForDisplay` came to exist.
- **The browser suite needs Git LFS content.** `public/assets/**` may be pointer
  text in a fresh container, and then `pnpm test:browser` fails at atlas decode
  by design. `bash scripts/provision-git-lfs.sh && git lfs pull` makes it
  runnable, and an agent that must verify a browser change should do that rather
  than push a guess. Running `git lfs pull` inside a worktree fetches the blobs
  there, verified on 2026-08-28. The sentence this bullet used to carry, *"A
  worktree does not carry the blobs **on checkout**"*, was measured false on
  2026-09-04 — see the LFS bullet under the 2026-08-27 mechanics above, and run
  the `file` check rather than either version of this claim. The advice this bullet used to give, "work in the main checkout
  when the browser suite is the thing being verified", was therefore stronger
  than the facts required, and it is withdrawn: verify on the branch you are
  actually changing.
- **`pnpm test` does not run the browser suite, and "the full suite is green"
  is the sentence that let a regression through.** `./node_modules/.bin/vitest
  run` collects `tests/unit`, `tests/integration`, `tests/foundation`,
  `tests/determinism` and `tests/migrations` — **not** `tests/browser`, which is
  Playwright and runs from `pnpm test:browser`. On 2026-09-02 an agent fixed
  the Buy button to disable itself when a press would be refused (#772),
  reported *"378/378 files, 4365 passed"* — which was **true** — and CI's
  `browser` job then failed 3 of 318: three `app-shell.spec.ts` tests
  deliberately set an unaffordable quantity and press Buy to exercise the
  host-refusal plumbing (#89, #261, #220), and a disabled button cannot be
  pressed. The integrator compounded it by verifying the *change* (the new
  spec, both typecheck projects, the pinned citations, and a mutation of the
  freshness thread) and never running `app-shell.spec.ts`. **Verifying a change
  and verifying the suite are different acts.** If you touch anything a browser
  spec presses — a control's enabled state, a class name, a label, a layout
  bound — name the specs that press it and run those whole files, and never
  extrapolate from three greens to a green suite.
- **A browser spec must import `test` from `./network-changed-fixture`, and
  breaking that rule goes red where you are not looking.**
  `tests/foundation/browser-network-changed-retry-contract.test.ts` forbids
  `'@playwright/test'` in every `tests/browser/*.spec.ts`: the `test` object
  obtained that way carries no listeners, so a run aborted by
  `net::ERR_NETWORK_CHANGED` records no evidence and the suite runner cannot
  tell it from an ordinary failure — the failure would be red for the wrong
  reason, or block a retry every other failing test qualified for. The trap is
  the direction: that contract is a **`vitest`** test, so a spec with the wrong
  import **passes the browser runner** and fails `pnpm test`. Two agents wrote
  the direct import on 2026-09-02; one caught it before pushing because it ran
  `tests/foundation`, which is the cheap habit that catches it.
- **The Playwright configs live in `tests/browser/`, not the repository root.**
  `playwright.config.ts`, `playwright.playtest.config.ts` and
  `playwright.artifact.config.ts` are all under `tests/browser/`, so a bare
  `playwright test <file>` finds no config, gets no `baseURL`, and every
  `page.goto('/index.html')` fails with *"Cannot navigate to invalid URL"* —
  which reads exactly like a broken app rather than a wrong invocation. Run the
  suite the way the repository does: `node --experimental-transform-types
  --disable-warning=ExperimentalWarning tests/browser/run-suite.ts --suite
  browser --grep "<pattern>"`. Note also that `playwright.config.ts` matches
  only `/.*\.spec\.ts$/`, so the `.playtest.ts` instruments under
  `playwright.playtest.config.ts` **are never collected by CI** — a playtest is
  evidence, never a gate.
- **`--reporter=line` is dead in this repository's `vitest` (4.1.11).** It fails
  inside `loadCustomReporterModule` with `ERR_LOAD_URL` before a single test
  runs, and the stack is a wall of Vite module-runner frames that reads exactly
  like a broken test file or a broken install. Omit the flag; the default
  reporter is fine. Recorded because the failure mode is expensive to diagnose
  and cheap to avoid.
- **Two tests sit close enough to their 5s budget that box load pushes them
  over, and neither is a flake to wave through.**
  `tests/foundation/comment-symbol-existence-contract.test.ts` (a
  repository-wide comment scan) and `tests/unit/prisoners-sentence.test.ts`
  (a bisection over an RNG stream) were measured at 5.2s and 6.8s against a 5s
  `testTimeout` while three other agents ran full suites. Both report
  `Error: Test timed out in 5000ms` — **not an assertion** — and both pass run
  alone. If you see them red, run them alone before concluding anything, and
  report what you saw rather than the word "flake": a label is not a diagnosis.
  What is genuinely worth fixing here is the margin, not the runs.
- **Three browser tests are the contention canaries, and the integrator who
  said otherwise was wrong.** `app-shell.spec.ts` *"every control can actually be
  pressed … (#88)"* (held-guard rows 2 and 3 never laid out), *"a pending delivery
  costs the Build panel nothing … (#285)"* (the refund misses a 20-second poll),
  and `ui-shell.spec.ts` *"the Rooms panel says what a zoned room is missing …
  (#331)"*. All three wait on the simulation to produce something, so they are the
  first to give up when the machine is busy.
  The second of those was renamed on 2026-08-31 by issue #703 ruling 2 and is now
  *"a pending delivery is on the panel with the fold shut, and costs it nothing
  while none is … (#285, #703)"* — same test, same poll, same canary; the old
  title is kept here because it is what earlier logs say.
  **That day added a number to the first of them, and the number is the point:
  the #88 sweep passes at 2.9m against the 3.0m `test.slow()` gives it**, on this
  container with other agents' suites running — so it does not fail on a
  *finding*, it fails for being slow, and it did so four times that afternoon at
  load averages between 5.6 and 10.7, timing out in four different places (a
  staff-roster click, a wheel poll, a canvas poll, a page load). A red there is
  worth reading for *where* it stopped before it is worth reading as a defect.
  Its delivery setup also had a real race of its own — it pressed Play before
  buying, so the three `Buy` presses and the poll for `data-pending="9"` sat
  inside the 5s a delivery takes to land, and on a loaded machine they do not fit:
  the poll read `null`, which is every delivery having landed rather than none
  having been bought. ADR 0051's paused drain removed the need for that press and
  the setup no longer runs the clock at all until it has finished measuring.
  **This bullet said the opposite for one merge**, on 2026-08-28: that the three
  were "a property of where the suite runs and not of the diff", confirmed by
  running each *alone* on plain `main`. Both halves are withdrawn. On a genuinely
  idle machine all three pass on `main` — measured, `3 passed (3.4m)` — and the
  whole suite passed 220/220 on a branch that changes the renderer. The
  "alone" runs were not alone: an agent was running browser suites throughout,
  for nearly two hours, and `ps` was checked without the checker drawing the
  conclusion.
  Two agents had reported these as contention and were overruled. They were
  right, and the bullet below about not running a suite alongside another
  agent's already said so. **The failure mode this records is therefore not a
  flaky test, it is an integrator promoting "I could not find the cause" into
  "there is no cause in the diff"** — which is the same move `docs/AGENT_WORKFLOW.md`
  §3 calls out under "a measurement is not a diagnosis", committed by the person
  who wrote that rule.
  So: a local browser failure is **yours until the machine is idle and it still
  fails**. `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"` returning
  nothing is the precondition for any such claim, and re-running one test while
  another suite runs proves nothing at all. Let the PR's own `browser` job be the
  gate.
  **Do not wrap that check in `until ! ps … | grep -q "[p]laywright/test/cli"; do
  sleep …; done`.** It deadlocks: the waiting shell's own command line contains
  the pattern, so the loop matches itself and waits for ever. Two agents sat
  spinning on an already-idle machine on 2026-08-28 before one of them worked out
  why. Append `| grep -v "bash -c"`, or just run the check by hand between runs —
  the point is a decision, not a wait.
  **Added 2026-09-04: two more belong on this list, and a third red in the same
  file emphatically does not — it fails on an idle machine.** So the opening
  sentence's tally is stale and is left rather than renumbered, per §4: the
  count was never the finding, and *"three"* is the form §4 says rots first.
  All of the below measured in this container on a worktree at `194f31f5`
  (v0.0.468) with no `src/` change in it, so the application under test is
  `origin/main`.
  - **Two more contention canaries.** `app-shell.spec.ts` *"zones a room and
    admits a prisoner with the keyboard alone (#411)"* and *"takes a room back
    with the keyboard alone, through the same confirm control (#411)"*. Both
    take `test.slow()`'s 180 s and both exceeded it, and both died inside the
    shared `walkFocus` helper — one at its `page.keyboard.press`, one at the
    `page.evaluate` that reads `document.activeElement` — which is **a walk
    that ran out of budget mid-hop, not an assertion about focus landing
    somewhere wrong.** Read *where* it stopped before reading it as a defect,
    exactly as with the #88 sweep above. Nothing is hung and nothing is broken:
    run with `--timeout 0`, the first of them **passes in 6.7 m** at load
    average 9.6–10.4, with another agent's full browser suite and a `vitest`
    run alongside it. What was not obtained is an idle run of these two, so
    they are recorded here as failing under load and the precondition in the
    paragraph above still applies to them.
  - **`app-shell.spec.ts` *"no room type in the catalogue pushes the Rooms panel
    past its fold (#529)"* was NOT contention, and it is no longer on this list
    as a canary at all — the measurement below is kept because it is what
    justifies the budget it now has.** It carried no `test.slow()`, so it got
    `playwright.config.ts`'s bare `timeout: 60_000`, and it did not fit inside
    it on this box at any load. **The same commit that measured that gave it
    `test.slow()`**, which is where the entry stops being a canary and becomes
    a budget: a test given 60 s that needs 108 s is a test that *cannot* pass,
    and writing it down here instead of raising the budget would have been
    documenting a defect rather than fixing one. `test.slow()` skips, disables
    and quarantines nothing — the test still runs, still sweeps 18 rooms across
    5 viewports, and a failure is still a failure; three of its siblings in this
    same file already carry it and this was the odd one out. Measured on a genuinely idle machine — `ps`
    clear of `[p]laywright/test/cli` and `[v]itest`, load average **1.55**:
    `Test timeout of 60000ms exceeded` on `locator.click` at
    `tests/browser/app-shell.spec.ts:5247`, the call log showing the row
    *resolved*, *"visible, enabled and stable"* and *"done scrolling"* before
    the budget ran out — so not a locator that stopped matching. **Same tree,
    same idle box, `--timeout 180000`: `1 passed (1.9m)`, the test itself
    1.8 m.** It needs roughly 108 s and is given 60, and no amount of idleness
    will change that. Its own comment already carries the history:
    `The first shape of this test did it the other way round and timed out at
    sixty seconds.`
    (verbatim in
    `tests/browser/app-shell.spec.ts`)
    — and the sweep is 18 rooms × 5 viewports, so the second shape bought a 5×
    saving on clicks and still does not fit. **That attribution is deliberately
    wrapped**, after `verbatim in`, because until 2026-09-04
    `tests/foundation/adr-quotation-verbatim-contract.test.ts` could not match a
    wrapped one and then silently checked nothing; the corpus now contains the
    case, so the fix cannot regress unnoticed.
    **Why `main` is not red on it:** the CI runner is much faster than this
    container. `main`'s `browser` job at `198fc120` on 2026-09-04 was green
    with *"Run the real-browser suite"* taking **14m07s for the whole suite**,
    which is roughly what two of these tests cost here. So it is a property of
    where it runs, like the others, and that is why it is listed — but the
    entry to carry forward is *"too slow for its own budget on this
    container"*, which is a different fact from contention and asks for a
    different fix. That fix is a decision about `test.slow()` on the spec and
    it is deliberately not taken here: recording a measurement and changing a
    test's budget are separate acts, and the second belongs to whoever owns the
    spec.
  - `tests/unit/prisoners-sentence.test.ts` was checked against this list and
    **is already on it** — see the bullet above about the two tests sitting
    close to their 5 s budget. Re-measured alone on 2026-09-04 at load average
    3.49: `7 passed`, `Duration 2.60s`. Nothing to add.
- **A local browser run in the worktree you are editing is not a baseline.** Vite
  serves `src/**` live, so a run started before your edits reads them off disk as
  they land, and a "before" measurement taken that way is a measurement of the
  "after" tree. An agent caught its own baseline doing this and re-took it in a
  second worktree checked out at the unmodified commit. That is the only way to
  get one.
- **Do not run a suite while another agent is running one.** Timing-sensitive
  tests flake under contention and this repository has measured it: identical
  clean trees gave 9, 5 and 5 failures, every one a `Test timed out in 5000ms`.
  A cheap grep now beats a contended measurement.
- **A `beforeEach` that times out loading the page is arithmetic, not a
  judgement call.** On 2026-08-29 a `main` run failed
  `ui-shell.spec.ts` at `page.waitForFunction(() => 'lockstateUiHarness' in window)`
  after 60 s -- `1 failed, 245 passed`. The merged change had edited
  `tests/browser/ui-harness.ts`, so "the harness is broken" was the obvious
  reading and it was wrong: **if that module threw at load, the global would
  never appear and all 246 tests in the file would fail, not one.** The count
  settles it without a re-run and without an argument. Apply the same shape to
  any failure in shared setup: ask what the blast radius of the suspected cause
  would be, and compare it to the blast radius you actually see.
- **Merge one pull request at a time, and let its `main` CI run finish before
  merging the next.** Two merges two minutes apart start two `main` runs, which
  execute **two full browser suites simultaneously** across the two self-hosted
  runners; the second suite's page boot then exceeds the 60 s test timeout. That
  is what produced the false red above. Nothing enforces this -- it is a habit,
  and four minutes of waiting is much cheaper than a root-cause pass on a red
  `main`, which also stops publication (`deploy.yml` fires on CI completion).
- **Never edit a source file while a Playwright run is live.** Vite serves
  `src/**` with HMR, so the edit is pushed into the running page: a keyboard
  walk loses focus mid-test and the run dies somewhere unrelated to both the old
  code and the new. This is the *active* form of the baseline rule two bullets
  up -- that one is about reading your edits, this one is about the browser
  reacting to them. A ten-minute run was lost to it on 2026-08-29 and the
  failure was briefly mistaken for a real one.
- **A change that breaks fixtures breaks them wherever they live.** ADR 0045's
  refusal turned about 104 tests red in 16 files; the agent fixed those and
  missed `tests/browser/app-shell.spec.ts`, because it could not run the browser
  suite. Ask what *else* asserts the behaviour you just changed, and name the
  suites you did not run.
- **There is no such thing as an unnumbered ADR draft here.** An integrator on
  2026-08-28 told three agents to draft with a placeholder id `ADR-XXXX` and to
  leave `docs/adr/README.md` alone. That is impossible, and an agent proved it
  rather than complying: `tests/foundation/adr-numbering-contract.test.ts`
  requires the filename to be `NNNN-kebab-case.md`, requires a matching row in
  `docs/adr/README.md` — its own failure message reads *"Adding an ADR means
  adding its row in the same commit, and the index says so itself"* — and
  requires the index's **Next free number** line to name a number no file has
  taken. A placeholder fails the first check; a numbered file with no row fails
  the other two.
  `AGENTS.md`'s rule was right all along and says how this works: *"A number is
  not reserved until it appears in `docs/adr/README.md`."* Adding the row **is**
  the reservation. So an ADR arrives numbered, indexed and with the next-free
  line moved, all in one commit — and, because a branch nobody has merged is
  invisible from the index, it also carries the sentence ADR 0048 and 0049 both
  carry: the number is provisional, and if it collides, the file, its row and
  every citation of it get renumbered.
  **What "assigned centrally" then means in a parallel session is that the
  integrator hands out the numbers before the drafts exist**, one per agent, at
  the moment it becomes plausible that an agent will need one. Two agents that
  each read "next free" off `main` will both write 0050.

### What the 2026-09-02 session cost, in mechanics

Three more, all paid for on the same day, all of them the same shape: a check
that answers confidently and wrongly.

- **A pull request whose head conflicts with its base gets NO `pull_request`
  workflow run at all.** GitHub builds no merge ref for a conflicted head, so
  the workflows that trigger on `pull_request` never fire — only the checks
  that come from elsewhere (`claude`, `supabase`) appear on the commit. **It
  reads as "CI has not started yet" and it means "this pull request has a
  conflict."** Waiting is the wrong response and can be waited on forever. The
  test is one request: read `mergeable_state`, and if it is `dirty`, merge the
  base branch in and push — the run starts on the merge commit. Two pull
  requests sat in that state before the mechanism was diagnosed.

- **`origin/main` inside a worktree can be stale, and a merge against it looks
  like a success.** Worktrees share the repository's refs, but nothing fetches
  for you: `git merge origin/main` in a worktree whose last fetch predates a
  merge silently merges the *older* `main`, prints a normal diffstat, and exits
  0. The conflict you expected does not appear, which is the misleading part —
  absence of conflict reads as "already up to date". Caught only by checking
  that a file the newer `main` was supposed to bring (`docs/adr/0092-*.md`)
  was actually in the tree; it was not. **`git fetch origin main` immediately
  before any merge in a worktree**, and where a specific merge is expected in
  the base, assert one of its files exists rather than trusting the exit code.

- **A player-facing string can be absent from the locale file and still
  present in the game.** `src/content/default-locale-en.ts` merges
  `simulationEnumMessages()` — grep for `const derivedMessages =` rather than
  for a line number, for the reason the paragraph below records — which computes
  labels from the census
  in `src/content/simulation-message-keys.ts` — so `grep` over the locale file
  finds nothing for `risk-tier` while tier 2 renders as the literal text
  `Medium`. A whole claim was built on that absence, put to the owner as a
  question, and was wrong: the tier has a name and a screen reader reads it.
  **For any "this string does not exist" claim, grep the census file too, and
  confirm at the render site** — here `regime-panel.ts:650` passes
  `t(readout.badgeKey)` and `status-badge.ts:64` assigns it to `textContent`.
  A derived string is invisible to the search that would disprove the claim,
  which makes this the worst case of §4's rule about sentences asserting an
  absence.

  **This bullet cited that merge as `:1808`, and the coordinate was false
  within the day — so the bullet became an instance of §4's own rule about a
  `file:line` into a live file.** It was correct when written (`f00c7d15`,
  where `const derivedMessages = simulationEnumMessages();` genuinely sat at
  line 1808) and became false at `f19b9ef2`, *"fix(hud): the Remove hint says
  what cancelling actually gives back (#835)"*, which added fourteen lines of
  locale above it and moved the merge to `:1822`. Nothing about the claim
  changed; only the coordinate did. It is corrected to a **symbol** rather than
  to `:1822`, because a second number rots on the next string anybody adds, and
  the correction is kept beside the claim rather than overwriting it because
  the *interval* — one day, one unrelated commit — is the finding. The cost was
  paid: an agent brief built on `:1808` sent its reader to a comment about
  keyboard shortcuts, which is as misleading as the absence this bullet warns
  about. The two render-site citations in the same bullet were re-opened at
  `98e05058` and both still hold.

- **An agent that arms a monitor, a background command or a sleep-poll and
  then stops calling tools has ended its turn, and nothing will wake it.**
  Three agents did this on 2026-09-02 across four turns — one twice — each
  time with a browser run in flight and each time reporting *"waiting for the
  monitor to report before finishing"*. The monitor fired into a turn that no
  longer existed. Two of the three had been told in their brief not to do it.
  The mechanism is not subtle and is worth stating flatly: **a subagent's turn
  ends with its last tool call; a background task completing does not start a
  new one.** So a long-running command an agent needs the result of goes in
  the **foreground**, in a single call with a high `timeout` (up to 600000 ms
  is allowed), and is read in the same turn. A run that would exceed that is
  narrowed with `--grep` rather than split across turns. Background tasks are
  for the *coordinator*, whose session is woken by their completion; they are
  a trap for the agents it dispatches. The cost of the four turns was not the
  tokens — it was that each agent had to be resumed by hand, with the
  instruction re-stated, before any work it had done became visible.

### Nothing may exist only in the container

**Added 2026-08-29, after the owner named the failure mode this prevents.**

A session runs in an ephemeral container. It can be cut off by a usage limit
**with no warning** -- no signal, no wind-down, the turn simply stops -- and
everything not pushed dies with it. The owner may not look for hours, so the
loss is discovered long after it is recoverable.

That makes the count of parallel agents a *risk* multiplier and not only a
throughput one: three agents that each hold two hours of unpushed work are
three times the exposure. The right response is not fewer agents. It is that
**no work may exist only in the container**.

Three rules, in the order they matter:

1. **Every agent commits and pushes after its first coherent chunk**, not at
   the end. An unfinished pushed branch is recoverable by anyone; a finished
   unpushed one is not. Put the *reasoning* in the commit message too, not only
   in the final report -- if the report never arrives, the commit message is
   what survives. Say plainly in the message when a commit is a work-in-progress
   checkpoint and what is still missing.
2. **Agents report incrementally.** A finding the coordinator has is worth more
   than a better-organised finding it never receives.
3. **The coordinator does not rely on either of the above.** On 2026-08-29 an
   agent committed and stopped without pushing; its work survived only because
   the coordinator noticed and pushed it by hand. Compliance is not a mechanism.

`scripts/wip-sweep.sh` is the mechanism. Run it in the background for the life
of a session. Every three minutes it pushes each agent worktree's committed
work to its own branch, and snapshots **uncommitted** work to `wip/<branch>`.

Two properties are what make it safe to run beside live agents, and both are
deliberate:

- It uses `git stash create`, which writes a commit object and touches
  **neither the index nor the working tree**. It therefore cannot race an
  agent's own `git add` or `git commit`. Verified against a live agent: the
  snapshot reached the remote while the agent's twelve modified files stayed
  exactly as they were.
- Uncommitted work goes to a **separate `wip/` ref**, never to the agent's own
  branch, so a sweep can never land on a branch an agent is about to push to
  itself or turn a clean push into a conflict.

The effect is a bounded loss window -- three minutes -- that does not depend on
how many agents are running or on any of them behaving correctly. `wip/` refs
are scratch: delete them once the branch they shadow has merged.

### Handovers between parallel agents

An agent that finds a defect outside its own surface cannot fix it, and the
agent that owns that surface has already finished by the time the report lands.
**The integrator owns the gap.** Three corrections fell through it in one
session — a stale `docs/TESTING.md` paragraph, an ADR sentence, a comment
carrying two tallies — and each was found by an agent forbidden to touch the
file it lived in. Collect every "handing this over" line from every report and
close them before the branch is called done.

## 3. The method every agent is held to

- **A green suite is not a guarded suite.** A test proves nothing until the
  production code has been mutated and that test watched going red. Run the new
  test against the unfixed code first; keep both outputs; report both.
- **Never write a fixture that supplies both sides of a comparison.** An expected
  value computed by the code under test holds for any implementation.
  `docs/TESTING.md` lists the forms this takes here.
- **A measurement is not a diagnosis, and neither is a cause an impact.** This
  is the sibling of the rule below and it caught a model that was obeying that
  one. On 2026-08-27 an agent compared the response headers of `lockstate.io`
  and the `workers.dev` host, found five missing on the domain, ruled out
  caching properly, dated the commit that introduced them — every step
  measured, every number real — and then wrote into `docs/DEPLOYMENT.md` that
  this was a **defect** and that ADR 0021's security posture was "not in force
  on the host players visit". Both were invented. The owner had switched that
  domain's deploy off deliberately, and nobody plays the game yet. One sentence
  from them demolished a paragraph that had looked rigorous because the
  *evidence* was rigorous.
  So: state the observation, then say separately what would establish the cause
  and what would establish the impact. **"I measured X; I do not know why, and
  I do not know what it costs" is a complete and useful report.** Words like
  *defect*, *incident*, *regression*, *users affected* are claims about cause
  and impact, and each needs its own evidence.
- **Ask about state this repository cannot read.** Cloudflare and Supabase
  dashboard settings, whether a custom domain is attached and to what, whether
  a deploy is switched off, who is actually using the thing — none of it is in
  git and no amount of measurement will produce it. `docs/DEPLOYMENT.md` already
  says the domain binding "is therefore **not reproducible from this
  repository**"; treat that sentence as a general rule, not a footnote about one
  binding. When a finding depends on unreadable state, the finding is a
  question.
- **A correction is cheap while it is still yours.** The paragraph above was
  wrong for eleven minutes because it was rewritten as soon as the owner said
  so, and the commit that removed it says what it had claimed. Marking both
  directions (§4) applies to your own mistakes first.
- **Never report a result you did not obtain.** Run it, paste it. Open every
  `file:line` you cite. This project has paid hours for confident false findings,
  including audit reports citing line numbers for code nobody opened.
- **Where a document and the code disagree, the code is right and the document
  rotted** — and establish *when* it became false (`git log -S`,
  `git merge-base --is-ancestor`), not merely that it is. A claim can be false
  the day it is written.
- **Do not lower a pinned floor, weaken an assertion, raise a timeout to hide a
  race, or skip a test.** Extending a pinned list is fine; that is what adding a
  system looks like here.
- **Propose an ADR rather than deciding architecture inside implementation code,
  and never self-approve one** outside a recorded delegation from the owner.
- **Correcting the brief you were given is welcome and expected.** An agent
  reporting "already fixed, here are the numbers" is doing the job. If an
  assignment turns out to be done, wrong or overtaken, say so with numbers and
  stop rather than inventing work around it.
- **Fix the class, not the instance**, and report the sweep even where only one
  instance is fixed.
- **Look one module over before designing.** More than once the correct fix was
  already written elsewhere in this repository and simply not applied.
- **Name your weakest claim and say what would change your mind.**
  `docs/research/README.md` requires it, and it is why that directory is
  trustworthy.

---

## 4. Writing sentences that do not rot

This repository's most common defect is a document disagreeing with the code, so
a document about method should say how to write one that lasts.

- **A sentence asserting an absence or a count rots first** — "every", "none",
  "the only", "no X does Y", "there are seven". Adding the thing it denies never
  touches the sentence denying it. Prefer a sentence that states a subject over
  one that states a tally.
- **A correction is no more durable than the claim it corrected.** One paragraph
  in `docs/adr/README.md` was corrected and then broke again in the opposite
  direction one commit later. Mark both directions rather than overwriting.
- **A `file:line` into a document under active edit is the least durable
  citation here; a quoted sentence is the most.** Repeated passes over
  `STATUS-QUEUE.md` have found that nearly every correction needed was a line
  number pointing at a sentence that had not changed. Cite code by `file:line`,
  because grep checks it; cite prose by quoting it.
- **A delta pass is blind to a claim that was already false when its window
  opened**, and to a document contradicting itself. Reading a file's own
  headings against each other is a different check from any diff, it takes a
  minute, and it has caught what diffs could not.

---

## 5. Reporting

Deliver **a set of proposals the owner can say yes or no to**, not a count of
closed tickets. Each proposal carries: the decision in one sentence; what the
code does today, with `file:line`; the options with their real costs; the
recommendation and why; and what would change your mind.

Where a fix needs no decision, make it — with red-then-green evidence — and keep
it separate from the proposals.

State what you did **not** reach. A partial pass reported honestly is worth more
than a complete-sounding one, and an empty category backed by the numbers that
establish it is a real result.
