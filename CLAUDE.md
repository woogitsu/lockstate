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

**A FIFTH RELEASE LANDED ON 2026-09-07, AND IT IS THE THIRD AND WIDEST INSIDE
RESERVATION 3.** The owner directed that no workflow use the retired WSL2
runners `woogitsu-wsl-DOM-NEW-01`–`-04` and that every self-hosted job go to
the new pool `woogitsu-linux-01`–`-10` by the label set
`[self-hosted, Linux, X64, woogitsu, i5-10400f, nvidia-gtx1070]` — in their own
words and dated, in `AGENTS.md`. **This is the first release inside reservation
3 that reaches `deploy.yml`**, and the first anywhere in that section given as a
direct instruction rather than as an answer to drafted options, so it carries no
"against a summary" disclosure. It covers the ten `runs-on:` keys and the prose
and contracts that named the old pool, and nothing else — no step, matrix,
permission, trigger or environment variable moved, and `public/_headers`,
`wrangler.jsonc` and both dashboards are untouched.

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
