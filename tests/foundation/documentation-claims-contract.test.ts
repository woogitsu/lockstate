import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * Documentation claims about the code, asserted against the code.
 *
 * `docs/ARCHITECTURE.md` declares its contracts binding, which is why a false
 * sentence in it is a defect rather than untidiness — and issue #121 found five
 * of them at once. Two of the five were the kind that reads as settled fact and
 * sends an agent in a straight line the wrong way: the architecture topology
 * listed "compressed immutable save versions" and "Supabase cloud sync" as
 * things the app has, when nothing compresses anything and no module in `src/`
 * can reach the cloud client at all. An agent sizing a save assumed a
 * compression ratio that does not exist; an agent asked to finish cloud save
 * hunted for a wiring bug instead of writing the wiring.
 *
 * The prose is corrected. These are the assertions that keep it corrected, and
 * they are the ones #121 identified as mechanically checkable. The value is not
 * in catching a typo — it is that when one of these becomes *false because the
 * code changed*, the test fails and the sentence has to be rewritten in the
 * same change rather than quietly becoming a lie.
 *
 * Deliberately not here: #121's item 1 (whether the trusted-services layer is
 * "asynchronous") and item 5 (whether `ISSUE_BACKLOG.md`'s delivery table
 * should be extended or reduced). The first needs a return-type accounting of
 * `src/services/**` and touches files another change is live in; the second is
 * a product decision `docs/ISSUE_BACKLOG.md` explicitly parks for the owner.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function collectSourceFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
      continue;
    }
    if (entry.name.endsWith('.ts')) files.push(entryPath);
  }
  return files;
}

/**
 * A pattern every real source tree matches, used as a positive control.
 *
 * Why this exists: every substantive assertion in this file is `toEqual([])`,
 * so the whole gate is a set of "found nothing" claims -- and a gate like that
 * is structurally unable to notice a scanner that finds nothing *for the wrong
 * reason*. An over-stripping bug (one that blanks more than the comments) makes
 * every assertion here pass more emphatically.
 *
 * The file-count guard inside `sourceFilesMatching` does not close that: it
 * counts files **walked**, not content **surviving**, so a scanner that read all
 * of `src/` and reduced each file to an empty string would satisfy it (#198).
 *
 * So this asserts the scanner still sees code. `export ` appears in essentially
 * every module here; the mutation to run against it is `stripComments = () => ''`.
 */
const POSITIVE_CONTROL = /\bexport\b/u;

async function sourceFilesMatching(pattern: RegExp): Promise<readonly string[]> {
  const files = await collectSourceFiles(path.join(repositoryRoot, 'src'));

  // Vacuity guard: an empty or failed walk would make every assertion below
  // pass while reading nothing.
  expect(files.length, 'no TypeScript files found under src/; the walk is broken').toBeGreaterThan(100);

  const matches: string[] = [];
  for (const file of files) {
    // Comments removed, so a sentence *about* a mechanism is not read as the
    // mechanism. `stripComments` is the shared one: it removes a trailing `//`
    // comment as well as a whole-line one, which a local copy did not (#188).
    if (pattern.test(stripComments(await readFile(file, 'utf8')))) matches.push(path.relative(repositoryRoot, file));
  }
  return matches;
}

