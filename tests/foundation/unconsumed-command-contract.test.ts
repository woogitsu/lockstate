import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { simulationCommandSchema } from '../../src/simulation/protocol/commands';

/**
 * The sibling of `unconsumed-action-contract.test.ts`, applied to the other
 * vocabulary a player reaches the simulation through.
 *
 * That gate exists because five declared input actions were bound to keys and
 * read by nobody, and its header states the argument this file inherits
 * verbatim: *"A dead key is worse than a missing one -- it is
 * indistinguishable from a broken build."* A command the game cannot send is
 * the same object one level up. It decodes, it has a handler, it has a save
 * representation, it has tests -- and no code path in the shipped application
 * can produce one, so every one of those is exercised only by the suite.
 *
 * ## What it found on the first run, and what it has moved since
 *
 * Six commands were declared. **One had a producer.** (There are twelve now:
 * `UnzoneRoom` arrived with the Rooms tab, `HireStaff` with the Staff panel,
 * `AdmitPrisoner` with the Intake panel, and `PlaceObject` and `RemoveObject`
 * with the object tool's two modes, and each arrived with a producer.)
 *
 * `src/main.ts` dispatched `{ type: 'PlaceBuildOrder', ... }` from the
 * `'place-build-order'` HUD intent. `CancelBuildOrder`, `ZoneRoom`,
 * `PurchaseMaterials`, `Undo` and `Redo` had none: `HudIntent`
 * (`src/ui/hud/hud.ts`) declared five members and not one of them was a
 * cancel, a zone, a purchase or an undo, and no other module built a
 * command object at all.
 *
 * ## What it reads today: fourteen of fourteen
 *
 * `Undo` and `Redo` gained producers with #261's step 6, and their entries came
 * out of the list below in the same change -- which is the direction this file
 * exists to force. The transaction model itself is older than either: it has
 * been in `ConstructionSystem` since #108, and what #261 added was the way to
 * reach it. `HudIntent` now declares thirteen members, two of which are `undo` and
 * `redo`: the world's `KeyZ`/`KeyY` bindings report through `BuildTool` to the
 * HUD, the HUD dispatches its own intent, and `src/main.ts` turns it into the
 * command.
 *
 * `PurchaseMaterials` is the one that made this worth writing, and it is the
 * one this gate has since moved. On the first run it read: #249 gave the
 * simulation money, a price list and a delivery; #250 put the balance on the
 * status strip; and a player could *see* the starting balance and not spend a
 * unit of it, because the only thing that could issue a purchase was a test.
 * That was the exact condition `src/ui/hud/projection.ts`'s own comment warns
 * about -- "the same class of lie as a money counter with no economy" -- and
 * it shipped anyway, because nothing was counting. #89 closed it by giving the
 * Build panel a quantity stepper, so its entry came out of the list below and
 * the count at the foot of this file moved with it. The gate fails in both
 * directions by design, which is why closing #89 had to change this file: a
 * record of unreachability cannot outlive the fact.
 *
 * `ZoneRoom` is the one this gate moved most recently, and it had been on the
 * list longest. Its consumer stopped being a no-op in #261's zoning step, so
 * what was missing was only the producer -- and the entry recorded the reason in
 * the terms ADR 0022 was then written to settle: *"every member of `HudIntent`
 * is a tab, a panel, the clock, a build order, the build tool or the undo pair,
 * and none is about a room."* The Rooms tab (#312) is the producer, `HudIntent`
 * now declares a `zone-room` member, and the entry came out of the list below in
 * the same change. `UnzoneRoom` arrived in that change *with* a producer and was
 * never on the list at all, which is the only way a new command should land.
 *
 * `HireStaff` is the eighth command and landed the same way: with its producer,
 * so it never spent a day on the list below either. Its consumer was in the
 * position `PurchaseMaterials`'s had been in, one layer down: `GuardRoster.hire`
 * was complete, snapshotted and restored, and **every call in the repository was
 * in a test**, so the four systems that read the roster -- deployment, patrol,
 * incident response and contraband search -- iterated an empty collection in
 * every session a player could start. ADR 0025 records the surface that closed
 * it, and `src/main.ts` dispatches the command from the Staff panel's one
 * button.
 *
 * `AdmitPrisoner` is the ninth and landed the same way again (#261 step 4): the
 * schema member, the `createSessionCommandHandler` branch, the `HudIntent`
 * member and the Intake panel that emits it in one change. Its consumer had the
 * same shape of gap as `HireStaff`'s -- `PrisonerOperationsRuntime.admitPrisoner`
 * and the whole intake pipeline had existed since #24 with no caller in `src/`
 * -- which is worth naming because the alternative, declaring the command first
 * and wiring it later, is exactly how the six before these three got here.
 *
 * `PlaceObject` is the tenth and landed the same way again (ADR 0028 phase 1):
 * the schema member, the `createSessionCommandHandler` branch, the `HudIntent`
 * member, the object tool that emits it from a world press and the Build panel's
 * numeric fields that emit it from the keyboard, all in one change. Its consumer
 * did not pre-exist it at all, which is the one respect in which it differs from
 * the three before it -- `ObjectPlacementService` is new in the same commit, so
 * there was never a window in which a complete consumer sat unreachable.
 *
 * `RemoveObject` is the eleventh and it is the same story one phase on (ADR
 * 0028 phase 3), including the two routes: the object tool armed to remove, and
 * the Build panel's numeric fields with the same mode on. It is worth naming
 * separately because a removal is the one command whose *point* is the gesture
 * -- an object could already be taken back by `Undo`, and `Undo` is a keyboard
 * chord, so a command reachable only from a test would have left touch exactly
 * where it was.
 *
 * `CancelBuildOrder` was the whole of what the list below held, and **the list
 * is now empty**. It was the last one, and it is the only entry that ever came
 * off this list for a reason that was not "somebody built the control": the
 * control had been buildable all along and would have been *worse* than nothing,
 * because the thing it could not do was name an order. `CancelBuildOrder` takes
 * an `orderId`, and no order id reached the main thread at all --
 * `src/simulation/protocol/commands.ts` still says so where it argues that
 * `RemoveObject` carries a tile instead: an order id is something "nothing on
 * screen shows and no snapshot carries". So the missing piece was a *read model*,
 * not a button, and the entry below stood for as long as it did because that was
 * a correct diagnosis.
 *
 * What changed is #348. Construction now builds **one order at a time** --
 * `tests/unit/construction-crew-capacity.test.ts` and
 * `tests/unit/construction-geometry.test.ts` measure it: a twelve-segment run
 * finishes at tick **730** where it used to finish at **70** -- so a queue became
 * a real, long-lived thing a player waits on, and "cancel the third one, keep the
 * rest" went from a hypothetical to the obvious thing to want. `hud/build-queue`
 * carries the pending orders and their ids, `src/ui/simulation-build-queue.ts`
 * reads them, the Build panel draws a row per order, and `src/main.ts` turns a
 * press on a row into the command. The entry is deleted and the count below moved
 * with it, in the same change, which is what this file exists to force.
 *
 * `CancelMaterialPurchase` is the twelfth and it landed the way the last five
 * did -- with its producer, in one change (#285) -- but it is worth naming
 * separately because of what it made reachable one layer down. Its consumer,
 * `ProcurementSystem.cancel`, was in exactly the position `GuardRoster.hire` had
 * been in: complete, idempotent, snapshotted, restored, tested, and with **every
 * caller in the repository in a test**. `grep -rn "procurement\.cancel" src/`
 * found nothing at all. So the one thing in the economy that credits the
 * treasury besides the state's income line could not be produced by any session
 * a player could drive, and money spent on a delivery they had changed their mind
 * about was unrecoverable. The blocker was this file's own subject twice over:
 * no command named a purchase, and no read model carried a purchase id to the
 * thread that would have had to name one.
 *
 * `ReleaseGuardAssignment` is the thirteenth and it landed the same way the last
 * six did -- with its producer, in one change (ADR 0034) -- and it is worth
 * naming separately for what it makes reachable, which is the same shape as
 * `CancelMaterialPurchase`'s and one resource over. `GuardRoster.unassign` is
 * complete and has been since #26, and **every caller of it in `src/` sits inside
 * the system that made the claim being released**, each firing only when that
 * system decides the claim is over. So a claim whose owner had lost track of it
 * was permanent, which is precisely what issue #352 was: ADR 0033 measured four
 * guards and one sector still held 53,000 ticks after a restore and recorded that
 * *"`GuardRoster.unassign`'s callers in `src/` are all unreachable for an
 * `'on-search'` guard, and no dismiss command exists"*, then said in its open
 * question 3 that the absence *"will make the next resource-claiming system's
 * equivalent bug terminal too"*. The blocker was this file's own subject twice
 * over again: no command named a guard, and no read model carried a guard id --
 * `hud/staff` was catalogued and unread, and would not have been enough anyway,
 * because `'on-search'` is a shared phase and a row saying so cannot say which
 * claimant holds the guard.
 *
 * `DismissStaff` is the fourteenth (issue #533, the owner's decision on issue
 * #535 decision 4) and it landed the same way the last seven did -- with its
 * producer, in one change -- and it is worth naming separately for what it makes
 * reachable, which is the mirror image of `ReleaseGuardAssignment`'s. That
 * command's own schema comment says it is *"Not a dismissal ... firing destroys
 * an entity, which is ADR 0026's subject and needs its own decision about id
 * reuse"*, and until #533 no such command existed: `staff/hiring.ts` stated in
 * its own words that *"nothing in `src/` ever removes a staff member from"* the
 * roster, and `PayrollSystem` bills every id the roster holds at every in-game
 * day boundary. So a hire was a standing charge no session could end, measured
 * at a prison spent from 25,000 down to 0 by three guards it had no use for.
 *
 * The blocker was this file's own subject twice over again, and the *read model*
 * half is the interesting one: a staff id did already reach this thread, on
 * `hud/held-guards` -- and it was the wrong set of staff ids. That projection
 * carries the *held* subset, and the guards a trapped player most needs rid of
 * are the ones nothing is holding. `src/ui/simulation-staff-roster.ts` is the
 * piece that had actually been missing, and it reads `hud/staff` -- catalogued
 * since #104 and, for rows, unread until now.
 *
 * The count is measured, not carried: **fourteen producers, all in `src/main.ts`,
 * and no command with none.**
 *
 * ## What counts as a producer
 *
 * `type:` followed by the command name as a single-quoted literal, in a `.ts`
 * file under `src/`, **excluding `src/simulation/protocol/`**.
 *
 * The exclusion is the same argument the action gate makes for excluding
 * `src/input/`: declaring a command's schema, listing it in the union and
 * serialising it in `commandJson` are all things the protocol tier does to
 * *describe* a command. None of them is the application producing one.
 *
 * `type:` rather than the bare name is what separates producing from
 * consuming, and both spellings are live in this repository: a producer
 * writes `{ type: 'PlaceBuildOrder', orderId, ... }`, while a consumer writes
 * `case 'PlaceBuildOrder':` (`src/simulation/construction/handler.ts`) or
 * `command.type === 'PlaceBuildOrder'`. Matching the bare literal would count
 * every handler branch as a producer and report the opposite of the truth.
 *
 * Two limits, stated rather than left to be discovered:
 *
 * - A producer that assembles the object from a variable (`{ type: kind, ... }`)
 *   is invisible to a text scan. None exists today, and the positive control
 *   below fails loudly if any of the eleven that do exist stops being found.
 * - The scan cannot tell a live dispatch from dead code inside `src/`. It
 *   answers "can this command be constructed anywhere in the application",
 *   which is the weaker and checkable half of "can a player send it".
 *
 * Both err toward reporting a command as *produced*, so the failures this
 * gate raises are real ones.
 *
 * ## Why the list comes out of the schema
 *
 * `simulationCommandSchema.options` is the discriminated union itself, so an
 * eleventh member is in scope the moment it is added. A hand-written array
 * here would be a second list to forget, which is the failure this whole
 * family of gates exists to prevent.
 */

