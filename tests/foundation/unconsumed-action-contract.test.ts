import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { ACTION_IDS, ACTION_REGISTRY } from '../../src/input/actions';

/**
 * Issue #200, recommendation: *"Headless, `tests/unit/input.test.ts` could
 * additionally assert that every `ACTION_IDS` entry has a reader in `src/` --
 * the same shape as `tests/foundation/unconsumed-content-contract.test.ts`
 * applies to content ids, and it would have caught five of these nine at
 * declaration time."*
 *
 * Nine actions are declared. Seven are read.
 *
 * When this gate was written it was four. `src/rendering/scene/world-scene.ts`
 * called `isActive` for `camera.right`/`camera.left`/`camera.down`/`camera.up`
 * and for nothing else, so five ids were declared, given a locale string apiece
 * (`src/content/default-locale-en.ts`), and read by no consumer -- three of
 * them bound to keys a player can press. Measured in a browser at the time:
 * `Equal` and `Minus` left the zoom at 1 across ten presses, and `Escape`
 * neither cleared a pending wall run nor stopped it committing.
 *
 * A dead key is worse than a missing one -- it is indistinguishable from a
 * broken build -- and the suite could not tell the difference: deleting the
 * `Equal` binding and deleting the `Escape` binding each survived the whole
 * suite (#200). #200 items 2 and 3 wired the three of them:
 * `WorldScene.handleActionEvents` consumes the `SemanticActionEvent` array the
 * adapter returns and switches on `action`. Their entries came out of the list
 * below, which is the direction this file was built to force.
 *
 * ## The second rule, added with the consumer
 *
 * There are now two ways an action reaches the game -- a held-key poll and a
 * discrete event -- and `ActionDefinition.behavior` says which one an action
 * is for. It said so decoratively: nothing in `src/` read the field, and its
 * one former reader was the tautological filter #200 item 4 deleted. So the
 * pairing is asserted here, textually, in both directions: a `discrete` action
 * cannot be served by a poll at all (that is exactly why the zoom keys were
 * dead), and a `continuous` action handled in the event switch would fire once
 * per press instead of once per frame.
 *
 * ## Why this file rather than `tests/unit/input.test.ts`
 *
 * #200 names that file, and it is the wrong home on inspection:
 * `tests/unit/input.test.ts` is pure logic over the input API and imports no
 * filesystem module. This gate reads `src/**` off disk, which is what every
 * sibling of that kind under `tests/foundation/` does -- and #200's own
 * sentence names the sibling this is modelled on. The behaviour asserted is the
 * one #200 asked for; only the directory differs.
 *
 * ## What counts as a reader
 *
 * The action id as a single-quoted literal, in a `.ts` file under `src/`,
 * **excluding `src/input/` itself**. That exclusion is the whole measurement,
 * and it is the same argument `unconsumed-content-contract.test.ts` makes for
 * excluding `src/content/`: declaring an action, binding a key to it and
 * constructing an event carrying it are all things the input tier does to
 * describe a control. None of them is the game doing something when the player
 * presses the key. `src/input/pointer.ts` returning
 * `{ action: 'build.confirm', … }` is the clearest case: the array it returns is
 * discarded by the only caller (`world-scene.ts`), so counting it as a reader
 * would report a consumed action for a key that does nothing -- exactly the
 * conclusion this gate exists to prevent.
 *
 * The leading quote in the search term matters. Every action also has a locale
 * key of the form `'input.action.camera.zoom.in'`, which contains the id as a
 * substring but not as a quoted literal, so the locale table does not read as a
 * consumer. That is correct: a string a nonexistent settings UI would display
 * is not a control.
 *
 * Unlike the content gate, this one measures `src/` alone and does not count
 * `tests/`. The content gate weakens to `src/` + `tests/` because the strict
 * measure would need 58 allow-list entries all saying the same thing; here the
 * strict measure needs five, so the honest rule is affordable and the weaker one
 * would only hide them.
 */

const ROOT = join(__dirname, '../..');

