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
- **The process table is shared too, and until now nothing here said so.**
  Every agent gets its own worktree and its own scratchpad subdirectory; it
  has never had its own port, and nothing above said the process table was
  anyone's alone to clear. Measured 2026-09-06: a pass clearing a Playwright
  port collision ran `pkill -f "bin/vite.js"` and killed dev servers on ports
  **5353** and **5354** belonging to two other agents, not the one it meant to
  free. One of those two recorded seven `net::ERR_CONNECTION_REFUSED` failures
  it could not explain at the time; a re-run passed. **Kill only PIDs you
  started, and when a port is busy pick another rather than clearing the
  machine.** The only reason this one was diagnosable at all is that the agent
  it hit reported the failures instead of writing them off as flaky.
- **Assign ADR numbers centrally, after the drafts come back.** Two agents took
  `0034` within an hour, each having correctly enumerated the open pull requests
  first — the number is not reserved until it is in `docs/adr/README.md`. Have
  drafts carry a placeholder and pre-commit, in the ADR text, to being
  renumbered.
- **Never `git add -A`, and never leave a scratch file under `tests/`.** A stray
  probe has broken `pnpm verify` collection more than once.
- **`scripts/wip-sweep.sh` pushes COMMITTED work to the real branch, not to
  `wip/` — so you cannot hold a commit back, and the session-start hook's
  one-line description of it is misleading.** That hook says *"agent worktrees
  snapshot to `wip/` every 3 min"*. The script's own header says what it
  actually does: *"Committed work is pushed to the real branch; uncommitted
  work goes to `wip/` so it never lands on a branch an agent is about to push
  to itself."* Its gate is `[ -n "$upstream" ] && git push -q origin "$b"`, and
  the only skip is a clean tree whose branch already equals its tracking ref.

  Measured 2026-09-07, at a cost of one CI cycle. The integrator merged `main`
  into an open pull request's branch **in a worktree and deliberately did not
  push**: the base delta was documentation-only, and the `browser` job then
  thirteen minutes into its run was the one job that would prove a new
  `ci.yml` include-filter entry actually fetched its file instead of an LFS
  pointer. Three minutes later the sweep pushed the merge commit, GitHub
  cancelled the run, and CI restarted from zero — on a **single self-hosted
  runner where jobs serialise**, which is what makes a cancelled thirteen-minute
  job expensive rather than merely untidy.

  **The sweep was right and the intent behind it is worth more than the run it
  cost.** The same session watched it pay off: a re-anchor pass was killed
  mid-flight by a container restart, and its branch survived complete because
  it had been pushed. That is the guarantee this script exists to provide and
  it does not depend on anyone complying.

  So the rule is about *where you work*, not about the sweep: **if you need a
  commit to stay local, work on a detached HEAD** — the sweep reads
  `git branch --show-current`, which is empty for a detached head, and
  `continue`s — **or delete the worktree before the next three-minute tick.**
  And the cheaper habit, given CI is the scarce serialised resource here:
  **merge the base branch in and push once BEFORE opening the pull request**,
  rather than opening it and merging the base in afterwards.

---

### What the 2026-08-27 session cost, in mechanics

Eight agents ran in parallel that day. None of these is taste; each was paid for.

