import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `docs/BENCHMARKING.md`'s scenario rule 9, made mechanical.
 *
 * The rule states, unconditionally: *"Say in its own file, in the first lines,
 * whether it drives production code or models it — and if it models it, never
 * let its `description` claim otherwise. A scenario named after a subsystem it
 * does not import is the defect #410 was filed about."*
 *
 * ## Why this file exists rather than the rule alone
 *
 * The rule was written when #410 fixed the three modelled navigation
 * descriptions **by hand**, and the class was never swept. Measured on the
 * tree that added this file: `head -18` on each of the six scenario files
 * found the marker in exactly one of them (`navigation-actor-tiers.mjs`, line
 * 1) and a header stating the opposite kind in one more
 * (`navigation-production.mjs`). The other four -- `entity-soa.mjs`,
 * `kernel-throughput.mjs`, `world-chunk-size.mjs` and `foundation-smoke.mjs`
 * -- opened with a bare seed constant and said nothing at all, and rule 9 had
 * been in the document for the whole of their lives.
 *
 * The sharpest instance was `kernel-throughput.mjs`, whose description read
 * *"Evaluates headless **Kernel** tick loop throughput"*. `Kernel` is the
 * exported production class at `src/simulation/kernel/kernel.ts`; the scenario
 * imports nothing from `src/` and schedules mock systems. That is #410's
 * defect verbatim, surviving in the file next to the one #410 fixed.
 * `world.chunk-size-*` is the same shape and carries more weight, because
 * `docs/BENCHMARKING.md` records that ADR 0004 decided the production chunk
 * size on those numbers.
 *
 * So the fix is not four edits. Four edits are what the last pass did.
 *
 * ## The property, and why it is checked in both directions
 *
 * Every file in `benchmarks/scenarios/` declares its kind in its first lines
 * with one of exactly two markers, and that declaration is checked against the
 * mechanical fact -- whether the file imports `benchmarks/production-modules.mjs`,
 * which is the only route from a `.mjs` benchmark into `src/`.
 *
 * Both directions fail, and the second is the one worth having. A file that
 * claims `MODELLED` while importing production modules is merely out of date;
 * a file that claims `DRIVES PRODUCTION CODE` while importing nothing is the
 * false gate #410 was about, and no ceiling, bound or checksum anywhere in the
 * harness can see it. A single-direction check would have been satisfied by
 * pasting the production marker into all six files.
 *
 * ## Bounds
 *
 * - **Textual, deliberately.** It proves the declaration is *written* and
 *   agrees with the imports. It cannot prove a modelled scenario's algorithm
 *   resembles the production one, nor that a production scenario's metrics
 *   come from production counters rather than being recomputed locally -- that
 *   second one is `metricBounds`' problem and `navigation-production.mjs`
 *   argues it at length.
 * - **Comments are the subject, so nothing here strips them.** Most gates in
 *   `tests/foundation/` run `stripComments` first so that a comment
 *   *discussing* a mechanism is not read as the mechanism. A gate over a
 *   marker that lives in a comment must not, and would erase its own subject
 *   if it did.
 * - **The description check is a prefix, not a semantic reading.** It cannot
 *   tell whether the rest of a description is true. It can tell that a
 *   modelled scenario's description opens by saying so, which is the specific
 *   thing `kernel.throughput.benchmark`'s did not.
 */

const ROOT = join(__dirname, '../..');
const SCENARIO_DIR = join(ROOT, 'benchmarks/scenarios');
const REGISTRY_PATH = join(ROOT, 'benchmarks/registry.mjs');

/** The marker a scenario that imports nothing from `src/` must open with. */
const MODELLED_MARKER = 'MODELLED, NOT PRODUCTION.';

/** The marker a scenario that drives `src/` must open with. */
const PRODUCTION_MARKER = 'DRIVES PRODUCTION CODE, NOT A MODEL OF IT.';

/**
 * "In the first lines" made a number. Twelve is generous enough for a JSDoc
 * banner to precede the marker and tight enough that a reader opening the file
 * sees it without scrolling; `navigation-actor-tiers.mjs` puts it on line 1 and
 * `navigation-production.mjs` on line 2.
 */