const ROOT = resolve(__dirname, '../..');

/**
 * Why each declared command has no producer in `src/`.
 *
 * Not decoration: this is the reviewable half of the claim, exactly as
 * `AWAITING_CONSUMER` is in the action gate. An entry has to say what is true
 * today, and it fails as stale the moment the command gains a producer.
 */
const AWAITING_PRODUCER: Readonly<Record<string, string>> = {
  // **Empty, and that is a first.** Every command this repository declares can
  // now be constructed by the application.
  //
  // The last entry was `CancelBuildOrder`, and it is worth recording what it
  // said rather than only that it is gone, because the shape of it is the
  // lesson. It read: handled at `construction/handler.ts`, reachable from
  // `ConstructionSystem.cancelOrder`, and constructed by nothing -- with the
  // narrowing that #328 forced on it, that a pending *object* order could be
  // withdrawn individually by pressing its tile with the Build panel armed to
  // Remove, because that route sends `RemoveObject` and cancels the order inside
  // its handler. Nothing reached a *wall* order the same way: a misplaced run
  // could be taken back whole by `KeyZ`, because undo pops the last transaction,
  // which is not the same control. The entry ended by naming what was needed --
  // "cancelling the third order of a twelve-segment run still needs a per-order
  // control on the panel" -- and calling it #174 territory, because the panel was
  // already over its height budget.
  //
  // Both halves of that were true and both are now answered. The height is
  // answered by the block being `hidden` while nothing is queued and *collapsed*
  // when it appears, so the panel's arrival height is unchanged
  // (`BUILD_QUEUE_ROW_LIMIT` in `src/ui/hud/build-panel.ts` carries the
  // measurement). The naming is answered by `hud/build-queue`, which is the piece
  // that had actually been missing: the panel could always have had a button, and
  // a button that could not name an order would have been a second, worse undo.
  //
  // An empty list here is not a state to defend -- it is the state this gate
  // exists to bring about. The twelfth and thirteenth commands arrived and
  // neither touched this list, which is the only way a new one should land:
  // `CancelMaterialPurchase` came with its producer, its consumer and its read
  // model in one change (#285), and `ReleaseGuardAssignment` came with the same
  // three in one change (ADR 0034). A fourteenth added with no producer belongs
  // here with a reason, and fails the count below until it is either wired or
  // written down.
  //
  // **It stopped being empty on 2026-09-14 and is empty again since
  // 2026-09-16**, and the entry that stood here for those two days is recorded
  // rather than only its absence, because it said what it expected to happen
  // to it and that is what happened. It read: ADR 0113 slice 1 (#1167) landed
  // the command, its consumer in `session-commands.ts`, its two refusals and
  // the V6 save section together, and not the producer, because the Day-plan
  // panel that would send it is stage 3 of the identity-v5 rollout (epic
  // #1155) and `src/ui/` was held by two other agents -- so "a producer
  // written here would have been written blind against a panel being
  // rewritten". It ended: "this entry is expected to be deleted by the panel
  // change, not by a second thought about the command."
  //
  // The panel change is #1167's editor: seven toggles per classification
  // group under `.hud-regime__editor`, sending the categories the block would
  // then allow. Nothing about the command was reconsidered, and the three
  // facts that entry offered an implementer all held -- the integration test
  // drives the real kernel path, both refusals reach `RefusalLog`, and
  // `hud/status-strip` already reported the edited schedule, so the panel had
  // something to read and something to send.
};

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

