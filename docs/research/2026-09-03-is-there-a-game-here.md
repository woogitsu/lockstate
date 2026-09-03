# Is there a game here? — a working prison, run for forty-eight days

**Date:** 2026-09-03
**Branch:** `playtest/is-there-a-game-here`, cut from `origin/main` at `f7adf652` (v0.0.419)
**Instruments:** `tests/browser/playtest-2026-09-03-is-there-a-game-here.playtest.ts`,
`tests/browser/playtest-2026-09-03-twenty-prisoners-ergonomics.playtest.ts`
**Status:** WORK IN PROGRESS — the runs are in flight; sections below are filled as
they land. Nothing in this file is a decision, and nothing in it is a fix.

> `.playtest.ts` is collected only by `tests/browser/playwright.playtest.config.ts`.
> **Nothing in CI runs either instrument.** A playtest is evidence, never a gate.

## 0. What this pass was asked, and what it is not

Every other pass over this repository this week hunted defects. This one was
asked to judge whether the game is worth playing: *what is fun, what is not,
what to change, what to improve, what to remove* — against the owner's standing
design directive of 2026-09-03, in their words, **"gra ma być łatwa przyjazna do
grania, a nie jakieś ukryte funkcje"**: easy and friendly to play, not full of
hidden features.

It is deliberately **not** the first twenty minutes. A companion pass judged
those. This one starts where they stop: build a prison that actually works —
cells with beds, a canteen, a kitchen, a shower room, a laundry, a common room,
a yard, a delivery bay and a store; guards hired; twenty prisoners admitted —
and then **run it for a long time and ask whether there is a game here.**

Every item below is labelled `DEFECT` (the code does not do what it says) or
`DESIGN` (the code does what it says and what it says is not enough). They are
never merged. A measurement is not a diagnosis and a cause is not an impact:
where this note says "and the game never made me care", that is the design claim
sitting on top of the measurement above it, and it is marked as such.

## 1. Method

