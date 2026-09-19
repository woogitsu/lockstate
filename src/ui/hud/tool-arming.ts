/**
 * The two booleans a map tool is held in, and the two transitions its arm
 * control and its removal control each make.
 *
 * The Build panel and the Rooms panel each hold an armed tool as a pair of
 * flags -- `armed`, which decides whether a press on the *world* is the tool's
 * or the camera's, and `removing`, which decides which of the tool's two
 * gestures that press is. The pair is chrome, not simulation state: the panels
 * report it onward and `main.ts` turns it into `RoomTool.setArmed`,
 * `BuildTool.setArmed` and `ObjectTool.setArmed`.
 *
 * It lives here, rather than inline in each panel, because the two panels had
 * drifted into holding the identical pair by two copies of the identical
 * expression, and a defect written once was therefore shipped twice (#689,
 * and again as #735 on the neighbouring control -- see `pressArm` below). A
 * pure reducer is also the only layer this decision can be *proved* at:
 * `vitest.config.ts` runs on `environment: 'node'` with no DOM, so a mounted
 * panel is unreachable from the unit suite entirely -- the same constraint that
 * produced `orderPrisonsForDisplay`, and `docs/AGENT_WORKFLOW.md` §2 records
 * why extracting is the answer rather than reporting a survivor.
 */

/** An armed map tool, as the panel that owns it holds it. */
export interface HudToolArming {
  /** Whether the world's pointer belongs to the tool rather than the camera. */
  readonly armed: boolean;
  /** Whether the armed gesture takes something away instead of putting it there. */
  readonly removing: boolean;
}

/**
 * What pressing the removal toggle -- "Remove" / "Stop removing" -- means.
 *
 * ## Arming to remove is arming, and that half is unchanged
 *
 * Pressing "Remove" from a standing start arms the tool in **one** press. That
 * is the whole gesture on a touch device: press one control, then press tiles.
 * It is not a convenience, it is the only route removal has on a device with no
 * keyboard, so nothing here may cost it a second press.
 *
 * ## Pressing "Stop removing" stands the tool down
 *
 * **This is the half that changed, in #689.** Both panels used to write
 * `armed = removing || armed`, which is right on the way *in* and keeps
 * whatever `armed` already was on the way *out*. So the player pressed a
 * control that says *stop* and got a tool that had stopped removing and was
 * still armed -- a **placing** tool, still holding the pointer, aimed at
 * something they had not asked for. The panel said so, in the neighbouring
 * control's label, which is why it was a smaller defect than the one #684
 * fixed; it was still a control doing something other than what it says.
 *
 * The alternative considered was to leave the tool armed and return it to the
 * *previously selected* mode. It was rejected on evidence rather than taste:
 * **no such mode is recorded anywhere.** Entering removal overwrites `armed`,
 * so `{ armed: true, removing: true }` is the state of a player who armed to
 * place and then pressed Remove *and* of a player who pressed Remove with
 * nothing armed at all. Telling the two apart means adding a remembered field
 * -- one control whose outcome depends on invisible history, which is the
 * hidden state the owner's standing directive rules out, bought for one press.
 *
 * It is also the rule the neighbouring surface already follows. `RoomsPanel`'s
 * confirm stands the tool down through the same pair (#684), for the reason
 * that comment gives: a tool that is not armed is aimed at nothing, and
 * leaving the *other* flag set would leave the control beside it offering to
 * stop something that is not happening. Both panels clear the pair together
 * when their tab goes away, too.
 *
 * So the pair moves as one, and the whole transition is that both flags become
 * whatever `removing` is about to be.
 */
export function toggleRemovalMode(state: HudToolArming): HudToolArming {
  const removing = !state.removing;
  return { armed: removing, removing };
}

/**
 * What pressing the arm control -- "Draw on map" / "Place on map" -- means.
 * `toggleRemovalMode` above is the removal toggle's transition; this is the
 * other control's, and issue #735 is the reason it exists as its own function
 * rather than as two more copies of one expression.
 *
 * ## The defect, and why it is #689's shape again
 *
 * `RoomsPanel`'s arm button used to run
 * ```ts
 * removing = false;
 * armed = !armed;
 * ```
 * right beside a comment saying a player pressing it while removal is on "has
 * said which of the two they want" -- draw, not remove. Coming *out* of
 * removal, `armed` is already `true` (`toggleRemovalMode` arms the tool to
 * enter removal), so `!armed` is `false`: the press stood the tool down
 * instead of arming it to draw. That is exactly the bug #689 fixed on the
 * removal control -- a boolean negated across a transition the expression did
 * not account for -- reported separately (#735) rather than folded into that
 * fix, to keep #689 to the control its issue named.
 *
 * ## The formula
 *
 * The press arms the tool whenever it is a fresh arming (`armed` was `false`)
 * *or* a switch out of removal (`armed` was already `true`, but for the wrong
 * gesture). Both collapse to one expression, read *before* `removing` is
 * cleared: `state.removing || !state.armed`. `removing` always becomes
 * `false` -- this control's whole job is to select "draw", never "remove".
 *
 * ## `build-panel.ts` already has this, with an extra term, and why it is not
 * reproduced here
 *
 * `src/ui/hud/build-panel.ts`'s arm button computes
 * `armed = (wasRemoving || !armed) && selectedId !== undefined`. That third
 * term is dead code on every path that can reach it: `createActionButton`
 * wires `onActivate` to nothing but the button element's native `click`
 * listener (`src/ui/primitives/action-button.ts:88-90`), a `disabled` button
 * dispatches no `click` event at all (browser behaviour, not this
 * codebase's), and both panels disable this exact button whenever
 * `selectedId === undefined` -- `build-panel.ts:1306` at creation,
 * `rooms-panel.ts:1062` at creation and kept live every repaint at
 * `rooms-panel.ts:1869`'s `armButton.setDisabled(selectedId === undefined)`.
 * So the handler this reducer replaces cannot run without a selection already
 * held. Neither panel ever sets a `selectedId` that was once defined back to
 * `undefined` -- each assigns it exactly twice in its own file: once from the
 * model's first entry, once from a catalogue row's own id -- so the guard has
 * never been observed to matter on either panel. Generalising it into the
 * shared contract would give the Rooms panel a parameter that exists to guard
 * against a state it cannot reach, which is the "state paid for and never
 * read" the owner's standing directive already rules against in the other
 * direction (see `toggleRemovalMode`'s own account of the rejected
 * "remember the previous mode" alternative). It stays `build-panel.ts`'s own
 * defensive line, not part of this function's contract.
 *
 * ## Why only `RoomsPanel` calls this, for now
 *
 * A reducer "both panels call" is exactly #689's shape, and `build-panel.ts`
 * carries the identical defect in its own arm button today -- but this
 * session's brief holds `build-panel.ts` for another agent, so migrating it
 * is not this change's to make. `pressArm` is written to the same contract
 * `toggleRemovalMode` is (`HudToolArming -> HudToolArming`, no panel-specific
 * argument), so adopting it there is `armed = pressArm({ armed, removing
 * }).armed` in place of the expression quoted above, once that file is free
 * to edit -- and the textual-coupling test beside this module's says plainly
 * that only `RoomsPanel` calls it yet, rather than claiming a coupling that
 * is not there.
 */
export function pressArm(state: HudToolArming): HudToolArming {
  return { armed: state.removing || !state.armed, removing: false };
}