/**
 * Declared, and read by nothing outside `src/input/`.
 *
 * It held five. Three came out when #200 items 2 and 3 were decided and the
 * event stream gained its consumer, which is what this list is for: the stale
 * check below failed on each of them until the entry was deleted, so the record
 * could not outlive the fact.
 *
 * The two that remain are the two the decision did not reach, and the reasons
 * say what is verifiably true today rather than proposing a plan. Both come
 * from `PointerInputAdapter`, whose returned events are still discarded --
 * `WorldScene` consumes the *keyboard* adapter's array and not the pointer
 * one, because placement and panning already work through Phaser's own pointer
 * handlers, which consult no action id.
 */
const AWAITING_CONSUMER: Readonly<Record<string, string>> = {
  'selection.primary':
    'Emitted by `PointerInputAdapter` when the `world` context is active, and read by nobody: the returned event array reaches `world-scene.ts` and is discarded. Nothing in the repository selects anything yet -- there is no selection state, no highlight and no inspector -- so unlike the zoom keys this one is not a dead path to a working behaviour but a declared control for a feature that does not exist (#141, #200). Note that no key is bound to it either, so no player can press it and find nothing happening.',
  'build.confirm':
    'Emitted by `PointerInputAdapter` when the `construction` context is active, and read by nobody. Placement does work, through `WorldScene`\'s own Phaser pointer handlers, which never consult an action id -- so the action duplicates a live behaviour without participating in it. Note that the `construction` context is itself never active: `world-scene.ts` supplies `world` or `text-entry` (#201), so this branch of `primaryAction` cannot be reached in production today. No key is bound to it.',
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

const readerSources = collectTypeScriptFiles(join(ROOT, 'src'))
  // Comments are stripped so an id *discussed* in prose does not read as a
  // reference -- and this file's subject makes that essential rather than
  // tidy: `world-scene.ts` and `bindings.ts` both carry comments naming the
  // very ids that have no reader, so an unstripped scan would report them
  // consumed by the sentences saying they are not. `stripComments` is the
  // shared one, which removes a trailing `//` comment as well as a whole-line
  // one (#188).
  .map((path) => ({ where: relative(ROOT, path), text: stripComments(readFileSync(path, 'utf8')) }))
  .filter((source) => !source.where.startsWith(join('src', 'input')));

const isRead = (id: string): boolean => readerSources.some((source) => source.text.includes(`'${id}'`));
const unreadIds = ACTION_IDS.filter((id) => !isRead(id));

describe('every declared input action either has a reader or is accounted for', () => {
  it('scans a real source set and really finds the readers that exist', () => {
    // Both halves of the vacuity guard, and the second is the one that matters.
    // An empty file list would make every id unread -- loud. A scan that
    // matched nothing, or a stripper that blanked the file, would do the same
    // in a way the file count cannot see, so the positive control names the
    // four ids that are genuinely consumed and where.
    expect(readerSources.length).toBeGreaterThan(50);
    expect(ACTION_IDS.length).toBe(9);

    const cameraPoll = readerSources.find((source) => source.where === join('src', 'rendering', 'scene', 'world-scene.ts'));
    expect(cameraPoll, 'the one production consumer of src/input/ is no longer where this gate looks for it').toBeDefined();
    for (const consumed of ['camera.up', 'camera.down', 'camera.left', 'camera.right'] as const) {
      expect(isRead(consumed), `${consumed} is read by world-scene.ts's isActive poll; a scan that cannot see it is broken`).toBe(true);
      expect(cameraPoll!.text).toContain(`isActive('${consumed}')`);
    }
  });

  it('accounts for every unread action, with a reason', () => {
    const unlisted = unreadIds.filter((id) => AWAITING_CONSUMER[id] === undefined);
    expect(
      unlisted,
      'a declared action id that nothing in src/ outside src/input/ reads. A bound key that does nothing is indistinguishable from a broken build (#200): wire a consumer, or record the id in AWAITING_CONSUMER with what is true about it today',
    ).toEqual([]);

    for (const [id, reason] of Object.entries(AWAITING_CONSUMER)) {
      expect(reason.trim().length, `${id} needs a reason`).toBeGreaterThan(80);
    }
  });

  it('holds no entry for an action that has since gained a reader', () => {
    // The direction that makes the list a gate rather than a note. Wiring
    // `build.cancel` to `WorldScene.cancelBuild` -- #200 item 2, the most
    // likely next change here -- fails this until the entry goes, so the
    // record cannot outlive the fact. Restricted to ids still declared, so a
    // *deleted* id fails the assertion below with its reason instead of
    // failing here with the wrong diagnosis.
    const declared = new Set<string>(ACTION_IDS);
    const stale = Object.keys(AWAITING_CONSUMER).filter((id) => declared.has(id) && !unreadIds.includes(id as never));
    expect(stale, 'these actions now have a reader in src/: delete their AWAITING_CONSUMER entries in the same change').toEqual([]);
  });

  it('still declares every action the list names', () => {
    const declared = new Set<string>(ACTION_IDS);
    const removed = Object.keys(AWAITING_CONSUMER).filter((id) => !declared.has(id));
    expect(
      removed.map((id) => `${id}: ${AWAITING_CONSUMER[id]}`),
      'an action this list accounts for is no longer declared. Deleting the unconsumed actions is one of the two directions #200 item 3 offers, and it is the owner\'s call: if that is the decision, delete the entry in the same change, and its locale key with it',
    ).toEqual([]);
  });

  it('measures seven consumed and two unread, which is what #200 items 2 and 3 changed', () => {
    // The denominator, stated so the gate reports a fact rather than only
    // guarding one. This is deliberately an exact number in both directions:
    // an action that quietly stopped being read would otherwise only have to
    // be added to the list above, and adding an entry is a smaller act than
    // changing a count that says the control surface is half-built. It was
    // four and five before the event stream gained a consumer.
    expect(unreadIds.length).toBe(2);
    expect(ACTION_IDS.length - unreadIds.length).toBe(7);
  });

  it('serves each action the way its declared behavior says it can be served', () => {
    /*
     * The invariant the consumer added, and the one that gives
     * `ActionDefinition.behavior` a reader at all.
     *
     * Two routes exist and they are not interchangeable. `isActive` answers
     * "is this key down right now", which `update()` asks four times a frame
     * -- correct for a `continuous` action and incapable of serving a
     * `discrete` one, because "zoom in" has no duration. That mismatch is
     * exactly why `Equal` and `Minus` did nothing for as long as they were
     * bound (#200). The event switch is the mirror: a `continuous` action
     * handled there would fire once on the press instead of every frame the
     * key is held, so the camera would jump one step and stop.
     *
     * Textual, and the bound is real -- it proves the shape of the call, not
     * that the call works. `tests/browser/world-scene-input.spec.ts` drives
     * real keys at a real camera for that. What this buys is that reaching
     * for the wrong route fails here rather than in a browser nobody ran.
     */
    const scene = readerSources.find((source) => source.where === join('src', 'rendering', 'scene', 'world-scene.ts'));
    expect(scene, 'the one production consumer of src/input/ is no longer where this gate looks for it').toBeDefined();

    const polled = ACTION_IDS.filter((id) => scene!.text.includes(`isActive('${id}')`));
    const switched = ACTION_IDS.filter((id) => scene!.text.includes(`case '${id}':`));

    // Vacuity guard: both routes must actually be found, or the two loops
    // below iterate over nothing and pass while saying nothing.
    expect(polled.length).toBe(4);
    expect(switched.length).toBe(3);
    expect(polled.filter((id) => switched.includes(id)), 'an action served both ways would act twice').toEqual([]);

    for (const id of polled) {
      expect(
        ACTION_REGISTRY[id].behavior,
        `${id} is polled with isActive, which only answers "is the key down"; a discrete action cannot be served that way (#200)`,
      ).toBe('continuous');
    }
    for (const id of switched) {
      expect(
        ACTION_REGISTRY[id].behavior,
        `${id} is handled as a one-shot event; a continuous action handled there fires once per press instead of once per frame`,
      ).toBe('discrete');
    }
  });
});
