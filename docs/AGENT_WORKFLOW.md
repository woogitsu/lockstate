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
  - **`git worktree add` does not run the Git LFS smudge filter either, and
    this one does not announce itself.** A worktree gets LFS *pointer files*
    where the main checkout has images:
    `file public/assets/actors/actor.guard.base.idle.png` returns `ASCII text`
    in a worktree and `PNG image data, 260 x 3104` in `/workspace/lockstate`.
    Fix it first thing, beside the symlink: **`git lfs checkout`** in the
    worktree (62 objects, 93 MB).
    - **The session-start hook does not cover you.** It reports *"Git LFS
      content looks present"*, which is true of the checkout it looked at and
      false of every worktree made from it.
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
- **The browser suite needs Git LFS content.** `public/assets/**` is pointer
  text in a fresh container, so `pnpm test:browser` fails at atlas decode by
  design. `bash scripts/provision-git-lfs.sh && git lfs pull` makes it runnable,
  and an agent that must verify a browser change should do that rather than
  push a guess. A worktree does not carry the blobs **on checkout** — but
  running `git lfs pull` inside the worktree fetches them there, verified on
  2026-08-28. The advice this bullet used to give, "work in the main checkout
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
