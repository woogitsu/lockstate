import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { ACTION_IDS } from '../../src/input/actions';

/**
 * Issue #200, recommendation: *"Headless, `tests/unit/input.test.ts` could
 * additionally assert that every `ACTION_IDS` entry has a reader in `src/` --
 * the same shape as `tests/foundation/unconsumed-content-contract.test.ts`
 * applies to content ids, and it would have caught five of these nine at
 * declaration time."*
 *
 * Nine actions are declared. Four are read. `src/rendering/scene/world-scene.ts`
 * calls `isActive` for `camera.right`/`camera.left`/`camera.down`/`camera.up`
 * and for nothing else, so `camera.zoom.in`, `camera.zoom.out`,
 * `selection.primary`, `build.confirm` and `build.cancel` are declared, given a
 * locale string apiece (`src/content/default-locale-en.ts`), and read by no
 * consumer. Three of them are bound to keys a player can press: measured in a
 * browser, `Equal` and `Minus` left the zoom at 1 across ten presses, and
 * `Escape` neither cleared a pending wall run nor stopped it committing.
 *
 * A dead key is worse than a missing one -- it is indistinguishable from a
 * broken build -- and the suite could not tell the difference: deleting the
 * `Equal` binding and deleting the `Escape` binding each survived the whole
 * suite (#200).
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
 * The reasons state what is verifiably true today. None of them proposes a
 * plan, because the plan is #200 item 3 and it is explicitly the owner's:
 * `AGENTS.md` boundary 10 requires input to support remapping and
 * QWERTY/AZERTY, and #141 already holds remapping and accessibility as an open
 * commitment. Wiring the event stream makes `ACTION_REGISTRY.behavior` and the
 * bindings mean something; deleting these five makes boundary 10 harder to
 * satisfy later. Choosing inside a test file would be the same mistake as
 * choosing inside `world-scene.ts`.
 *
 * What the list buys is that **acting on that decision forces these entries
 * out**. Wiring a consumer fails the stale check below until the entry is
 * deleted; deleting an id fails the still-declared check. Either way the change
 * has to pass through this list, which is the difference between five facts
 * recorded in an issue body and five facts a gate holds.
 */
const AWAITING_CONSUMER: Readonly<Record<string, string>> = {
  'camera.zoom.in':
    'Bound to `Equal` in DEFAULT_KEYBOARD_BINDINGS and read by nobody: measured in a browser, five presses of `Equal` left `camera.zoom` at 1. It is a `discrete` action, so a held-key poll cannot serve it at all -- it needs the `SemanticActionEvent` array `KeyboardInputAdapter.keyDown` returns and `world-scene.ts` discards. Whether that stream gains a consumer or the binding goes is #200 item 3, which is an owner decision against `AGENTS.md` boundary 10 and #141.',
  'camera.zoom.out':
    'Bound to `Minus` and read by nobody: measured in a browser, five presses left `camera.zoom` at 1. The camera does zoom -- on the wheel and on a pinch, both of which call `zoomAtScreenPoint` directly without going through an action id -- so this is a second, dead path to a behaviour that works, not a missing behaviour. Same `discrete`/poll mismatch and same open decision as `camera.zoom.in` (#200 item 3).',
  'selection.primary':
    'Emitted by `PointerInputAdapter` when the `world` context is active, and read by nobody: the returned event array reaches `world-scene.ts` and is discarded. Nothing in the repository selects anything yet -- there is no selection state, no highlight and no inspector -- so unlike the zoom keys this one is not a dead path to a working behaviour but a declared control for a feature that does not exist (#141, #200).',
  'build.confirm':
    'Emitted by `PointerInputAdapter` when the `construction` context is active, and read by nobody. Placement does work, through `WorldScene`\'s own Phaser pointer handlers, which never consult an action id -- so the action duplicates a live behaviour without participating in it. Note that the `construction` context is itself never active: `world-scene.ts` supplies `world` or `text-entry` (#201), so this branch of `primaryAction` cannot be reached in production today.',
  'build.cancel':
    'Bound to `Escape`, emitted by `PointerInputAdapter.pointerCancel`, and read by nobody. Measured with the build tool armed: `Escape` pressed mid-drag left the four targeted segments unchanged and the run committed anyway. `WorldScene.cancelBuild` exists and does the right thing; it is reachable only from a second finger arriving during a pinch and from the tool being disarmed mid-gesture. This is #200 item 2 -- a real defect with an unambiguous intent -- held open only because the honest fix consumes the event stream rather than polling a `discrete` action, which is item 3\'s decision.',
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

  it('measures four consumed and five unread, which is the number #200 reported', () => {
    // The denominator, stated so the gate reports a fact rather than only
    // guarding one. This is deliberately an exact number in both directions:
    // an action that quietly stopped being read would otherwise only have to
    // be added to the list above, and adding an entry is a smaller act than
    // changing a count that says the control surface is half-built.
    expect(unreadIds.length).toBe(5);
    expect(ACTION_IDS.length - unreadIds.length).toBe(4);
  });
});
