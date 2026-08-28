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
- **Three browser tests are the contention canaries, and the integrator who
  said otherwise was wrong.** `app-shell.spec.ts` *"every control can actually be
  pressed … (#88)"* (held-guard rows 2 and 3 never laid out), *"a pending delivery
  costs the Build panel nothing … (#285)"* (the refund misses a 20-second poll),
  and `ui-shell.spec.ts` *"the Rooms panel says what a zoned room is missing …
  (#331)"*. All three wait on the simulation to produce something, so they are the
  first to give up when the machine is busy.
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
