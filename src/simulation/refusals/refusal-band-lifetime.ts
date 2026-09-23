import type { SimulationSpeed } from '../clock/fixed-step-clock';

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
 * ## Where 300 comes from, and what it is 300 *of*
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
 * **That sentence was reworded for #935 and is one word shorter.** It now
 * reads *"The room was not zoned — this room type needs a finished wall or door
 * along every side, and yours has a gap."* -- 22 words, still the longest of
 * the 48 (the next is 21). The quotation above is kept as the figure 300 was
 * derived from; re-derived, 22 words is 13.2 s, 13.45 s with `SEEN_MS`, 269
 * ticks, so 300 still clears it and nothing here moves.
 *
 * **It must be short enough that the row comes back inside the game's own
 * time.** `DAY_LENGTH_TICKS` is 2,400, so this is one eighth of an in-game
 * day. And it sits the right side of the only comparable number this codebase
 * has: the events band's 8000 ms is 160 ticks at x1, against a twelve-word
 * sentence, and this band's is 23 words -- so a longer sentence gets a longer
 * hold, which is the ordering a reader would expect and not an accident of
 * rounding.
 *
 * **THAT NUMBER IS THE CEILING AT x1 AND IS NO LONGER THE WHOLE THRESHOLD.**
 * The paragraph that stood here is kept below rather than deleted, because it
 * is the cost the owner was shown and the cost they then ruled on:
 *
 * > **What it costs, stated rather than left to be found.** A tick ceiling is
 * > not a wall-clock guarantee, and at speed x4 a tick is 12.5 ms -- so 300
 * > ticks is 3.75 s of wall clock, well under the 14.05 s the derivation above
 * > calls a read of the longest sentence. A player fast-forwarding may
 * > therefore lose a long refusal before they have finished it.
 *
 * Put to them as exactly that -- and as 15.0 s at x1, **7.5 s at x2** and
 * 3.75 s at x4, so the sentence can vanish unread at *both* faster speeds --
 * the owner chose, on 2026-09-20, from three clickable options, the one
 * labelled:
 *
 * > Skalować sufit prędkością (zalecane)
 *
 * ("Scale the ceiling with speed.") **Same weaker provenance as the ruling it
 * amends**: the label of an option this session wrote, not a sentence they
 * typed.
 *
 * **What that authorises, and its limit.** The ceiling stays *counted in
 * ticks* -- that is the 2026-09-20 ruling and it does not move, so a paused
 * prison must still never age the sentence by a single tick. What scales is
 * the **threshold**, so the wall-clock hold is about 15 s at x1, x2 and x4
 * alike. It authorises nothing else: not a wall-clock timer on this band, not
 * a change to `EVENT_BAND_HOLD_CEILING_MS`, not gap 34.
 *
 * **The new cost, in the other currency, stated for the same reason the old
 * one was.** Holding 15 wall-clock seconds at x4 takes 1,200 ticks, which is
 * **half an in-game day** against one eighth at x1. So a player who
 * fast-forwards now keeps the sentence across a much longer stretch of prison
 * time, and the corner is that much more likely to be describing something the
 * prison has moved on from. That is the trade the ruling makes: the sentence
 * is readable at every speed, and it is *stale* in game terms at the fast
 * ones. The alerts list is the record either way.
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
export const REFUSAL_BAND_TICK_CEILING_AT_X1 = 300;

/**
 * The tick threshold at `speed`: 15 wall-clock seconds' worth of ticks at the
 * rate the game is running now.
 *
 * **Multiplied, not divided, and the direction is worth deriving rather than
 * trusting.** A tick is `stepMilliseconds / speed` of wall clock -- 50 ms at
 * x1, 25 ms at x2, 12.5 ms at x4 -- so a faster game spends *more* ticks per
 * wall-clock second and needs *more* of them to fill the same hold.
 * `300 x 1 = 300` ticks at 50 ms is 15.0 s; `300 x 2 = 600` at 25 ms is 15.0 s;
 * `300 x 4 = 1200` at 12.5 ms is 15.0 s. The rate is the worker's own
 * (`SimulationWorkerStateMachine` builds `ticksPerWallSecond` from
 * `stepMilliseconds` and the same speed for the renderer), and it is not
 * duplicated here: this function multiplies a tick budget, it does not read a
 * clock.
 *
 * **Paused is not a speed and must never be passed as one.** `1` is the
 * smallest multiplier and therefore the *shortest* threshold, so treating a
 * paused clock as x1 would shrink the budget under a standing refusal and
 * could retire a sentence while the prison is frozen -- the exact thing the
 * 2026-09-20 ruling exists to prevent. Both callers avoid it in their own way
 * and say so: the HUD is handed `HudClockViewModel.speed`, which
 * `hudClockFromWorkerMessage` deliberately keeps at the last speed the
 * simulation actually ran at across a pause; the worker freezes the whole
 * comparison while `ClockControl.mode` is `'paused'` rather than choosing a
 * multiplier at all.
 */
export function refusalBandTickCeiling(speed: SimulationSpeed): number {
  return REFUSAL_BAND_TICK_CEILING_AT_X1 * speed;
}

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
 *
 * **It is not monotone in `speed`, and that is the one thing a caller must
 * handle rather than assume away.** Ticks only ever advance, so at a fixed
 * speed this answer goes `false` -> `true` once and stays. Change the speed
 * under a standing refusal and the *threshold* moves: a sentence past its
 * budget at x1 is not past the four-times-larger budget at x4, so this can
 * answer `true` and then `false` about the same record. Nothing here can fix
 * that -- it is what "the budget is 15 seconds at the speed you are running
 * now" means -- so the **band** remembers the ordinal it retired
 * (`mountHud`'s `applySimulationRefusal`) and never raises it again. The
 * retirement is one-way even though the predicate is not, which is the
 * property a player would name: a sentence the corner has let go of does not
 * come back because they pressed fast-forward.
 */
export function refusalBandCeilingPassed(refusalTick: number, tick: number, speed: SimulationSpeed): boolean {
  return tick - refusalTick >= refusalBandTickCeiling(speed);
}
