# Claude Code instructions for Lockstate

`AGENTS.md` is the canonical agent contract for this repository and MUST be read before implementation work.
`docs/AGENT_WORKFLOW.md` is the operating method that accompanies it — how work continues across sessions, how it is split across several agents, and what evidence a finding needs. Read it before dispatching agents.

`AGENTS.md`'s section "The owner's standing mandate, and the four things it
does not cover" is the posture every agent works under: decide after research
rather than asking, quality over cheapness, cost is not a constraint — and four
exclusions that stay the owner's (a server entry point, `supabase/migrations/`,
deploy configuration, and any player-visible promise the code does not keep).
Read it before deciding whether a question is yours to answer.

**This file paraphrases `AGENTS.md` and therefore rots when `AGENTS.md` moves.
It has done so twice, both times in the direction of asking for permission the
owner had already given, which is the expensive direction.** What follows is
correct as of 2026-09-05; `AGENTS.md` is the contract and wins wherever the two
differ.

> **FIVE TIMES, AND THE SENTENCE ABOVE IS ITSELF ONE OF THEM. Corrected
> 2026-09-12; the original is kept because a file that miscounts its own
> mistakes is the best available demonstration of why it should not be
> trusted over `AGENTS.md`.**
>
> **The date stamp was wrong by five days, refuted by this file's own
> headings.** *"Correct as of 2026-09-05"* — and the paragraphs below it are
> dated 2026-09-06, -07, -08, -09 and -10. No diff finds that;
> `docs/AGENT_WORKFLOW.md` §4's *"reading a file's own headings against each
> other"* finds it in a minute. **Correct as of 2026-09-12**, and this is the
> line the next editor must touch.
>
> **The count contradicted itself in three places.** *"twice"* here,
> *"the third time"* below, *"three recorded mistakes"* further down. A tally
> is the sentence form §4 says rots first, and this one rotted inside the file
> that quotes the rule. **Five**, listed so the number stops being the claim:
> the three this file already records, plus the two found on 2026-09-12 — the
> stale CI pool below, and this stamp.
>
> **And the self-description no longer holds either.** *"Both times in the
> direction of asking for permission"* was true of the first errors and is not
> true of the new ones: a stale runner pool and a stale date are wrong about
> **measurements**, not about permission breadth. Both directions are now on
> the list, so neither is the one to watch for.
>
> **SIX, AS OF 2026-09-19, AND THE PARAGRAPHS ABOVE ARE LEFT SAYING FIVE.** The
> sixth is the *"reservation 4"* miscount corrected further down, where
> `supabase/migrations/` — **reservation 2** in `AGENTS.md`'s numbering — is
> called reservation 4. It arrived by the same route as the fourth and the
> fifth: a number written once and never re-read against the document this file
> paraphrases, so it is a miscount rather than a claim about permission breadth,
> and the *"both directions"* sentence above still holds with two on one side
> and four on the other. **Correct as of 2026-09-19**, which supersedes the
> stamp above under that paragraph's own instruction that the stamp is the line
> the next editor must touch. The tally is kept in this append-only shape
> deliberately: a tally rewritten in place is a tally whose earlier values
> nobody can see, and those values are the whole evidence that this file should
> not be trusted over `AGENTS.md`.

**The first of those four was released on 2026-09-03, narrowly.** The owner
authorised the one `main` and the one Worker module that carry ADR 0046's
telemetry ingest, in their own words and dated, in that section. Nothing else
about server-side execution moved: a second route or any server behaviour that
is not that ingest is still theirs.

**The fourth was partly released on 2026-09-04:** the CHOICE OF WORDS in a
player-facing string is ours; the requirement that the sentence be TRUE is not.
Quote every string you author verbatim in the commit message and in the pull
request body, beside the code that proves it true.

**A THIRD RELEASE LANDED ON 2026-09-06, AND IT IS THE FIRST INSIDE
RESERVATION 3.** The owner authorised ONE change in `.github/workflows/ci.yml`
— extending the `browser` job's LFS include filter and its decode assertion to
the path ADR 0100 defines — in their own words and dated, in that section.
Nothing else in that file moved: not a second job, not `deploy.yml`, not
`wrangler.jsonc`, not `public/_headers`, and neither dashboard. It was released
because the decode step fails closed on any sprite published outside
`public/game-content/source-art/`, which put the fix for object art inside a
reserved file.