describe('docs/ARCHITECTURE.md: what the persistence layer actually does', () => {

  /**
   * `docs/INPUT.md`'s claims about which modules emit which contract.
   *
   * That file was **mentioned nowhere in this suite** until #203, which is how
   * five false sentences accumulated in a 17-bullet document -- including two
   * that contradicted other bullets in the same file. Three of the five are
   * mechanically checkable, and these are they.
   *
   * The other two had a code half rather than only a prose half and were fixed
   * by #199 and #201; their prose is now true because the code changed, not
   * because the sentence was softened.
   */
  it('emits SemanticActionEvent from exactly the two adapters docs/INPUT.md names', async () => {
    // The claim being pinned: "**Keyboard and pointer** emit one
    // `SemanticActionEvent` contract -- those two and nothing else." The bullet
    // used to include touch, which contradicted the gesture bullet two below it.
    //
    // Producing is matched on the **construction site** rather than on the type
    // name, and that distinction became load-bearing rather than pedantic when
    // #200 wired a consumer: `world-scene.ts` now names the type, which the
    // old `/SemanticActionEvent/` sweep counted as a third emitter. Naming a
    // type is reading; writing `source: '...'` is emitting.
    //
    // The trailing `[,}\]]` is what separates a construction from the *type*
    // declaration in `actions.ts`, which reads `source: 'keyboard' | 'pointer'`
    // and would otherwise match on its first alternative. A pattern that
    // quietly stops matching is the failure mode #206 paid for, and this one
    // fails in the safe direction: the assertion is an exact list, so a
    // producer the pattern can no longer see disappears from it and the test
    // goes red rather than green.
    const producing = await sourceFilesMatching(/source: '(?:keyboard|pointer)'\s*(?:as const)?\s*[,}\]]/u);
    expect(
      [...producing].sort(),
      'a third module now constructs a SemanticActionEvent. docs/INPUT.md names keyboard and pointer only, and the touch tier deliberately emits `Gesture` instead (#203)',
    ).toEqual([path.join('src', 'input', 'keyboard.ts'), path.join('src', 'input', 'pointer.ts')].sort());
  });

  it('keeps the SemanticActionEvent stream to its declared surface plus its one consumer', async () => {
    // The other half of the same sentence, and the half that changed. Until
    // #200 the stream had no consumer at all: `keyDown`/`keyUp` returned the
    // events and the one production caller discarded them, so `docs/INPUT.md`
    // line 5 described a mechanism nothing used. It has one now, and it is
    // named here rather than left to a wildcard -- a *second* consumer
    // appearing is exactly the change this file exists to make visible, since
    // the polled and received routes are not interchangeable and which one an
    // action may take is fixed by its `behavior`.
    const naming = await sourceFilesMatching(/SemanticActionEvent/u);
    expect(
      [...naming].sort(),
      'a module outside src/input/ now names SemanticActionEvent. docs/INPUT.md line 5 documents exactly one consumer (WorldScene.handleActionEvents); a second is a real change to the input contract, not a refactor',
    ).toEqual(
      [
        path.join('src', 'input', 'actions.ts'),
        path.join('src', 'input', 'keyboard.ts'),
        path.join('src', 'input', 'pointer.ts'),
        path.join('src', 'rendering', 'scene', 'world-scene.ts'),
      ].sort(),
    );
  });

  it('keeps the accessibility module free of any event surface, as three bullets now agree', async () => {
    // `src/input/accessibility.ts` is a versioned settings record, not an
    // adapter -- four exports, no method, no event type. Asserted separately
    // from the sweep above because it is the specific sentence that was wrong
    // ("Pointer, touch and accessibility adapters emit this same action
    // contract"), and because it would still be wrong if the module gained an
    // event type of some other name.
    const source = stripComments(await readFile(path.join(repositoryRoot, 'src', 'input', 'accessibility.ts'), 'utf8'));
    expect(
      /SemanticActionEvent|Gesture\b/u.test(source),
      'src/input/accessibility.ts now carries an event surface. docs/INPUT.md says in two places that it is a versioned settings record with none -- correct both in the same change',
    ).toBe(false);
  });

  it('leaves the key-label resolver with no consumer, as docs/INPUT.md now says outright', async () => {
    // The claim being pinned: the resolver exists, is tested, and **nothing
    // displays a label yet**. The bullet used to be present tense, which sent a
    // reader looking for a remapping UI that does not exist (#141).
    //
    // This is the direction that matters: a consumer *appearing* is good news
    // and a doc change, not a regression -- so the failure message says so
    // rather than implying something broke.
    const referencing = await sourceFilesMatching(/resolveKeyboardLabel|fallbackKeyboardLabel/u);
    expect(
      referencing,
      'something now references the key-label resolver. That is a feature arriving, not a defect -- say so in docs/INPUT.md, which currently states it has no consumer',
    ).toEqual([path.join('src', 'input', 'bindings.ts')]);
  });

  it('reads surviving code and not whitespace, so a scanner that strips too much cannot pass', async () => {
    // The counterpart to every `toEqual([])` below. If this stops matching
    // nearly everything, the scanner is not reading source any more and the
    // rest of this file's green is meaningless.
    const seeing = await sourceFilesMatching(POSITIVE_CONTROL);
    const walked = await collectSourceFiles(path.join(repositoryRoot, 'src'));
    expect(
      seeing.length,
      'the scanner no longer sees `export` in almost every module under src/ -- it is matching against stripped-away content, not code',
    ).toBeGreaterThan(walked.length - 10);
  });

  it('compresses nothing, as the topology and the persistence section both now say', async () => {
    // The claim being pinned: "immutable save versions (payloads are not
    // compressed)" and "no payload is compressed anywhere in `src/`".
    //
    // Comment-stripped on purpose: `src/persistence/size.ts` explains that its
    // estimate exists so a *future* storage backend can decide when
    // compression is worth it. Discussing compression is not performing it,
    // and a check that could not tell the difference would have to be
    // allow-listed immediately.
    // No word boundaries: the first version of this used `\bcompress\b`, and a
    // mutation adding `export function compressPayload(...)` walked straight
    // through it, because `P` is a word character. The likeliest real
    // introduction is exactly a name like that, so this matches the substring.
    const compressing = await sourceFilesMatching(/compress|gzip|deflate|zlib|brotli/iu);
    expect(
      compressing,
      'something under src/ now compresses. docs/ARCHITECTURE.md and docs/PERSISTENCE.md both state that nothing does -- correct them in the same change',
    ).toEqual([]);
  });

  it('is the only thing that credits the treasury, as the HUD projections gap list claims', async () => {
    /*
     * The claim being pinned, from `docs/HUD_PROJECTIONS.md`'s gap 21: that
     * the only thing crediting the treasury is a cancelled purchase's refund,
     * and that there is therefore no income line.
     *
     * It said "nothing credits the treasury at all" until this gate was
     * written, which was false the day `ProcurementSystem.cancel` landed --
     * `treasury.ts` documents the refund at the method itself. The gap's
     * *point* survived the error, which is exactly why nobody noticed: an
     * absolute that is nearly true reads as true.
     *
     * A second crediting site is not a typo. It is **the arrival of an income
     * line** -- the single most significant thing ADR 0017 decision 6 is
     * waiting on -- and it must not be able to land while a document still
     * says there is none.
     */
    const crediting = await sourceFilesMatching(/\.\s*credit\s*\(/u);
    expect(
      crediting,
      'something other than ProcurementSystem.cancel now credits the treasury. If that is an income line, say so in docs/HUD_PROJECTIONS.md gap 21 and in ADR 0017 in the same change',
    ).toEqual([path.join('src', 'simulation', 'economy', 'procurement.ts')]);
  });

  it('agrees with itself about how many integers the status-counts channel carries', async () => {
    /*
     * Three files state this number in prose and one of them drifted.
     * `src/simulation/worker/state-machine.ts` and
     * `docs/adr/0003-simulation-worker-protocol.md` were updated to eleven
     * when the treasury field landed; `docs/HUD_PROJECTIONS.md` was left at
     * ten *by the same commit*, which was editing that file at the time.
     *
     * The number is load-bearing rather than decorative: it is the reason
     * `docs/HUD_PROJECTIONS.md` contract 5 (paging) has nothing to bound on
     * this channel. A payload that grew rows while the sentence still said
     * "integers" would be a paging contract silently not applying.
     *
     * Counted from the schema rather than from a fixture, so it cannot be
     * satisfied by a projection that happens to emit the right number today.
     */
    const source = await readFile(
      path.join(repositoryRoot, 'src', 'simulation', 'presentation', 'status-strip-projection.ts'),
      'utf8',
    );
    const block = /readonly counts: \{([\s\S]*?)\n {2}\};/u.exec(stripComments(source));
    expect(block, 'the `counts` block in status-strip-projection.ts is no longer where this gate looks for it').not.toBeNull();
    const fieldCount = [...block![1]!.matchAll(/readonly \w+: number;/gu)].length;
    expect(fieldCount, 'no counts fields parsed; the block shape changed').toBeGreaterThan(5);

    const WORDS: Readonly<Record<number, string>> = {
      9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
    };
    const word = WORDS[fieldCount];
    expect(word, `add ${fieldCount} to this gate's number-word table`).toBeDefined();

    for (const claimant of [
      path.join('docs', 'HUD_PROJECTIONS.md'),
      path.join('docs', 'adr', '0003-simulation-worker-protocol.md'),
      path.join('src', 'simulation', 'worker', 'state-machine.ts'),
    ]) {
      // Whitespace-collapsed, because prose wraps: this gate's own first run
      // failed on `carries eleven\nintegers` in a document that said exactly
      // the right thing.
      const text = (await readFile(path.join(repositoryRoot, claimant), 'utf8')).replace(/\s+/gu, ' ');
      expect(
        text.includes(`${word} integers`),
        `${claimant} does not say "${word} integers", but simulation/status-counts carries ${fieldCount}`,
      ).toBe(true);
    }
  });

  it('names every module outside operations/ that deposits into a container, as the no-teleport rule claims to', async () => {
    /*
     * The claim being pinned, from `docs/OPERATIONS.md`'s "The no-teleport
     * rule": that section enumerates the deliberate exceptions to "every unit
     * of every item that moves between containers does so through a
     * `CarryItemJob`'s two navigation-backed legs", and says how many there
     * are.
     *
     * It was wrong for exactly as long as #249 had been merged. The section
     * said `ContainerMaterialsProvider` "is the one deliberate exception",
     * while `ProcurementSystem.update` had begun calling `deposit` at no tile
     * whatsoever -- a second exception to a rule the document declared
     * singular. Nothing noticed, because deleting the entire section left the
     * whole suite green.
     *
     * `src/simulation/operations/` is excluded because it *is* the inventory
     * tier: `Container.deposit`'s declaration, `ContainerRegistry`'s
     * delegation and the carry job's own dropoff leg all live there, and a
     * module implementing the rule is not an exception to it.
     *
     * The assertion is deliberately shaped as "the section names it" rather
     * than as an allow-list here. An allow-list would let the code and the
     * prose drift apart while both looked checked; requiring the *document*
     * to contain the module's own name means the only way to add a third
     * exception is to write the paragraph explaining it.
     */
    const depositors = (await sourceFilesMatching(/\.\s*deposit\s*\(/u)).filter(
      (file) => !file.startsWith(path.join('src', 'simulation', 'operations')),
    );
    const operations = await readFile(path.join(repositoryRoot, 'docs', 'OPERATIONS.md'), 'utf8');
    const ruleSection = operations.slice(operations.indexOf('## The no-teleport rule'));
    expect(ruleSection.length, 'docs/OPERATIONS.md no longer has a "## The no-teleport rule" section for this to check').toBeGreaterThan(200);

    const unnamed = depositors.filter((file) => !ruleSection.includes(path.basename(file)));
    expect(
      unnamed,
      'a module outside src/simulation/operations/ deposits into a container and docs/OPERATIONS.md\'s no-teleport rule does not name it. Moving items outside a carry job is a real architectural exception: add the paragraph saying which module, and why it is not a transfer',
    ).toEqual([]);

    // The positive control, and the reason this is not a vacuous pass: the
    // exception the rule already documents must actually be found by the scan.
    // A pattern that matched nothing would satisfy the assertion above.
    expect(depositors, 'the procurement deposit this rule was corrected for is no longer where the scan looks').toContain(
      path.join('src', 'simulation', 'economy', 'procurement.ts'),
    );
  });

  it('cannot reach Supabase from the running app, as the topology and the persistence section both now say', async () => {
    // The claim being pinned: "Supabase cloud sync (contract and SQL only --
    // not reachable from the app)" and "nothing under `src/` reads
    // `VITE_SUPABASE_*` or imports `src/persistence/cloud/`".
    //
    // `src/persistence/cloud/` itself is excluded: it *is* the cloud client,
    // and it naming its own configuration is not the app reaching it. What
    // this catches is the wiring appearing anywhere else -- which is a good
    // change to make, and one that must update the documentation with it.
    const reaching = (await sourceFilesMatching(/import\s*\.\s*meta\s*\.\s*env|VITE_SUPABASE|createClient\s*\(/u)).filter(
      (file) => !file.startsWith(path.join('src', 'persistence', 'cloud')),
    );
    expect(
      reaching,
      'a module outside src/persistence/cloud/ now reads Supabase configuration. That is cloud save becoming reachable, which is a real milestone -- say so in docs/ARCHITECTURE.md and docs/CLOUD_SAVE.md in the same change',
    ).toEqual([]);
  });
});

describe('docs/ROADMAP.md: Phase 0 claims only what the repository has', () => {
  it('agrees with package.json about whether a linter or formatter exists', async () => {
    // #121 found Phase 0 claiming "lint/format/test/build CI" and "issue and
    // PR templates" against a repository with no linter, no formatter, no
    // `lint` script and no pull-request template. The roadmap now says so
    // explicitly, and that parenthetical is what this asserts -- in both
    // directions, because adding a linter is a real decision that should
    // update the sentence rather than leave it stale in the other direction.
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const roadmap = await readFile(path.join(repositoryRoot, 'docs/ROADMAP.md'), 'utf8');

    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    const linters = dependencyNames.filter((name) => /^(?:eslint|prettier|@biomejs\/biome|oxlint|dprint)$/u.test(name));
    const lintScripts = Object.keys(packageJson.scripts ?? {}).filter((name) => /^(?:lint|format)(?::|$)/u.test(name));

    const repositoryHasOne = linters.length > 0 || lintScripts.length > 0;
    const roadmapSaysThereIsNone = roadmap.includes('there is no linter or formatter in this repository');

    expect(
      { repositoryHasOne, roadmapSaysThereIsNone, linters, lintScripts },
      repositoryHasOne
        ? 'a linter or formatter was added: remove the parenthetical from docs/ROADMAP.md Phase 0, add it to docs/TESTING.md, and gate it in CI'
        : 'docs/ROADMAP.md Phase 0 must keep recording that there is no linter or formatter, because there is not one',
    ).toMatchObject({ repositoryHasOne, roadmapSaysThereIsNone: !repositoryHasOne });
  });

  it('claims no pull-request template while none exists', async () => {
    const githubDirectory = path.join(repositoryRoot, '.github');
    const templates: string[] = [];
    for (const candidate of ['pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md', 'PULL_REQUEST_TEMPLATE']) {
      try {
        await stat(path.join(githubDirectory, candidate));
        templates.push(candidate);
      } catch {
        // Absent, which is the expected state.
      }
    }

    const roadmap = await readFile(path.join(repositoryRoot, 'docs/ROADMAP.md'), 'utf8');
    if (templates.length === 0) {
      expect(
        roadmap,
        'docs/ROADMAP.md Phase 0 must say "issue templates", not "issue and PR templates": there is no pull-request template',
      ).not.toContain('issue and PR templates');
    } else {
      expect(
        roadmap,
        `a pull-request template exists (${templates.join(', ')}), so docs/ROADMAP.md Phase 0 may say so again`,
      ).toContain('PR template');
    }
  });
});

/**
 * Counts a document states about the code, asserted against the code.
 *
 * Every claim below is a **number in prose** that nothing recomputed. That is
 * the failure mode this repository keeps paying for, and it has a shape: a
 * figure is measured once, written into a sentence, and then the thing it
 * counted grows. The sentence stays, reads as settled fact, and the next agent
 * plans against it. Measured in one sweep at v0.0.37: the browser suite had
 * gone from 101 tests to 126, the save panel from five buttons to six and from
 * eighteen status sentences to twenty-five, the production bundle from 201
 * modules to 285, and `docs/HUD_PROJECTIONS.md` claimed "the other nine
 * projections" about a directory holding nine in total.
 *
 * None of those was caught by a test, because none of them *had* one. What
 * follows is the gate, not the correction -- the corrections are in the
 * documents. Each assertion reads the number **out of the document** and
 * compares it with a measurement, so the only way to change the code is to
 * change the sentence in the same commit, and both directions fail.
 */

/** Number words this file can read out of prose. */
const NUMBER_WORDS: readonly string[] = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five',
  'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty',
];

