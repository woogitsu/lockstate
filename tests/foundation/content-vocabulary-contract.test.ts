import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { defaultObjectRegistry, objectDefinitionSchema } from '../../src/content/object-catalog';
import { SIMULATION_ENUM_GROUPS } from '../../src/content/simulation-message-keys';

/**
 * Two content vocabularies that no gate could see, and the reason they were
 * invisible is the same one both times: **the row was gated on the dimensions
 * someone had already thought about, and not on this one.**
 *
 * `tests/foundation/` already holds `fault-code-`,
 * `challenge-rejection-code-`, `message-kind-`, `unconsumed-command-`,
 * `unconsumed-content-` and `unconsumed-action-` contracts. Each takes a
 * vocabulary that is declared in one place and consumed in another, and fails
 * when the two stop agreeing. This is the missing member for the vocabularies
 * `src/content/` declares that are not *ids*: an object's capability tags, and
 * a message-key namespace.
 *
 * ## What was measured before this file existed
 *
 * `src/content/object-catalog.ts:82`'s `object.desk` row had its
 * `capabilities: ['workstation']` changed to `['wrkstatoin-MUTANT']` -- a
 * plausible typo, in the dimension nothing checked. The 35 test files covering
 * `tests/foundation/` and every content and catalogue test returned a
 * **byte-identical** result to the unmutated baseline (`35 passed | 325
 * tests`), and `pnpm typecheck` passed, because `capabilities` is
 * `z.array(identifierSchema)` and a typo is a valid identifier.
 *
 * The control matters as much as the mutation: the *same row's* `id` and
 * `nameKey` are gated hard. Adding a whole new object draws four immediate
 * failures, and `validateBuildableObjectReferences` throws at import if a
 * buildable's `placesObjectId` stops naming a catalogue entry. So this was not
 * a catalogue nobody checks -- it was one checked in every dimension but one.
 *
 * ## What "consumed" means for a capability, precisely
 *
 * This is the part worth reading before trusting a reason below, because the
 * obvious phrasing is wrong. A capability is read on **two** paths and only
 * one of them names it as a literal:
 *
 *  - `requirementStatus` (`src/simulation/presentation/room-projection.ts`)
 *    asks whether every capability of the *required object* is present in the
 *    room instance's derived list. It names no capability at all -- it joins
 *    two sets -- so every declared capability is already load-bearing there,
 *    and none of them is dead.
 *  - `requiredObjectCapability` on a `PrisonerAction`
 *    (`src/simulation/prisoners/actions.ts`) and on an `AccommodationTarget`
 *    (`intake-system.ts`) names **one** capability as a literal, and that is
 *    what decides whether a prisoner can use a room for something.
 *
 * So the gate below measures the second path only, and the honest name for
 * what it finds is *"declared by an object and gated on by no action or
 * accommodation target"* -- **not** "unused". A reason that said "nothing
 * reads this" would be false for all thirteen.
 */

const ROOT = join(__dirname, '../..');
const SOURCE_ROOT = join(ROOT, 'src');

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

/**
 * Comments stripped, for the reason `unconsumed-content-contract` strips them
 * and with the same hazard in the same direction: this rule asks *"is this
 * capability gated on"*, so a comment answering yes would be a **silent
 * pass**. `src/simulation/construction/definition.ts` carries several
 * paragraphs naming these exact capabilities in order to say that nothing
 * gates them -- prose which, unstripped, would count as gating them and empty
 * this gate out.
 */
const srcSources = collectTypeScriptFiles(SOURCE_ROOT).map((path) => ({
  where: relative(ROOT, path),
  text: stripComments(readFileSync(path, 'utf8')),
}));

// ---------------------------------------------------------------------------
// 1. Object capabilities
// ---------------------------------------------------------------------------

const declaredCapabilities = [
  ...new Set(defaultObjectRegistry.all().flatMap((definition) => definition.capabilities)),
].sort();

/**
 * Every capability named as an action's or accommodation target's requirement,
 * read out of the real source text rather than by importing `DEFAULT_ACTIONS`.
 *
 * Source-scanned on purpose, and it is the difference between a gate and a
 * tautology: importing the actions and reading `action.requiredObjectCapability`
 * would compare the catalogue against a value the same program produced, and
 * would hold for any implementation (`docs/TESTING.md`'s rule against a
 * fixture supplying both sides). Reading the literal off the page means a
 * requirement added anywhere under `src/` -- in a system this file has never
 * heard of -- enters the census without this file being edited. It is the
 * technique `tests/helpers/simulation-enum-source.ts` and
 * `tests/determinism/ambient-nondeterminism-contract.test.ts` already use.
 */
