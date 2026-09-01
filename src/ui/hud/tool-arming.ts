/**
 * The two booleans a map tool is held in, and the one transition both panels
 * make out of removal.
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
 * expression, and a defect written once was therefore shipped twice (#689).
 * A pure reducer is also the only layer this decision can be *proved* at:
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