function numberWord(value: number): string {
  const word = NUMBER_WORDS[value];
  expect(word, `add ${value} to this file's number-word table`).toBeDefined();
  return word!;
}

/**
 * Whitespace-collapsed, lower-cased document text.
 *
 * Collapsed because prose wraps and a claim can straddle a line break -- the
 * status-counts gate above failed its own first run on `carries eleven\ninteger
 * s` in a document that said exactly the right thing. Lower-cased because
 * several of these phrases open a sentence in one document and sit mid-sentence
 * in another, and a gate that turned on a capital letter would be a gate about
 * punctuation.
 */
async function collapsedDocument(relativePath: string): Promise<string> {
  return (await readFile(path.join(repositoryRoot, relativePath), 'utf8')).replace(/\s+/gu, ' ').toLowerCase();
}

describe('the toolchain versions the documents tell a contributor to install', () => {
  /*
   * `README.md` and `docs/DEPENDENCY_POLICY.md` both state the Node and pnpm
   * pins as literals, and nothing recomputed either. `repository-contract.test.ts`
   * says in its own words why that matters -- "a fourth [literal pin] would go
   * stale silently on the next bump" -- and then checks only
   * `.claude/hooks/session-start.sh`, so these two were exactly the fourth and
   * fifth.
   *
   * Both are right today; this is the gate, not a correction. It is also the
   * highest-consequence pair in this file: they are the first instruction a
   * contributor follows, and a stale one sends them to a Node that
   * `engines` then refuses.
   *
   * Deliberately *not* every occurrence of the version string. `docs/PERSISTENCE.md`
   * names "Node 24.19.0" as the machine a measurement ran on, and that sentence
   * must **not** change when the pin moves -- it would stop describing the run
   * it reports. What is pinned here is the sentences that tell someone what to
   * install.
   */
  it('states the pinned Node and pnpm versions, and states the pinned ones', async () => {
    const nodeVersion = (await readFile(path.join(repositoryRoot, '.node-version'), 'utf8')).trim();
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      readonly packageManager: string;
    };
    const pnpmVersion = packageJson.packageManager.replace(/^pnpm@/u, '');

    expect(nodeVersion, '.node-version is empty; this gate is measuring nothing').toMatch(/^\d+\.\d+\.\d+$/u);
    expect(pnpmVersion, 'package.json packageManager is not pnpm@x.y.z').toMatch(/^\d+\.\d+\.\d+$/u);

    const readme = await collapsedDocument('README.md');
    for (const sentence of [
      `required versions are node.js ${nodeVersion} and pnpm ${pnpmVersion}.`,
      `corepack prepare pnpm@${pnpmVersion} --activate`,
    ]) {
      expect(readme.includes(sentence), `README.md must say "${sentence}"`).toBe(true);
    }

    const policy = await collapsedDocument(path.join('docs', 'DEPENDENCY_POLICY.md'));
    for (const sentence of [
      `node.js \`${nodeVersion}\` lts, recorded in \`.node-version\``,
      `pnpm \`${pnpmVersion}\`, recorded in \`packagemanager\``,
      `corepack prepare pnpm@${pnpmVersion} --activate`,
    ]) {
      expect(policy.includes(sentence), `docs/DEPENDENCY_POLICY.md must say "${sentence}"`).toBe(true);
    }
  });
});

