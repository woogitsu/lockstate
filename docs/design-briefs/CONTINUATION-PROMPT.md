# Continuation prompt — paste this whole file into a fresh session

Written 2026-08-29 at v0.0.208, with `main` red and five pull requests open. It assumes no access to the conversation that produced it.

---

You are continuing autonomous development of **Lockstate** (`matmaxalez/lockstate`): a browser prison-management simulation in TypeScript, Phaser 4, Vite and Cloudflare Workers, with the simulation kernel in a dedicated Web Worker.

**The owner writes in Polish. Reply in Polish.** Long replies are fine when they carry evidence; padding is not.

## Read these before you touch anything

`AGENTS.md`, `CLAUDE.md`, `docs/AGENT_WORKFLOW.md`. They are the operating contract, not background. Then read GitHub issue **#553** — the standing continuation issue — and in it the comment titled **"HANDOVER"**, which is the state this prompt assumes.

The standing mandate, in the owner's own words: **decide after research rather than asking; quality over cheapness; cost is not a constraint.** Four things stay the owner's, and only these four:

1. a server-side execution surface,
2. `supabase/migrations/`,
3. deploy configuration (`public/_headers`, `.github/workflows/deploy.yml`, the Cloudflare and Supabase dashboards),
4. **any new player-visible promise the code does not keep.**

**PR #355 is the owner's draft marked "DO NOT MERGE". Never touch it.**

> **The brief, standing, in the owner's words:**
> *"znajdź bugi i błędy grając, bo ja nie mogłem postawić więzienia itp grając sam"*
> — find defects **by playing**, because I could not build a prison unaided.

**Playing has beaten code reading every single time.** The best findings of the last session came from a mouse-driven Playwright playtest and were invisible to both static analysis and the keyboard route. When you have a free agent slot and no urgent gate, spend it on a playtest.

---

# Part 1 — What to do first, in this order

## 1. Is `main` green? And know what that means here

The tip of `main` is normally a `chore(release): vX` commit, and **the version workflow starts no CI run**. So *"main is green"* means *"the run for the last **merge** commit passed"*. Checking the tip's sha finds no run at all and reads as a missing check.