const HEADER_LINE_COUNT = 12;

/**
 * The prefix a modelled scenario's `description` must open with, matching the
 * form #410 established by hand on `navigation.meal-rush` and its two
 * siblings. Lower-case after the first word because a description is prose in
 * a JSON result, not a banner.
 */
const MODELLED_DESCRIPTION_PREFIX = 'MODELLED, not production:';

/**
 * The one route from a `.mjs` benchmark into `src/`. Asserted to exist below,
 * so this string cannot rot into a pattern that matches nothing.
 */
const PRODUCTION_MODULES_SPECIFIER = 'production-modules.mjs';

interface ScenarioFile {
  readonly name: string;
  readonly source: string;
  readonly header: string;
  readonly importsProductionModules: boolean;
  readonly declaresModelled: boolean;
  readonly declaresProduction: boolean;
}

function scenarioFiles(): readonly ScenarioFile[] {
  return readdirSync(SCENARIO_DIR)
    .filter((name) => name.endsWith('.mjs'))
    .sort()
    .map((name) => {
      const source = readFileSync(join(SCENARIO_DIR, name), 'utf8');
      const header = source.split('\n').slice(0, HEADER_LINE_COUNT).join('\n');

      return {
        name,
        source,
        header,
        // `from '../production-modules.mjs'` or a dynamic `import(...)` of it.
        importsProductionModules: source.includes(PRODUCTION_MODULES_SPECIFIER),
        declaresModelled: header.includes(MODELLED_MARKER),
        declaresProduction: header.includes(PRODUCTION_MARKER),
      };
    });
}

interface RegisteredScenario {
  readonly id: string;
  readonly description: string;
  readonly file: string;
}

/**
 * Reads every scenario object each file exports, so a description is compared
 * against the kind of the file that actually declares it. Importing the
 * scenario modules is safe from Vitest: the production-code path in
 * `production-modules.mjs` is lazy, and `assertTypeScriptTransformEnabled`
 * runs inside its loader functions rather than at module scope.
 */
async function registeredScenarios(): Promise<readonly RegisteredScenario[]> {
  const collected: RegisteredScenario[] = [];

  for (const file of scenarioFiles()) {
    const namespace: Record<string, unknown> = (await import(
      pathToFileURL(join(SCENARIO_DIR, file.name)).href
    )) as Record<string, unknown>;

    for (const value of Object.values(namespace)) {
      if (typeof value !== 'object' || value === null) continue;
      const candidate = value as { id?: unknown; description?: unknown; profiles?: unknown };
      if (typeof candidate.id !== 'string') continue;
      if (typeof candidate.description !== 'string') continue;
      if (typeof candidate.profiles !== 'object' || candidate.profiles === null) continue;

      collected.push({ id: candidate.id, description: candidate.description, file: file.name });
    }
  }

  return collected;
}

