/**
 * How many simulation ticks a refusal keeps the HUD's `.hud__refusal` band
 * when nothing further happens.
 *
 * ## What ruled this, and how weakly
 *
 * ADR 0091 decision 2 (option F, 2026-09-16) retires the band when *something*
 * happens -- a decided outcome of the same command route. It left the opposite
 * case open: a refusal that nothing ever answers holds the corner, and the
 * grid row under it, for the rest of the session.
 *
 * Asked whether the band should also retire when nothing further happens, the
 * owner chose, on 2026-09-20, from four clickable options, the one labelled:
 *
 * > Tak, ale liczony w tikach
 *
 * ("Yes, but counted in ticks.") **The provenance is the weaker of the two
 * kinds this repository distinguishes**, exactly as option F's own is and as
 * `docs/adr/0091-what-clears-the-refusal-band.md`'s Status block records for
 * it: the owner did not type a sentence, they chose the label of an option a
 * session had written. What was agreed is the **unit and the existence of a
 * lifetime** -- ticks rather than the wall clock -- and not the number below,
 * which is this repository's to measure (balance and number-tuning are not
 * reserved) and to change again when the measurement moves.
 *
 * ## Why the unit is the whole of the ruling
 *
 * `.hud__event`'s ceiling is `EVENT_BAND_HOLD_CEILING_MS` -- 8000 milliseconds
 * of *wall clock*, armed from a DOM timer. A wall-clock ceiling on this band
 * would take the sentence down while the game is **paused**, which is the one
 * state in which a player is most likely reading it and least likely to have
 * caused anything that would replace it. Counted in ticks, a paused prison
 * never ages the sentence at all, and a slow one ages it slowly. That is the
 * property the owner chose and it is the reason this module exists rather than
 * a second constant beside the events band's.
 *
 * ## Where 300 comes from
 *
 * Derived from both ends, the way `EVENT_BAND_HOLD_CEILING_MS` is, rather than
 * picked.
 *
 * **It must be long enough to read the longest thing this band can say.**
 * `REFUSAL_LABEL_KEYS` in `src/ui/simulation-alerts.ts` maps 48 refusal
 * reasons onto 48 authored sentences, and the longest is
 * `hud.alert.refusal.zone.not-enclosed` -- *"The room was not zoned — this
 * room type must be enclosed, and the area you drew is open on at least one
 * side."* -- 23 words. At 100 words per minute, which is the half-rate
 * `EVENT_BAND_HOLD_CEILING_MS` already argues is the right one for a player
 * whose eyes are on the prison rather than on the band, that is 13.8 s; plus
 * the 250 ms this repository already calls *seen*
 * (`tests/browser/ui-escape-sentence-survival.spec.ts`, `SEEN_MS`) it is
 * 14.05 s. A tick is 50 ms (`FixedStepClock`'s `stepMilliseconds`), so 14.05 s
 * is 281 ticks and **300 is the round number above it**.
 *
 * **It must be short enough that the row comes back inside the game's own
 * time.** `DAY_LENGTH_TICKS` is 2,400, so this is one eighth of an in-game
 * day. And it sits the right side of the only comparable number this codebase
 * has: the events band's 8000 ms is 160 ticks at x1, against a twelve-word
 * sentence, and this band's is 23 words -- so a longer sentence gets a longer
 * hold, which is the ordering a reader would expect and not an accident of
 * rounding.
 *
 * **What it costs, stated rather than left to be found.** A tick ceiling is
 * not a wall-clock guarantee, and at speed x4 a tick is 12.5 ms -- so 300
 * ticks is 3.75 s of wall clock, well under the 14.05 s the derivation above
 * calls a read of the longest sentence. A player fast-forwarding may therefore
 * lose a long refusal before they have finished it. That is a direct
 * consequence of the unit the owner chose rather than a defect in the number,
 * it is the mirror image of the property that makes a paused prison safe, and
 * the alerts list keeps the row either way -- the band is the notice, the list
 * is the record.
 *
 * ## What this does not reach
 *
 * Not `.hud__event`: `EVENT_BAND_HOLD_CEILING_MS` is untouched and stays a
 * wall-clock number, because that band's sentence is not about a press the
 * player just made. Not the host-refusal half of `.hud__refusal` either -- a
 * host refusal is cleared when that action later succeeds (`clearRefusal` in
 * `src/ui/hud/hud.ts`) and never entered the simulation, so it has no tick to
 * be counted from. Not a dismiss button, which ADR 0084 declined (gap 34) and
 * which stays the owner's.
 */
export const REFUSAL_BAND_TICK_CEILING = 300;

/**
 * Whether the refusal recorded at `refusalTick` has outlived the band, as of
 * `tick`.
 *
 * **A read, and a pure function of two integers.** Nothing here touches the
 * kernel, a system or a log; the answer is recomputed from the standing
 * record every time it is wanted rather than stored on it, so nothing about a
 * refusal changes because a HUD exists to look at it
 * (`docs/DETERMINISM.md`). That is the same shape `RefusalLog.supersede`'s own
 * flag does *not* have -- `routeDecidedSince` is state, because "the route
 * decided something" is an event the log has to witness, while "300 ticks have
 * passed" is a subtraction anybody holding both numbers can do.
 *
 * Both callers hold both numbers already. The worker's publication gate reads
 * the kernel's tick beside the standing refusal's; the main thread's
 * translator reads the publication's own `tick` beside the same field on the
 * wire. Neither needed a new member on `simulation/status-counts`, which is
 * why this change adds none.
 *
 * `>=` rather than `>`: the ceiling is a count of ticks the sentence is owed,
 * so the tick that completes the count is the one it stops being owed on.
 */
export function refusalBandCeilingPassed(refusalTick: number, tick: number): boolean {
  return tick - refusalTick >= REFUSAL_BAND_TICK_CEILING;
}