const producerSources = collectTypeScriptFiles(join(ROOT, 'src'))
  // Comments are stripped for the same reason the action gate strips them, and
  // it matters more here: the protocol module, the handler and this repository's
  // issue prose all name these commands in sentences saying they have no
  // producer. An unstripped scan would report them produced by the comments
  // explaining that they are not.
  .map((path) => ({ where: relative(ROOT, path), text: stripComments(readFileSync(path, 'utf8')) }))
  .filter((source) => !source.where.startsWith(join('src', 'simulation', 'protocol')));

const COMMAND_TYPES: readonly string[] = simulationCommandSchema.options.map((option) => option.shape.type.value);

/** `type:` and then the name, tolerating the whitespace a formatter may put after the colon. */
const producerPattern = (type: string): RegExp => new RegExp(`\\btype\\s*:\\s*'${type}'`);

const producersOf = (type: string): readonly string[] =>
  producerSources.filter((source) => producerPattern(type).test(source.text)).map((source) => source.where);

const unproducedTypes = COMMAND_TYPES.filter((type) => producersOf(type).length === 0);

describe('every declared simulation command either has a producer or is accounted for', () => {
  it('scans a real source set and really finds the producer that exists', () => {
    // Both halves of the vacuity guard, and the second is the one that
    // matters. An empty file list would make every command unproduced --
    // loud. A pattern that matched nothing, or a stripper that blanked every
    // file, would do the same in a way the file count cannot see, so the
    // positive control names every command that genuinely has a producer and
    // where it is -- all sixteen in `src/main.ts`, which is the composition
    // root and the only place in `src/` that builds a command object.
    //
    // **This read `all eleven` until this change**, and it was right when #367
    // wrote it at `0e70f14`. It went false at `8dc95eb` (#392,
    // `CancelMaterialPurchase`), then further at `e44bcb9` (#394,
    // `ReleaseGuardAssignment`) and `a8a446e` (#533, `DismissStaff`) -- three
    // additions, none of which touched the sentence
    // counting them, which is the shape `docs/AGENT_WORKFLOW.md` section 4 names:
    // a sentence stating a tally is not touched by adding the thing it tallies.
    // Corrected rather than overwritten, because the number is not the finding
    // and the assertion below is: `COMMAND_TYPES.length` is pinned two lines
    // down, so the *comment* could rot for three additions while the *gate*
    // could not rot for one. Fourteen of the fifteen were named in this block;
    // `Undo` is named at the `case 'Undo':` case below, for the reason given
    // there.
    //
    // **And it read `all fourteen` until the owner's decisions of 2026-09-01 on
    // [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)**,
    // which added `DismissAlert` -- with its producer, from the alerts list's
    // own rows. The correction is the fifth of exactly the shape the paragraph
    // above describes, which is why the paragraph is kept.
    //
    // **And it read `all fifteen` until ADR 0106**, which added `RemoveWall`
    // -- with its producer, in the same `case 'remove-object':` branch
    // `RemoveObject` already had, distinguished by whether the intent carries
    // an `edge`. The sixth correction of the same shape.
    // **And it read `all sixteen` until `SellMaterials`** (ADR 0075 decision
    // 3, invoked by ADR 0096 decision 3(b)), which arrived with its producer
    // in the same change -- `case 'sell-materials':` beside
    // `case 'purchase-materials':` -- rather than spending time on the list
    // below. The seventh correction of the same shape.
    expect(producerSources.length).toBeGreaterThan(50);
    expect(COMMAND_TYPES.length).toBe(20);

    expect(producersOf('PlaceBuildOrder')).toEqual(['src/main.ts']);
    expect(producersOf('PurchaseMaterials')).toEqual(['src/main.ts']);
    // The seventeenth, which made an unreachable *credit path* reachable a
    // second time (#285 made the first, for a cancelled delivery): the only
    // caller of `ProcurementSystem.sellStock` and `previewSellStock` in the
    // repository was a test.
    expect(producersOf('SellMaterials')).toEqual(['src/main.ts']);
    expect(producersOf('AdmitPrisoner')).toEqual(['src/main.ts']);
    expect(producersOf('HireStaff')).toEqual(['src/main.ts']);
    expect(producersOf('Redo')).toEqual(['src/main.ts']);
    // The alerts log's own gesture (ADR 0084 decision 3). Named here for the
    // reason `RemoveObject` is named below: its whole point is that a *press*
    // reaches it, so a producer that existed only in a test would be exactly
    // the defect this gate is named after.
    expect(producersOf('DismissAlert')).toEqual(['src/main.ts']);
    // The two the Rooms tab added, asserted by name rather than only by the
    // count: a producer that had drifted out of the composition root would
    // still keep the count green.
    expect(producersOf('ZoneRoom')).toEqual(['src/main.ts']);
    // The pair ADR 0028's object placement added, in phases 1 and 3. Named for
    // the reason above, and `RemoveObject` doubly so: it is the command whose
    // whole purpose is that a *gesture* reaches it, so a producer that existed
    // only in a test would be the exact defect this gate is named after.
    expect(producersOf('RemoveObject')).toEqual(['src/main.ts']);
    // The sixteenth, added by ADR 0106 beside `RemoveObject` in the same
    // branch (ADR 0106): the completed-wall arm of the same removal gesture,
    // reached only when the object arm this gate already named finds
    // nothing. Named separately for `RemoveObject`'s own reason: a producer
    // that existed only in a test would be exactly the defect this gate is
    // named after, and this is the command whose whole point is that a
    // touch player's *press* reaches a finished wall at all.
    expect(producersOf('RemoveWall')).toEqual(['src/main.ts']);
    expect(producersOf('UnzoneRoom')).toEqual(['src/main.ts']);
    // The tenth and eleventh, added by ADR 0028 phases 1 and 3 by the same
    // route: arriving *with* their producers rather than spending time on the
    // list below.
    expect(producersOf('PlaceObject')).toEqual(['src/main.ts']);
    // And the one this file was written about: the only command that needed a
    // *read model* rather than a control before it could exist, and the last to
    // get a producer -- see this file's header.
    expect(producersOf('CancelBuildOrder')).toEqual(['src/main.ts']);
    // And the twelfth, which is the one that made an unreachable *credit path*
    // reachable rather than an unreachable control (#285): the only caller of
    // `ProcurementSystem.cancel` in the repository was a test.
    expect(producersOf('CancelMaterialPurchase')).toEqual(['src/main.ts']);
    // And the thirteenth, which made an unreachable *release* reachable rather
    // than an unreachable control or credit (ADR 0034): every caller of
    // `GuardRoster.unassign` in `src/` was inside the system that had made the
    // claim, so a claim whose owner had lost track of it was permanent.
    expect(producersOf('ReleaseGuardAssignment')).toEqual(['src/main.ts']);
    // And the fourteenth, which made an unreachable *departure* reachable: no
    // path in `src/` had ever removed a staff member from `GuardRoster`, so the
    // wage bill a hire started could not be ended (#533).
    expect(producersOf('DismissStaff')).toEqual(['src/main.ts']);
    const main = producerSources.find((source) => source.where === 'src/main.ts');
    expect(main, 'the production producers of a simulation command are no longer where this gate looks for them').toBeDefined();
    expect(main!.text).toContain(`type: 'PlaceBuildOrder'`);
    expect(main!.text).toContain(`type: 'PurchaseMaterials'`);
    expect(main!.text).toContain(`type: 'AdmitPrisoner'`);
    expect(main!.text).toContain(`type: 'HireStaff'`);
    expect(main!.text).toContain(`type: 'Undo'`);
    expect(main!.text).toContain(`type: 'Redo'`);
    expect(main!.text).toContain(`type: 'ZoneRoom'`);
    expect(main!.text).toContain(`type: 'UnzoneRoom'`);
    expect(main!.text).toContain(`type: 'PlaceObject'`);
    expect(main!.text).toContain(`type: 'RemoveObject'`);
    expect(main!.text).toContain(`type: 'RemoveWall'`);
    expect(main!.text).toContain(`type: 'CancelBuildOrder'`);
    expect(main!.text).toContain(`type: 'CancelMaterialPurchase'`);
    expect(main!.text).toContain(`type: 'ReleaseGuardAssignment'`);
  });

  it('separates producing from consuming, so a handler branch is not mistaken for a dispatch', () => {
    // The rule the whole measurement rests on. `construction/handler.ts`
    // switches on all four of the commands it handles; if `case 'X':` counted
    // as producing an `X`, this gate would report every command as
    // reachable and be exactly wrong about the one that is not.
    //
    // Demonstrated on `CancelBuildOrder`, and the example has now been
    // through both of its available shapes. It used to be `Undo` -- a stronger
    // example while `Undo` was the command with a handler branch, a full
    // implementation behind it and no way to reach it -- and it moved here when
    // #261 gave `Undo` a producer. Now this command has one too, so the
    // *interesting* half of the control is what remains: the handler branch is
    // still not read as a dispatch, and the producer is found where it really is.
    //
    // With no unproduced command left anywhere, there is no example that can
    // demonstrate the rule by having zero producers; asserting "the handler is
    // not the producer" while naming the file that *is* is the strongest form
    // available, and it is the form that keeps working as commands gain
    // producers.
    const handler = producerSources.find((source) => source.where === join('src', 'simulation', 'construction', 'handler.ts'));
    expect(handler, 'the construction command handler moved; this control needs its new path').toBeDefined();
    expect(handler!.text).toContain(`case 'CancelBuildOrder':`);
    expect(producerPattern('CancelBuildOrder').test(handler!.text)).toBe(false);
    expect(producersOf('CancelBuildOrder')).toEqual(['src/main.ts']);

    // And the same file's `case 'Undo':` is still not read as a dispatch: the
    // branch is in the handler and the producer is in `src/main.ts`, and this
    // gate tells them apart.
    expect(handler!.text).toContain(`case 'Undo':`);
    expect(producerPattern('Undo').test(handler!.text)).toBe(false);
    expect(producersOf('Undo')).toEqual(['src/main.ts']);
  });

  it('accounts for every unproduced command, with a reason', () => {
    const unlisted = unproducedTypes.filter((type) => AWAITING_PRODUCER[type] === undefined);
    expect(
      unlisted,
      'a declared command type nothing in src/ outside src/simulation/protocol/ constructs. A command only a test can send is indistinguishable from an unimplemented feature: wire a producer, or record the type in AWAITING_PRODUCER with what is true about it today',
    ).toEqual([]);

    for (const [type, reason] of Object.entries(AWAITING_PRODUCER)) {
      expect(reason.trim().length, `${type} needs a reason`).toBeGreaterThan(80);
    }
  });

  it('holds no entry for a command that has since gained a producer', () => {
    // The direction that makes the list a gate rather than a note, and the
    // one that has already fired: giving the HUD a purchase control -- #89's
    // actual blocker -- failed this until the `PurchaseMaterials` entry went,
    // so the record could not outlive the fact. Restricted to types still
    // declared, so a *removed* command fails the assertion below with its
    // reason rather than failing here with the wrong diagnosis.
    const declared = new Set(COMMAND_TYPES);
    const stale = Object.keys(AWAITING_PRODUCER).filter((type) => declared.has(type) && !unproducedTypes.includes(type));
    expect(stale, 'these commands now have a producer in src/: delete their AWAITING_PRODUCER entries in the same change').toEqual([]);
  });

  it('still declares every command the list names', () => {
    const declared = new Set(COMMAND_TYPES);
    const removed = Object.keys(AWAITING_PRODUCER).filter((type) => !declared.has(type));
    expect(
      removed.map((type) => `${type}: ${AWAITING_PRODUCER[type]}`),
      'a command this list accounts for is no longer declared. Deleting an unreachable command is a legitimate outcome and the owner\'s call: if that is the decision, delete the entry, its handler branch and its `commandJson` case in the same change',
    ).toEqual([]);
  });

  // **This name read "measures seventeen produced and one unproduced, the
  // first entry this list has held in six passes", and both halves of it went
  // false in the same commit that moved the two assertions below to 0 and
  // 18** (#1167). A test name is what a reader of a CI log is shown, so it is
  // corrected here rather than left describing the state the body had just
  // stopped asserting -- and it is kept quoted, because this file's whole
  // subject is a count that means something.
  it('measures twenty produced and none unproduced, the list empty again after its one entry', () => {
    // The denominator, stated so the gate reports a fact rather than only
    // guarding one, and exact in both directions. A command that quietly
    // stopped being reachable would otherwise only have to be added to the
    // list above, and adding an entry is a smaller act than changing a count
    // that says a third of the command surface cannot be reached from the
    // application.
    //
    // It read five and one on the first run, three and three once #261 gave
    // the undo pair its keys, two and four on #89's branch before that merged
    // in, one and six once the Rooms tab gave `ZoneRoom` a producer and brought
    // `UnzoneRoom` with one, one and seven once ADR 0025 added `HireStaff`
    // *with* its producer, one and eight once #261 step 4 added
    // `AdmitPrisoner` the same way, one and nine once ADR 0028 phase 1
    // added `PlaceObject` -- also with its producer, from two routes: the
    // object tool's world gesture and the Build panel's numeric fields -- one
    // and ten once phase 3 added `RemoveObject` with the same two routes in
    // their removing mode, **zero and eleven** once the Build panel's queue
    // block gave `CancelBuildOrder` the only thing it had ever been short of -- a
    // read model that names the pending orders, so a control can aim at one --
    // and **zero and twelve** once `CancelMaterialPurchase` arrived with its
    // producer and gave the same treatment to a purchase (#285), which is what
    // finally put a caller in `src/` in front of `ProcurementSystem.cancel`, and
    // **zero and thirteen** once `ReleaseGuardAssignment` arrived the same way
    // and put the first caller in `src/` in front of `GuardRoster.unassign` for a
    // guard something is *holding* (ADR 0034), and **zero and fourteen** once
    // `DismissStaff` arrived the same way and put the first caller in `src/` in
    // front of anything that removes a staff member from the roster at all
    // (#533) -- which, unlike the three before it, was not an unreachable
    // existing path but a path that did not exist, and **zero and fifteen**
    // once `DismissAlert` arrived the same way (ADR 0084 decision 3, the
    // owner's, 2026-09-01) and gave the alerts log the player gesture two
    // modules in `src/ui/` had each recorded as missing, and **zero and
    // sixteen** once `RemoveWall` arrived the same way (ADR 0106) and put a
    // pointer route in front of `ConstructionSystem.completedOrderClaimingEdge`
    // for a finished wall, which until then had none, and **zero and
    // seventeen** once `SellMaterials` arrived the same way (ADR 0075
    // decision 3, invoked by ADR 0096 decision 3(b)) and put the first
    // caller in `src/` in front of `ProcurementSystem.sellStock` and
    // `previewSellStock`.
    // Both numbers move in the same change as a producer, which is the point of
    // asserting the count as well as the list: neither can be edited alone and
    // stay green. Note the denominator moves too, so an eighteenth command
    // added with no producer fails here as well as failing the accounting
    // above.
    // **One and seventeen from 2026-09-14 to 2026-09-16**, and the streak of
    // zeroes above ended deliberately for those two days: ADR 0113's
    // `EditRegimeBlock` landed with its consumer, its refusals and its save
    // section and without its panel, for the reason `AWAITING_PRODUCER`
    // recorded. **Zero and eighteen again since the Regime panel's editor
    // shipped** (#1167) -- `regime-panel.ts`'s toggle group sends it, `hud.ts`
    // dispatches it and `src/main.ts` submits it, which is the three-file route
    // every other command takes. Both numbers still move together, which is
    // what this pair of assertions is for -- a nineteenth command added with no
    // producer fails here as well as failing the accounting above.
    expect(unproducedTypes.length).toBe(0);
    expect(COMMAND_TYPES.length - unproducedTypes.length).toBe(20);
  });
});
