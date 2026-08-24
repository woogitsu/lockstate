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
 * ## What it found on the first run
 *
 * Six commands are declared. **One has a producer.**
 *
 * `src/main.ts` dispatches `{ type: 'PlaceBuildOrder', ... }` from the
 * `'place-build-order'` HUD intent. `CancelBuildOrder`, `ZoneRoom`,
 * `PurchaseMaterials`, `Undo` and `Redo` have none: `HudIntent`
 * (`src/ui/hud/hud.ts`) declares five members and not one of them is a
 * cancel, a zone, a purchase or an undo, and no other module builds a
 * command object at all.
 *
 * `PurchaseMaterials` is the one that made this worth writing. #249 gave the
 * simulation money, a price list and a delivery; #250 put the balance on the
 * status strip. A player now *sees* the starting balance and cannot spend a
 * unit of it, because the only thing that can issue a purchase is a test.
 * That is the exact condition `src/ui/hud/projection.ts`'s own comment warns
 * about -- "the same class of lie as a money counter with no economy" -- and
 * it shipped anyway, because nothing was counting. This gate would have
 * failed on `PurchaseMaterials` the moment it joined the union.
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
 * all six handler branches as producers and report the opposite of the truth.
 *
 * Two limits, stated rather than left to be discovered:
 *
 * - A producer that assembles the object from a variable (`{ type: kind, ... }`)
 *   is invisible to a text scan. None exists today, and the positive control
 *   below fails loudly if the one that does exist stops being found.
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
 * seventh member is in scope the moment it is added. A hand-written array
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
    'Handled at `construction/handler.ts` and reachable from `ConstructionSystem.cancelOrder`, but nothing in the application constructs the command. The Build panel places an order and offers no way to withdraw one, so a misplaced wall can only be undone -- and `Undo` has no producer either. Needs a control on the panel, which is #174 territory since that panel is already over its height budget.',
  ZoneRoom:
    'Declared, schema-bounded and handled, with no producer. Its consumer stopped being a no-op in #261 -- `RoomZoningService` paints the world\'s zoning plane and registers a room instance, which is what finally moves the status strip\'s `Rooms` count -- so what is missing here is only the producer. Room zoning still has no interface at all: `HudIntent` carries `place-build-order` and `arm-build-tool` and nothing about rooms, so the whole zoning vocabulary is reachable only from a test. This is the command shape a room-designation tool would use when one exists.',
  PurchaseMaterials:
    'Added by #249 with the economy and still unreachable: `grep -rn "type: \'PurchaseMaterials\'" src/` returns nothing. The treasury balance is on the status strip as of #250, so the player sees money they cannot spend, and a build order therefore still cannot complete in a real session -- which is #89, unchanged in symptom and changed in cause. Blocked on a product decision about the buy surface, not on implementation.',
  Undo:
    'Handled at `construction/handler.ts` and wired to `ConstructionSystem.undo()`, which releases a cancelled order\'s materials. No producer: there is no undo control and no keyboard binding -- `src/input/actions.ts` declares no `edit.undo` action for one to be bound to. So the transaction stack the construction system maintains can be pushed and never popped.',
  Redo:
    'The mirror of `Undo` and unreachable for the same reason. `redo()` deliberately cannot double-refund, because `cancelOrder` clears `materialsAllocated` in the same step -- a property with no way to be exercised outside the suite while nothing can reach either command.',
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
    // positive control names the one command that genuinely has a producer
    // and where it is.
    expect(producerSources.length).toBeGreaterThan(50);
    expect(COMMAND_TYPES.length).toBe(6);

    expect(producersOf('PlaceBuildOrder')).toEqual(['src/main.ts']);
    const main = producerSources.find((source) => source.where === 'src/main.ts');
    expect(main, 'the one production producer of a simulation command is no longer where this gate looks for it').toBeDefined();
    expect(main!.text).toContain(`type: 'PlaceBuildOrder'`);
  });

  it('separates producing from consuming, so a handler branch is not mistaken for a dispatch', () => {
    // The rule the whole measurement rests on. `construction/handler.ts`
    // switches on all four of the commands it handles; if `case 'Undo':`
    // counted as producing an `Undo`, this gate would report five of six
    // commands as reachable and be exactly wrong.
    const handler = producerSources.find((source) => source.where === join('src', 'simulation', 'construction', 'handler.ts'));
    expect(handler, 'the construction command handler moved; this control needs its new path').toBeDefined();
    expect(handler!.text).toContain(`case 'Undo':`);
    expect(producerPattern('Undo').test(handler!.text)).toBe(false);
    expect(producersOf('Undo')).toEqual([]);
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
    // The direction that makes the list a gate rather than a note. Giving the
    // HUD a purchase control -- the most likely next change here, and #89's
    // actual blocker -- fails this until the `PurchaseMaterials` entry goes,
    // so the record cannot outlive the fact. Restricted to types still
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

  it('measures one produced and five unproduced, which is the state #89 is really about', () => {
    // The denominator, stated so the gate reports a fact rather than only
    // guarding one, and exact in both directions. A command that quietly
    // stopped being reachable would otherwise only have to be added to the
    // list above, and adding an entry is a smaller act than changing a count
    // that says five sixths of the command surface cannot be reached from the
    // application.
    expect(unproducedTypes.length).toBe(5);
    expect(COMMAND_TYPES.length - unproducedTypes.length).toBe(1);
  });
});
