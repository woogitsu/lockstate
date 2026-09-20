import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { PROJECTION_IDS, type ProjectionId } from '../../src/simulation/protocol/types';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

/**
 * The fourth member of the reachability family, after the fault-code, the
 * challenge-rejection-code and the protocol-message-kind gates. It measures
 * the thing issue #104 is about, and that none of the other three can see.
 *
 * #104's finding, in its own words:
 *
 * > **Eleven of the thirteen exported projection functions are called from
 * > nowhere outside `src/simulation/presentation/`.** Their only other
 * > consumers are their own tests.
 *
 * and its ask:
 *
 * > The two that *are* reachable arrived as **two separate special cases**,
 * > which is the second pattern this issue was filed to prevent.
 *
 * The message-kind gate one directory over cannot catch either. It asks
 * whether a *message kind* has a sender, and a read model with no message at
 * all is invisible to it: `simulation/status-counts` was sent, provokable and
 * green throughout the period in which nine of the ten projections it was
 * supposed to have generalised were unreachable. So this gate asks the
 * question in the read model's own terms -- **does every exported projection
 * have a route out of the worker** -- and answers it from the two artefacts
 * that decide it: the projection sources themselves, and the catalog that
 * binds them to the wire.
 *
 * ## Why this is worth more than any individual wiring
 *
 * The wirings are already asserted, twice over. `PROJECTION_CATALOG` is a
 * `Record<ProjectionId, ProjectionCatalogEntry>`, so a declared id with no
 * entry does not compile, and `tests/contract/worker-projection-channel.test.ts`
 * drives every entry through a real state machine, so an entry that throws
 * fails. Both of those are gates on the *declared vocabulary*.
 *
 * What neither can see is a projection that was never declared: somebody adds
 * `projectVisitation` to `src/simulation/presentation/`, writes it, tests it,
 * and stops -- and the compiler is happy, the catalog is complete, the channel
 * is healthy, and the interface cannot reach the new read model. That is
 * exactly how eleven of thirteen got where they were, one function at a time,
 * with a green suite the whole way. **This file is the gate that fails on
 * that**, because it starts from the directory rather than from the
 * vocabulary.
 *
 * ## What it does not claim
 *
 * It is a text scan over two directories, and the floor it asserts is "this
 * projection has a route", not "a panel paints it". A route with nothing on the
 * end of it is a real and separate state, and it was this repository's state
 * until #331's milestone: this file used to carry a `UNPAINTED_ROUTE` entry
 * recording it, written so that the day a module under `src/ui/` called the
 * requester the entry went stale and this file failed until it was deleted.
 * That is what happened -- `src/ui/simulation-room-needs.ts` reads
 * `hud/room-list` and `hud/room-detail` to tell the player what a zoned room is
 * missing -- so the entry is gone and the assertion that replaced it runs the
 * other way: **there must be a painter**, and deleting the last one fails here
 * rather than quietly returning the channel to a pipe with nothing on the end
 * of it. It still does not claim that every projection is painted; **one of the
 * fifteen catalogued read models has a route and no reader.**
 *
 * That number is stated with the way to re-derive it, because it is a tally and
 * this file's whole subject is claims that rot. `PROJECTION_IDS`
 * (`src/simulation/protocol/types.ts`, the tuple `PROJECTION_IDS`) has fifteen
 * members; grepping all fifteen as string literals across `src/ui/` and
 * `src/rendering/` returns **fourteen**, so fifteen minus fourteen is one. The
 * fourteen are `hud/room-list` and `hud/room-detail`
 * (`simulation-room-needs.ts`), `hud/held-guards` (`simulation-held-guards.ts`),
 * `hud/pending-deliveries` (`simulation-pending-deliveries.ts`),
 * `hud/prisoner-population` (`simulation-intake.ts`), `hud/build-queue`
 * (`simulation-build-queue.ts`), `hud/staff` (`simulation-staff-coverage.ts`),
 * `hud/prisoner-roster` (`simulation-prisoner-roster.ts`),
 * `hud/prisoner-detail` (`simulation-prisoner-detail.ts`), `hud/status-strip`
 * (`simulation-regime.ts`), `hud/security` (`simulation-security.ts`),
 * `hud/incidents` and `hud/incident-detail` (`simulation-incidents.ts`) and
 * `hud/contraband` (`simulation-contraband.ts`). `src/rendering/` matches none.
 * The one with a route and nobody on it is `world/render-snapshot`.
 *
 * **This paragraph said "five" and "ten" until 2026-09-17, and before that
 * "nine" and "six" until issue #895, and every one of them was right when
 * written.** The 2026-09-17 move is the largest this tally has made: the
 * Security section landed three reader modules at once, and they carry *four*
 * ids between them because `simulation-incidents.ts` reads the incidents pair.
 * So the two counts moved by three and by four in the same change, which is the
 * amendment below this one stated as arithmetic rather than as a warning.
 *
 * **The earlier movement, kept because its reasoning is the one a reader
 * needs.** `src/ui/simulation-prisoner-detail.ts` is the tenth reader
 * and `hud/prisoner-detail` is the read model that moved between the two lists
 * -- the *first* of the five that #157 found waiting on a selection model to
 * get one. The pair still moves together only by coincidence, for the reason
 * the amendment below this one gives: `simulation-room-needs.ts` reads two ids,
 * so a count of reader files and a count of read models are different numbers
 * and stop agreeing whenever one module requests two projections.
 *
 * **Added 2026-08-29 (#157), reinstating the `UNPAINTED_ROUTE` idiom this file
 * deleted at #331 -- named per id this time rather than as one entry, because
 * six ids need it rather than two.** #157 asked whether an unread route is
 * dead, waiting on something named, or blocked on a protocol shape the channel
 * lacks; investigating it found five of the six waiting on the same undone
 * decision (`tests/foundation/unconsumed-action-contract.test.ts`'s
 * `AWAITING_CONSUMER['selection.primary']`: *"there is no selection state, no
 * highlight and no inspector"*) and the sixth (`world/render-snapshot`)
 * -- **and one of that five stopped waiting at issue #895, which is the
 * finding rather than the digit.** The quoted sentence had three clauses and
 * only the middle one still holds: the Regime panel's roster rows are now a
 * selection (`role="radio"`, `aria-checked`, a roving tab stop) and the block
 * under them is an inspector, so `hud/prisoner-detail` had its blocker
 * removed by a panel rather than by the world-pointer selection model
 * `selection.primary` names. There is still no *highlight* -- nothing in
 * `src/rendering/` marks the selected prisoner in the world -- and
 * `selection.primary` still has no consumer at all, which is why that entry
 * stands, amended, rather than being deleted; and
 * superseded by `simulation-snapshot-feed.ts`'s session-snapshot bundle, an
 * open question ADR 0040 already records and defers to its slice 4. Neither is
 * an accident this gate should paper over, and neither should be allowed to
 * become one silently again: `UNPAINTED_PROJECTION_IDS` below names each id
 * with what blocks it, and the test after `ROUTED_ELSEWHERE`'s own is written
 * to fail in both directions -- an id with a reader keeps a stale entry from
 * standing (exactly how the single `UNPAINTED_ROUTE` entry died at #331), and
 * an id added to `PROJECTION_CATALOG` tomorrow with neither a reader nor an
 * entry fails immediately instead of joining this list unnoticed the way
 * `world/render-snapshot` did. This is a narrower promise than "every route is
 * painted" -- it is "every unpainted route says why," which is the one a text
 * scan over stable string ids can actually keep without drifting the day a
 * panel's internal shape changes.
 *
 * **This said "nine of the fifteen" and "six", then "eight" and "seven", and
 * every one of them was right when written.** The directions are marked rather
 * than overwritten because the pair -- how many read models, how many reader
 * modules -- is what a reader checks, and the two stop agreeing whenever one
 * module requests two projections. `src/ui/simulation-staff-coverage.ts` was
 * the seventh reader (ADR 0048 consequence 1); the eighth and ninth are
 * `src/ui/simulation-prisoner-roster.ts` and `src/ui/simulation-regime.ts`
 * (issue #451), which are counted here as *two* modules reading two projections
 * so the two counts happen to move together this time. The tenth is
 * `src/ui/simulation-prisoner-detail.ts` (issue #895), one module reading one
 * id, so they move together again -- which is luck and not a rule. The `file:line`
 * citations that used to sit beside each reader are gone rather than
 * renumbered, for `docs/AGENT_WORKFLOW.md` §4's reason: a line number into a file
 * under active edit is the least durable citation here, and every one of these
 * pointed at a `request(` call that a single inserted comment moves.
 *
 * The eighth and ninth readers are the first whose subject is the prison's
 * **inhabitants**. `src/ui/simulation-prisoner-roster.ts` carries who is in the
 * prison, what each of them is doing and how each is classified;
 * `src/ui/simulation-regime.ts` carries what each classification group's day
 * allows at this tick, off the one field of `hud/status-strip` that the *push*
 * route does not already publish. Together they are the first surface for
 * #450's consequence chain -- an incident writes a disciplinary record,
 * `ClassificationReviewSystem` rewrites the prisoner's tier and group from it,
 * and `ActionSystem` puts them on a different timetable -- of which the only
 * thing that had ever reached a player was `activeIncidents`, one integer on
 * one stat tile.
 *
 * **This said "ten", and the arithmetic slip is the interesting part rather than
 * the digit.** Six ids are read by *five* modules, because
 * `simulation-room-needs.ts` reads two of them -- so a count of reader files
 * gives five and fifteen minus five gives ten. The sentence is about read
 * *models*, not reader modules, and the two stop agreeing the moment one module
 * requests two projections. It was already wrong when it was written, and the
 * same off-by-one from the same cause was independently found in
 * `docs/HUD_PROJECTIONS.md` §9; ADR 0040's open question 4 has had nine right
 * all along.
 *
 * A literal grep can only prove a *lower* bound on readers -- a module that
 * built an id at runtime would be invisible to it -- so that was checked
 * separately rather than assumed: the only place in `src/ui/` or
 * `src/rendering/` that holds a `ProjectionId` as a value instead of a literal
 * is `simulation-projections.ts:159`, the requester's own signature, which is
 * the transport every one of the six calls through rather than a reader of any
 * particular projection. So there is no indirect resolution to miss, and nine is
 * exact rather than an upper bound.
 *
 * The second painter is `src/ui/simulation-build-queue.ts`, and it is worth
 * naming because it closed a *different* gap from the room readout's. That one
 * made a verdict visible. This one carries the **order ids** of the orders that
 * are still pending, which is what `CancelBuildOrder` names -- and until it
 * existed that command was the repository's only one with no production
 * producer, because no control could aim at an order nothing had told this
 * thread about. So this channel is now the route by which a *command* becomes
 * reachable, not only the route by which a readout does.
 *
 * The fourth is `src/ui/simulation-pending-deliveries.ts`, over
 * `hud/pending-deliveries`, and it is the second time this channel is what makes
 * a *command* reachable rather than a readout -- with the difference that what
 * sat unreachable behind it was not a control but a **credit** (#285).
 * `ProcurementSystem.cancel` refunds the recorded price of a delivery that has
 * not landed, exactly, and every caller in the repository was a test -- so the
 * one thing besides the state income line that puts money back into the treasury
 * could not happen in any session a player could drive. A purchase id is minted
 * on the main thread and immediately forgotten; this projection is what carries
 * it back, so a control can name one.
 *
 * The fifth is `src/ui/simulation-held-guards.ts`, over `hud/held-guards`, and it
 * is the **third** time this channel is what makes a *command* reachable rather
 * than a readout -- with the difference that what sat unreachable behind it was
 * neither a control nor a credit but a **release** (ADR 0034, answering ADR 0033's
 * open question 3). `GuardRoster.unassign` has been complete since #26 and every
 * caller of it in `src/` sits inside the system that made the claim being
 * released, each firing only when that system decides the claim is over -- so a
 * claim whose owner had lost track of it was permanent, which is what issue #352
 * measured as four guards held for ever. A guard id is minted inside the
 * simulation and never reached this thread at all; this projection is what
 * carries it out, together with the one fact the roster cannot answer on its own
 * -- which of the two `'on-search'` claimants holds the guard.
 *
 * The sixth is `src/ui/simulation-staff-coverage.ts`, over `hud/staff`, and it
 * is the first whose subject is neither a readout of what the prison holds nor
 * an id a control aims at, but a **warning**. ADR 0048 made a riot reachable in
 * a prison a player can build and scaled `requiredGuardCount` with occupancy, so
 * a prison that outgrows its guards riots; its own Consequences record that
 * `StaffCoverageRowViewModel` carried `required`/`assigned`/`shortage` and no
 * panel rendered any of it, which left the build-up invisible. Measured in a
 * 12-bed prison driven through the real command path: the report reads
 * `required: 1` from the first admission through the eighth and `required: 2` on
 * the tick the ninth lands -- 12,788 ticks before that prison's first riot. The
 * reader carries the summed totals rather than the per-sector rows, because
 * `applyDefaultSecuritySector` derives exactly one sector for every session a
 * player can start.
 *
 * The third is `src/ui/simulation-intake.ts`, over `hud/prisoner-population`,
 * and it is the first one about *people* rather than about the building: it
 * says where the arrivals the player has already admitted are, which is the
 * difference between an admission that is waiting for a cell and one that can
 * never be housed at all. Neither state had a surface, although the strip
 * counted both among the population.
 *
 * The tenth is `src/ui/simulation-prisoner-detail.ts`, over
 * `hud/prisoner-detail` (issue #895), and it is the first reader on this
 * channel whose request names **one row**: every one above it asks a question
 * with no subject and takes whatever window the projection holds, while this
 * one carries an `EntityId` the player chose by pressing a roster row. What
 * sat unreachable behind it was neither a control nor a credit nor a warning
 * but a **composition**: the state withholds part of a prisoner's day of the
 * operating grant per unmet need, and the roster row shows the worst need of
 * six -- so a prisoner costing the prison four needs' worth and one costing it
 * a single need were indistinguishable in every surface the application had.
 * It is also the first route this gate has seen leave
 * `UNPAINTED_PROJECTION_IDS` by having its stated blocker removed rather than
 * by that blocker being re-argued: the entry named "no selection state, no
 * highlight and no inspector", and a panel-local selection answered two thirds
 * of it.
 */