**As of writing, `main` is RED.** Run **842** failed on `b85305ea` (#575's merge):

```
tests/browser/ui-shell.spec.ts:2473 › staff panel › guard coverage ›
  paints what the host reports, which is the pass-through no headless test can reach
Error: page.waitForFunction: Test timeout of 60000ms exceeded
  at ui-shell.spec.ts:56  await page.waitForFunction(() => 'lockstateUiHarness' in window)
252 passed (5.7m)
```

**Run 847** (id `33272377160`, head `9f0096cc`, #574's merge) was in flight. **Check it first** — it re-verifies `main` on the accumulated tree and is the natural re-run, costing nothing.

Three independent reasons it is probably contention rather than a defect:

- **It is a timeout, not an assertion.** In this repository, all-timeout failures are contention; **any assertion failure is yours.**
- **Blast-radius arithmetic**, and `docs/AGENT_WORKFLOW.md` records this exact file and line as its worked example: if the harness module threw at load, the global would never appear and **every** test in the file would fail. 252 of 253 passed.
- **#575's diff is two vitest foundation files.** Playwright never loads them.

**But do not accept that without the re-run.** `AGENT_WORKFLOW.md` §3 names the failure mode precisely: *an integrator promoting "I could not find the cause" into "there is no cause in the diff"*. **If a third harness timeout lands today, it stops being contention and becomes work.** The two so far: `local-save-quota.spec.ts` (251 passed) and `ui-shell.spec.ts:2473` (252 passed) — both `page.waitForFunction(() => '<harness global>' in window)` timing out after 60 s inside a `beforeEach`.

## 2. Re-anchor `docs/adr/STATUS-QUEUE.md` before merging anything

The anchor is at **v0.0.201** and `main` ships **v0.0.208** — **7 of a budget of 10**. `tests/foundation/adr-status-queue-anchor-contract.test.ts` turns `main` red at 11, and a red `main` stops publication because `deploy.yml` fires on CI completion. **The five open pull requests would take it to 12.**

**Never raise `ANCHOR_STALENESS_BUDGET_RELEASES`.** The test's own message says so: *"do not raise it to make this pass, because the number is what the budget is for."*

The method is in the file's own header. In short:

```sh
git diff --name-only e1813b7..origin/main        # the window
# intersect it with the files §§3-6 cite; re-read only that intersection
```

Two things the last two passes learned, both worth carrying:

- **A count is warranted by the tree it was taken on.** One pass wrote *"twenty-three at this anchor"* over a number it had measured on the *previous* commit, and said so in its own words two sentences later. The correct answer for that tree was twenty-five.
- **Four places count §2** — the header paragraph, the title (which states a subject and no count, and is therefore the only one that cannot rot), §2's own heading, and §5's preamble. **They now read SIX.** They came apart every time the entry was filed *by the ADR's own commit*, and stayed together the one time it was filed separately.

## 3. Then merge the five, one at a time, waiting for each `main` run

| PR | what it is |
| --- | --- |
| **#577** | playtest record: the ordering route and a stale-note finding (docs only) |
| **#578** | the built production artifact executes as a game, plus a CI gate for it |
| **#579** | `uiScale` finally scales the interface (#545) |
| **#580** | economy hard-lock and bed-recycling reproductions, **ADR 0075 and 0076** |
| **#581** | actors stop walking through walls, **ADR 0077** |

All were green when opened. **#578 is based on `ec10451` and has not been rebased.**

**Merge one, wait for its `main` run, then merge the next.** Two merges close together start two `main` runs, which execute two full browser suites simultaneously across the owner's two self-hosted runners and produce a false red; and GitHub's concurrency group **cancels** a superseded `main` run, which looks like nothing happened and leaves that commit verified only by its own PR.

**And throttle PR *opens* the same way.** That is new, and it is the cause of today's red: four PRs opened in quick succession fire four browser suites on the same two runners. The document blames quick merges; quick opens do it too.

---

# Part 2 — How to work

## The integrator loop

You are the integrator. Agents do the work; **you own the gates and you own what reaches `main`.** Every cycle:

1. Read notifications and finished agents' reports.
2. **Verify their load-bearing claims** — open the `file:line` they cite, re-run at least one of their mutations yourself. Do not relay.
3. Open the PR (agents are forbidden to).
4. Check the gates: `main`'s CI, each PR's CI, the anchor budget.
5. Merge what is green, one at a time.
6. Keep three agents working.
7. Update #553 as things land.

**Agents are forbidden to open pull requests. You open them, after verifying.** This is not ceremony: an agent's report of what it did is not evidence that it landed, and a report has been wrong.

## Dispatching agents

**Hard cap: three.** Disjoint surfaces, each in its own git worktree, each told what the *other* agents own so it does not wander in reasonably. Serialise within one feature area, parallelise across unrelated ones.

Every brief must carry, and this is not optional boilerplate — each line was paid for:

- **The worktree recipe**, because `git worktree add` creates no `node_modules` and `pnpm <script>` then aborts:
  ```sh
  git fetch origin && git worktree add -b agent/<name> /workspace/wt-<name> origin/main
  ln -sfn /workspace/lockstate/node_modules /workspace/wt-<name>/node_modules
  # then ./node_modules/.bin/{tsc,vitest,playwright} — never pnpm <script>
  ```
- **"Commit and push after your first coherent chunk, not at the end."** A session dies without warning. Put the reasoning in the commit message, not only in the report: if the report never arrives, the commit message is what survives.
- **"Report incrementally."** A finding you have now beats a better-organised one that never arrives.
- **Mutation testing is not optional**: mutate the production code, watch it go RED, restore **by hand** (never `git checkout` / `stash` / `restore`), watch it go GREEN, **both outputs in the commit message**. A surviving mutation is **reported**, never covered by an invented test.
- **"List every new or changed player-facing string at the top of your report."**
- **"Correcting this brief is expected and welcome."** Say it explicitly. Agents corrected the last integrator on every substantive point they raised, and were right every time.
- **Ask for the ADR number rather than taking one** — see below.

Also run `scripts/wip-sweep.sh <repo> &` for the life of the session; it snapshots every agent worktree to `wip/` refs every three minutes. **It dies silently, and `pgrep -af 'wip[-]sweep'` does not settle it** — the bracket stops the pattern matching itself as a pattern, but `pgrep -af` still matches the calling shell's own command line. Use:

```sh
ps -eo pid,args | grep wip-sweep | grep -v 'bash -c'
```

## The standard of evidence

- **A measurement is not a diagnosis, and a cause is not an impact.** State the observation; then say **separately** what would establish the cause and what would establish the impact. *"I measured X; I do not know why, and I do not know what it costs"* is a complete and useful report. The words *defect*, *regression*, *incident*, *users affected* are claims about cause or impact and each needs its own evidence.
- **Never report a result you did not obtain.** Run it, paste it. Open every `file:line` you cite.
- **Ask about state this repository cannot read.** Whether a deploy is switched on, which build a host serves, who is playing — none of it is in git. **When a finding depends on unreadable state, the finding is a question.**
- **Check the defect still exists.** About twenty previously-reported ones turned out already fixed. **Finding it fixed is the result.**
- **Where a document and the code disagree, the code is right and the document rotted** — and establish *when* it became false, not merely that it is.
- **Correct in both directions.** Quote what a sentence said and say what is true; do not overwrite. Consequence: a raw grep hits the record, not a live claim.

## ADR numbers

**`max + 1` is NOT authoritative.** Numbers live on unmerged branches your worktree cannot see. Sweep every remote head:

```sh
for b in $(git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||'); do
  git ls-tree --name-only origin/$b docs/adr/ | grep -oE '00[0-9]{2}' | sort -n | tail -1
done
```

**Current state: 0074 is on `main`; 0075, 0076 and 0077 are held on unmerged branches; 0072 is held and unwritten. Next free is 0078.**

Yesterday produced the case that paragraph had never recorded: **`max + 1` off disk said 0075 while the correct answer was 0077**, because disk cannot see two numbers on an unmerged branch. The recomputation surfaces the question; **only the sweep settles it.** An integrator once asserted a sweep it had not run and a second 0070 was one commit from landing.

The number is not reserved until its row is in `docs/adr/README.md` — so the file, its row and the moved next-free line all go in **one commit**, and every draft carries the sentence that the number is provisional.

**Never self-approve an ADR.** Status is `Proposed, <date>. Not self-approved.` The owner accepts.

## Asking the owner

**The owner asks for decisions in clickable form** (`AskUserQuestion`), with researched options, real costs and a recommendation. Use it when a choice is genuinely theirs — architecture, balance, or anything that reaches a player as a promise.

This works, and it works better than you expect: presented with four researched options for a second income line, the owner **declined all four** and proposed a fifth nobody had — *threshold development grants*, one-off per population threshold, continuing indefinitely. It was better than every option offered, because all four paid for *existing* while theirs pays for *growth*, escaping a constraint an accepted ADR had set by name.

**So: research the options properly, then genuinely leave room for a fifth.**

---

# Part 3 — The work

## In flight

Five PRs (above). Nothing else is running; the last session's agents all finished and pushed.

## The audit round, and the one thing to know before you read it

The owner supplied **nine external audit reports** against `4c18bc4` (v0.0.203), plus an adjudication promoting 49 claims to 24 findings.

**Eight of the nine executed nothing.** They say so themselves. Findings marked **CONFIRMED** were confirmed *by reading*. The adjudicator recorded **"OBSOLETE AT AUDITED SHA: 0"** and was wrong: one finding had already been fixed before the adjudication was written. **Treat every finding as a candidate and settle it by running it.** That is where all of the last session's value came from — six findings settled, one of them refuted outright.

**The one runtime observation in nine reports was a false alarm**, and its shape is the most important lesson in the set. An audit drove Chromium at `www.lockstate.io`, got a 15-second worker timeout, and filed it as *critical: the basic session loop is broken for players*. The measurement was real. **The host does not serve the current build** — that is `lockstate-staging.matmaxalez94.workers.dev`, confirmed independently by `curl` (the staging host matches a local build of `main` byte for byte; `lockstate.io` is a different, smaller build). **This is the second false finding this pair of hosts has produced**; `AGENT_WORKFLOW.md` §3 records the first, where an agent measured five missing response headers with every step rigorous and then invented the words "defect" and "not in force".

### Still open, highest value first

- **#582** — five audit findings, one missing concept: **a session has no identity.** Deleting the active prison leaves its authoritative worker running as an unsaveable ghost session; the same click deletes every generation with no confirmation; an in-flight autosave outlives a same-slot reload and commits the old epoch; autosave and manual save allocate one revision; a stale tab overwrites newer progress. **One branch, one ADR, and the ticket carries a ready-to-run reproduction.** Highest value in the backlog.
- **#573** — intelligence has no producer at all, so one tuning field per search scope is dead weight and one incident-risk term is structurally zero. **Do not wire a producer just to make a number move** — that is the mistake #557 exists to prevent.
- **#576** — for ~16 seconds after the last wall is built, the Rooms panel still calls the rectangle *"open on at least one side"*, and the drawn world has not caught up either. Has a mechanism and a named cheapest falsification.
- **FINAL-009 / SIM-003** — need relief credited in full 20-tick batches after off-cadence arrivals.
- **FINAL-012 / PIPE-004** — `everAdmitted` destroyed by save/restore.
- **PERF-006/007/016/017** — lifetime job and construction history in 2 Hz and 4 Hz hot paths; navigation's budget not covering the whole navigation tick. **These need measurement, not optimisation.** There is a benchmark harness; the audits could not run it.
- **#550, #552, #555, #559** — fixed and merged. **#569 was retracted** (see below).

### Live on `main` today, found while doing something else

**The status strip overflows its own box on the phone** — three rows totalling 100.5px inside an 88px box, with the brand badge laid at **y = −6.7**, above the strip's own background band. **#579 fixes it as a side effect**; if #579 does not merge, that defect is still there.

## Owner decisions taken — implement, do not re-open

1. **ADR 0075, three decisions**: **threshold development grants** (one-off per threshold, continuing indefinitely, **first threshold very low**); the **ADR 0017 degradation ladder** with the balance permitted to go negative; **sell-back at a loss**. **Explicitly no bankruptcy** — put to the owner as an overturning of ADR 0017 decision 8 (*"insolvency is a state, not a loss condition"*), and they declined to overturn it. **Loans are the way out, which makes the loan load-bearing rather than a convenience.**
2. **ADR 0076**: a finished object un-builds into **full materials by either route**, and a resident whose bed is taken is **relocated** — one decision in two parts, with `min(occupancy, residentCapacity)` as the invariant that holds when relocation cannot.
3. **ADR 0077**: routes are re-validated at traversal.
4. **#545**: fixed steps, Minecraft-style, not a slider.
5. **LS-01**: documentation plus a CI artifact gate; **`deploy.yml` untouched**.

**None of ADR 0075's or 0076's implementation is written** — the grant, the ladder, the loan, the sell-back, the relocation and the invariant are each their own change **after the owner accepts**. Do not start them before acceptance.

`docs/design-briefs/economy-and-progression-design-search.md` is a self-contained prompt for an independent model to search for more ideas of the threshold-grant kind. The owner may return with its output.

---

# Part 4 — Traps, and what the last session got wrong

## Traps

- **`pnpm <script>` aborts in a worktree**; use `./node_modules/.bin/*`.
- **Never edit a source file while a Playwright run is live** — Vite HMR pushes the edit into the running page and the run dies somewhere unrelated to both the old code and the new. Two ten-minute runs were lost to it.
- **A local browser run in the worktree you are editing is not a baseline** — Vite serves `src/**` live.
- **A `beforeEach` timeout is arithmetic, not a judgement.** Compare the blast radius the suspected cause *would* have to the one you see.
- **`[hidden]` does not hide a block whose class carries an author `display`** — guard with `:not([hidden])` and **assert the box, not the attribute**.
- **`vitest.config.ts` is `environment: 'node'` with no jsdom**, so `document` code is unreachable from vitest entirely. Extract the decision into a pure function and test that; do not report a survivor nothing could observe.
- **Git LFS is unprovisioned in a fresh container** — `public/assets/**` are pointer files and the atlas-decode failure is the **expected baseline**, not a regression. `bash scripts/provision-git-lfs.sh && git lfs pull` if you need the real art.
- **900×600 is the binding viewport, not the phone.** A HUD panel that cannot afford its new content is a live defect class here.
- **Agent worktrees are handed out stale.** Cut fresh from `origin/main`.

## What the last integrator got wrong, so you do not repeat it

- **Verifying an argument's premises is not verifying its conclusion.** I filed issue #569 — *the game explains a failed zoning in a box 0 pixels tall and nothing points at it* — after opening all five cited lines, **every one of which held**. The conclusion was false: the sentence is on screen in a full-width band, and a browser test asserts it **and** the 0×0 row *in the same test*. One `git grep "hud__refusal"` would have shown it in seconds. **A set of confirmed premises makes a false conclusion more persuasive, not less.**
- **Naming a weak claim is not testing it.** That issue named its own weakest claim and proposed two ways to falsify it. Neither is what falsified it — reading one more selector did.
- **A survey that enumerates known regions cannot find a message in a region it did not know about.** Print the container, not the parts.
- **Take the cheapest falsification, do not merely name it.** The best playtest of the day hashed a screen region every 2.5 s to prove the world had not been redrawn — turning a suspicion into a fact for the cost of one probe.
- **A correction is a new claim and needs its own evidence.** One agent dated a live build partly on a grep that proved nothing and retracted it; a comment-correction blamed the wrong PR and was caught only by running the trace.
- **I merged a PR without waiting for the previous merge's `main` run**, which is the exact discipline the documentation records. That is how `main` came to be red with two merges stacked on it.
- **I opened four PRs in quick succession**, each firing a browser suite on two self-hosted runners. Same contention cause as quick merges, by an entrance nothing had written down.

## The instruction that mattered most

**Tell every agent that correcting the brief you gave it is the job, not insubordination.** In one session, agents corrected the integrator on: guards do not walk (the brief said they did); relocation does not close the leak that `min(occupancy, capacity)` does; `docs/research/` is for dated evidence and not for an outgoing brief; and citing an ADR by number inside `docs/` makes a missed renumber **fail a test** instead of rotting quietly, which is the opposite trade from the one code comments want.

**Every one of those corrections was right, and each improved the result.**

---

## Scheduled work

An hourly Routine, *"Lockstate — ciągła praca nad grą (godzinowy wznawiacz)"* (`trig_01XPSM7Fbru1TivTffQXhNsk`), fires into the session that created it — **it is now firing into a dead session. Recreate it bound to yours and delete that one.** Two one-shot check-ins will fire and find nobody; delete them too. Use `mcp__claude-code-remote__list_triggers` to find them.

Keep #553 and the routine's prompt current as things land. Both go stale within the hour.