const REQUIRED_CAPABILITY_PATTERN = /requiredObjectCapability:\s*'([a-z0-9-]+)'/g;

const requiredCapabilities = [
  ...new Set(srcSources.flatMap(({ text }) => [...text.matchAll(REQUIRED_CAPABILITY_PATTERN)].map((match) => match[1]!))),
].sort();

const declaredNotRequired = declaredCapabilities.filter((capability) => !requiredCapabilities.includes(capability));
const requiredNotDeclared = requiredCapabilities.filter((capability) => !declaredCapabilities.includes(capability));

/**
 * Declared by an object, gated on by no action and no accommodation target.
 *
 * `AWAITING_CONSUMER`'s idiom from `unconsumed-content-contract.test.ts`, and
 * its rule about reasons applies unchanged: **each reason states what is
 * verifiably true today and does not invent a roadmap for it.** Where the
 * repository has already written down why a capability is ungated, the reason
 * cites that rather than paraphrasing it -- `src/simulation/construction/definition.ts`
 * argues this for six of the thirteen in its own comments, and those
 * paragraphs are the most durable thing available to point at.
 *
 * Six of the thirteen are `object` requirements of some room, so they are read
 * by `requirementStatus`'s containment join every time that room is projected.
 * They are in this list because no *action* gates on them, which is a
 * different and narrower statement -- see the file docblock.
 */
const UNGATED_BY_ANY_ACTION: Readonly<Record<string, string>> = {
  'delivery-access': "Declared by `object.loading-dock-door` and required by `room.delivery-bay`, so the containment join reads it; no action gates on it. `src/simulation/construction/definition.ts` states it directly -- the capability appears \"in no `DEFAULT_ACTIONS` entry and in no other room's requirements\" -- and names ADR 0017's procurement route as the system that would consume it. The same comment records that what a player places is \"a capability marker on three tiles, not a passage\": it gates nothing and `DoorRegistry` does not read it.",
  'food-preparation': 'Declared by `object.stove` and `object.prep-counter`, both required by `room.kitchen`. No action prepares food: `DEFAULT_ACTIONS` has `action.eat-meal` gating on `dining` in a canteen, and nothing that cooks. A meal-production or kitchen-job system is what would gate on it, and neither exists.',
  'food-storage': 'Declared by `object.fridge`, required by `room.kitchen`. Gated on by no action, for the same reason as `food-preparation`: nothing in the simulation produces or stores a meal as an object yet.',
  'item-storage': "Declared by `object.storage-rack`, required by `room.storage-room`. `src/simulation/construction/definition.ts` lists it among the capabilities that \"appear in no `DEFAULT_ACTIONS` entry and in no other room's requirements\", and names #99's salvage destination as what would consume it.",
  laundry: "Declared by `object.washing-machine`, required by `room.laundry`. `src/simulation/construction/definition.ts` singles this one out: the capability \"is gated by **nothing**: no entry in `DEFAULT_ACTIONS` names it and no other room requires it, so a furnished `room.laundry` reads both its requirements satisfied and changes no prisoner's behaviour\", and names a laundry job system as what would consume it.",
  'medical-supply': 'Declared by `object.medicine-cabinet`, required by `room.infirmary`. No action treats or medicates a prisoner; the health/treatment system that would gate on it does not exist.',
  'medical-treatment': "Declared by `object.medical-bed`, required by `room.infirmary`. It is load-bearing in the containment join and `src/simulation/construction/definition.ts` explains the asymmetry it produces -- a plain `object.bed` cannot satisfy an infirmary's requirement while a medical bed can satisfy a cell's -- but no action names it, so nothing a prisoner does depends on it.",
  seating: "Declared by `object.chair` and `object.bench`. Not gated on by any action, and the near miss is recorded in `src/simulation/construction/definition.ts`: a bench declares `'seating'` and `'recreation'` and **not** `'dining'`, so a canteen's dining capacity comes from its tables and its benches bound nothing. Whether a bench should carry `'dining'` is left open there deliberately (#326) and is a content decision, not this gate's to make.",
  shower: "Declared by `object.shower-head`. The action that would gate on it gates on `hygiene` instead -- `action.wash` names `hygiene`, which `object.sink` also declares -- so `'shower'` distinguishes a shower head from a sink for nothing that currently asks.",
  surveillance: "Declared by `object.security-console`, required by `room.security-office`. `src/simulation/construction/definition.ts` lists it among the ungated five and names a security-deployment system as what would consume it. It is also the capability that makes the desk/console asymmetry work, which that comment sets out in full.",
  'utility-control': "Declared by `object.utility-panel`, required by `room.utility-room`. Listed in `src/simulation/construction/definition.ts` among the capabilities gated by nothing, with a maintenance job system named as what would consume it.",
  'waste-disposal': "Declared by `object.waste-bin`, required by `room.garbage-room`. Listed in `src/simulation/construction/definition.ts` among the capabilities gated by nothing.",
  workstation: "Declared by `object.desk` **and** `object.security-console`, and required by `room.reception` and `room.staff-room` through the desk. No action gates on it -- `ACTION_CATEGORIES` has a `work` category with no member in `DEFAULT_ACTIONS` at all (#440), so the actions that would name it are the two categories that are empty. This is the capability the reproduction above mutated, and the one whose typo nothing caught.",
};