describe('every benchmark scenario declares whether it drives production code or models it', () => {
  it('reads a non-trivial set of scenario files, so nothing below can pass on an empty scan', () => {
    const files = scenarioFiles();

    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.map((file) => file.name)).toContain('navigation-production.mjs');
    expect(files.map((file) => file.name)).toContain('kernel-throughput.mjs');
  });

  it('finds both kinds present, so neither branch of the check is dead', () => {
    const files = scenarioFiles();

    expect(files.filter((file) => file.importsProductionModules).length).toBeGreaterThanOrEqual(1);
    expect(files.filter((file) => !file.importsProductionModules).length).toBeGreaterThanOrEqual(1);
  });

  it('opens every scenario file with exactly one of the two kind markers', () => {
    const offenders = scenarioFiles()
      .filter((file) => file.declaresModelled === file.declaresProduction)
      .map((file) =>
        file.declaresModelled
          ? `${file.name} carries both markers in its first ${String(HEADER_LINE_COUNT)} lines`
          : `${file.name} carries neither marker in its first ${String(HEADER_LINE_COUNT)} lines`,
      );

    expect(offenders).toEqual([]);
  });

  it('agrees with the imports: a file claiming to drive production code imports the production modules', () => {
    const offenders = scenarioFiles()
      .filter((file) => file.declaresProduction && !file.importsProductionModules)
      .map(
        (file) =>
          `${file.name} says "${PRODUCTION_MARKER}" but imports no ${PRODUCTION_MODULES_SPECIFIER}, which is the only route from a .mjs benchmark into src/`,
      );

    expect(offenders).toEqual([]);
  });

  it('agrees with the imports in the other direction: a file claiming to be a model imports no production modules', () => {
    const offenders = scenarioFiles()
      .filter((file) => file.declaresModelled && file.importsProductionModules)
      .map(
        (file) =>
          `${file.name} says "${MODELLED_MARKER}" but imports ${PRODUCTION_MODULES_SPECIFIER}; it drives production code and its header denies it`,
      );

    expect(offenders).toEqual([]);
  });

  it('holds the production-modules route open, so the import check cannot become vacuous', () => {
    const registry = readFileSync(REGISTRY_PATH, 'utf8');

    expect(readFileSync(join(ROOT, 'benchmarks/production-modules.mjs'), 'utf8')).toContain(
      'export function assertTypeScriptTransformEnabled',
    );
    // Every scenario file is registered, so a scenario cannot escape this gate
    // by not being run.
    const unregistered = scenarioFiles()
      .map((file) => file.name)
      .filter((name) => !registry.includes(`./scenarios/${name}`));

    expect(unregistered).toEqual([]);
  });
});

describe('a modelled scenario never lets its description claim production', () => {
  it('reads a description off every registered scenario, so nothing below can pass on an empty scan', async () => {
    const scenarios = await registeredScenarios();

    expect(scenarios.length).toBeGreaterThanOrEqual(11);
    expect(scenarios.map((scenario) => scenario.id)).toContain('kernel.throughput.benchmark');
    expect(scenarios.map((scenario) => scenario.id)).toContain('navigation.production.meal-rush');
  });

  it('opens every modelled scenario description with the modelled prefix', async () => {
    const modelledFiles = new Set(
      scenarioFiles()
        .filter((file) => !file.importsProductionModules)
        .map((file) => file.name),
    );

    const offenders = (await registeredScenarios())
      .filter((scenario) => modelledFiles.has(scenario.file))
      .filter((scenario) => !scenario.description.startsWith(MODELLED_DESCRIPTION_PREFIX))
      .map(
        (scenario) =>
          `${scenario.id} (${scenario.file}) is modelled but its description opens "${scenario.description.slice(0, 60)}..."`,
      );

    expect(offenders).toEqual([]);
  });

  it('does not let a production scenario borrow the modelled prefix', async () => {
    const productionFiles = new Set(
      scenarioFiles()
        .filter((file) => file.importsProductionModules)
        .map((file) => file.name),
    );

    const offenders = (await registeredScenarios())
      .filter((scenario) => productionFiles.has(scenario.file))
      .filter((scenario) => scenario.description.startsWith(MODELLED_DESCRIPTION_PREFIX))
      .map((scenario) => `${scenario.id} (${scenario.file}) drives production code and calls itself modelled`);

    expect(offenders).toEqual([]);
  });

  it('names no production class it does not import, for the one case that was measured', async () => {
    const scenarios = await registeredScenarios();
    const kernelThroughput = scenarios.find((scenario) => scenario.id === 'kernel.throughput.benchmark');

    expect(kernelThroughput).toBeDefined();
    // The specific regression: `Kernel` was the description's subject, and it
    // is a real exported class this file has never imported. If the scenario
    // ever does import it, this expectation is the right thing to fail --
    // rewrite it against the import, do not delete it.
    expect(kernelThroughput?.file).toBe('kernel-throughput.mjs');
    expect(kernelThroughput?.description).toContain('MODELLED, not production:');
    expect(kernelThroughput?.description).toContain('src/simulation/kernel/kernel.ts');
  });
});