const ROOT = join(__dirname, '../..');
const PRESENTATION_DIR = 'src/simulation/presentation';
const CATALOG_FILE = 'src/simulation/worker/projection-catalog.ts';
const UI_DIR = 'src/ui';
const RENDERING_DIR = 'src/rendering';

const read = (path: string): string => stripComments(readFileSync(join(ROOT, path), 'utf8'));

/**
 * Every exported projection in the read-model layer, as declared in source.
 *
 * Read from the files rather than from `src/simulation/presentation/index.ts`,
 * because the index re-exports with `export *` and a barrel cannot be
 * enumerated statically. The naming convention is the repository's own and is
 * pinned by the vacuity guard below: every one of these is `project<Thing>`.
 */
function exportedProjections(): readonly { readonly file: string; readonly name: string }[] {
  const found: { file: string; name: string }[] = [];
  for (const entry of [...readdirSync(join(ROOT, PRESENTATION_DIR))].sort()) {
    if (!entry.endsWith('.ts')) continue;
    const file = `${PRESENTATION_DIR}/${entry}`;
    for (const match of read(file).matchAll(/^export function (project[A-Za-z0-9_]*)/gm)) {
      found.push({ file, name: match[1]! });
    }
  }
  return found;
}

const PROJECTIONS = exportedProjections();

