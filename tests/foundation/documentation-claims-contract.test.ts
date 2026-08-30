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

/**
 * One comment's worth of prose, with the comment markers taken off.
 *
 * The deliberate inversion of `sourceFilesMatching`, which strips comments so
 * that a sentence *about* a mechanism is not read as the mechanism. Sometimes
 * the sentence **is** the subject: `docs/` is not the only place this
 * repository states claims, and a false absolute in a `//` comment beside the
 * code it describes is read by the next agent as settled fact just as readily.
 *
 * The markers have to come off before matching, because a claim that wraps
 * across two comment lines has a `//` sitting in the middle of it -- which is
 * exactly how the sentence this was written for is written, and a scan that
 * missed it would be a scan that could not see the defect it exists for.
 */
function proseOf(text: string): string {
  return text
    .replace(/\r/gu, '')
    .replace(/^[ \t]*(?:\/\/|\/\*+|\*+\/?)[ \t]*/gmu, ' ')
    .replace(/\s+/gu, ' ');
}

async function sourceProseMatching(pattern: RegExp): Promise<readonly (readonly [string, string])[]> {
  const files = await collectSourceFiles(path.join(repositoryRoot, 'src'));
  expect(files.length, 'no TypeScript files found under src/; the walk is broken').toBeGreaterThan(100);

  const hits: (readonly [string, string])[] = [];
  for (const file of files) {
    const prose = proseOf(await readFile(file, 'utf8'));
    for (const match of prose.matchAll(pattern)) {
      hits.push([path.relative(repositoryRoot, file), match[0]!]);
    }
  }
  return hits;
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

  it('names every thing that credits the treasury, as the HUD projections gap list claims', async () => {
    /*
     * The claim being pinned, from `docs/HUD_PROJECTIONS.md`'s gap 21: which
     * things credit the treasury, and whether any of them is an income line.
     *
     * It said "nothing credits the treasury at all" until this gate was
     * written, which was false the day `ProcurementSystem.cancel` landed --
     * `treasury.ts` documents the refund at the method itself. The gap's
     * *point* survived the error, which is exactly why nobody noticed: an
     * absolute that is nearly true reads as true.
     *
     * **The second crediting site has now arrived, and it is the income
     * line.** `StateIncomeSystem` (#29) implements ADR 0017 decision 3 on
     * decision 6's basis: the state pays per prisoner-day, per occupied place,
     * at the end of each in-game day. That is exactly the event this gate was
     * written to make undeniable, so the allow-list grows by one **and** gap
     * 21 was rewritten in the same change, along with ADR 0017's own
     * "what is implemented" bullet -- which is what the failure message below
     * asked for, and the reason this list is an enumeration rather than a cap
     * of one.
     *
     * A third entry is still a real event and still has to pass through here.
     * ADR 0017 decision 3 names grants and prison labour as the *secondary*
     * lines, and neither exists; the degradation ladder of decision 8 debits
     * rather than credits.
     */
    const crediting = await sourceFilesMatching(/\.\s*credit\s*\(/u);
    expect(
      crediting,
      'something other than ProcurementSystem.cancel and StateIncomeSystem now credits the treasury. If that is a new income line, say so in docs/HUD_PROJECTIONS.md gap 21 and in ADR 0017 in the same change',
    ).toEqual([
      path.join('src', 'simulation', 'economy', 'income.ts'),
      path.join('src', 'simulation', 'economy', 'procurement.ts'),
    ]);
  });

  it('requires every sentence in src/ that denies a treasury credit to say "on a schedule"', async () => {
    /*
     * The other half of the check above, and the half that was missing.
     *
     * The `.credit(` scan guards the **code**: a second crediting site is the
     * arrival of an income line and must not land silently. It cannot guard the
     * **claim**, because the claim lives in prose it deliberately strips -- and
     * the claim is what keeps going wrong. "Nothing credits the treasury at
     * all" was written once, ruled a defect, and the gate above was written for
     * it; #282 then wrote it again in `src/ui/hud/projection.ts`, in the same
     * change that applied the correct qualifier to the clause beside it. The
     * absolute is false and the qualified form is true, they differ by four
     * words, and nothing in the suite could tell them apart.
     *
     * So this pins the four words -- and since #29 it pins something stronger.
     * The qualifier existed because a refund credited while an income line did
     * not; the state now pays per occupied place once a day, so a *scheduled*
     * credit exists too and the negated claim is false in every form, qualified
     * or not. The five modules that carried it (`treasury.ts`,
     * `view-model.ts`, `new-session.ts`, `default-locale-en.ts`,
     * `projection.ts`) no longer make it, so the assertion is that **no module
     * under `src/` makes it at all** rather than that each one qualifies it.
     *
     * That is a narrower subject, so it is guarded against going vacuous in the
     * one way it could: the scan finding nothing is indistinguishable from the
     * scan being broken, so the pattern is exercised against a sample of the
     * exact prose it exists to catch. If the regex stops matching, that control
     * fails and says so, rather than this check quietly passing for ever.
     *
     * Measured against the tree before the fix: `projection.ts` was the single
     * violation of the qualifier rule, so this began as a gate over a defect
     * that existed rather than one over a defect imagined.
     *
     * Its bound, stated rather than implied: this catches the *phrase*, not the
     * idea. "The treasury has no income" carries the same absolute in words
     * this cannot see, and a prose scan that tried to would be a scan of
     * English rather than of a claim. What makes this one worth running is that
     * the phrase itself has now been written wrong twice.
     */
    const denials = await sourceProseMatching(/\bnothing\s+(?:\w+\s+){0,2}credits\b[^.]*/giu);

    // Non-vacuity first, for the reason the sibling assertions state: a scan
    // handed nothing reports no violations and reads exactly like compliance.
    // The subject is now empty by design, so the denominator moves from "five
    // modules state this" to "the pattern still recognises the claim".
    const CONTROL = 'Nothing credits the treasury at all, so the balance only falls.';
    expect(
      CONTROL.match(/\bnothing\s+(?:\w+\s+){0,2}credits\b[^.]*/giu),
      'the pattern no longer recognises the sentence this check exists to catch, so its empty result below proves nothing',
    ).not.toBeNull();

    expect(
      denials.map(([file, sentence]) => `${file}: ${sentence.trim()}`),
      'this sentence denies that anything credits the treasury. Since #29 that is false however it is qualified: the state pays per occupied place once a day, so an income line exists and a refund is not the only credit. Delete the claim rather than adding "on a schedule" to it',
    ).toEqual([]);
  });

  it('does not claim in prose that nothing charges the treasury', async () => {
    /**
     * **The mirror of the assertion above, and it is here because the gate
     * above could not see its own reflection.**
     *
     * That one pins the *income* direction: no module may write that nothing
     * credits the treasury. The identical claim exists with the sign flipped --
     * that nothing takes money *out* -- and until this check it was ungated and
     * false. `src/ui/hud/projection.ts` reasoned, in the comment that decides
     * the Funds chip has no warning tone, that "the state now pays in once a
     * day and nothing at all is charged, so a warning here would describe a
     * slope that runs the wrong way."
     *
     * That was true when it was written, on 2026-08-25 in `4f711d5` (#311),
     * and it has since been falsified twice, in the two ways money can leave a
     * treasury:
     *
     * - **A charge the player cannot decline.** `916ac46` (#455, 2026-08-28)
     *   made wages recurring: `PayrollSystem` bills every employee's
     *   `wageBand.minPerDay` at each in-game day boundary.
     * - **A charge the player makes without meaning to.** `a87b0d3` (#640)
     *   made a `PlaceBuildOrder` buy its own materials at the press, so one
     *   drag along a tile edge takes 80 per segment out of the balance.
     *
     * `git merge-base --is-ancestor 4f711d5 916ac46` holds, so the order is
     * settled rather than inferred: the sentence predates the first thing that
     * made it false by three days.
     *
     * **What this gate is not.** It does not say the Funds chip should have a
     * tone. Whether a balance is "low", and at what number, is a threshold, and
     * ADR 0017 decision 5 reserves every such value to #29. It says only that a
     * module may not *reason from* an absolute that the code contradicts --
     * which is the same thing the assertion above says, and the reason that one
     * exists is that the phrase had by then been written wrong twice.
     */
    const denials = await sourceProseMatching(/\bnothing\s+(?:\w+\s+){0,3}(?:charges|is\s+charged|charged)\b[^.]*/giu);

    // Non-vacuity first, exactly as the assertion above does it and for the
    // same reason: a scan handed nothing reports no violations and reads
    // identically to compliance.
    const CONTROL = 'The state pays in once a day and nothing at all is charged.';
    expect(
      CONTROL.match(/\bnothing\s+(?:\w+\s+){0,3}(?:charges|is\s+charged|charged)\b[^.]*/giu),
      'the pattern no longer recognises the sentence this check exists to catch, so its empty result below proves nothing',
    ).not.toBeNull();

    expect(
      denials.map(([file, sentence]) => `${file}: ${sentence.trim()}`),
      'this sentence denies that anything charges the treasury. Two changes have falsified it: PayrollSystem bills a wage at every in-game day boundary (#455), and a build order buys its own materials at the press (#640). Delete the claim rather than qualifying it, and do not replace it with a threshold -- what counts as a low balance is #29\'s under ADR 0017 decision 5',
    ).toEqual([]);
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
      15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty',
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
