# Auditing the two documents every agent reads first

**Date:** 2026-09-05
**Tree:** `origin/main` at `1ad2189a` (v0.0.483), worktree `docs/audit-the-agent-contract`
**Subjects:** `AGENTS.md` (189 lines), `docs/AGENT_WORKFLOW.md` (640 lines), `CLAUDE.md` (26 lines)
**No issue.** The GitHub API was at its user rate limit for most of this pass; the
integrator will open one and attach this note.

---

## Why this pass exists

Every ADR, `docs/adr/STATUS-QUEUE.md` and every research note in this repository has
been audited at least once. The two documents that *gate* all of that work — the
contract and the method every agent reads before its first edit — never had been. A
false sentence in either is inherited by every agent dispatched afterwards, and no
gate in this repository reads them.

This is not hypothetical. On 2026-09-04 the integrator told eight agents that Git LFS
**is** expanded in a worktree and that only the primary checkout holds pointers.
`docs/AGENT_WORKFLOW.md` §2 said the same thing, having been rewritten to say it
fourteen hours earlier. Measured today, both are false — see finding 1.

**This pass changes neither document.** `AGENTS.md` is a contract; amending it is the
owner's, and amending the method is the integrator's. What follows is evidence.

---

## 1. Inventory

The split between "falsifiable" and "not" is a judgement at the margin — a normative
sentence often carries a checkable sub-claim (`AGENTS.md`'s "Run typecheck, tests and
production build" asserts those scripts exist). Where a sentence carried one, it was
counted as falsifiable and the normative half ignored.

| | `AGENTS.md` | `AGENT_WORKFLOW.md` | `CLAUDE.md` | total |
| --- | ---: | ---: | ---: | ---: |
| **Falsifiable, verified TRUE** | 32 | 62 | 6 | **100** |
| **Falsifiable, measured FALSE** | 4 | 8 | 3 | **15** |
| **False by design** (preserved, marked as withdrawn in the text) | 2 | 3 | 0 | **5** |
| **Could not resolve** (§4 below) | 3 | 18 | 0 | **21** |
| **Not falsifiable** (posture, rule, judgement) | 38 | 31 | 4 | **73** |
| falsifiable subtotal | 41 | 91 | 9 | 141 |

The FALSE row sums to 15 across 13 **distinct** findings: F5 (`wip-sweep.sh`) and F13
(half-heading citations) each land in two documents and are counted once per document
here and once overall below.

"False by design" is its own row on purpose. Both documents deliberately keep the
sentence they withdrew beside the withdrawal — reservation 1's *"do not add `main`
to `wrangler.jsonc`"*, reservation 4's strict reading, §2's *"`git worktree add` does
not run the Git LFS smudge filter either"*. Those are not defects; they are the
marking-both-directions rule of §4 working. They are counted separately so they are
not mistaken for either category.

**Rot rate on the falsifiable set: 13 distinct findings across 141 falsifiable
claims, about 9%.** Every one of the thirteen is below. Four of the eight in `AGENT_WORKFLOW.md` were **false on the day they were
written**, which is a different disease from decay and is treated separately in §3.

---

## 2. The thirteen FALSE findings

Each carries the command that shows it and, where git can establish one, the moment it
became false.

### F1 — Git LFS: neither tree has the art, and the mechanism §2 gives is inverted

`docs/AGENT_WORKFLOW.md` §2 (2026-08-27 mechanics, LFS bullet) says, of this
container:

> Measured that day, in a fresh `git worktree add` off `origin/main` and in
> `/workspace/lockstate` side by side: **the worktree had the art and the primary
> checkout had the pointers.** […] `git lfs ls-files` names 62 paths and **0** of them
> were pointers in the worktree.

and gives the reason:

> `filter.lfs.smudge`, `filter.lfs.process` and `filter.lfs.required` are set in
> **`/etc/gitconfig`** […] So a checkout in this container runs the smudge filter,
> `git worktree add` included, and gets real bytes.

Measured today, in a worktree created by
`git worktree add /workspace/wt-agentaudit -b docs/audit-the-agent-contract origin/main`:

```
$ file public/assets/actors/actor.guard.base.idle.png
public/assets/actors/actor.guard.base.idle.png: ASCII text
$ file /workspace/lockstate/public/assets/actors/actor.guard.base.idle.png
/workspace/lockstate/public/assets/actors/actor.guard.base.idle.png: ASCII text
$ git lfs ls-files | wc -l
62
$ git lfs ls-files -n | while read -r p; do head -c 40 "$p" | grep -q "version https://git-lfs" && echo "$p"; done | wc -l
62
```

**62 of 62 are pointers, in both trees.** The reason the doc gives is inverted by one
flag it did not read:

```
$ cat /etc/gitconfig
[filter "lfs"]
	smudge = git-lfs smudge --skip -- %f
	process = git-lfs filter-process --skip
	required = true
	clean = git-lfs clean -- %f
```

The three keys *are* in `/etc/gitconfig`, exactly as the doc says. They are set with
`--skip`, which is the opposite of "runs the smudge filter and gets real bytes." The
doc's premise is true and its conclusion is false.

Four dependent sentences fall with it:

```
$ node tooling/validate-runtime-atlas.mjs public/assets/actors     # this is verify:assets
Invalid runtime atlas batch in /workspace/wt-agentaudit/public/assets/actors:
  - actor.cook.base.idle.png is a Git LFS pointer, not image data. …
  … ten such lines …
EXIT=1
```

against the doc's *"printed `Validated 10 clip atlases` and exited 0 there"*. The same
command exits 1 in `/workspace/lockstate` too, which is the half of that sentence that
still holds. And *"`app-shell.spec.ts`'s art test therefore has its bytes in a
worktree"* is false: it has no bytes in either tree.

**When it became false: cannot be dated from git, and that is the finding.**
`/etc/gitconfig` is not in this repository — the doc says so itself, in the paragraph
directly under the claim, and calls it *"an observation about one container's
filesystem, not a diagnosis"*. What can be dated is the writing: `75f47df8`,
2026-09-04 20:56:06 UTC, *"docs(workflow): the worktree has the LFS bytes here, and
the primary checkout has the pointers"*. It was false again within roughly twelve
hours.

**The doc's own durable advice survives intact and is the reason this cost nothing
today.** *"One command settles it and it is the same command either way: `file
public/assets/actors/actor.guard.base.idle.png`. `ASCII text` is a pointer; `PNG image
data, 260 x 3104` is the art."* Both literals are exactly right — the pull below
returned `PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced`. The bullet
predicted its own rot correctly and only the direction rotted.

**What is missing, and it is cheap:** the bytes are already on this container's disk.

```
$ cd <fresh worktree off origin/main>
$ file -b public/assets/actors/actor.guard.base.idle.png
ASCII text
$ git lfs checkout
Checking out LFS objects: 100% (62/62), 93 MB | 0 B/s, done.
$ file -b public/assets/actors/actor.guard.base.idle.png
PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced
$ node tooling/validate-runtime-atlas.mjs public/assets/actors
Validated 10 clip atlases in …
$ git status --short          # empty: the clean filter re-encodes, the tree stays clean
```

`0 B/s`, and `/workspace/lockstate/.git/lfs/objects` stayed at 39 files / 54 MB across
the run: **nothing was downloaded.** So in this container a fresh worktree is one
offline `git lfs checkout` away from real art, `verify:assets` green and a browser run
that draws actors — no `git lfs pull`, no metered bandwidth, no dirty tree. Neither
document says this. It is the single most useful sentence this pass produced and it is
in neither.

(`git lfs pull --include=<one path>` also works in a worktree — the doc's *"Running
`git lfs pull` inside a worktree fetches the blobs there, verified on 2026-08-28"* is
TRUE, verified again today. It is simply the expensive way round when the objects are
already local.)

### F2 — the #331 contention canary names the wrong file, and always did

§2:

> and `ui-shell.spec.ts` *"the Rooms panel says what a zoned room is missing … (#331)"*.

```
$ grep -rn "the Rooms panel says what a zoned room is missing" tests/browser/*.ts
tests/browser/app-shell.spec.ts:5660:  test('the Rooms panel says what a zoned room is missing, and says nothing when nothing is (#331)', …
$ grep -n "(#331)" tests/browser/ui-shell.spec.ts
4423:  test('says what a designated room is missing, and says nothing when nothing is (#331)', …
```

`ui-shell.spec.ts` has a #331 test; it is not that test and does not carry that
wording. The quoted title is in `app-shell.spec.ts`.

**When it became false: it was false when written**, `422245a9`, 2026-08-28.

```
$ git log -S "the Rooms panel says what a zoned room is missing" -- tests/browser/ui-shell.spec.ts
(empty — the string has never been in that file)
$ git show 422245a9:tests/browser/app-shell.spec.ts | grep -n "(#331)"
3680:  test('the Rooms panel says what a zoned room is missing, and says nothing when nothing is (#331)', …
$ git show 422245a9:tests/browser/ui-shell.spec.ts | grep -n "(#331)"
2786:  test('says what a designated room is missing, and says nothing when nothing is (#331)', …
```

An agent told to run this canary runs `ui-shell.spec.ts --grep "zoned room is
missing"` and gets nothing collected, which reads like the test was deleted.

### F3 — `app-shell.spec.ts:5247` rotted in 43 minutes

§2:

> `Test timeout of 60000ms exceeded` on `locator.click` at
> `tests/browser/app-shell.spec.ts:5247`

```
$ sed -n '5247p' tests/browser/app-shell.spec.ts
      ).toBeLessThanOrEqual(geometry.fold);
```

An `expect`, and it is now *above* the test the citation is about (`no room type in
the catalogue pushes the Rooms panel past its fold (#529)` opens at 5319). The clicks
that test makes are at 5352 and 5376.

**Correct when written; false 43 minutes later.**

```
$ git log -S "app-shell.spec.ts:5247" --format="%h %ai %s" -- docs/AGENT_WORKFLOW.md
4e9f6f8b 2026-09-04 21:26:30 +0000 docs(workflow): two more canaries, one that is not a canary at all, …
$ git show bc4b0851:tests/browser/app-shell.spec.ts | sed -n '5247p'   # 2026-09-04 19:15:26 UTC
      await page.locator(`.hud-rooms__rows [data-room="${roomId}"]`).click();
$ git show abd1d783:tests/browser/app-shell.spec.ts | sed -n '5247p'   # 2026-09-04 22:09:44 UTC
    await page.setViewportSize({ width: 1280, height: 720 });
```

`abd1d783` is *"test(browser): give the #529 fold sweep the budget it needs"* — the
commit the same doc paragraph describes as the fix. **The paragraph broke its own
citation in the act of recording the fix**, and did so in the same document whose §4
says *"A `file:line` into a document under active edit is the least durable citation
here"*. Its own worked example of that rule (`:1808`, false in one day) is beaten by
its own new citation by a factor of thirty.

### F4 — `regime-panel.ts:650`, and the "both still hold" correction is now half false

§2 (2026-09-02 mechanics, derived-string bullet):

> here `regime-panel.ts:650` passes `t(readout.badgeKey)` and `status-badge.ts:64`
> assigns it to `textContent`.

> The two render-site citations in the same bullet were re-opened at `98e05058` and
> both still hold.

```
$ grep -n "t(readout.badgeKey)" src/ui/hud/regime-panel.ts
1309:      row.badge.update({ tone: readout.tone, text: t(readout.badgeKey) });
$ sed -n '650p' src/ui/hud/regime-panel.ts
 * decision. A prisoner who has not reached the intake stage that mints one is
```

The sibling citation is fine — `sed -n '64p' src/ui/primitives/status-badge.ts` gives
`    label.textContent = next.text;`. So *"both still hold"* is now *"one still
holds"*.

**When it became false: `e8ae1087`, 2026-09-03 18:38:57 UTC** (moved 650 → 671).

```
$ for c in 6d8352a0 96ec6130 e8ae1087 f4239950; do
    echo "$c $(git log -1 --format=%ai $c) line=$(git show $c:src/ui/hud/regime-panel.ts | grep -n 't(readout.badgeKey)' | cut -d: -f1)"
  done
6d8352a0 2026-09-02 13:40:34 +0200 line=650
96ec6130 2026-09-03 16:38:18 +0000 line=650
e8ae1087 2026-09-03 18:38:57 +0000 line=671
f4239950 2026-09-05 01:26:47 +0000 line=1309
```

The citation was written at `f00c7d15` (2026-09-02 17:16:13) and re-affirmed at
`bc5f0075` (2026-09-03 01:43:24) against `98e05058`, where it genuinely was 650. It
survived **seventeen hours** past its own re-affirmation. The bullet it lives in is
the one that exists *because* a coordinate rotted in a day; the correction rotted
faster than the thing it corrected.

The bullet's non-coordinate half is entirely sound and was re-verified:
`grep -c "risk-tier" src/content/default-locale-en.ts` → `0`, while
`src/content/simulation-message-keys.ts:251,255` carries
`namespace: 'risk-tier'` with `labels: { 0: 'Minimal', 1: 'Low', 2: 'Medium', 3: 'High' }`.
So does its own archaeology: `git show f00c7d15:src/content/default-locale-en.ts | sed -n '1808p'`
returns `const derivedMessages = simulationEnumMessages();`, and at `f19b9ef2` it is
at 1822, exactly as recorded. **The fix the bullet chose — cite the symbol, not the
line — is the correct one, and it is the line it kept beside it that failed.**

### F5 — `scripts/wip-sweep.sh` covers 5 of this session's 54 worktrees

`AGENTS.md`:

> a coordinator runs `scripts/wip-sweep.sh` beside them instead of relying on them to

`AGENT_WORKFLOW.md`, "Nothing may exist only in the container":

> Every three minutes it pushes each agent worktree's committed work to its own
> branch, and snapshots **uncommitted** work to `wip/<branch>`.

The script filters by branch name:

```
$ grep -n 'case "\$b" in agent/' scripts/wip-sweep.sh
21:    case "$b" in agent/*) ;; *) continue ;; esac
```

Measured against this session:

```
$ git worktree list --porcelain | grep '^branch ' | sed 's#refs/heads/##' \
    | awk -F/ '{print $1}' | sort | uniq -c | sort -rn
     15 fix
      7 docs
      5 playtest
      5 agent
      4 research
      4 feat
      3 measure
$ git worktree list | wc -l
54
```

**Five worktrees of fifty-four are on an `agent/*` branch.** Every `fix/`, `docs/`,
`research/`, `feat/`, `measure/` and `playtest/` worktree — including the one this
note was written in — is skipped silently. Neither document states the precondition:

```
$ grep -n "agent/" AGENTS.md docs/AGENT_WORKFLOW.md CLAUDE.md
(no output)
```

**When it became false: from the first day.** `31f63131`, 2026-08-29 14:22:58, is one
commit that added both the filter and the paragraph describing it. The mechanism the
section calls *"a bounded loss window — three minutes — that does not depend on […]
any of them behaving correctly"* has, since it was written, depended on a naming
convention neither document names.

Two smaller inaccuracies in the same paragraph: the ref is
`refs/heads/wip/${b#agent/}`, so `agent/foo` snapshots to `wip/foo`, not
`wip/agent/foo` as `wip/<branch>` reads; and *"pushes each agent worktree's committed
work"* is `git push -q origin "$b"` with stderr discarded, so a rejected push is
indistinguishable from a successful one from outside. `sleep 180` is correct.

### F6 — `tests/contract` is missing from the list of what `vitest run` collects

§2:

> `./node_modules/.bin/vitest run` collects `tests/unit`, `tests/integration`,
> `tests/foundation`, `tests/determinism` and `tests/migrations` — **not**
> `tests/browser`

```
$ node node_modules/vitest/vitest.mjs list | sed 's#^tests/\([a-z]*\)/.*#\1#' | sort | uniq -c | sort -rn
   3323 unit
    572 integration
    483 foundation
    180 determinism
     86 contract
     85 migrations
```

`tests/contract` — 9 files, 86 tests — is collected and unlisted. `vitest.config.ts`
includes `['src/**/*.test.ts', 'tests/**/*.test.ts']`, so the enumeration is a
directory list standing in for a glob: exactly the "count or closed set" form §4 says
rots first.

**When it became false: it was false when written.** The sentence is `e0ca2bd5`,
2026-09-02; the first file under `tests/contract/` is `7cd6384e`, 2026-08-22.

The bullet's actual point — `tests/browser` is not collected, and "the full suite is
green" is the sentence that let a regression through — is **true and unaffected**;
`tests/browser` holds 46 `*.spec.ts` and 0 `*.test.ts`.

### F7 — "three of its siblings" were seven

§2, on the #529 fold sweep:

> three of its siblings in this same file already carry it and this was the odd one out

```
$ grep -c "test.slow();" tests/browser/app-shell.spec.ts
8
$ git show 4e9f6f8b:tests/browser/app-shell.spec.ts | grep -c "test.slow();"
7
$ grep -n "^test.describe" tests/browser/app-shell.spec.ts
2553:test.describe('the assembled application', () => {
```

One `describe` block, so all of them are siblings. When the sentence was written
(`4e9f6f8b`, 2026-09-04 21:26:30) seven tests already carried `test.slow()`, and
`#529`'s was not among them — it was added at `abd1d783` 43 minutes later, taking the
count from 7 to 8. **False when written**, and by four rather than by drift.

The finding the sentence supports is otherwise verified: `test.slow()` is at
`app-shell.spec.ts:5346` inside the #529 test today, and `playwright.config.ts` sets
`timeout: 60_000`.

### F8 — `AGENTS.md`: the telemetry migration is no longer owed

`AGENTS.md`, reservation 1:

> **What was not released, and is still owed.** Items 2 and 3 below are untouched, and
> the ingest needs both before it stores anything: the `telemetry_events` table, its
> insert function and the dedicated least-privilege database role are
> `supabase/migrations/` […]

```
$ ls supabase/migrations/ | tail -1
20260904090000_create_telemetry_events.sql
$ grep -n "create table if not exists public.telemetry_events\|create role telemetry_ingest" \
    supabase/migrations/20260904090000_create_telemetry_events.sql
152:    create role telemetry_ingest nologin noinherit;
203:create table if not exists public.telemetry_events (
$ git log --diff-filter=A --format="%h %ai %s" -- supabase/migrations/20260904090000_create_telemetry_events.sql
b63919f9 2026-09-04 17:29:37 +0000 feat(supabase): the telemetry ingest destination ADR 0046 needs
```

The table, the insert function and the `telemetry_ingest` role are all in the tree.
The sentence was written at `b2aaa3f1`, 2026-09-03 15:28:59 +0200; **it became false
at `b63919f9`, 2026-09-04 17:29:37 UTC** — about 26 hours.

This matters more than a stale sentence usually would, because it is inside the
paragraph that tells an agent *what the owner still owns*. An agent reading it today
is told a migration is outstanding that landed yesterday, and may go looking for
authorisation it does not need or re-propose work already merged.

### F9 — and the conclusion that hangs off it now holds for a different reason

Same paragraph:

> Until those land the endpoint refuses every batch, which is why merging the entry
> point changes no behaviour on `lockstate.io`.

The **conclusion is still true** and the **stated reason is now half false**. What
makes the endpoint unreachable today is not the missing migration but the missing
binding:

```
$ grep -o "LOCKSTATE_TELEMETRY[A-Z_]*" src/worker/*.ts | sort -u
src/worker/index.ts:LOCKSTATE_TELEMETRY_INGEST_PATH
src/worker/telemetry-ingest-route.ts:LOCKSTATE_TELEMETRY_INGEST_PATH
```

`resolveTelemetryIngestRoute` returns `undefined` when that binding is absent, and
every request falls through to Static Assets untouched. It is counted as its own
finding because a reader who checks the premise, finds it false, and concludes the
endpoint is therefore *live* would be wrong — the safe conclusion survives its broken
reason, which is the most dangerous shape a half-false sentence can take.

(`AGENTS.md`'s *"the two Worker variables that would configure a destination are
deploy configuration"* is **not** a finding: `docs/DEPLOYMENT.md:410` names those two
as still owed and distinguishes them from the client pair
`LOCKSTATE_TELEMETRY_INGEST_PATH` / `LOCKSTATE_TELEMETRY_ENVIRONMENT`. The worker
holding one binding today is consistent with both documents.)

### F10 — `AGENTS.md` line 3 is violated by `CLAUDE.md`

> `CLAUDE.md` and `.agents/rules/` must point back to these rules instead of diverging
> from them.

`.agents/rules/lockstate.md:3` complies exactly: *"Read `/AGENTS.md` first. It is the
canonical operating contract."* `CLAUDE.md` does not — see F11 and F12, which are its
two divergences. This is recorded as its own finding because it is the *contract's own
compliance clause*, and nothing in the repository checks it.

### F11 — `CLAUDE.md` inherits F8

> and so are the other three exclusions — **including the migration the ingest needs
> before it can store anything**.

Same command as F8. False since 2026-09-04 17:29:37 UTC. `CLAUDE.md` has not been
edited since:

```
$ git log -1 --format="%h %ai" -- CLAUDE.md
b2aaa3f1 2026-09-03 15:28:59 +0200
```

### F12 — `CLAUDE.md` does not carry the 2026-09-04 release of exclusion 4

`CLAUDE.md` lists the four exclusions as *"a server entry point,
`supabase/migrations/`, deploy configuration, and any player-visible promise the code
does not keep"*, notes that the **first** was released on 2026-09-03, and says of the
rest *"so are the other three exclusions"*.

`AGENTS.md` released half of the fourth the next day:

```
$ git log -S "Partly released by the owner on 2026-09-04" --format="%h %ai %s" -- AGENTS.md
3ecb2e36 2026-09-04 05:44:07 +0000 docs(agents): record the owner's rulings of 2026-09-04, including a partial release of reservation 4
```

Under that release the **choice of words is ours** — *"Sam decyduj zawsze"* — and only
the requirement that a sentence be true is reserved. An agent that reads `CLAUDE.md`
and stops (which is what a Claude Code session does by default: `CLAUDE.md` is the
file the harness injects) will bounce every player-visible string back to the owner,
which is exactly the bottleneck the owner removed. **This is the most operationally
expensive of the thirteen.**

False from `3ecb2e36`, 2026-09-04 05:44:07 UTC — CLAUDE.md was already 14 hours stale
when the ruling landed.

### F13 — heading citations that no longer resolve by grep

`CLAUDE.md`: *"`AGENTS.md`'s section \"The owner's standing mandate\""*.
`AGENT_WORKFLOW.md` §1: *"(`AGENTS.md`, \"The owner's standing mandate\")"*.

```
$ grep -n "^## The owner's standing mandate" AGENTS.md
54:## The owner's standing mandate, and the four things it does not cover
```

Both cite a prefix of the heading rather than the heading. Minor, and grouped here
rather than split, because the same failure appears twice and has one cause: a heading
that grew a subordinate clause after two documents had quoted its first half. Worth
recording only because §4's own rule is *"cite prose by quoting it"*, and a quoted
half-heading is a quotation that `grep -F` cannot find.

---

## 3. False-when-written is a different disease from rot

Four of the thirteen — F2, F5, F6, F7 — were false at the moment they were committed.
`AGENT_WORKFLOW.md` §3 already names this (*"A claim can be false the day it is
written"*), and §4's diagnosis fits all four: every one is a **count, a set, or an
attribution** — "three siblings", "five directories", "zero pointers", "in
`ui-shell.spec.ts`". None is a claim about behaviour; all four behavioural claims in
the same bullets are still true.

The pattern is worth stating because it changes what a future pass should check
first. **Rot is found by re-running commands. False-when-written is found only by
running the command the author did not run** — and in all four cases that command is
under ten seconds:

| finding | the ten-second command the author did not run |
| --- | --- |
| F2 | `grep -rn "<the quoted title>" tests/browser/` |
| F5 | `grep -n 'case "$b" in' scripts/wip-sweep.sh` |
| F6 | `vitest list \| cut -d/ -f2 \| sort -u` |
| F7 | `grep -c "test.slow();" <the file>` |

---

## 4. What could not be resolved, and why

Twenty-one claims. This list is offered as a result, not an apology: it is the
boundary of what a container-bound pass can establish about these documents.

**Rate-limited (GitHub API exhausted mid-pass — 6).** `AGENTS.md`'s *"Four such
sentences were waiting when the release came (#901, #903, #904, #893)"* — not read.
`AGENT_WORKFLOW.md`'s *"#772 … reported `378/378 files, 4365 passed`"*, *"CI's
`browser` job then failed 3 of 318"*, *"three `app-shell.spec.ts` tests … (#89, #261,
#220)"*, *"`main`'s `browser` job at `198fc120` … 14m07s"*, and the whole
`mergeable_state`/`dirty` bullet. **#913 was read before the limit and is TRUE**: the
FUNDS badge does assert the state owes a prison money it does not owe, verbatim in the
issue and cited to `src/content/default-locale-en.ts:273`.

**Needs an idle machine, which this container never was (5).** The box carried another
agent's full `vitest run` throughout
(`ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"` was never empty; load
average 4.3–5.1). So: *"the #88 sweep passes at 2.9m against the 3.0m"*, *"all three
pass on `main` — `3 passed (3.4m)`"*, the #411 pair's *"passes in 6.7 m"*, *"`1 passed
(1.9m)`"* for #529, and *"identical clean trees gave 9, 5 and 5 failures"*. Under the
document's own rule these cannot be claimed either way from here.

What *was* obtained on the near-budget pair is a non-falsification rather than a
confirmation: `comment-symbol-existence-contract.test.ts` + `prisoners-sentence.test.ts`
together gave `10 passed`, `Duration 3.45s` at load 5.09, and `prisoners-sentence`
alone gave `7 passed`, `Duration 2.03s` at load 4.31. The *count* the doc records
(`7 passed`) is exact. The 5.2 s / 6.8 s figures are conditional on load and were not
reproduced; the claim is not falsified.

**Historical, and the evidence is not in the tree (7).** *"Eight agents ran in parallel
that day"*; *"Two agents took `0034` within an hour"*; *"ADR 0045's refusal turned
about 104 tests red in 16 files"*; *"`1 failed, 245 passed`"* and *"all 246 tests in
the file"*; *"A stray probe has broken `pnpm verify` collection more than once"*;
*"three runs … 829, 842 and 847"*; *"`grep -c WebServer` over the uploaded
`browser-suite.log` returns 0"*.

**Hosted state this repository cannot read (2).** *"`lockstate.io` is attached by hand
to that Worker"* and *"two merges … across the two self-hosted runners"*. Both are
covered by §3's *"Ask about state this repository cannot read"* and by
`docs/DEPLOYMENT.md:368`'s *"not reproducible from this repository"* — which is
verbatim correct. Unresolvable **by design**, not by omission.

**Deliberately not run (1).** The `until ! ps … | grep -q "[p]laywright/test/cli"; do
sleep …; done` deadlock. Running it to confirm would hang this pass, which is the
claim. It is nevertheless **confirmed incidentally**: the plain `ps` invocation in this
pass returned its own `bash -c` wrapper as a match, because that wrapper's command
line contains the bracketed pattern. The mechanism is exactly as described.

---

## 5. The three questions

### Do the two documents agree with each other?

**Yes, on everything checked, with one gap and one asymmetry.**

Every cross-quotation resolves. `AGENT_WORKFLOW.md` quotes `AGENTS.md` verbatim —
*"A number is not reserved until it appears in `docs/adr/README.md`."* is `AGENTS.md:47`
word for word — and `AGENTS.md`'s six-bullet summary of the method matches §2 and §3
in substance (*"takes its own git worktree before it touches anything"* against §2's
*"gets its own git worktree as its first action"*; *"never self-approve"* against §3).
Both state the precedence rule identically and in the same direction. `AGENTS.md`:
*"Where they disagree, this file wins."* `AGENT_WORKFLOW.md`: *"Where the two
disagree, `AGENTS.md` wins."*

**The gap:** `AGENTS.md` distils §2 into six bullets and drops the environment
mechanics entirely — LFS, `ERR_PNPM_UNSAFE_MODULES_DIR`, the missing `node_modules`,
the vitest/jsdom boundary. That is defensible (contract vs. method) but it means the
traps live in exactly one place, and an agent briefed on the contract alone hits every
one of them.

**The asymmetry:** `AGENT_WORKFLOW.md` is amended in place with dates and both
directions marked. `AGENTS.md` is amended the same way. `CLAUDE.md` is not amended at
all — see below. The two audited documents keep each other current; the third is a
copy that nothing updates.

### Does `CLAUDE.md` agree with them both?

**No — it is two rulings behind, and both gaps point the same way: toward asking the
owner for permission that has already been given.** F11 (the migration is no longer
owed) and F12 (the wording of player-visible strings is ours since 2026-09-04). Its
eight falsifiable claims are otherwise sound: the four exclusions are named correctly,
the 2026-09-03 release is described accurately and narrowly, and its
project-specific rules (ADRs as source of truth, propose an ADR rather than deciding
in implementation code) restate §3 faithfully.

The structural problem is that `CLAUDE.md` **paraphrases** `AGENTS.md` where
`.agents/rules/lockstate.md` merely **points at** it. A pointer cannot go stale; a
paraphrase of a document amended twice in eight days always will. `AGENTS.md:3`
already forbids the divergence and nothing enforces it — `tests/foundation/` has
contracts for ADR numbering, verbatim quotation, browser-suite partitioning and
comment-symbol existence, and none for this.

### What does an agent need that it does not have?

**The vitest/jsdom trap is documented and correct.** §2: *"`vitest.config.ts` sets
`environment: 'node'` and there is no jsdom. Code that touches `document` is therefore
unreachable from `pnpm test` at all — not merely untested. A mutation there survives
because nothing could observe it."* Verified: `environment: 'node'` in
`vitest.config.ts`, and `grep -rn "jsdom\|happy-dom" package.json vitest.config.ts`
returns nothing. `orderPrisonsForDisplay` exists in `src/ui/save-panel.ts`, as the
bullet says.

One refinement, since the brief named `src/ui/hud/hud.ts` specifically:
`grep -c "document\." src/ui/hud/hud.ts` returns **0** — the file creates DOM through
`element()` from `src/ui/primitives/dom.ts` — and nine test files under `tests/`
(eight in `tests/unit`, one in `tests/foundation`) name it. But `grep -rn "mountHud" tests/ --include=*.test.ts` finds it only in comments and
type positions: **no unit test calls `mountHud`**, so the conclusion the brief drew is
right for a slightly different reason. A mutation inside `mountHud` survives because
nothing invokes it, not because `document` is missing.

**The LFS trap is documented and currently backwards** — F1, and it is the one that
costs a browser run. What is missing is not a warning but the *remedy*: `git lfs
checkout` in a fresh worktree, 62 files, `0 B/s`, no network, tree stays clean,
`verify:assets` green. Neither document says the objects are already local.

**Four more this pass paid for that neither document mentions:**

1. **`git worktree add` gives no `node_modules`** is in §2, and correct. What is not
   said is that `pnpm exec` in a worktree fails *even after* the symlink is made — the
   symlink is what triggers `ERR_PNPM_UNSAFE_MODULES_DIR`, not what fixes it.
   Reproduced verbatim today: *"Refusing to remove the modules directory at
   `/workspace/lockstate/node_modules` because its resolved target is not a strict
   subdirectory of the project root."* The two bullets read as cause and cure and are
   in fact the same fact twice.
2. **`playwright.config.ts` carries `testIgnore: /production-artifact\.spec\.ts$/`.**
   §2 says the config *"matches only `/.*\.spec\.ts$/`"*, which is true of `testMatch`
   and incomplete about the config: one spec in `tests/browser/` is deliberately not
   collected by it (it runs under `playwright.artifact.config.ts` against `dist/`).
   An agent auditing browser coverage from §2 alone will conclude that spec is dead.
3. **`wip-sweep.sh` will not save you unless your branch is `agent/*`** — F5. Given
   *"Nothing may exist only in the container"* is a rule in both documents, this is the
   gap most likely to cost real work.
4. **`git lfs ls-files` names 62 paths but `.git/lfs/objects` holds 39 files / 54 MB.**
   Several paths share content. Any future count-based LFS check should count pointers
   in the working tree, not objects in the cache.

**And one thing both documents get exactly right and should keep:** the `file` check.
It was written as a direction-free command precisely because the direction was expected
to rot, and it rotted, and the command still answered correctly the first time this
pass ran it. That is the only claim in either document that survived being wrong.

---

## Weakest claim, and what would change my mind

**The inventory counts.** The falsifiable/non-falsifiable split is a judgement made
sentence by sentence, and a different reader would move perhaps a dozen either way —
`AGENTS.md`'s architectural boundaries in particular were counted as non-falsifiable
rules, though most carry a checkable descriptive half. The **thirteen FALSE findings
are not a judgement**: each has a command in this note and each was run in this
container today. If the counts are wrong the findings are unaffected, which is why the
findings are given individually and the counts only in aggregate.

**What would change my mind on F1:** a different container. `/etc/gitconfig` is not in
this repository, so the direction I measured is a property of this image and not of
Lockstate. If the next image ships `smudge = git-lfs smudge -- %f` without `--skip`,
the doc's 2026-09-04 sentence becomes true again and this finding becomes a third
entry in the same bullet's history. The durable claim is not the direction — it is
that **neither document tells an agent the objects are already on disk**, and that is
true in every direction.

**What would change my mind on the "false-when-written" classification (§3):** for F6
and F7 the git evidence is decisive. For F2 the string search over
`tests/browser/ui-shell.spec.ts` is exhaustive across history and I am confident. For
F5, the reading turns on whether "each agent worktree" was meant to describe the
`agent/*` convention rather than agents in general; the integrator who wrote it could
settle that in one sentence, and if the convention was meant, the finding becomes
"undocumented precondition" rather than "false", which is a smaller claim but the same
fix.