- **`pnpm <script>` does not work in a worktree** whose `node_modules` is a
  symlink outside the project root — pnpm's pre-run check aborts with
  `ERR_PNPM_UNSAFE_MODULES_DIR`. Four agents hit it independently.
  - **Run the script anyway, with the pre-run check switched off:**
    `pnpm --config.verify-deps-before-run=false <script>`. Added 2026-09-07,
    after a fifth and sixth agent hit the same wall. What aborts is
    `runDepsStatusCheck`, not the script — so disabling that one check runs the
    **real `package.json` script**, and the stack trace in the failure names
    that function if you want to confirm it rather than take this on faith.
    Measured in a fresh worktree on `typecheck`, `verify:benchmark` and
    `verify:deployment`, all exit 0.
  - **The advice this bullet used to give — call the binaries the scripts wrap,
    `node …/typescript/bin/tsc -b --pretty false` and
    `node …/vitest/vitest.mjs run <files>` — still works and is kept as a
    fallback, but it is no longer the first thing to reach for**, because it
    quietly invites the failure §3 and this section spend most of their length
    warning about. A hand-assembled command line is a **hand-picked subset**:
    it is how an agent ends up reporting a green measurement of something that
    is not the gate. `pnpm verify` already omits `verify:benchmark`; `pnpm test`
    already omits the browser suite; a binary invocation you typed yourself
    omits whatever you forgot. Run the named script, and prefer it exactly
    because you did not choose its contents.
  - **`git worktree add` does not create that symlink.** It creates no
    `node_modules` at all, and every import then fails to resolve in a way that
    looks like the branch is broken. Make it yourself, first thing:
    `ln -sfn /workspace/lockstate/node_modules <worktree>/node_modules`.
  - **Git LFS: check which of your trees has the bytes, and do not assume the
    direction. On 2026-09-04 it was the opposite of what this bullet said, in
    both trees.** One command settles it and it is the same command either way:
    `file public/assets/actors/actor.guard.base.idle.png`. `ASCII text` is a
    pointer; `PNG image data, 260 x 3104` is the art.
    **"One command settles it" is the half of that sentence a fourth container
    falsified on 2026-09-05, and the sentence is kept because everything else
    in it holds.** `file` still tells you whether the tree you are in has the
    bytes; it cannot tell you *why not*, so it cannot tell you what the remedy
    costs. Two of the states below both read `ASCII text` and their remedies
    are a free local checkout and a 93 MB metered fetch. `git lfs version` and
    `du -sh .git/lfs` are what separate them and they cost nothing.
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
    - **A FOURTH STATE, measured 2026-09-05 in a different container on the
      same day: git-lfs IS NOT INSTALLED, there is no `.git/lfs`, and
      `git lfs checkout` is not a command that can be run at all.** The entry
      above is left exactly as it stands, its withdrawal of the "unfixable
      baseline" advice included, because it was measured and it was true of the
      container it was measured in — and §4's rule about marking both
      directions rather than overwriting is the whole reason this chain is
      worth reading. What this adds is that its remedy is not available
      everywhere. It does not take it back.

      Measured on `main` at `75ecd7c` (v0.0.491), in `/workspace/lockstate` and
      in a fresh `git worktree add` off `origin/main`, side by side:
      - `git lfs version` prints `git: 'lfs' is not a git command.` and exits
        1; `which git-lfs` finds nothing and exits 1.
      - `du -sh .git/lfs` prints `No such file or directory`. **There is no
        local object store**, so the 54 MB the entry above found already
        present is not present here, and there would be nothing for
        `git lfs checkout` to materialise even if the subcommand existed.
      - `file public/assets/actors/actor.guard.base.idle.png` returns
        `ASCII text` in **both** trees, and the file's first line is
        `version https://git-lfs.github.com/spec/v1`.
      - `node tooling/validate-runtime-atlas.mjs public/assets/actors` — what
        `verify:assets` runs — exits 1 with
        `actor.cook.base.idle.png is a Git LFS pointer, not image data` and a
        line like it for every atlas.
      - **The `file` check is still the advice, and by itself it is not
        enough — which is the conclusion this chain has been reaching for and
        the reason this entry exists at all.** `ASCII text` is *identical* in
        state 3 and state 4 while the remedies are a free 1.07-second local
        checkout and a package install plus a 93 MB metered fetch — **the
        second half of which was priced without being run, and was measured at
        2.45 s the same day; see the transition entry below.** Two more
        commands separate them and both are instant: **`git lfs version`**
        (is the client there at all?) and **`du -sh .git/lfs`** (are the
        objects local?). Run those two beside `file` and you know which state
        you are in; run `file` alone and you know the bytes are pointers with
        no idea why, which is a guess dressed as a measurement.
      - **The mechanism entry above does not describe this container either,
        and the difference is not `--skip`.** There is no `/etc/gitconfig` here
        at all — `cat /etc/gitconfig` prints `No such file or directory` — and
        `git config --show-origin --get-regexp '^filter\.lfs\.'` exits 1 with
        no output. **No LFS filter is configured in any scope**, so nothing was
        skipped: the smudge filter does not exist and git wrote the pointer
        blobs out verbatim. That is one more container's filesystem and not a
        diagnosis, exactly as the entry above says of its own reading.
      - **What is now unknown, said rather than papered over:** which of these
        four states the next container is in, and why they differ at all.
        Nothing in this repository sets any of it — `/etc/gitconfig` is not in
        git, and neither is whether the image ships `git-lfs` — so **no
        direction written here, this one included, can be trusted ahead of the
        three commands above.**
      - **In this container the session-start hook's sentence is the CORRECT
        instruction rather than the one to disbelieve:** *"To get the real
        bytes: bash scripts/provision-git-lfs.sh && git lfs pull (metered
        bandwidth -- that is why this hook leaves it to you)."* It is the only
        route to `verify:assets` and to `app-shell.spec.ts`'s art test here,
        and the agent that measured this **did not run it** — installing a
        package and spending 93 MB of somebody else's metered bandwidth is not
        an agent's call, and the hook deliberately left it to a human. So the
        assets gate is an unfixable baseline *in this container until a human
        takes that route*, which is a fact about this container and not a
        re-reversal of the withdrawal above.
    - **ADDED LATER THE SAME DAY, AND IT IS THE STRONGEST THING IN THIS CHAIN:
      a human took the provisioning route and THIS CONTAINER MOVED FROM THE
      FOURTH STATE INTO THE THIRD.** Nothing above is withdrawn and the fourth
      state was not wrong — it was measured, and it was the truth of this
      container for the first hour of the session that recorded it. It is
      history now in the same way the other three are, which is the whole
      reason this chain keeps them.

      **So the four states are not properties of a container. They are
      properties of a moment**, and one `apt` install moved this one across a
      boundary the chain had been treating as environmental. That is the
      conclusion to carry, and it is a stronger version of the one the entry
      above draws: `file` plus `git lfs version` plus `du -sh .git/lfs` is not
      merely how you tell the states apart, it is **the only thing that stays
      true, because the state can change under you inside one session.** A
      direction you read at the top of a session may be false by the middle of
      it, and that is not a stale document — it is a moving environment.
      - **What the integrator measured**, in `/workspace/lockstate` on `main`,
        in this order: `bash scripts/provision-git-lfs.sh` installed
        `git-lfs/3.4.1 (GitHub; linux amd64; go 1.22.2)` from the distribution
        archive, then `git lfs pull` took **2.45 s** wall clock, then `file`
        returned `PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced`
        and `node tooling/validate-runtime-atlas.mjs public/assets/actors`
        printed *"Validated 10 clip atlases"* and exited 0, and `.git/lfs` was
        **54 MB**.
      - **2.45 s is the measurement and no mechanism is offered for it.** Both
        the brief that produced the entry above and the entry itself priced
        this route as *"a package install plus a 93 MB metered fetch"*, and
        that pricing is marked here rather than deleted because it is what two
        readers believed. The install is real. The fetch was not slow enough to
        have moved 93 MB over a metered link — and **why** is not established:
        a proxy or an image-level cache is a guess, and §3's rule that a
        measurement is not a diagnosis applies to a *fast* number exactly as it
        applies to a slow one.
      - **The transition is into the third state specifically, to the byte and
        to the message.** `.git/lfs` is 54 MB and `git lfs checkout` in a tree
        still holding pointers prints
        `Checking out LFS objects: 100% (62/62), 93 MB | 0 B/s, done.` — the
        third state's own recorded figures. Three timings for that command are
        now on record and none of them is worth pinning: **1.07 s**, **1.26 s**
        and **0.464 s**, the last measured in a worktree whose working tree
        then stayed clean under `git status` and whose
        `validate-runtime-atlas.mjs` run printed *"Validated 10 clip atlases"*
        and exited 0. So `verify:assets` and `app-shell.spec.ts`'s art test are
        reachable from a worktree again, which is what the third state said and
        what the fourth state could not do.
      - **One thing is NOT the third state, and it is the half a reader would
        assume:** `/etc/gitconfig` did not exist an hour earlier and exists
        now, carrying `smudge = git-lfs smudge -- %f` and
        `process = git-lfs filter-process` — **without `--skip`**, which is the
        flag the third state's mechanism entry reads as the reason no checkout
        smudges. So the prediction that entry would make here is wrong, and it
        was tested rather than reasoned about: a `git worktree add` performed
        **after** the install lands `PNG image data, 260 x 3104` and 459,767
        bytes on disk — the size the pointer file declares — while a worktree
        created **before** it still read `ASCII text` until `git lfs checkout`
        was run in it. **A checkout's bytes depend on when the tree was
        materialised, not only on which container it is in**, which is one more
        reason a tree-by-tree `file` check beats every direction in this chain.
      - **What is still unknown, and the list has not shrunk:** why the images
        differ, whether `/etc/gitconfig` carries `--skip` or not in any given
        one, and what `git lfs pull` actually costs on a link that is genuinely
        metered. None of it is in git. **The three commands stay the answer,
        and now they have to be re-run rather than remembered.**
    - **A FIFTH STATE, measured 2026-09-06 in this container, and it is the
      good one: git-lfs installed, `.git/lfs` already holding the bytes, and
      the good state outliving the pass that bought it because the object
      store is shared.** A pass earlier in this container ran `bash
      scripts/provision-git-lfs.sh && git lfs pull`; that pull took **2
      seconds**, not the ~93 MB this chain has priced the route at, and at
      the moment it finished the six `assets/source/blender/*.blend` files
      were still pointers — nothing at runtime reads them, so it cost nothing
      that they were not among the bytes it fetched.
      - **Because `.git/lfs` is shared with every worktree and with the
        primary checkout, this outlives the pass that bought it.** In the
        primary checkout afterwards, `git lfs checkout` printed `Checking out
        LFS objects: 100% (62/62), 93 MB | 0 B/s, done.` — **`0 B/s`, nothing
        fetched** — and `node tooling/validate-runtime-atlas.mjs
        public/assets/actors` then printed *"Validated 10 clip atlases"* and
        exited 0. Re-checked in this pass at `a2b3632b` (v0.0.507): the same
        command still exits 0, `file` on `actor.guard.base.idle.png` still
        returns `PNG image data, 260 x 3104`, and the six `.blend` files now
        read `Zstandard compressed data` rather than pointer text — the
        checkout above reached them too. A worktree cut fresh from
        `origin/main` in this same container carries the same real bytes with
        no `git lfs checkout` run in it at all: the shared store means a new
        worktree does not start from pointers here.
      - **So `verify:assets` and the browser art assertions run in this
        container, and the standing note that they are an unfixable baseline
        here is withdrawn — for this container, not as a repository fact.**
        That is one more instance of the conclusion the "ADDED LATER" entry
        above already drew: the state is a property of a moment, not of an
        image, and this moment happens to be a good one rather than a cost.
      - **`/etc/gitconfig` here carries no `--skip` on the smudge filter** —
        `smudge = git-lfs smudge -- %f`, `process = git-lfs filter-process` —
        matching the post-install container the "ADDED LATER" entry above
        measured and differing from the state the "Why, and why it is not a
        repository fact" entry below currently records for 2026-09-05
        (`--skip`, in a different container). That is the other half of why
        the fresh worktree above needed no extra command: the objects were
        local **and** nothing in this container's filter configuration would
        have skipped smudging them even if they had not been.
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
- **This container's clone is SHALLOW, which turns three of
  `tests/foundation/`'s tests red on plain `main` and quietly breaks
  `git log -S` as an answer to "was this ever here?"** Measured 2026-09-05 in a
  fresh worktree off `origin/main` at `75ecd7c`, with nothing modified in it:
  `git rev-list --count HEAD` is **374** and the root commit is `558fbad`,
  dated **2026-09-03**, so the history simply stops a few days back;
  `.git/shallow` exists in `/workspace/lockstate/.git`.
  `tests/foundation/documentation-commit-citation-contract.test.ts` fails 3 of
  its 8 — *"runs on a checkout deep enough to answer, and fails rather than
  skipping when it is not"*, *"resolves every cited commit"* and *"cites only
  commits this repository publishes, so CI reads the same history a reader
  can"* — and it is **not a defect in the citations**: the first of the three
  says so itself, at length, and names the remedy. Its message is worth having
  here because the other two failures list dozens of `file:line -> sha` pairs
  and read exactly like a documentation audit finding:
  *"this checkout is shallow, so no citation can be resolved and every case
  below would fail for a reason that is not about the citations […] This is
  deliberately a failure and not a skip: a gate that passes on a checkout too
  shallow to answer manufactures confidence, which is worse than having no
  gate."*
  CI is not in this state — `.github/workflows/ci.yml` sets `fetch-depth: 0` on
  the `verify` job for this reason — so a red here is a container fact and the
  pull request's own `verify` job is the gate that means something.
  **Two consequences worth carrying.** First, `tests/foundation/` is the cheap
  habit this document recommends and **its clean baseline in this container is
  three short of green**: measured on plain `origin/main` at `75ecd7c`,
  `3 failed | 488 passed (491)`, and the same three on a branch that adds a
  contract of its own, `3 failed | 493 passed (496)`. The tally moves whenever
  a test is added and the *three* does not; establish it in a clean worktree
  before reading three reds as yours. Second, and more expensive:
  **`git log -S` and `--diff-filter=A` cannot distinguish "never existed" from
  "predates the graft"** here, and they answer confidently either way:
  `--diff-filter=A` on a file older than the root commit names the release
  commit nearest the graft as the commit that added it, which is simply
  false. An integrator's *"`git
  log -S` shows these were never added"* was checked against this and could not
  be confirmed for anything before 2026-09-03. The way round it without paying
  for history is the GitHub API: list the commits for a path with `until=`,
  then read the file at one of those shas. `git fetch --unshallow` is the other
  route and its cost is not known — 374 commits are 22.6 MiB of pack here, and
  nobody has measured the whole history.
  **A third command belongs on that list and it caught the agent who wrote the
  two above out within the hour: `git branch -r --contains <sha>` answers
  "nothing" and means "cannot say".**
  `tests/foundation/documentation-commit-citation-contract.test.ts`'s third
  failure lists `docs/adr/STATUS-QUEUE.md`'s citations of `c56e18bd` and
  `24ef7aec` as commits *"on this disk and on no ref this repository
  publishes"*, and that test's check is `--contains`. Both are plainly real
  published history — `git log --oneline -1` on them gives #913's copy fix and
  #897's merge commit — and `--contains` finds nothing for either because the
  graft truncates the ancestry walk before it reaches them.
  **The reason this is one cause and not two is a control, and it is worth
  running before blaming a ref set:** with 200 remote-tracking branches against
  origin's 198 heads — essentially all of them — `--contains` still returns 0
  refs for both, while `829d3c11`, a commit *inside* the visible walk, is
  contained by 21 and `git merge-base --is-ancestor 829d3c11 origin/main` exits
  0. Same refs, same command, different answers, and what separates the two
  cases is only whether the walk can reach.
  **THAT CORRECTS A CLAIM THIS BULLET'S OWN AUTHOR PUBLISHED, and the wrong
  figure is named rather than quietly dropped:** a commit message on
  `docs/re-anchor-status-queue` attributed the third failure to the container
  knowing *"16 of origin's 196 branches"* and called it *"a different container
  artifact from the shallow depth"*. Both halves are wrong. `git branch -r`
  returns **200** in the primary checkout and in every worktree — worktrees
  share refs, so a per-tree ref set was never possible — and the cause is the
  graft, the same one. The 16 was measured in this shared clone earlier the
  same hour and is not reproducible; what it was counting is unknown, and the
  useful lesson is that it was **reconciled instead of re-measured**, which is
  how one number became a mechanism.
  **So the generalisation, which is cheap and now has three instances:
  `--contains`, `log -S` and `--diff-filter=A` all answer confidently and
  wrongly when the walk cannot complete, and one command tells you before any
  of them lies to you:** `git rev-parse --is-shallow-repository`. Run it once
  at the start of any pass that will reason about history, and treat a `true`
  as making every containment and every "when did this first appear" answer
  **undecidable rather than negative**. `.git/shallow` lists the boundary
  commits and `git log --oneline --max-parents=0` shows where the walk bottoms
  out.
  **What this does NOT license:** the three reds are still not a licence to
  edit the citations they name, and the fix is not
  `UNPUBLISHED_BY_ORIGIN`. The argument that settles it is that CI's `verify`
  job runs at `fetch-depth: 0` and is green on the same file content, so the
  citations resolve where anybody with a full clone reads them; that
  allowlist's own comment says an entry *"preserves a citation nobody can
  check"*, and these are checkable.
  **Added 2026-09-06, and it corrects half of a sentence higher up in this
  same bullet rather than the baseline itself.** "The tally moves whenever a
  test is added and the *three* does not" is the sentence: both halves were
  wrong within the day. The third of the three cases quoted above — *"cites
  only commits this repository publishes, so CI reads the same history a
  reader can"* — asserts `git rev-list --remotes=origin --tags` exceeds 500.
  At 17:30 on 2026-09-05 that count was **381** and the case failed; by 21:15
  the same day it was **2,946** and the case passed. **Nothing was fixed and
  the clone is still shallow** — `git rev-parse --is-shallow-repository` was
  `true` at both readings and `.git/shallow` was untouched. So the tally moved
  from three failures to two with no test added and no citation touched,
  which is exactly what the corrected sentence said could not happen.
  The cause is a fetch, not a fix: one agent ran `git fetch origin
  '+refs/heads/*:refs/remotes/origin/*' --prune`, which populated
  remote-tracking refs for roughly 197 of origin's branches — and worktrees
  share the object store and the refs with the primary checkout, the same
  sharing this bullet's own `git branch -r` figures rest on, so one agent's
  fetch moved the baseline for every agent in the container.
  **Two wrong explanations were published before the right one, and both are
  kept rather than replaced, because the point of this chain is showing how a
  guess becomes a mechanism.** The integrator guessed *"today's merges
  published enough refs"* — four merges cannot move a ref count by 2,565. The
  agent who ran the fetch then wrote *"my fetch deepened the clone"* — it did
  not; the clone was shallow before the fetch and is shallow after it, because
  fetching branch tips is not fetching history depth.
  **So the number to distrust here is not the count of failures, it is the
  word "three."** Re-measured in this pass, in a clean worktree at `a2b3632b`
  (v0.0.507): `git rev-list --remotes=origin --tags` returns **3,004** —
  moved again, overnight, with nothing in this pass touching it — the clone
  is still shallow (`.git/shallow` present, untouched since the prior
  reading), and `node
  /workspace/lockstate/node_modules/vitest/vitest.mjs run tests/foundation`
  gives `Test Files  1 failed | 54 passed (55)`, `Tests  2 failed | 494
  passed (496)`. **The ref count is a function of which refs have been
  fetched, not a property of this repository, so it has to be measured on a
  clean tree at the start of every pass rather than quoted from this
  document** — the `2` in this paragraph is due to go stale exactly the way
  the `3` above it did.
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
  **Both halves of that pair are now false, on different dates, and the bullet
  is kept rather than deleted because its last sentence was right and was what
  eventually got acted on.** `comment-symbol-existence-contract.test.ts` stopped
  being on a 5s budget on 2026-09-03: `51b65da1`, *"four whole-tree contracts
  outgrew the global timeout, so a finding read as a hang (#872)"*, gave it and
  three siblings an explicit 60,000 ms. So this bullet was already half wrong
  the day after it was written, and an agent who read it on 2026-09-05 and went
  looking for a 5s scan found a 60s one.
  `prisoners-sentence.test.ts` stopped being on the list on 2026-09-05 (#1005),
  and *"a bisection over an RNG stream"* was never what it did — it draws
  60,000 sentences in a loop. The 2.0s that loop cost was not the draws and not
  the sample size: it was **three `expect` calls per iteration, 180,000 of
  them**, which is 99% of the test. The sibling test in the same file draws
  30,000 sentences from the same function with no per-draw assertion and takes
  **10 ms**. Collecting the violations and asserting once, with every draw and
  every predicate unchanged, took it to 25 ms.
  **The transferable part is the diagnosis, not the two names.** Before
  concluding that a slow test is doing expensive work, price its assertions:
  an `expect` in a hot loop costs about 11 microseconds whether or not anything
  is wrong, so a loop with three of them and 60,000 iterations spends two
  seconds proving nothing. Vitest reports it as *"Test timed out in 5000ms"*,
  which points at the budget rather than at the loop.
  **And measure against the budget each test actually has, not against 5,000.**
  Twenty-odd tests here carry an explicit `it(..., 30_000)`-style argument, and
  a sweep that ignores those ranks the wrong ones first: the slowest test in the
  whole `vitest` suite in wall-clock, `prisoners-actor-tier-scale`'s 5,000-actor
  tier at 3.6s, is at 12% of its budget and needs nothing, while
  `prisoners-sentence` at 2.0s was at 43% of its and was the one that fell over.
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
- **THE `#331` CANARY ABOVE NAMES THE WRONG FILE, AND WHAT IT NAMES THE RIGHT
  ONE FOR IS THE WRONG PHASE OF THE TEST.** Measured 2026-09-08 for issue
  #1008, which asked for a repetition count on `main` that nobody had taken.
  Both halves below are corrections to sentences in this document, so both are
  marked rather than overwritten (§4).
  - **The file.** The title the canary bullet quotes — *"the Rooms panel says
    what a zoned room is missing, and says nothing when nothing is (#331)"* —
    is `tests/browser/app-shell.spec.ts`'s, not `tests/browser/ui-shell.spec.ts`'s.
    `git log -S` on that string returns `3389f29c` for `app-shell.spec.ts` and
    **nothing at all** for `ui-shell.spec.ts`, so the string has never been in
    the file the bullet attributes it to. `ui-shell.spec.ts` does carry a
    same-issue twin, *"says what a designated room is missing, and says nothing
    when nothing is (#331)"*, and that one is not a canary and never was: it ran
    twelve times in the count below and finished in **0.7–1.3 s** every time,
    against a test that takes minutes. The two are told apart by their titles —
    *zoned* against *designated* — which is a thin distinction to hang a
    citation on, so cite the file.
  - **The count, on untouched `origin/main`.** Worktree at `491fcdce`
    (v0.0.541), `git lfs checkout` done, twelve repeats of the `app-shell`
    test in one invocation with no retry wrapper: **7 passed, 5 failed**. So it
    is neither "always" nor "randomly". The durations run
    `2.3, 2.2, 2.2, 2.4, 2.7, 2.7, 2.7` minutes and then `3.0, 3.0, 3.0, 3.0,
    3.0` — the last five being `test.slow()`'s 180 s cap, reported as
    `Test timeout of 180000ms exceeded`. Load average over the passing window
    was median **5.0**; over the failing window, median **11.0**, because
    another agent's suite started partway through. Nothing else changed: same
    process, same tree, same command.
  - **Where it dies moves, which is the signature of a budget rather than of a
    wait.** Across those five: three at the crew poll in
    `wallRectanglesFromTheKeyboard`, one at a `page.keyboard.press` in the
    ordering loop, one inside `focusIs` under `hopTo`. The same shape the #88
    sweep shows above.
  - **And the crew is not what it is waiting for, which reverses what the
    canary bullet above says about all three of them.** That bullet's reason is
    *"All three wait on the simulation to produce something, so they are the
    first to give up when the machine is busy"* — as far as this pass can tell
    that holds for the other two, and it is false of this one. Instrumented
    runs on the same tree print the split — two `console.log`s at the ends of
    the ordering loop and a one-second in-page sampler over the crew poll, in a
    second throwaway worktree, none of it committed. Typing the thirty-two build orders
    through the keyboard costs **138–164 s** across five runs of the 180 s budget; the crew
    phase then starts with 2–16 s left and the poll that reports the failure
    has a 90 s budget it never gets to spend. Sampled once a second inside that
    remnant, the crew lays **20 segments in 15.0 s — 0.75 s each — and the HUD's
    day progress moves 6% → 57% of `DAY_LENGTH_TICKS`, which is 81.5 ticks per
    second against ×4's 80.** The simulation worker is running at *exactly* its
    nominal speed on a box at load 9. So `data-queued` stopping at some number
    short of the perimeter is the residue of a budget already spent elsewhere,
    not a crew that stalled, and "the crew never finished the N wall segments"
    is a true sentence pointing at the wrong subject.
  - **And the trace says which call spends it, which no reading of the code
    would have.** `trace: 'retain-on-failure'` is already on in
    `tests/browser/playwright.config.ts`, so every failing run leaves a
    `trace.zip` whose `.trace` file is JSONL with a `before`/`after` pair per
    API call — unzip it and sum by `apiName` rather than guessing. One failing
    run at load ~9: **407 `keyboard.press` calls, mean 221 ms, median 207 ms,
    worst 939 ms, 90.1 s in total** — half the whole test budget in one API
    call — beside 43 `keyboard.type` at 270 ms (11.6 s), 113 `page.evaluate`
    at 129 ms (14.5 s), 11 clicks at 870 ms and 6 `mouse.move` at 989 ms. The
    file's own recorded figures for this page are ~57 ms a press and ~50 ms an
    evaluate, so this host is about **four times** the machine those were taken
    on, uniformly. That uniformity is why the helper's choice of the keyboard
    over the pointer is still the right one here and is not what to reopen.
  - **The environment difference this container HAS, measured.** Four cores
    (`nproc`, and `navigator.hardwareConcurrency` agrees) and no GPU:
    Chromium's unmasked WebGL renderer is
    `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)),
    SwiftShader driver)`, a software rasteriser. One single-worker Playwright
    test saturates the box on its own — `ps -eo pcpu,args --sort=-pcpu` during
    a run puts the browser's `--type=gpu-process` at **261–296% CPU** while the
    renderer process sits at ~20%, and load average holds 3.6–4.6 with no
    other agent's suite running — checked with `ps`, whose top four entries
    were all this run's own processes. Every `page.keyboard.press` and
    `page.evaluate` queues
    behind that renderer's main thread, which is why the keyboard route and
    not the simulation is what runs out of budget.
  - **The environment difference CI has is NOT readable from here, and the
    Actions API looks as though it answers this and does not.** A job's
    `labels` array in the jobs API is the `runs-on` list the *workflow asked
    for*, not the runner's own label set: every job on `main` reports
    `["self-hosted","Linux","X64","wsl2","woogitsu"]` whichever machine it
    landed on. So it cannot say whether any runner has a GPU, and a reading
    that it can is how PR #1073's comment came to say the old pool "carried an
    `nvidia-gtx1070` label" — PR #1071's own text has that label as one of the
    two terms the retired pool **cannot** satisfy, and #1071 states in terms
    that the new pool's labels are "not verifiable from this repository". Treat
    runner hardware as owner-only state (§3).
  - **What the API does say, and it is enough to explain a green `main` beside
    a red pull request with no diff between them: one `runs-on` list is
    satisfied by machines that differ by more than 3×.** The green browser job
    ran on runner `woogitsu-wsl-DOM-NEW-02` — job `101857042955`, `main` at
    `59049c07`, **420 passed in 13.0 m**, with this test itself at **46.6 s**.
    The job that hit the 30-minute cap after 32 of 420 tests ran on
    `woogitsu-linux-09` — job `101909314164`, on a branch whose entire diff is
    shell scripts — and this test there exceeded its 180 s cap. Same requested
    labels, same commit family, different machine.
  - **The commands, so the count can be retaken.** `git worktree add <dir>
    origin/main --detach`,
    `ln -sfn /workspace/lockstate/node_modules <dir>/node_modules`,
    `git lfs checkout`, then
    `LOCKSTATE_BROWSER_TEST_PORT=<free port> node_modules/.bin/playwright test
    --config tests/browser/playwright.config.ts -g "Rooms panel says what a
    zoned room is missing" --repeat-each=12`. The port matters: the config
    refuses to reuse a server, so two agents on 5183 collide. Going through
    `playwright` rather than `tests/browser/run-suite.ts` was deliberate here
    and is the one thing to change if you want the gate rather than the
    measurement — the wrapper adds the `net::ERR_NETWORK_CHANGED` re-run, and a
    count of failures wants no retry in it at all.
  - **What to run before concluding anything about a browser timeout here.**
    `nproc`, `cut -d' ' -f1-3 /proc/loadavg`, and
    `ps -eo pcpu,args --sort=-pcpu | head -4` — if a `--type=gpu-process` is
    near 300% you are on a software rasteriser and the wall clock is not the
    one the test was written against. The rasteriser itself is one
    `gl.getParameter(gl.RENDERER)` away in any Playwright page, with
    `WEBGL_debug_renderer_info` for the unmasked string.
  - **Not fixed here, deliberately.** Raising `test.slow()`'s cap, or the 90 s
    poll, would move a budget without anyone having decided which budget is
    wrong — and this document's own rule is not to raise a timeout until you
    know what the test is waiting on. Now that it is known, the decision is
    whose cost to cut: the keyboard route's 138–164 s, the perimeter's
    thirty-two segments, or the budget. #1008 carries the options.
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

**The check that catches a lost row is counting the rows you owe, not reading
the diff.** Added 2026-09-05, twice in one day, on `docs/research/README.md` —
a table with one append point, which is the structural conflict §2 already
warns about. What is new is the *resolution*: the correct answer is always
"keep every row", and a resolver cannot tell by inspection whether they have.
Both times the merge was wrong in a way the diff looked fine for. Once an agent
dropped a row while resolving; once one branch had pulled twenty-four drifted
rows back *into* the table while `main` had extended the drifted region with a
twenty-fifth, so git saw one side delete a block and the other grow it. **The
move that settled it in seconds was arithmetic over the two parents**: the
parents carried 93 and 84 rows, the union of their labels was 94, the resolved
file had 94, and `comm -23` over the union reported nothing missing. **Do that
before you read the hunks, not after** — and where a contract counts the same
thing (`tests/foundation/research-index-contract.test.ts` fails on a record
with no row and on a row outside the table), run it, because those are exactly
the two ways such a merge goes wrong silently.

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