/**
 * Projections that reach the interface by a route other than the general
 * channel, with what carries them.
 *
 * A reason must name the module and the message, so that a route that is
 * deleted or moved leaves an entry a reader can check. It must state what is
 * true today and must not describe a plan.
 */
const ROUTED_ELSEWHERE: Readonly<Record<string, string>> = {
  projectClockPosition:
    'Reached from `src/ui/simulation-clock.ts:1`, which calls it on the *main* thread over the tick carried by `simulation/clock-state` (PR #94). It is the one projection here with no simulation state behind it -- a pure function from a tick count to a day and a position within the day -- so a request/response round trip would be a message pair spent on arithmetic the caller can already do. It is deliberately absent from `PROJECTION_IDS` for that reason, and `src/ui/simulation-clock.ts` is where the deletion of this entry would have to start.',
};

/**
 * The modules that actually drink from the channel.
 *
 * The other half of #104's question, and the one no other gate asks: "there is
 * a pipe" and "something drinks from it" are different facts. This list is the
 * second, and it is a *floor* rather than a manifest -- a new reader may be
 * added without touching it, and the last one being deleted fails the
 * assertion below. Named individually so that a reader which is renamed or
 * moved out of `src/ui/` fails here instead of silently leaving the surface.
 */
const PAINTERS = [
  'simulation-build-queue.ts',
  // 2026-09-17, the Security section. Three readers landing at once, which has
  // not happened on this channel before: `hud/contraband`, `hud/incidents`
  // *with* `hud/incident-detail`, and `hud/security`. Named individually for
  // the reason this list gives -- and with a sharper edge for the middle one,
  // because `simulation-incidents.ts` is the only reader of two ids whose
  // second id is quoted nowhere else in `src/ui/`, so a rename that moved it
  // out of this tree would take the last reader of `hud/incident-detail` with
  // it and the per-id check below would report that route unpainted again.
  'simulation-contraband.ts',
  'simulation-held-guards.ts',
  'simulation-incidents.ts',
  'simulation-intake.ts',
  'simulation-pending-deliveries.ts',
  // Issue #895. The first reader on this channel whose request names **one**
  // row: `hud/prisoner-detail` is `target: 'entity'`, and the id is the one the
  // player pressed on a roster row. Named here for the reason this list gives,
  // and it is the direction that matters most for a detail route -- the id is
  // quoted in exactly one file, so a rename that moved it out of `src/ui/`
  // would take the last reader of that projection with it and the per-id check
  // below would report the route unpainted again.
  'simulation-prisoner-detail.ts',
  'simulation-prisoner-roster.ts',
  'simulation-regime.ts',
  'simulation-room-needs.ts',
  'simulation-security.ts',
  'simulation-staff-coverage.ts',
  // Issue #533. The **second** reader of `hud/staff`, beside
  // `simulation-staff-coverage.ts` above, and it is named here for the reason
  // this list gives: named individually so a reader renamed or moved out of
  // `src/ui/` fails here rather than silently leaving the surface -- which
  // matters more for a second reader of one id than for a first, because the
  // per-id check below would still find the *other* one and report the id as
  // read.
  'simulation-staff-roster.ts',
] as const;