describe('docs/CONTENT.md: the representative catalogs are the size it says', () => {
  /*
   * `docs/CONTENT.md`'s "Representative catalog scope" states three exact
   * sizes -- 18 rooms, 20 objects, 8 staff roles -- and until this gate the
   * only assertions over those catalogs were `toBeGreaterThanOrEqual(10)` and
   * a department-set equality. A catalog could therefore grow or shrink by any
   * amount, in either direction, with the whole suite green and the document
   * wrong.
   *
   * The sizes are load-bearing rather than trivia: ADR 0017 decision 4 reasons
   * about how many declared ids are unread and
   * `tests/foundation/unconsumed-content-contract.test.ts` pins the
   * denominator at 62, and both arguments are about *these* numbers.
   */
  it('states each catalog size, and states the one the code has', async () => {
    const { defaultObjectRegistry, defaultRoomContentRegistry, defaultStaffRoleRegistry } = await import(
      '../../src/content/index'
    );
    const content = await collapsedDocument(path.join('docs', 'CONTENT.md'));

    const measured: Readonly<Record<string, number>> = {
      rooms: defaultRoomContentRegistry.size(),
      objects: defaultObjectRegistry.size(),
      'staff roles': defaultStaffRoleRegistry.size(),
    };

    // Vacuity guard: a registry that failed to load would report 0, and the
    // assertions below would then fail for the wrong reason. Say which.
    for (const [what, count] of Object.entries(measured)) {
      expect(count, `no ${what} loaded; the content registries are not what is being measured`).toBeGreaterThan(1);
    }

    for (const [what, count] of Object.entries(measured)) {
      expect(
        content.includes(`**${count} ${what}**`),
        `docs/CONTENT.md's "Representative catalog scope" must say "**${count} ${what}**"; the catalog holds ${count}`,
      ).toBe(true);
    }
  });
});