**A FOURTH RELEASE LANDED ON 2026-09-07, AND IT IS THE SECOND INSIDE
RESERVATION 3.** The owner authorised THREE GLOB SEGMENTS appended to the
`browser` job's `git lfs pull --include=` list in `.github/workflows/ci.yml` —
in their own words and dated, in `AGENTS.md` — and nothing else in that file.

**The paragraph above is kept rather than corrected, because its last clause is
where the mistake lives and a reader should see it.** It says the decode step
fails closed on any sprite published outside a *path*, which is true and is the
half that is generic. What it does not say, and what the integrator assumed on
its authority when briefing an agent, is that the `--include=` filter beside
that step is a **literal list of specific globs rather than a pattern over
them** — so every new rendered sprite must be named there individually or CI
fetches an LFS pointer and the decode step fails on it. The agent read the file
and refuted the brief. **That is the third time this file's paraphrase has cost
something, and the second time in the direction of believing a permission was
broader or narrower than it is.** `AGENTS.md` carries the full reading.

**A FIFTH RELEASE LANDED ON 2026-09-08, AND IT IS THE THIRD INSIDE
RESERVATION 3 — the first of them that is not about art.** The owner
authorised raising the `browser` job's own `timeout-minutes` from 30 to 90 in
`.github/workflows/ci.yml`, and nothing else in that file: not `verify`'s 30,
not `assets`'s 20, not the evidence upload's `if: failure()`, not the runner
selectors. It was released because the job stopped finishing — the same 420-test
suite ran 13m 00s green on one runner pool and was cancelled at 29m 44s having
reached 46 tests on another, with the same six-fold slowdown measurable on
`pnpm verify` outside Chromium entirely.

**Its provenance is weaker than the two before it and `AGENTS.md` says so.**
The 2026-09-06 and 2026-09-07 releases quote words the owner typed; this one
quotes the label of a clickable option this session wrote and the owner chose.
Read the full entry before treating it as a precedent for anything.

**And it is necessary, not sufficient — which the owner was told before
choosing it.** Four browser specs exhaust `test.slow()`'s own 180-second
per-test cap and fail rather than cancel; a larger job budget lets the job
report them instead of dying mid-suite. It does not make them pass.

**THAT PARAGRAPH IS WRONG AND THE CORRECTION IS IN `AGENTS.md`.** The first
`browser` job ever allowed to finish on this pool (run 34215508642) reported
**422 passed, 1 failed in 41.3 minutes**. Only `#331` exhausts the per-test
cap; `#88` and both `#411` specs pass in 2.4-2.6 m. The four-red picture came
from a job cancelled at test 46 of 420 on a saturated pool, and a starved
partial run is not a sample of a finished one. `AGENTS.md` carries five further
corrections to that entry's figures, including that the runner is
`woogitsu-linux-03` rather than `woogitsu-host-03` (the log path shows the
install directory, the API shows the name) and that the slowdown is about **4x**
rather than the 6 quoted from three hand-picked samples.

**AND THE ONE FAILURE THAT PARAGRAPH KEPT IS WRONG TOO, BOTH HALVES OF IT.**
`#331` is **intermittent** rather than a standing red: the second finished
`browser` run (34251663361), on the same unmodified base commit, reported
**`423 passed (39.5m)`** with `#331` among them -- red on `woogitsu-linux-02`,
green on `woogitsu-linux-03`. And `app-shell.spec.ts:6119` is where the clock
stopped, not where the time went: the retained trace prices that call at
**0.12 s** and puts **69%** of the 180 s in the keyboard wall-ordering loop
much earlier. Finishing a job once settles its failure list once.

**AND THE HOST READING THAT PARAGRAPH INVITES IS WRONG TOO — `AGENTS.md`
CARRIES THE SEVENTH CORRECTION AND THE CLOSE.** A fourth run went green on
`woogitsu-linux-02`, the host of both reds, so the host is not the variable;
the fastest suite of the four (35.6m) is the one where `#331` came closest to
the cap, so load is not either. Read out of the logs, `#331` sat **at or over
its 3.0-minute cap on three of the four runs** while its neighbours held
1.5-2.7m and the file moved under 3% — the variance was the test's own.
**#1093 fixed it** (merged `8a35167b`): `#331` **1.5m** on the next finished
run, `app-shell.spec.ts` 21.3m → 18.6m.

