import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_FAULT_CODES,
  REFUSAL_REASONS,
  SIMULATION_PROTOCOL_VERSION,
  type ProtocolFaultCode,
  type RefusalReason,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { hudAlertsFromWorkerMessage } from '../../src/ui/simulation-alerts';
import { alertRows } from '../helpers/alert-rows';

/**
 * **The disjointness the press rests on, over the whole of both unions.**
 *
 * The owner ruled on 2026-09-22 that a message row is itself the press (ADR
 * 0122, the option labelled *"Naciskany wiersz, bez czasownika"*), and
 * `src/ui/hud/hud.ts` gives that press only to a row that is **not**
 * dismissible. The reason is at the primitive: `createListRow` makes the whole
 * row a `<button>` when it is given `onActivate`, and `ListRowAction`'s own
 * comment states what a row with both would be -- *"a button inside a button,
 * which is invalid HTML"*. The owner's decision 3 of 2026-09-01 is the other
 * half: a dismissal writes an irreversible mark, so it keeps the smaller
 * target on purpose.
 *
 * That guard costs nothing **only if no producer ever sends both**, and *"no
 * producer does"* was a claim about today when it was written. This file is
 * the check, and it is complete over the unions rather than a sample:
 *
 * 1. **No refusal row is dismissible**, for every one of the sixteen
 *    `RefusalReason`s, published *with* a tile so the case that could collide
 *    is the case tested. `src/ui/simulation-alerts.ts` says in prose why a
 *    refusal has no dismissal -- it is a *level*, republished up to twice a
 *    second, and suppressing one is `docs/HUD_PROJECTIONS.md` gap 34 -- and
 *    this is that sentence as an assertion.
 * 2. **No protocol-fault row is either**, for every one of the twelve
 *    `ProtocolFaultCode`s: no tile, so not a press, and no `occurrences`, so
 *    not dismissible. A malformed message is not anywhere, which is the
 *    reason, and a fault row that grew a tile would be a destination invented
 *    for a message that has none.
 * 3. **The other producer cannot collide from its side either.**
 *    `src/ui/simulation-events.ts` never writes a `tile` onto a row, so every
 *    row it builds is dismissible and place-less -- the mirror image. Asserted
 *    by reading that file rather than by driving its twenty-odd event types a
 *    second time: `tests/unit/ui-simulation-events.test.ts` already drives
 *    every one of them through its own `SAMPLE`, and what is wanted here is
 *    the statement that no *future* row can carry one without this test
 *    failing, which is a property of the source and not of a sample.
 */

const ROOT = join(__dirname, '../..');

const COUNTS = {
  prisoners: 0,
  prisonersInIntake: 0,
  prisonersHighRisk: 0,
  staff: 0,
  staffUnassigned: 0,
  rooms: 0,
  roomCapacity: 0,
  roomOccupants: 0,
  activeIncidents: 0,
  contrabandDiscovered: 0,
  treasuryMinorUnits: 25_000,
} as const;

/** One `simulation/status-counts` publication carrying a refusal and a tile. */
function refusalPublication(reason: RefusalReason): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-1',
    kind: 'simulation/status-counts',
    payload: {
      tick: 12,
      schemaVersion: 1,
      counts: { ...COUNTS },
      refusal: { sequence: 1, tick: 12, reason, tile: { x: 41, y: 83 } },
    },
  } as WorkerToMainMessage;
}

/** One uncorrelated `protocol/error`, which is the only kind that reaches the log. */
function faultPublication(code: ProtocolFaultCode): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'fault-1',
    kind: 'protocol/error',
    payload: { code, recoverable: true },
  } as WorkerToMainMessage;
}

describe('a pressable message row and a dismissable one are never the same row', () => {
  it('gives no refusal row a dismissal, for every reason, including the ones that carry a tile', () => {
    // Non-vacuity: the union is read from the production constant, so a
    // reason added tomorrow is tested tomorrow without editing this file.
    expect(REFUSAL_REASONS.length, 'the refusal union is empty, so this loop asserts nothing').toBeGreaterThan(10);

    const dismissible: string[] = [];
    for (const reason of REFUSAL_REASONS) {
      const rows = alertRows(hudAlertsFromWorkerMessage(refusalPublication(reason)));
      expect(rows.length, `${reason}: a refusal publication produced ${rows.length} rows rather than one`).toBe(1);
      if (rows[0]?.occurrences !== undefined) dismissible.push(reason);
    }

    expect(
      dismissible,
      'a refusal row became dismissible. `hud.ts` then gives up its press to keep the dismiss control, so the ' +
        'destination this row carries stops being reachable -- and a row with both would be a button inside a button.',
    ).toEqual([]);
  });

  it('gives no protocol-fault row a tile or a dismissal, for every fault code', () => {
    expect(PROTOCOL_FAULT_CODES.length, 'the fault union is empty, so this loop asserts nothing').toBeGreaterThan(8);

    const placed: string[] = [];
    const dismissible: string[] = [];
    for (const code of PROTOCOL_FAULT_CODES) {
      const rows = alertRows(hudAlertsFromWorkerMessage(faultPublication(code)));
      expect(rows.length, `${code}: a fault produced ${rows.length} rows rather than one`).toBe(1);
      if (rows[0] !== undefined && 'tile' in rows[0]) placed.push(code);
      if (rows[0]?.occurrences !== undefined) dismissible.push(code);
    }

    expect(
      placed,
      'a protocol-fault row carries a tile. A malformed message is not anywhere, so that is a destination invented ' +
        'for a message that has none.',
    ).toEqual([]);
    expect(dismissible, 'a protocol-fault row became dismissible').toEqual([]);
  });

  it('never lets the event producer put a place on a row', () => {
    const source = readFileSync(join(ROOT, 'src/ui/simulation-events.ts'), 'utf8');
    // Property assignments only -- `tile:` or `tile,` in an object literal --
    // so the three existing comments in that file about tiles do not match
    // and a row that gained the field would.
    const assignments = [...source.matchAll(/^\s*(?:\.\.\.\([^\n]*\btile\b[^\n]*\)|tile\s*[:,])/gmu)].map((match) =>
      match[0].trim(),
    );
    expect(
      assignments,
      'src/ui/simulation-events.ts now puts a place on a row it builds. Every row it builds also carries ' +
        '`occurrences`, so that row would be both a press and a dismissal -- a button inside a button. Decide which ' +
        'it is, in `hud.ts`, before adding the field.',
    ).toEqual([]);
  });
});