describe('docs/PERSISTENCE.md: the save panel has the strings it says it has', () => {
  /*
   * The panel's string inventory, which #287 moved without moving the
   * sentence. `docs/PERSISTENCE.md` said "the five buttons ... and the
   * seventeen status sentences" while `SAVE_PANEL_MESSAGE_KEY` held six
   * `save.action.*` keys and twenty-five `save.status.*` ones -- Import plus
   * the seven distinguishable outcomes it can report. The seventeen was wrong
   * on the day it was typed as well: #208 shipped eighteen.
   *
   * Read off the frozen key object rather than off the panel's DOM, because
   * that object is what `tests/foundation/localization-key-completeness.test.ts`
   * already treats as the panel's whole vocabulary.
   */
  it('counts the buttons and the status sentences the way the panel declares them', async () => {
    const { SAVE_PANEL_MESSAGE_KEYS } = await import('../../src/ui/save-panel-messages');
    const persistence = await collapsedDocument(path.join('docs', 'PERSISTENCE.md'));

    const buttons = SAVE_PANEL_MESSAGE_KEYS.filter((key) => key.startsWith('save.action.')).length;
    const statuses = SAVE_PANEL_MESSAGE_KEYS.filter((key) => key.startsWith('save.status.')).length;
    expect(buttons, 'no save.action.* keys found; this gate is measuring nothing').toBeGreaterThan(1);
    expect(statuses, 'no save.status.* keys found; this gate is measuring nothing').toBeGreaterThan(1);

    expect(
      persistence.includes(`the ${numberWord(buttons)} buttons`),
      `docs/PERSISTENCE.md must say "the ${numberWord(buttons)} buttons": SAVE_PANEL_MESSAGE_KEY declares ${buttons} save.action.* keys`,
    ).toBe(true);
    expect(
      persistence.includes(`${numberWord(statuses)} status sentences`),
      `docs/PERSISTENCE.md must say "${numberWord(statuses)} status sentences": SAVE_PANEL_MESSAGE_KEY declares ${statuses} save.status.* keys`,
    ).toBe(true);
  });
});