**AND EVERY RUNNER NAME AND EVERY TIMING ABOVE IS FROM A POOL CI NO LONGER
RUNS ON — this file never received `AGENTS.md`'s correction of 2026-09-10, and
that is the fourth of the five mistakes the preamble now counts.** It is the
first that is wrong about a *measurement* rather than about the breadth of a
permission.

`AGENTS.md`'s entry reads `runner_name` off the API: the pool is
**`lockstate-wsl-DOM-NEW-01`, `-02` and `-03`**, the runner user is
**`mateusz`** rather than `matma`, and whether it grants passwordless sudo is
**untested** rather than known-absent. Read every `woogitsu-linux-*` figure
above as history.

**Dated to the minute, because the gap is the lesson.** `dbd70cff` added that
correction to `AGENTS.md` at 2026-09-10 14:00:12Z and did not touch this file;
this file's own last commit before the correction was `f95c2d9f`, 11:25:01Z the
same day.

**Re-measured 2026-09-12 on the pool that is actually serving**, off the job
logs of PR #1147 (runner path `/home/mateusz/actions-runner-lockstate-01/`):
the whole `browser` suite is **16.6m** for 429 tests, and a green run the same
morning took **18.3m**. Against the 35.6–42.0 minutes `AGENTS.md` records for
finished runs on the retired pool, that is **roughly half** — so the
90-minute budget has far more headroom than the 2026-09-08 entry assumes, and
any argument resting on "the suite needs ~40 minutes" is resting on the old
pool.

**One sentence in this block is no longer history and is checkable rather than
measured by hand: every `runs-on:` in every workflow reads the bare
`self-hosted` selector, not a label list naming a pool.** Checked directly,
2026-09-13: `grep -rn "runs-on" .github/workflows/` returns ten job selectors
(plus four comment lines that only discuss the setting) across six workflow
files, and every one of the ten is `self-hosted` — none names
`woogitsu-*`, `lockstate-wsl-DOM-NEW-*`, or any other label. That is now pinned
by `tests/foundation/ci-configuration-contract.test.ts`'s "runner selector
contract" (`describe('runner selector contract'` at
`tests/foundation/ci-configuration-contract.test.ts:2881`), added on the
owner's instruction of 2026-09-13 — *"runnery to po prostu self hosted i tak
ustaw wszędzie"* ("the runners are just self-hosted, set it that way
everywhere"). So the runner **names** above (`woogitsu-linux-03`,
`lockstate-wsl-DOM-NEW-01/-02/-03`, `mateusz`) stay history exactly as this
block already says; the **selector** stops being something a reader has to
take on faith, because a label list or a hosted runner added to any workflow
now fails that test.

