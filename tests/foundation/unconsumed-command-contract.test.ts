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
 * Six commands were declared. **One had a producer.** (There are eight now:
 * `UnzoneRoom` arrived with the Rooms tab and `AdmitPrisoner` with the Intake
 * panel, and each arrived with a producer.)
 *
 * `src/main.ts` dispatched `{ type: 'PlaceBuildOrder', ... }` from the
 * `'place-build-order'` HUD intent. `CancelBuildOrder`, `ZoneRoom`,
 * `PurchaseMaterials`, `Undo` and `Redo` had none: `HudIntent`
 * (`src/ui/hud/hud.ts`) declared five members and not one of them was a
 * cancel, a zone, a purchase or an undo, and no other module built a
 * command object at all.
 *
 * ## What it reads today: seven of eight
 *
 * `Undo` and `Redo` gained producers with #261's step 6, and their entries came
 * out of the list below in the same change -- which is the direction this file
 * exists to force. The transaction model itself is older than either: it has
 * been in `ConstructionSystem` since #108, and what #261 added was the way to
 * reach it. `HudIntent` now declares twelve members, two of which are `undo` and
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
 * `AdmitPrisoner` is the eighth member and never appeared on the list below
 * either, for the same reason: it arrived with its producer in the same change
 * (#261 step 4), the schema member, the `createSessionCommandHandler` branch,
 * the `HudIntent` member and the Intake panel that emits it landing together.
 * That is the direction this gate wants a command to arrive from, and it is
 * worth naming because the alternative -- declaring the command first and
 * wiring it later -- is exactly how the six before those two got here.
 *
 * So `CancelBuildOrder` is the whole of what the list below still holds, and
 * the count is measured, not carried: seven producers all in `src/main.ts`, one
 * command with none.
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
 * all eight handler branches as producers and report the opposite of the truth.
 *
 * Two limits, stated rather than left to be discovered:
 *
 * - A producer that assembles the object from a variable (`{ type: kind, ... }`)
 *   is invisible to a text scan. None exists today, and the positive control
 *   below fails loudly if any of the seven that do exist stops being found.
 * - The scan cannot tell a live dispatch from dead code inside `src/`. It
 *   answers "can this command be constructed anywhere in the application",
 *   which is the weaker and checkable half of "can a player send it".
 *
 * Both err toward reporting a command as *produced*, so the failures this
 * gate raises are real ones.
 *
 * ## Why the list comes out of the schema
 *
 * `simulationCommandSchema.options` is the discriminated union itself, so a
 * ninth member is in scope the moment it is added. A hand-written array
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
  CancelBuildOrder:
    'Handled at `construction/handler.ts` and reachable from `ConstructionSystem.cancelOrder`, but nothing in the application constructs the command. The Build panel places an order and offers no way to withdraw a *particular* one: since #261 a misplaced run can be taken back whole, by `KeyZ`, because undo pops the last transaction -- which is not the same control. Cancelling the third order of a twelve-segment run still needs a per-order control on the panel, which is #174 territory since that panel is already over its height budget.',
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
    // where it is -- all seven in `src/main.ts`, which is the composition root
    // and the only place in `src/` that builds a command object.
    expect(producerSources.length).toBeGreaterThan(50);
    expect(COMMAND_TYPES.length).toBe(8);

    expect(producersOf('PlaceBuildOrder')).toEqual(['src/main.ts']);
    expect(producersOf('PurchaseMaterials')).toEqual(['src/main.ts']);
    expect(producersOf('AdmitPrisoner')).toEqual(['src/main.ts']);
    expect(producersOf('Redo')).toEqual(['src/main.ts']);
    // The two the Rooms tab added, asserted by name rather than only by the
    // count: a producer that had drifted out of the composition root would
    // still keep the count green.
    expect(producersOf('ZoneRoom')).toEqual(['src/main.ts']);
    expect(producersOf('UnzoneRoom')).toEqual(['src/main.ts']);
    const main = producerSources.find((source) => source.where === 'src/main.ts');
    expect(main, 'the production producers of a simulation command are no longer where this gate looks for them').toBeDefined();
    expect(main!.text).toContain(`type: 'PlaceBuildOrder'`);
    expect(main!.text).toContain(`type: 'PurchaseMaterials'`);
    expect(main!.text).toContain(`type: 'AdmitPrisoner'`);
    expect(main!.text).toContain(`type: 'Undo'`);
    expect(main!.text).toContain(`type: 'Redo'`);
    expect(main!.text).toContain(`type: 'ZoneRoom'`);
    expect(main!.text).toContain(`type: 'UnzoneRoom'`);
  });

  it('separates producing from consuming, so a handler branch is not mistaken for a dispatch', () => {
    // The rule the whole measurement rests on. `construction/handler.ts`
    // switches on all four of the commands it handles; if `case 'X':` counted
    // as producing an `X`, this gate would report all eight commands as
    // reachable and be exactly wrong about the one that is not.
    //
    // Demonstrated on `CancelBuildOrder`, which is handled there and produced
    // nowhere. It used to be `Undo` -- a stronger example while `Undo` was the
    // command with a handler branch, a full implementation behind it and no
    // way to reach it, and an impossible one now that #261 gave it a producer
    // in `src/main.ts`: the third assertion would be asserting the opposite of
    // the truth. The control moved to the command that still has the property.
    const handler = producerSources.find((source) => source.where === join('src', 'simulation', 'construction', 'handler.ts'));
    expect(handler, 'the construction command handler moved; this control needs its new path').toBeDefined();
    expect(handler!.text).toContain(`case 'CancelBuildOrder':`);
    expect(producerPattern('CancelBuildOrder').test(handler!.text)).toBe(false);
    expect(producersOf('CancelBuildOrder')).toEqual([]);

    // And the same file's `case 'Undo':` is still not read as a dispatch, now
    // that a real one exists one module away: the branch is in the handler and
    // the producer is in `src/main.ts`, and this gate tells them apart.
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

  it('measures seven produced and one unproduced, which is where #261 step 4 left the command surface', () => {
    // The denominator, stated so the gate reports a fact rather than only
    // guarding one, and exact in both directions. A command that quietly
    // stopped being reachable would otherwise only have to be added to the
    // list above, and adding an entry is a smaller act than changing a count
    // that says a third of the command surface cannot be reached from the
    // application.
    //
    // It read five and one on the first run, three and three once #261 gave
    // the undo pair its keys, two and four on #89's branch before that merged
    // in, and one and six once the Rooms tab gave `ZoneRoom` a producer and
    // brought `UnzoneRoom` with one. `AdmitPrisoner` then arrived *with* its
    // producer -- an eighth declared command and a seventh dispatch in the same
    // change -- so the denominator moved and the numerator did not, which is the
    // one direction this gate wants a new command to arrive from. Both numbers
    // move in the same change as a producer, which is the point of asserting the
    // count as well as the list: neither can be edited alone and stay green.
    expect(unproducedTypes.length).toBe(1);
    expect(COMMAND_TYPES.length - unproducedTypes.length).toBe(7);
  });
});