describe('docs/HUD_PROJECTIONS.md: the projection directory is the size it says', () => {
  /*
   * "the other nine projections in this directory still have no route" was
   * arithmetically impossible: the directory holds nine projection modules in
   * total, two of which have a route, so seven remain. It also contradicted
   * `docs/ARCHITECTURE.md`, which says "two of them reach the status strip
   * today" and is right.
   *
   * The unit is the **module**, which is what "in this directory" means. A
   * count of exported `project*` functions is a different quantity -- thirteen
   * today, of which nine are unrouted -- and reading one number as the other
   * is how a reader ends up believing this directory has eleven projections
   * in it.
   */
  it('counts the modules, how many have a route, and how many do not', async () => {
    const directory = path.join(repositoryRoot, 'src', 'simulation', 'presentation');
    // `index.ts` re-exports and `view-model.ts` holds the shared value types;
    // neither projects anything.
    const NOT_A_PROJECTION = ['index.ts', 'view-model.ts'];
    const files = (await readdir(directory)).filter((name) => name.endsWith('.ts')).sort();
    const modules = files.filter((name) => !NOT_A_PROJECTION.includes(name));

    expect(modules.length, 'no projection modules found; the walk is broken').toBeGreaterThan(5);
    for (const name of NOT_A_PROJECTION) {
      expect(files, `${name} is no longer in src/simulation/presentation/; this gate's exclusion list is stale`).toContain(name);
    }

    // The two with a published route, named rather than derived: which
    // projection the worker publishes is a protocol decision (ADR 0003), and a
    // third one appearing is exactly the change this gate exists to surface.
    const ROUTED = ['clock-projection.ts', 'status-strip-projection.ts'];
    for (const routed of ROUTED) {
      expect(modules, `${routed} is no longer in src/simulation/presentation/`).toContain(routed);
    }
    const unrouted = modules.length - ROUTED.length;

    const hud = await collapsedDocument(path.join('docs', 'HUD_PROJECTIONS.md'));
    expect(
      hud.includes(`the other ${numberWord(unrouted)} projection modules in this directory`),
      `docs/HUD_PROJECTIONS.md must say "the other ${numberWord(unrouted)} projection modules in this directory": ${modules.length} modules less the ${ROUTED.length} with a route`,
    ).toBe(true);
    expect(
      hud.includes(`${numberWord(modules.length)} of the ${numberWord(files.length)} files here are projections`),
      `docs/HUD_PROJECTIONS.md must say "${numberWord(modules.length)} of the ${numberWord(files.length)} files here are projections"`,
    ).toBe(true);

    // The other half of the same fact, in the other document. These two
    // disagreed, which is what made the wrong one hard to see.
    const architecture = await collapsedDocument(path.join('docs', 'ARCHITECTURE.md'));
    expect(
      architecture.includes(`${numberWord(ROUTED.length)} of them reach the status strip today`),
      `docs/ARCHITECTURE.md must say "${numberWord(ROUTED.length)} of them reach the status strip today"`,
    ).toBe(true);
  });
});