**A SIXTH RELEASE LANDED ON 2026-09-09, AND IT IS THE FOURTH INSIDE
RESERVATION 3 — the first that adds a gate rather than widening or resizing
one.** The owner authorised ONE step in `.github/workflows/ci.yml`'s `verify`
job, running the `tests/perf/` measurement harness through its own Vitest
config (#1083), and nothing else in that file: not a second step, not a second
job, not any `timeout-minutes`, not the runner selectors, not `deploy.yml`. It
was released because that harness had a config nothing invoked — no script, no
CI step — so 35 passing tests were read by `tsc` and executed by nobody.

**Its provenance is the weaker kind, exactly as the 2026-09-08 release's is,
and `AGENTS.md` says so in both entries.** This one quotes the label of a
clickable option the integrator wrote and the owner chose — *"Dodaj bramkę w
CI"* — not a sentence they typed. Read the full entry before treating it as a
precedent for anything, and note that the harness's own config is load-bearing:
on the root `vitest.config.ts`'s `testTimeout: 5_000` the same 35 assertions go
red on time rather than on anything about the code — six of them when #1083 was
filed, 12 when re-measured with `--testTimeout=5000` on a loaded container.

**A SEVENTH RELEASE LANDED ON 2026-09-10, AND IT IS THE FIFTH INSIDE
RESERVATION 3 — the first that buys a sentence rather than a behaviour.** The
owner authorised ONE `command -v python3` guard line in
`.github/workflows/branch-gc.yml`, in front of the heredoc already there, and
nothing else in that file or any other workflow. Provenance is the weaker
kind again — the label of a clickable option (*"Zrób obie linijki"*), not
words they typed.

**Its own entry in `AGENTS.md` records that the question carried a false
premise, and that is the part to read.** The option said "both lines" because
the question named `branch-gc.yml` AND `delete-branches.yml` as two workflow
files needing a guard. `delete-branches.yml` contains no `python3` at all —
it runs `bash deletebranches.sh`, and #1089's audit row cites
`deletebranches.sh:107`. The second guard therefore went into a shell script,
which was ours already and needed no release. **The owner authorised more than
was required, and only half of it was used.**

**The provenance of that error is worth naming precisely, because this file
has a habit of collecting blame it has not earned.** The false premise did
not come from this document — it came from a running session's own carried
notes, restated across three context handovers without being re-read against
the two files it described. So it is the same *failure mode* this file's
three recorded mistakes are (a paraphrase outliving the thing it paraphrased)
arriving by a different route, and the useful difference is that it was
caught **before** the edit rather than after: the check that found it was
opening the two files named in the permission, immediately after the
permission was given and before spending it.

**This clause read "and so are the other three exclusions — including the
migration the ingest needs before it can store anything", and both halves of
that are now wrong.** The telemetry migration landed on 2026-09-04
(`supabase/migrations/20260904090000_create_telemetry_events.sql`), and
reservation 4 is no longer whole. `supabase/migrations/` itself is still the
owner's: that migration was authorised one at a time, not as a category.

> **"RESERVATION 4" IS WRONG AND THE NUMBER IS `2` — the sixth mistake this
> file records against itself, and the second in a row that is a miscount
> rather than a claim about permission breadth.** Corrected 2026-09-19; the
> sentence is kept because a file whose whole argument is that it rots should
> show the rot rather than describe it.
>
> `supabase/migrations/` is **reservation 2** in `AGENTS.md`'s own numbering,
> and reservation 4 is the player-promise one, whose partial release of
> 2026-09-04 this file already records separately and for an entirely different
> reason (the paragraph beginning *"The fourth was partly released"*). So the
> sentence as written says the telemetry migration dented the player-promise
> reservation, which it did not and could not.
>
> **The clause it corrects makes the intended reading legible, which is how the
> ambiguity is settled rather than split.** It is quoting *"the other three
> exclusions"* — items 2, 3 and 4 as a set, that set being what the 2026-09-03
> release of item 1 left — and saying that set is no longer whole. That is a
> true sentence about a **set of three**, and it was written as a false one
> about **item 4**. Both readings were on the table in
> [#1149](https://github.com/woogitsu/lockstate/issues/1149) §5, which asked the
> owner to choose between them; they do not need to, because the clause being
> corrected is in the same sentence and settles it.
>
> **`AGENTS.md` is the document that cannot be misread here and it is the one to
> open.** Its reservation 1 entry says of this same migration, in bold, *"Item 2
> was not thereby released"* — the number, the scope and the limit in one line.
> Nothing about reservation 4 moved on 2026-09-04 except the wording release
> this file records elsewhere.

## The 2026-09-13 visual identity delivery — a pointer, not a summary

A full new visual identity, HUD direction and twenty-article product
constitution was delivered by the owner on 2026-09-13. It is vendored verbatim
at `docs/design/2026-09-13-identity-v5/` and is never edited there.

This paragraph is not the source and is not trying to be: given this file's own
history above, treat nothing here as authoritative about the delivery's
content. The three documents that are the source, in the order to read them:

1. `docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md` — **Accepted
   by the owner on 2026-09-13, in five rulings**, two of them against the
   document's own recommendation. It was `Proposed` for part of that day and
   this list said so; the Status block keeps both states, and it is the block to
   read rather than any summary of it, including this one.
2. `docs/VISUAL_IDENTITY.md` — the repository's reading of what binds, what
   does not, and the measured gap against today's `src/ui/` code.
3. `docs/IDENTITY_V5_ROLLOUT.md` — the staged plan for getting there.

**Read `docs/VISUAL_IDENTITY.md` before making any change under `src/ui/`.** It
is the thing to check a UI change against, not this file.

Additional Claude-specific rules:
- Use repository docs and ADRs as the source of truth.
- Prefer small reviewable commits tied to GitHub Issues.
- Do not invent replacement architecture when an ADR already exists.
- When an issue affects simulation determinism, persistence format, worker boundaries, rendering architecture, security, or deployment, inspect the relevant architecture document first.
- If a necessary architectural decision is genuinely absent, create or propose an ADR instead of silently deciding inside implementation code.
- Do not trade correctness or maintainability for reduced token usage or fewer tool calls.
