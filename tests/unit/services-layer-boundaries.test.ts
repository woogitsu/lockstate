import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * The trusted-services layer is separate on purpose (issue #36, ADR 0008):
 * the same modules must run in a browser tab, a worker and a trusted
 * server function, and the simulation must never depend on any of them.
 * These are the boundary rules stated in `src/services/index.ts`, made
 * executable -- the same treatment `navigation-no-phaser.test.ts` gives
 * the navigation boundary.
 */
const SOURCE_ROOT = join(__dirname, '../../src');

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

function read(path: string): { readonly relative: string; readonly source: string } {
  return { relative: path.slice(SOURCE_ROOT.length + 1), source: readFileSync(path, 'utf8') };
}

const serviceFiles = collectTypeScriptFiles(join(SOURCE_ROOT, 'services')).map(read);
const simulationFiles = collectTypeScriptFiles(join(SOURCE_ROOT, 'simulation')).map(read);
const persistenceFiles = collectTypeScriptFiles(join(SOURCE_ROOT, 'persistence')).map(read);

describe('trusted services layer boundaries', () => {
  it('covers a non-trivial number of files', () => {
    expect(serviceFiles.length).toBeGreaterThan(10);
    expect(simulationFiles.length).toBeGreaterThan(10);
  });

  /**
   * A floor tolerates the corpus shrinking; it does not tolerate a whole
   * subtree going unscanned while the floor is still cleared by the rest.
   * Measured: with the walk given one line -- skip the `challenges` entry --
   * `src/services/` drops from 36 files to 31, comfortably above `> 10`
   * above, while a file inside `challenges/` importing Phaser and touching
   * `document` sat unscanned and every assertion in this file stayed green
   * (`docs/research/2026-09-02-the-unit-gates-that-cannot-fail.md`). Naming
   * every subtree closes exactly that hole.
   */
  it('reaches every subtree of src/services/, not just enough files to clear the floor above', () => {
    for (const subtree of ['challenges', 'entitlements', 'localization', 'telemetry']) {
      expect(
        serviceFiles.some((file) => file.relative.startsWith(`services/${subtree}/`)),
        `src/services/${subtree}/ is empty or was not reached by this scan`,
      ).toBe(true);
    }
  });

  it('imports no Phaser and touches no DOM or browser globals', () => {
    for (const { relative, source } of serviceFiles) {
      expect(source, `${relative} must not import Phaser`).not.toMatch(/from ['"]phaser['"]/i);
      // Requires a member access, so the word "window." ending an English
      // sentence in a comment or message is not a false positive.
      expect(source, `${relative} must not touch the DOM`).not.toMatch(/\b(?:document|window)\.[A-Za-z_$]/);
      // A mention in prose is fine; an actual access is not -- storage
      // reaches this layer only through the injected `KeyValueStore`.
      expect(source, `${relative} must not read localStorage directly`).not.toMatch(/\blocalStorage\s*[.[]/);
    }
  });

  /**
   * `docs/ARCHITECTURE.md`'s third boundary rule says that anything leaving the
   * device from this layer "is asynchronous, failable and optional". Nothing
   * enforced any part of it: the check above covers Phaser, the DOM and
   * `localStorage`, and a telemetry send written as a bare `fetch(...)` passed
   * every gate in this file.
   *
   * So this asserts the stronger fact that is actually true today, and which
   * #141 measured from the other direction when it counted 4,871 lines of this
   * layer as reachable only from its own tests: **nothing here performs I/O at
   * all.** The layer is contracts and pure logic. Storage reaches it only
   * through the injected `KeyValueStore`, and the network does not reach it.
   *
   * The allow-list was empty, and that was the point. Wiring the first
   * telemetry send or entitlement read is a real milestone -- it is the moment
   * the architecture document's claim starts having content -- and it should
   * require writing down that the layer now leaves the device, not just adding
   * a call.
   *
   * **It has one entry now, and the writing down is below.** The paragraph
   * above stands as the record of what the empty state meant, because the
   * milestone is only legible against it.
   *
   * The entry is exactly one module wide, and that is a property to keep
   * rather than a coincidence. `services/telemetry/http-transport.ts` is the only file
   * in the layer that calls `fetch`; the destination it posts to is resolved
   * by `services/telemetry/ingestion-config.ts`, which performs no I/O and is
   * deliberately a separate module so that the *validation* of a destination
   * stays inside the no-I/O set and only the *sending* is allow-listed. A
   * pattern like `'services/telemetry/*.ts'` would have been shorter and would have
   * granted the whole subsystem permission to reach the network.
   */
  const MODULES_PERFORMING_IO: Readonly<Record<string, string>> = {
    'services/telemetry/http-transport.ts':
      'The telemetry ingestion send (#36, ADR 0010). One `fetch` to a root-relative, same-origin path that `telemetry/ingestion-config.ts` will only produce from deployment configuration -- no URL, host, project reference or table name appears anywhere in `src/`, and with that configuration absent (which is every build in this repository) `createTelemetryPipeline` constructs no transport at all. It is asynchronous, failable and optional exactly as `docs/ARCHITECTURE.md`\'s third boundary rule requires: `send` is `async`, it rejects rather than reporting anything to the player, `BatchingTelemetrySink.flush` catches and drops the batch, and an abort deadline stops a hung request from wedging the queue. The next test asserts that half, which no pattern over the file list can.',
  };

  /**
   * Deliberately not asserted *by pattern*: that each I/O call sits inside an
   * `async` function. Tying a call site to its enclosing function's
   * declaration by pattern is not reliable, and a check that looked like it
   * did that while really matching on file-level `async` would be exactly the
   * theatre this file exists to remove. This comment used to end by saying
   * that when `MODULES_PERFORMING_IO` gained an entry, the
   * asynchronous/failable/optional half would need its own assertion against
   * that specific function.
   *
   * It has, and it does: `tests/unit/services-telemetry-transport.test.ts`
   * drives `HttpTelemetryTransport.send` against a stubbed global `fetch` and
   * asserts all three halves behaviourally -- that it returns a promise
   * rather than blocking, that a rejected or non-2xx send is dropped by the
   * sink rather than propagating, and that with no configuration there is no
   * transport to call. A behavioural assertion is the only kind that can say
   * this; the entry above names that file so the two cannot drift apart.
   */
  const IO_SOURCES: readonly (readonly [string, RegExp])[] = [
    ['fetch', /(?:^|[^.\w])fetch\s*\(/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['navigator.sendBeacon', /\bnavigator\s*\.\s*sendBeacon\b/],
    ['WebSocket', /\bnew\s+WebSocket\b/],
    ['EventSource', /\bnew\s+EventSource\b/],
    ['indexedDB', /\bindexedDB\s*[.[]/],
    ['sessionStorage', /\bsessionStorage\s*[.[]/],
    ['caches', /\bcaches\s*\.\s*(?:open|match)\b/],
    // A dynamic `import()` is a network fetch in a browser: the module is a
    // URL the page did not have and goes over the wire on first evaluation.
    // Added by #664, closing a gap the #662 delivery-route work handed over
    // when it landed `chunk-catalog-loader.ts`: that module takes its importer
    // as an injected thunk and performs no import of its own, but the obvious
    // next step -- a module here that imports a catalogue chunk directly --
    // would have left this gate green while falsifying its central claim and
    // `docs/CONTENT.md`'s "the trusted-services layer performs no I/O at all".
    //
    // Comments are stripped before the scan, so `chunk-catalog-loader.ts`'s
    // four prose mentions of `import()` do not match; a `type X =
    // import('./y').Y` annotation would, and there is none in either tree.
    ['dynamic import()', /(?:^|[^.\w])import\s*\(/],
  ];

  /**
   * The scan, with its allow-list as a parameter.
   *
   * Extracted so the gate can be run against an *empty* allow-list as well as
   * against the real one. That is what makes the list load-bearing rather than
   * decorative: a version of this scan that skipped `services/telemetry/**` by
   * prefix, or stopped consulting the map at all, would leave the real-list
   * assertion green -- and fails the empty-list one immediately, because it
   * would report nothing where it has to report the transport.
   */
  function modulesPerformingIo(allowList: Readonly<Record<string, string>>): readonly string[] {
    const offenders: string[] = [];

    for (const { relative, source } of serviceFiles) {
      // Comments stripped: this layer's whole job is to describe sends that a
      // caller will one day make, so prose naming `fetch` is not a send.
      //
      // The shared stripper rather than a local copy (#193, #198). The copy
      // this replaced removed only whole-line `//` comments, so a trailing
      // `// fetch(...)` survived it and a commented-out call read as a real
      // send.
      //
      // **The direction matters and is smaller than #188's.** This is a "must
      // not contain" rule, so a surviving comment makes it fail *loudly* on
      // prose -- a false failure, not a silent hole. Measured on the sibling
      // rule below by restoring the old stripper and adding a trailing
      // `// import { Kernel } ...` to a HUD module: "imports nothing from the
      // simulation" fails. That is still worth fixing, because a gate that
      // fails for a comment sends the next reader chasing an import that is not
      // there -- but it is not the silent pass `unconsumed-content-contract`
      // was exposed to, where the rule asks "is this referenced" and a comment
      // answers yes.
      //
      // The allow-list's staleness check one test below is unaffected either
      // way: it asks only whether the file is still under `src/services/` and
      // never re-reads the source, so no comment can keep an entry alive.
      const code = stripComments(source);
      for (const [name, pattern] of IO_SOURCES) {
        if (!pattern.test(code)) continue;
        if (allowList[relative] !== undefined) continue;
        offenders.push(`${relative} uses ${name}`);
      }
    }

    return offenders;
  }

  it('performs no I/O outside the one module written down as doing so', () => {
    expect(
      modulesPerformingIo(MODULES_PERFORMING_IO),
      'a module in the trusted-services layer now performs I/O. That is a milestone, not a mistake -- add it to MODULES_PERFORMING_IO with the reason, assert that its entry point is asynchronous and failable, and update docs/ARCHITECTURE.md, which states which module leaves the device',
    ).toEqual([]);
  });

  it('reports the allow-listed module when the allow-list is emptied, so the list is load-bearing', () => {
    // The negative control the empty allow-list used to be. With no entries,
    // the scan must find exactly the one module that really does perform I/O:
    // fewer means the scan has stopped seeing it (the patterns, the file walk
    // or the comment stripper broke), more means something else started.
    expect(modulesPerformingIo({})).toEqual(['services/telemetry/http-transport.ts uses fetch']);
  });

  it('sends nothing the layer is not allowed to send from the one module that sends', () => {
    // The narrow companion to the allow-list entry, and the half a behavioural
    // test cannot reach: what the request is *shaped* like. Telemetry carries
    // no account identifier by design (ADR 0010), and a cookie the browser
    // attached would undo that on the wire without a line of this repository
    // saying so -- so the two options that decide it are asserted as text,
    // because deleting either compiles and every behavioural test stays green.
    const allowed = Object.keys(MODULES_PERFORMING_IO);
    expect(allowed, 'exactly one module in this layer may leave the device').toEqual([
      'services/telemetry/http-transport.ts',
    ]);

    const transport = serviceFiles.find(({ relative }) => relative === allowed[0]);
    expect(transport, 'the one allow-listed I/O module is gone; remove its entry').toBeDefined();
    const code = stripComments(transport?.source ?? '');
    expect(code, 'the telemetry send must not carry cookies or credentials').toMatch(/credentials:\s*'omit'/);
    expect(code, 'the telemetry send must stay same-origin, which is what keeps connect-src \'self\' intact').toMatch(
      /mode:\s*'same-origin'/,
    );
  });

  it('holds no stale entry in the I/O allow-list', () => {
    // The "allow-list that fails when an entry goes stale" shape used by
    // tests/determinism/ambient-nondeterminism-contract.test.ts: an entry for a
    // module that no longer performs I/O would quietly grant permission
    // nobody needs.
    const known = new Set(serviceFiles.map(({ relative }) => relative));
    const stale = Object.keys(MODULES_PERFORMING_IO).filter((relative) => !known.has(relative));
    expect(stale, 'these files are no longer in src/services/: remove their entries').toEqual([]);
  });

  it('is never imported by the simulation or persistence layers', () => {
    for (const { relative, source } of [...simulationFiles, ...persistenceFiles]) {
      expect(source, `${relative} must not depend on the services layer`).not.toMatch(
        /from ['"][^'"]*\/services\//,
      );
    }
  });

  it('does not reach into the renderer', () => {
    for (const { relative, source } of serviceFiles) {
      expect(source, `${relative} must not import the renderer`).not.toMatch(/from ['"][^'"]*\/rendering\//);
    }
  });

  /**
   * Simulation may branch on a stable content id; it may never read a
   * translated string (ADR 0011, restated as a boundary rule in
   * `docs/ARCHITECTURE.md`: *"Simulation code may branch on a stable id; it
   * may never read translated text."*).
   *
   * **This rule was a specifier check, and a barrel walked past it.** The
   * only pattern was `/from ['"][^'"]*localization['"]/`, which matches the
   * module's own path and nothing else. `src/simulation/rooms/definition.ts`
   * imported `resolveLocalizationKey` and `defaultLocaleEnCatalog` from
   * `'../../content'` -- the barrel that re-exports `./localization` -- and
   * assigned the resolved English string into `RoomDefinition.name`. Measured
   * across all 145 files under `src/simulation/`: the specifier pattern
   * flagged **zero**, and exactly one file called `resolveLocalizationKey`,
   * the one it could not see. ADR 0011 says the rule is "enforced by a test";
   * for that file it was not.
   *
   * The gap was not hypothetical to the specifier rule's *other* reader
   * either. `src/simulation/runtime/restore-session.ts` types
   * `RestoredScopeEntry.labelKey` as `string` rather than `LocalizationKey`
   * and says why in a comment: the alias "would buy a documentation nicety at
   * the cost of the import that gate exists to refuse". One module contorted
   * to satisfy the specifier check while another routed around it, which is
   * the signature of a rule that names a path instead of a capability.
   *
   * So the check is by **symbol** as well as by specifier. A symbol name
   * survives re-export: renaming the import path, adding a barrel, or
   * aliasing the module cannot hide the fact that a simulation module names
   * the function that turns a key into text.
   *
   * What is deliberately *not* flagged:
   *
   * - `LocalizationKey`, and any `*Key` field or literal. A message key is a
   *   stable ASCII identifier, not translated text -- ADR 0011's own table
   *   puts them in different namespaces, and carrying one through the
   *   simulation to be resolved by the UI at the last moment is the
   *   architecture, not a violation of it.
   * - `deriveSimulationMessageKey`. It *computes* a key from a stable id and
   *   reads no catalog. `src/simulation/presentation/guard-release-projection.ts`
   *   already names it in prose as what the UI should call.
   *
   * Comments are stripped before matching, so prose naming the forbidden
   * symbol -- which several simulation modules deliberately carry, precisely
   * to explain why they do not import it -- is not a violation. The direction
   * makes that safe rather than lax: this is a "must not contain" rule, so a
   * surviving comment would fail *loudly* on prose, never pass silently
   * (`unconsumed-content-contract`'s hazard is the opposite direction).
   */
  const FORBIDDEN_LOCALIZATION_SYMBOLS: readonly (readonly [string, RegExp])[] = [
    // `src/content/localization.ts` -- the resolution primitives.
    ['resolveLocalizationKey', /\bresolveLocalizationKey\b/],
    ['buildLocalizationCatalog', /\bbuildLocalizationCatalog\b/],
    ['LocalizationCatalog', /\bLocalizationCatalog\b/],
    // The assembled default-locale text. Holding it is holding the strings.
    ['defaultLocaleEnCatalog', /\bdefaultLocaleEnCatalog\b/],
    // `src/services/localization/` -- already unreachable by the
    // services-layer rule above, listed here so the barrel route is closed
    // for the runtime as well as for the content-side primitive.
    ['Localizer', /\bLocalizer\b/],
    ['pseudoLocalizeText', /\bpseudoLocalizeText\b/],
    ['messageCatalogFromLocalizationCatalog', /\bmessageCatalogFromLocalizationCatalog\b/],
  ];

  it('keeps the simulation free of localization runtime dependencies', () => {
    for (const { relative, source } of simulationFiles) {
      expect(source, `${relative} must not import the localization runtime`).not.toMatch(
        /from ['"][^'"]*localization['"]/,
      );
    }
  });

  it('keeps the simulation from naming a localization symbol, whatever specifier it arrives by', () => {
    const offenders: string[] = [];

    for (const { relative, source } of simulationFiles) {
      const code = stripComments(source);
      for (const [name, pattern] of FORBIDDEN_LOCALIZATION_SYMBOLS) {
        if (pattern.test(code)) offenders.push(`${relative} names ${name}`);
      }
    }

    expect(
      offenders,
      'a module under src/simulation/ resolves a localization key to text. ADR 0011 forbids it: carry the key (a stable id) and let the UI resolve it, as src/simulation/runtime/restore-session.ts does with RestoredScopeEntry.labelKey',
    ).toEqual([]);
  });

  it('cannot pass because the symbol list stopped matching anything, or the scan stopped seeing files', () => {
    // Both halves of the rule above can fail open. A typo in a pattern, or a
    // rename in `src/content/localization.ts`, would leave the assertion
    // green while gating nothing -- so the symbols are checked to still exist
    // where they are declared, against the real source text.
    const localizationSources = [
      readFileSync(join(SOURCE_ROOT, 'content/localization.ts'), 'utf8'),
      readFileSync(join(SOURCE_ROOT, 'content/default-locale-en.ts'), 'utf8'),
      ...collectTypeScriptFiles(join(SOURCE_ROOT, 'services/localization')).map((path) => readFileSync(path, 'utf8')),
    ].join('\n');

    const vanished = FORBIDDEN_LOCALIZATION_SYMBOLS.filter(([, pattern]) => !pattern.test(localizationSources)).map(
      ([name]) => name,
    );
    expect(
      vanished,
      'these symbols no longer exist under src/content/localization.ts, src/content/default-locale-en.ts or src/services/localization/: the rule above is gating a name nothing declares. Rename the entry or remove it',
    ).toEqual([]);

    expect(simulationFiles.length).toBeGreaterThan(100);
  });

  it('reaches Supabase only through a declared adapter, and only as a type', () => {
    for (const { relative, source } of serviceFiles) {
      if (!source.includes('@supabase/supabase-js')) continue;
      expect(relative, 'only the entitlements read adapter may reference Supabase').toBe(
        join('services', 'entitlements', 'client.ts'),
      );
      expect(source, `${relative} must import Supabase types only`).toMatch(
        /import type \{[^}]*\} from '@supabase\/supabase-js'/,
      );
    }
  });

  it('never mentions a service-role credential', () => {
    for (const { relative, source } of serviceFiles) {
      expect(source.toLowerCase(), `${relative} must not reference a service-role key`).not.toMatch(
        /service_role_key|service-role-key|servicerolekey/,
      );
    }
  });
});