const catalogSource = read(CATALOG_FILE);

/** A projection the catalog actually calls: `projectThing(` in the catalog's source. */
const catalogued = (name: string): boolean => new RegExp(`\\b${name}\\s*\\(`).test(catalogSource);

/** Every `.ts` file under `directory`, recursively, as a path relative to `ROOT`. */
function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of [...readdirSync(join(ROOT, directory))].sort()) {
    const relative = `${directory}/${entry}`;
    if (statSync(join(ROOT, relative)).isDirectory()) {
      files.push(...collectTypeScriptFiles(relative));
    } else if (entry.endsWith('.ts')) {
      files.push(relative);
    }
  }
  return files;
}

/**
 * Every candidate reader file, scanned once. Recursive (unlike `PAINTERS`'
 * own top-level scan) because a per-id check has no equivalent of
 * `SimulationProjectionRequester` to anchor on -- it is looking for the id
 * literal itself, and that could in principle be quoted from a subdirectory
 * such as `src/ui/hud/`.
 */
const READER_SURFACE = [...collectTypeScriptFiles(UI_DIR), ...collectTypeScriptFiles(RENDERING_DIR)];

/**
 * Files that quote this projection id as a string literal -- the same
 * technique the doc comment above used by hand to produce "nine of fifteen",
 * mechanized so it cannot go stale the way a tally in a comment does.
 */
