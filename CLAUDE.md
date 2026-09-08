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

**This clause read "and so are the other three exclusions — including the
migration the ingest needs before it can store anything", and both halves of
that are now wrong.** The telemetry migration landed on 2026-09-04
(`supabase/migrations/20260904090000_create_telemetry_events.sql`), and
reservation 4 is no longer whole. `supabase/migrations/` itself is still the
owner's: that migration was authorised one at a time, not as a category.

Additional Claude-specific rules:
- Use repository docs and ADRs as the source of truth.
- Prefer small reviewable commits tied to GitHub Issues.
- Do not invent replacement architecture when an ADR already exists.
- When an issue affects simulation determinism, persistence format, worker boundaries, rendering architecture, security, or deployment, inspect the relevant architecture document first.
- If a necessary architectural decision is genuinely absent, create or propose an ADR instead of silently deciding inside implementation code.
- Do not trade correctness or maintainability for reduced token usage or fewer tool calls.
