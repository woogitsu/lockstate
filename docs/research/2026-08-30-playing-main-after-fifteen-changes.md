# Playtest: `main` after fifteen changes — what a 90-day sentence looks like from the chair

**2026-08-30.** Mouse-driven playtest in a real Chromium at 1440x900, driving
the assembled page (`index.html` + `src/main.ts`) through a `Worker` tee that
records every command sent and every reply received. The script is
`tests/browser/playtest-after-today.playtest.ts`, collected by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI runs.

Played on **`origin/main` at `898a16a` (v0.0.252)**, in a worktree taken from it
with `git lfs checkout` run first — 62 objects, 93 MB, confirmed with
`file public/assets/actors/actor.guard.base.idle.png` returning
`PNG image data, 260 x 3104` rather than `ASCII text`, because
`docs/AGENT_WORKFLOW.md` records a browser playtest that ran green with no actor
sprites on screen at all.

The brief was the owner's, in their own words: *"znajdź bugi i błędy grając, bo
ja nie mogłem postawić więzienia itp grając sam"* — find defects **by playing**
— under the standing design directive *"gra ma być łatwa przyjazna do grania, a
nie jakieś ukryte funkcje"*.

## The question

Fifteen changes landed on `main` on 2026-08-30 and nobody had played the result.
Three of them are what this pass is aimed at:

- **[#659](https://github.com/matmaxalez/lockstate/issues/659)** widened a
  sentence from 2–16 to **14–90 in-game days**
  (`src/simulation/prisoners/sentence.ts`, `MIN_SENTENCE_DAYS = 14`,
  `MAX_SENTENCE_DAYS = 90`). A day is `DAY_LENGTH_TICKS` = 2,400 ticks and a
  tick is 50 ms, so at ×1 a sentence went from *4–32 real minutes* to **28 real
  minutes to 3 real hours**.
- **[#660](https://github.com/matmaxalez/lockstate/issues/660)** gave a
  relocated resident a sentence: *"{name} had nowhere to sleep and moved to
  {room}."* (`src/content/default-locale-en.ts:461`).
- **[#635](https://github.com/matmaxalez/lockstate/issues/635)** put *"N with no
  bed"* on the PRISONERS chip.

And [ADR 0079](../adr/0079-a-sentence-long-enough-to-be-a-history.md) makes one
prediction it does not test:

> **Steady-state occupancy rises for a given admission rate**, by roughly the
> ratio of the means — 124,800 against 21,600, a factor of **5.8**. ADR 0050's
> 200,000-tick population harness was **not** re-run […]. That is stated as the
> largest gap rather than filled with an assumption, and it is the finding most
> likely to matter to the economy work in flight.

Two open pull requests, [#653](https://github.com/matmaxalez/lockstate/pull/653)
and [#668](https://github.com/matmaxalez/lockstate/pull/668), cost the economy
against a prison that may be 5.8× too small. This pass was asked to measure it.

## Claim tiers

`docs/research/README.md` labels every claim. Everything below is **VERIFIED**,
meaning one of exactly two first-party things: a number or a sentence pasted
verbatim out of one of the two runs named below, or a `file:line` in this
repository that was opened and read. **SEARCH-SUMMARY and FROM MEMORY do not
occur.** Where something could not be established it is marked **UNKNOWN**
inline, with what would settle it.

Two runs of the same script on the same commit, both pasted:

- **Run A**, 2026-08-30 16:46 UTC.
- **Run B**, later the same evening.

---

*(Sections 1–7 follow; measurements from the two runs are pasted in place.)*