const readersOf = (id: string): readonly string[] => READER_SURFACE.filter((file) => read(file).includes(`'${id}'`));

/**
 * Projection ids with a route and, today, no reader -- named individually with
 * what blocks one, so the entry a reader makes stale is exactly the entry that
 * described its own absence. A reason must state what is verifiably true
 * today, with a citation, and must not merely restate a plan.
 */
const UNPAINTED_PROJECTION_IDS: Readonly<Partial<Record<ProjectionId, string>>> = {
  'world/render-snapshot':
    "No reader. `decodeRenderLayer` (`src/simulation/presentation/world-projection.ts`) has no caller outside its own module and `tests/`; the render path gets world chunks through `src/rendering/feed/simulation-snapshot-feed.ts`'s session-snapshot bundle instead of pulling this projection. ADR 0040 open question 4 (`docs/adr/0040-the-shape-of-the-render-delta-channel.md:522`) leaves reuse-versus-delete to slice 4 and deliberately does not decide it here.",
};

/*
 * **FOUR ENTRIES LEFT THIS LIST ON 2026-09-17, AND THE ONE THAT IS LEFT IS THE
 * ONLY ONE WHOSE BLOCKER WAS NEVER A PANEL.** `hud/incidents`,
 * `hud/incident-detail`, `hud/contraband` and `hud/security` were deleted from
 * it by the Security section -- `src/ui/hud/security-panel.ts` and the three
 * readers `src/ui/simulation-security.ts`, `src/ui/simulation-incidents.ts` and
 * `src/ui/simulation-contraband.ts` -- which the owner ruled on that date
 * (provenance the weaker kind: the label of a clickable option, not a sentence
 * they typed).
 *
 * The entries are gone rather than rewritten, which is the rule this list is
 * built on and the direction that killed the single `UNPAINTED_ROUTE` entry at
 * #331: a record of an absence must go when the absence does, or the next
 * reader down the list learns nothing from something that is already false.
 * Each of the four is quoted in the commit that deleted it, beside the reader
 * that refuted it.
 *
 * What they said, in one line each, because the pattern in them is worth more
 * than the fact that they are gone. Three of the four blamed the same thing --
 * an unbuilt panel, each citing
 * `docs/research/audit-2026-08-26/10-product-roadmap.md:328` -- and the fourth,
 * `hud/incident-detail`, blamed the absence of the third: *"it waits on the
 * LIST half rather than on a selection model ... there is no row for a player
 * to press."* That is why one section and one panel deletes four entries, and
 * why building four panels would have been the wrong reading of a list of four
 * ids.
 *
 * The two cost gaps those entries also carried are **not** thereby closed, and
 * neither is claimed to be: `projectIncidents` still pages `IncidentLog.all()`
 * in memory so `resolved.total` costs `O(allIncidentsEverRecorded)`
 * (`docs/HUD_PROJECTIONS.md:1613-1616`), and `ConfiscationLedger.all()` is
 * still unbounded over a session (`:1600-1603`). The readers ask both with
 * `limit: 0` -- totals and no rows -- which avoids *building* rows nobody
 * renders and does nothing about the scan behind the total. Each reader's
 * header says so.
 */