describe('an object capability is declared and gated on, or it is accounted for', () => {
  it('reports the census in both directions, so the lists below are read against a number', () => {
    /*
     * Exact rather than `toBeGreaterThan`, for `unconsumed-content-contract`'s
     * stated reason: the failure mode is a number drifting quietly. An object
     * gaining a capability, or an action gaining its first requirement, should
     * be a visible change here rather than an invisible one.
     *
     * `requiredNotDeclared` is the direction that is always a defect and is
     * asserted separately below. It is in the census too because a census
     * reporting only the comfortable direction is how the other one goes
     * unnoticed.
     */
    expect({
      declared: declaredCapabilities.length,
      required: requiredCapabilities.length,
      declaredNotRequired: declaredNotRequired.length,
      requiredNotDeclared: requiredNotDeclared.length,
    }).toEqual({ declared: 19, required: 6, declaredNotRequired: 13, requiredNotDeclared: 0 });
  });

  it('cannot pass vacuously on an empty catalogue or an empty scan', () => {
    // The census above fails loudly if the catalogue empties. This covers the
    // half that would fail *silently*: a scan that stopped matching would make
    // `requiredCapabilities` empty, which moves `requiredNotDeclared` to 0 --
    // the value it is supposed to have -- and the "no undeclared requirement"
    // rule would then assert about nothing at all.
    expect(defaultObjectRegistry.all().length).toBeGreaterThan(15);
    expect(srcSources.length).toBeGreaterThan(100);
    expect(requiredCapabilities.length).toBeGreaterThan(3);
    expect(requiredCapabilities).toContain('sleep-surface');
  });

  /**
   * The direction that is always a defect, and the one the reproduction
   * exposed: an action gating on a capability spelled differently from the one
   * an object declares.
   *
   * Its consequence is not an error anywhere. `findAvailableForUse` filters
   * room instances on `objectCapabilities.includes(required)`, so a misspelled
   * requirement simply matches no room, for ever -- the prisoner never
   * performs the action and nothing reports why.
   */
  it('names no required capability that no object declares', () => {
    expect(
      requiredNotDeclared,
      'an action or accommodation target requires a capability no object in the catalogue declares. It will match no room instance and the action will silently never run -- check the spelling against src/content/object-catalog.ts',
    ).toEqual([]);
  });

  it('accounts for every declared capability that no action gates on', () => {
    const unlisted = declaredNotRequired.filter((capability) => UNGATED_BY_ANY_ACTION[capability] === undefined);
    expect(
      unlisted,
      'a capability is declared by an object and gated on by no action: add it to UNGATED_BY_ANY_ACTION with the reason, or give an action a requiredObjectCapability that names it',
    ).toEqual([]);
  });

  it('gives every listed capability a non-empty reason', () => {
    for (const [capability, reason] of Object.entries(UNGATED_BY_ANY_ACTION)) {
      expect(reason.trim().length, `${capability} needs a reason`).toBeGreaterThan(20);
    }
  });

  /**
   * This is the assertion the reproduction fails. Renaming or misspelling a
   * declared capability removes it from the catalogue, and its entry here says
   * so by name rather than the change passing in silence.
   */
  it('still declares every capability the list names', () => {
    const declared = new Set(declaredCapabilities);
    const removed = Object.keys(UNGATED_BY_ANY_ACTION).filter((capability) => !declared.has(capability));
    expect(
      removed.map((capability) => `${capability}: ${UNGATED_BY_ANY_ACTION[capability]}`),
      'a capability this list accounts for is no longer declared by any object -- if the removal is deliberate, delete its entry in the same change; if it is a typo in src/content/object-catalog.ts, this is the gate that was missing',
    ).toEqual([]);
  });

  it('holds no entry for a capability an action has since started gating on', () => {
    // The stale-entry shape every allow-list in this directory carries: without
    // it the list only grows and eventually describes a state the repository
    // left behind.
    const stale = Object.keys(UNGATED_BY_ANY_ACTION).filter((capability) => requiredCapabilities.includes(capability));
    expect(stale, 'an action now gates on these capabilities: remove their entries').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. An object with no capabilities at all
// ---------------------------------------------------------------------------

/**
 * The same dimension, one step further along: not a capability spelled wrong,
 * but a capability list that is empty.
 *
 * `capabilities` was `z.array(identifierSchema).max(16)` -- a ceiling and no
 * floor -- so `[]` was valid content. `requirementStatus` treats an empty list
 * as `'missing-capability'` on sight, so such an object makes every room
 * requiring it permanently unsatisfiable: the room reports the requirement
 * missing, the player builds and places the very object it names, and the
 * report does not change. Nothing logs, throws or reports.
 */
describe('an object with no capabilities is refused by the schema, not by a projection', () => {
  const validRow = {
    schemaVersion: 1 as const,
    id: 'object.probe',
    numericId: 900,
    nameKey: 'object.probe.name',
    category: 'furniture' as const,
    footprint: { width: 1, height: 1 },
  };

  it('accepts a row with one capability', () => {
    // The control. Without it, an assertion that `[]` is refused would also
    // pass if the schema had started refusing every row for some other reason.
    expect(objectDefinitionSchema.safeParse({ ...validRow, capabilities: ['probe-capability'] }).success).toBe(true);
  });

  it('refuses the same row with an empty capability list', () => {
    const result = objectDefinitionSchema.safeParse({ ...validRow, capabilities: [] });
    expect(result.success).toBe(false);
  });

  it('still refuses a list longer than the ceiling, so the floor did not replace the bound', () => {
    const tooMany = Array.from({ length: 17 }, (_, index) => `probe-${index}`);
    expect(objectDefinitionSchema.safeParse({ ...validRow, capabilities: tooMany }).success).toBe(false);
  });

  it('is a rule the shipped catalogue already satisfies, so the floor is not aspirational', () => {
    const empty = defaultObjectRegistry.all().filter((definition) => definition.capabilities.length === 0);
    expect(empty.map((definition) => definition.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Message-key namespaces
// ---------------------------------------------------------------------------

const DERIVE_CALL_PATTERN = /deriveSimulationMessageKey\(\s*'([a-z0-9-]+)'/g;

/**
 * Namespaces named at a `deriveSimulationMessageKey` call site under `src/`.
 *
 * The declaring module is excluded: it names every namespace in its own group
 * table and in its own derivation helper, so leaving it in would make every
 * namespace reachable and the measurement would be of nothing.
 */
const calledNamespaces = new Set(
  srcSources
    .filter(({ where }) => where !== join('src', 'content', 'simulation-message-keys.ts'))
    .flatMap(({ text }) => [...text.matchAll(DERIVE_CALL_PATTERN)].map((match) => match[1]!)),
);

const declaredNamespaces = SIMULATION_ENUM_GROUPS.map((group) => group.namespace);
const namespacesWithoutCallSite = declaredNamespaces.filter((namespace) => !calledNamespaces.has(namespace));
const labelsWithoutCallSite = SIMULATION_ENUM_GROUPS.filter(
  (group) => !calledNamespaces.has(group.namespace),
).reduce((total, group) => total + Object.keys(group.labels).length, 0);

describe('the message-key namespaces are counted, and no call site names one that does not exist', () => {
  /**
   * **A census, deliberately not a purge and deliberately not an allow-list.**
   *
   * Most of this table is unreachable from `src/`: 152 of the 172 derived
   * labels, across 38 of the 42 namespaces, sit under a namespace no
   * `deriveSimulationMessageKey` call site names. Four namespaces have one --
   * `build-edge`, `build-order-state`, `intake-stage` and `guard-claim`.
   *
   * **The counts moved by one, and the direction is the one this census is
   * for.** They read 151 of 171 until `action.free-association` was appended
   * to `DEFAULT_ACTIONS` and labelled `'Association'`
   * ([ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
   * decision 1). The `action` namespace had no `deriveSimulationMessageKey`
   * call site, and the reason was not that entry: **nothing under `src/ui/`
   * requested `hud/prisoner-roster` or `hud/prisoner-detail` at all.** Six
   * projections had a painter -- `hud/build-queue`, `hud/prisoner-population`,
   * `hud/pending-deliveries`, `hud/held-guards`, `hud/room-list` and
   * `hud/room-detail`; the two that carry a prisoner's current action had a
   * route and no panel on the end of it, which is the state
   * `tests/foundation/projection-reachability-contract.test.ts` exists to
   * distinguish from having no route. So the new label landed in the
   * unreachable column with the other 151, exactly as this docblock says the
   * table was written to do.
   *
   * **And then it moved the other way, by 25, which is the largest single
   * move this census has recorded** (issue #451). Both halves are left
   * standing rather than one being overwritten, because the pair is what a
   * reader checks. The Regime panel on the fifth tab reads
   * `hud/prisoner-roster` through `src/ui/simulation-prisoner-roster.ts` and
   * `hud/status-strip` through `src/ui/simulation-regime.ts`, and between them
   * those two modules call `deriveSimulationMessageKey` for five namespaces
   * that had no call site the day before: `action` (9 labels),
   * `action-category` (7), `action-phase` (3), `classification-group` (2) and
   * `risk-tier` (4). So 152 unreachable labels became 127 and four namespaces
   * with a call site became nine. Nothing was added to the table to achieve
   * it: every one of those 25 labels was already written, waiting for the
   * panel this docblock said they were waiting for.
   *
   * That number is **not** a defect list, and the distinction is the same one
   * `unconsumed-content-contract`'s docblock spends its length on. These
   * labels are what a HUD panel will render when the panel exists;
   * `docs/HUD_PROJECTIONS.md` gap 3 is the reason the table was written at
   * all, and it was written ahead of the surfaces on purpose so that an enum
   * cannot ship without a label. Deleting them would delete the answer to the
   * problem the module exists to solve.
   *
   * So this asserts the count exactly -- a number that moves is a visible
   * change -- and gates the one direction that is unambiguously a defect,
   * below. **An allow-list with a reason per namespace is owed and not
   * delivered**: it would be 33 entries whose reason is uniformly "the panel
   * that would render it is not built yet", edited on every feature that
   * builds one, which is the trade-off `unconsumed-content-contract` declines
   * in terms ("a list nobody reads enforces nothing"). Which of the 33 are
   * genuinely awaiting a panel and which are the `REFUSAL_REASONS` case --
   * vocabularies that reach the player as a *sentence* and should be exempted
   * from the table rather than labelled by it -- is a judgement per namespace,
   * and `tests/unit/simulation-message-keys.test.ts` already holds the
   * exemption mechanism and the reasons for the ones that have been made.
   */
  it('reports the namespace census exactly', () => {
    expect({
      namespaces: declaredNamespaces.length,
      labels: SIMULATION_ENUM_GROUPS.reduce((total, group) => total + Object.keys(group.labels).length, 0),
      namespacesWithACallSite: declaredNamespaces.length - namespacesWithoutCallSite.length,
      namespacesWithoutACallSite: namespacesWithoutCallSite.length,
      labelsWithoutACallSite: labelsWithoutCallSite,
    }).toEqual({
      namespaces: 42,
      labels: 172,
      namespacesWithACallSite: 9,
      namespacesWithoutACallSite: 33,
      labelsWithoutACallSite: 127,
    });
  });

  it('cannot pass vacuously with a scan that matched nothing', () => {
    expect(calledNamespaces.size).toBeGreaterThan(0);
    expect([...calledNamespaces].sort()).toEqual([
      'action',
      'action-category',
      'action-phase',
      'build-edge',
      'build-order-state',
      'classification-group',
      'guard-claim',
      'intake-stage',
      'risk-tier',
    ]);
  });

  /**
   * The direction that is always a defect, and the mirror of
   * `requiredNotDeclared` above: a call site naming a namespace the group
   * table does not declare.
   *
   * `deriveSimulationMessageKey`'s parameter is typed
   * `SimulationEnumNamespace`, so a literal typo fails `pnpm typecheck` today
   * and this rule is currently redundant with the compiler. It is here because
   * that is exactly the guarantee `capabilities` looked like it had and did
   * not: the moment a namespace is passed as a widened `string` -- from a
   * projection field, a config value, a `Record` key -- the type stops
   * checking it and only a scan like this one still does.
   */
  it('names no namespace at a call site that the group table does not declare', () => {
    // `Set<string>` explicitly: `declaredNamespaces` is inferred as the
    // literal union `SimulationEnumNamespace`, so an unwidened set would
    // refuse the `string` this scan produces -- which is the whole point of
    // the rule. The compiler already rejects a bad literal at a call site; the
    // case below exists for the call site that passes a widened string, and it
    // has to be able to hold one.
    const declared = new Set<string>(declaredNamespaces);
    const unknown = [...calledNamespaces].filter((namespace) => !declared.has(namespace)).sort();
    expect(
      unknown,
      'a deriveSimulationMessageKey call site names a namespace SIMULATION_ENUM_GROUPS does not declare: the key it builds will resolve to nothing and render as raw dotted text',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Two key families for one id
// ---------------------------------------------------------------------------

/**
 * The defect the exact-key collision check could not see, gated as a class.
 *
 * `validateSimulationEnumGroups` refuses a `duplicate-key`, comparing keys for
 * equality. `object.category.sanitation.name` and
 * `object-category.sanitation.name` are not equal -- one character, a dot
 * where the other has a hyphen -- so both families lived in the assembled `en`
 * catalog at once, naming the same seven ids, and two of the seven carried
 * **different English words**: "Plumbing"/"Sanitation" and "Catering"/"Food
 * Service".
 *
 * Whichever key a surface happened to resolve decided which word the player
 * read. Nothing chose between them, because nothing knew there was a choice.
 *
 * So the comparison here is on a key normalised to its letters -- every `.`
 * and `-` removed -- which is what makes the two spellings collide. Grouping
 * by that and failing where a group holds more than one distinct *text* is a
 * rule about the class rather than a fix for these two ids: any future pair
 * that differs only in separators, in any namespace, fails here.
 *
 * Keys that normalise together and carry the **same** text are not flagged.
 * Duplication that agrees is a redundancy for a human to decide about; this
 * gate is for duplication that *disagrees*, which is the one that produces two
 * answers to one question.
 */
describe('no two message keys differing only in separators carry different text', () => {
  const byNormalisedKey = new Map<string, Map<string, string[]>>();

  for (const [key, text] of defaultLocaleEnCatalog) {
    const normalised = key.replace(/[.-]/g, '');
    const texts = byNormalisedKey.get(normalised) ?? new Map<string, string[]>();
    texts.set(text, [...(texts.get(text) ?? []), key]);
    byNormalisedKey.set(normalised, texts);
  }

  it('scans a non-trivial catalog, so this cannot pass on an empty map', () => {
    expect(defaultLocaleEnCatalog.size).toBeGreaterThan(200);
    expect(byNormalisedKey.size).toBeGreaterThan(200);
  });

  it('has no normalised key carrying two different strings', () => {
    const divergent = [...byNormalisedKey.entries()]
      .filter(([, texts]) => texts.size > 1)
      .map(([normalised, texts]) => {
        const rendered = [...texts.entries()]
          .map(([text, keys]) => `${keys.sort().join(' + ')} = ${JSON.stringify(text)}`)
          .sort()
          .join('  vs  ');
        return `${normalised}: ${rendered}`;
      })
      .sort();

    expect(
      divergent,
      'two message keys differ only in their separators and resolve to different text, so which word the player reads depends on which key the surface happened to use. Decide which copy is right and make both families carry it, or remove one family',
    ).toEqual([]);
  });
});