describe('the browser suite is the size the documents say', () => {
  async function browserSpecFiles(): Promise<readonly string[]> {
    const directory = path.join(repositoryRoot, 'tests', 'browser');
    return (await readdir(directory)).filter((name) => name.endsWith('.spec.ts')).sort();
  }

  /*
   * `docs/TESTING.md` prints what `pnpm test:browser` reports, and it read
   * "101 tests" against a run of 126. Playwright's own total cannot be
   * computed here -- `camera-coordinates.spec.ts` parameterises two
   * declarations over five zoom levels, and only Playwright expands them --
   * so what this pins is the two quantities that *are* exact: how many spec
   * files there are, and how many `test(...)` declarations they hold.
   *
   * That residual is deliberate and is stated in the document: changing the
   * zoom list moves the printed total without moving either number here. What
   * it does catch is the change that actually moved the figure by 25 -- tests
   * being added -- and it forces the whole line, printed total included, to be
   * rewritten when they are.
   */
  it('states the spec-file and declaration counts docs/TESTING.md claims', async () => {
    const specs = await browserSpecFiles();
    expect(specs.length, 'no browser spec files found; the walk is broken').toBeGreaterThan(5);

    let declarations = 0;
    for (const spec of specs) {
      const source = stripComments(await readFile(path.join(repositoryRoot, 'tests', 'browser', spec), 'utf8'));
      // `test(` and not `test.describe(`/`test.beforeEach(`: a group is not a
      // test. Comment-stripped, so a `test(` written *about* in prose does not
      // count as one declared.
      declarations += [...source.matchAll(/(?:^|[^.\w])test\(/gu)].length;
    }
    expect(declarations, 'no test declarations parsed; the scanner is not reading the specs').toBeGreaterThan(50);

    const testing = await collapsedDocument(path.join('docs', 'TESTING.md'));
    expect(
      testing.includes(`${declarations} \`test(...)\` declarations in the ${numberWord(specs.length)} spec files`),
      `docs/TESTING.md must say "${declarations} \`test(...)\` declarations in the ${numberWord(specs.length)} spec files"`,
    ).toBe(true);
  });

  /*
   * A spec header that opens "<number> claims" is enumerating, and the number
   * is its own list's length. Both files that do this have had it go wrong:
   * `app-shell.spec.ts` says so in its own words ("it read 'six' while the
   * list held seven"), and `world-scene-input.spec.ts` read "two" while #200,
   * #209 and #261 had each added a group of tests to it without adding the
   * sentence saying what the group is for.
   *
   * The number is not decorative. These lists are what a reader consults to
   * decide whether a claim already has browser coverage, and a list that has
   * quietly stopped being maintained is worse than no list, because it reads
   * as exhaustive.
   */
  it('keeps every browser spec header claim count equal to its own list length', async () => {
    const specs = await browserSpecFiles();
    const checked: string[] = [];

    for (const spec of specs) {
      const source = await readFile(path.join(repositoryRoot, 'tests', 'browser', spec), 'utf8');
      const header = /\/\*\*([\s\S]*?)\*\//u.exec(source)?.[1];
      if (header === undefined) continue;

      const claimed = new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b claims`, 'iu').exec(header.replace(/\s+/gu, ' '));
      if (claimed === null) continue;

      const items = [...header.matchAll(/^\s*\*\s*(\d+)\.\s/gmu)].map((match) => Number(match[1]));
      expect(
        items.length,
        `${spec}'s header says "${claimed[1]} claims" but has no numbered list for this to count`,
      ).toBeGreaterThan(0);
      // Numbered 1..n as well as the right length: a duplicated or skipped
      // ordinal would leave the length right and the list unreadable.
      expect(items, `${spec}'s header list is not numbered 1..${items.length}`).toEqual(
        Array.from({ length: items.length }, (_unused, index) => index + 1),
      );
      expect(
        claimed[1]!.toLowerCase(),
        `${spec}'s header says "${claimed[1]} claims" and its numbered list holds ${items.length}. The count is the list's own length: add the missing entry, or correct the word`,
      ).toBe(numberWord(items.length));
      checked.push(spec);
    }

    // Positive control. Both of these enumerate today, and a scanner that
    // silently stopped finding either would make the loop above vacuous.
    expect(
      checked.sort(),
      'a browser spec that used to enumerate its claims no longer does, or the header scanner has stopped matching',
    ).toEqual(['app-shell.spec.ts', 'world-scene-input.spec.ts']);
  });
});