describe('every projection the worker can produce has a route out of it', () => {
  it('scans the read-model layer it means to, and really finds projections in it', () => {
    // Vacuity guard, both halves. An empty directory listing or a regex that
    // stopped matching would make every assertion below true of an empty set,
    // which reads exactly like compliance -- the failure this whole family of
    // gates exists to prevent.
    expect(PROJECTIONS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(PROJECTIONS.map(({ name }) => name)).size).toBe(PROJECTIONS.length);
    // Named files, so a projection module that is renamed or moved out of the
    // scanned directory fails here rather than silently leaving the surface.
    const files = new Set(PROJECTIONS.map(({ file }) => file));
    for (const expected of [
      'clock-projection.ts',
      'contraband-projection.ts',
      'guard-release-projection.ts',
      'incident-projection.ts',
      'prisoner-projection.ts',
      'room-projection.ts',
      'security-projection.ts',
      'staff-projection.ts',
      'status-strip-projection.ts',
      'world-projection.ts',
    ]) {
      expect(files, `${expected} exports no projection any more`).toContain(`${PRESENTATION_DIR}/${expected}`);
    }
    // And the catalog scan really reads source: an emptied file would make
    // `catalogued` false for everything, which is loud, but a stripper that
    // blanked it would do the same silently.
    expect(catalogSource.length).toBeGreaterThan(2_000);
    expect(catalogued('projectStatusStrip')).toBe(true);
  });

  it('gives every exported projection a route, or an entry saying which other one carries it', () => {
    const unreachable = PROJECTIONS.filter(({ name }) => !catalogued(name) && ROUTED_ELSEWHERE[name] === undefined);
    expect(
      unreachable.map(({ file, name }) => `${file}::${name}`),
      'this projection can be produced and cannot leave the worker. Add it to `PROJECTION_IDS` and give it a `PROJECTION_CATALOG` entry, or -- if something else already carries it -- record that here with the module and the message that do',
    ).toEqual([]);

    for (const [name, reason] of Object.entries(ROUTED_ELSEWHERE)) {
      expect(reason.trim().length, `${name} needs a reason naming its route`).toBeGreaterThan(80);
    }
  });

  it('keeps the other-route list honest in both directions', () => {
    const declared = new Set(PROJECTIONS.map(({ name }) => name));

    expect(
      Object.keys(ROUTED_ELSEWHERE).filter((name) => !declared.has(name)),
      'this key is not an exported projection, so its entry accounts for nothing and can never go stale',
    ).toEqual([]);

    expect(
      Object.keys(ROUTED_ELSEWHERE).filter((name) => catalogued(name)),
      'this projection is now on the general channel too, so its entry no longer describes the only route -- delete it, or rewrite it to say what the second route is for',
    ).toEqual([]);
  });

  it('declares exactly the projections the catalog binds, and binds exactly what it declares', () => {
    // The compiler already refuses a `Record<ProjectionId, ...>` with a
    // missing key, so this cannot fail today by that route. It is here for the
    // one the compiler cannot see: `PROJECTION_IDS` is what the *wire* enum is
    // built from, and a member deleted from the tuple while its catalog entry
    // stayed would leave an entry nothing can ask for.
    expect(Object.keys(PROJECTION_CATALOG).sort()).toEqual([...PROJECTION_IDS].sort());
    expect(PROJECTION_IDS.length).toBe(new Set(PROJECTION_IDS).size);
  });

  it('binds every catalogued id to a projection that exists in the read-model layer', () => {
    // The other direction of the scan: an entry whose body calls nothing from
    // `src/simulation/presentation/` is a route to a hand-rolled view model,
    // which is the duplication `AGENTS.md` boundary 1 and this layer exist to
    // prevent. Measured per entry rather than in aggregate, so the failure
    // names the id.
    const projectionNames = PROJECTIONS.map(({ name }) => name);
    const entries = [...catalogSource.matchAll(/'((?:hud|world)\/[a-z-]+)':\s*\{([\s\S]*?)\n  \},/g)];
    expect(entries.length, 'the catalog entry scan matched nothing, so the rule below asserts about an empty list').toBe(PROJECTION_IDS.length);

    for (const [, id, body] of entries) {
      const calls = projectionNames.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(body!));
      expect(calls.length, `${id!} calls no projection from ${PRESENTATION_DIR}/`).toBeGreaterThan(0);
    }
  });

  it('has a module that actually reads the channel, and says which', () => {
    const painters = readdirSync(join(ROOT, UI_DIR))
      .filter((entry) => entry.endsWith('.ts') && entry !== 'simulation-projections.ts')
      .filter((entry) => read(`${UI_DIR}/${entry}`).includes('SimulationProjectionRequester'));

    // The assertion this file used to make in reverse. Until #331's milestone
    // the channel had a route and no reader, which was recorded here as a
    // standing entry rather than left for the next audit; the entry has been
    // deleted and this is what took its place. An empty list is a channel that
    // has gone back to being a pipe with nothing on the end of it.
    expect(
      painters.length,
      'no module under src/ui/ reads a projection any more. The channel is a pull with nothing pulling: give a panel back its reader, or this whole layer is eleven read models nobody can see (#104)',
    ).toBeGreaterThan(0);

    // And the named ones are still there, so a reader that is renamed or moved
    // out of the tree fails here rather than being replaced in silence by
    // whichever other module happens to satisfy the count above.
    expect(
      [...PAINTERS].filter((entry) => !painters.includes(entry)),
      'this reader no longer uses the projection requester: update PAINTERS in the same change, or the list becomes fiction',
    ).toEqual([]);

    // The other half of the same fact: the requester exists and is the sender.
    // Without this the assertions above would be equally green if the requester
    // had been deleted and the readers were mentioning a name that no longer
    // sends anything.
    expect(read(`${UI_DIR}/simulation-projections.ts`)).toContain("kind: 'simulation/request-projection',");
  });

  /*
   * An explicit timeout: this walks the whole tree and exceeded
   * `vitest.config.ts`'s global 5,000 ms under contention on 2026-09-03.
   * The measurement and the reasoning are in
   * `comment-symbol-existence-contract.test.ts`, beside the slowest of them.
   * No assertion changes; only the patience does.
   */
  it('gives every projection id a reader, or a reason blocking one', () => {
    for (const id of PROJECTION_IDS) {
      const readers = readersOf(id);
      const reason = UNPAINTED_PROJECTION_IDS[id];
      if (readers.length > 0) {
        // The direction that killed the single `UNPAINTED_ROUTE` entry at
        // #331: a reader landed and the entry describing its absence must go
        // with it, or the next reader down this list learns nothing from a
        // record that is already false.
        expect(
          reason,
          `${id} is now read by ${readers.join(', ')} -- delete its UNPAINTED_PROJECTION_IDS entry, it is stale`,
        ).toBeUndefined();
      } else {
        expect(
          reason,
          `${id} has no reader under src/ui/ or src/rendering/ and no UNPAINTED_PROJECTION_IDS entry saying why. Wire a reader, or add an entry naming what blocks one`,
        ).toBeDefined();
        expect(reason!.trim().length, `${id}'s UNPAINTED_PROJECTION_IDS entry needs a reason, not a label`).toBeGreaterThan(80);
      }
    }
  }, 60_000);

  it('keeps the unpainted-projection list honest in the other direction', () => {
    const declared = new Set<string>(PROJECTION_IDS);
    expect(
      Object.keys(UNPAINTED_PROJECTION_IDS).filter((id) => !declared.has(id)),
      'this key is not a declared projection id, so its entry accounts for nothing and can never go stale',
    ).toEqual([]);
  });
});
