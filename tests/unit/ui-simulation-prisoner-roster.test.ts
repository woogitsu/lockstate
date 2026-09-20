import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import type { PrisonerRosterPage, PrisonerRosterRowViewModel } from '../../src/simulation/presentation/prisoner-projection';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import {
  HUD_MESSAGE_KEY,
  PRISONER_ROSTER_ROW_LIMIT,
  describePrisonerRow,
  formatPrisonerActivity,
  formatPrisonerName,
} from '../../src/ui/hud';
import { BADGE_TONES } from '../../src/ui/primitives/status-badge';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';
import { PrisonerRosterReader, prisonerRosterFromProjection } from '../../src/ui/simulation-prisoner-roster';

/**
 * The translator between `hud/prisoner-roster` and what the Regime panel's
 * roster block renders, and the rule that decides what a row's badge says
 * (issue #451).
 *
 * Four claims, different in kind.
 *
 * **That every id becomes the right key.** The expected keys are written out as
 * literals rather than built with `deriveSimulationMessageKey`, deliberately: a
 * fixture that derived them would pass for any namespace this module chose, and
 * the whole question is whether an action id becomes an `action.*.name` and a
 * risk tier a `risk-tier.*.name`. The keys are then resolved against the real
 * bundled catalog, so a key that is right in shape and absent in content fails
 * here too.
 *
 * **That "no action" and "idle" are handled as two fields rather than one.**
 * `currentActionId` and `actionPhase` are independent on the projection, and
 * the row has one activity slot -- so this file drives all four combinations,
 * including the one the simulation is not currently believed to produce.
 *
 * **That the badge word and the badge colour come from different fields.** The
 * word is the tier; the colour is the group for every tier but one, and the
 * *tier* for tier 2 -- the owner's ruling of 2026-09-02 on issue #788. So a
 * tier moving 0 -> 1 has to change the word without changing the colour,
 * reaching 2 has to change the colour without moving the group, and reaching 3
 * has to change the colour again and move the group with it.
 *
 * **That the total is the prison's and not the window's.** A mapping that
 * returned `rows.length` would make the panel's "N of M" read "4 of 4" in a
 * prison of five hundred.
 */

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
const t = (key: string, parameters?: Readonly<Record<string, string | number | boolean>>): string =>
  parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

/**
 * A projected roster row with every field a real one carries.
 *
 * The fields this module drops -- `tile` and `accommodation` -- are present and
 * populated rather than omitted, so a mapping that started forwarding one of
 * them would show up in the `toEqual` assertions below instead of being
 * invisible.
 *
 * **`lowestNeed` was in that list until issue #535 decision 6 and is now
 * forwarded**, so the `toEqual` assertions below assert its mapped shape rather
 * than its absence. The bullet is corrected rather than deleted because the
 * mechanism it describes is the one that made the change visible: this fixture
 * populated `lowestNeed` on a row nothing read, and the day the mapping started
 * reading it, the pinned `toEqual` went red and named the new field. That is
 * the fixture doing its job in the direction it was built for.
 *
 * The row is built as a `Record<string, unknown>` and cast, which is what lets
 * an override delete a key -- and it is also why a *new required field on
 * `PrisonerRosterRowViewModel`* does not fail the compiler here. It failed as a
 * runtime `undefined` in the assertion instead. Anything added to that
 * interface has to be added here by hand; the type will not ask.
 */
/**
 * An override set to `undefined` means **the key is absent**, not present and
 * holding `undefined`.
 *
 * `tsconfig` sets `exactOptionalPropertyTypes: true`, so
 * `PrisonerRosterRowViewModel`'s `name?`, `classificationGroupId?`, `riskTier?`
 * and `currentActionId?` each mean "a value, or no key at all" -- and
 * `{ name: undefined }` is a third thing the type deliberately forbids. A
 * spread cannot express removal, so the keys are deleted instead. That is not
 * a compile-time convenience: `'name' in row` is what the projection's readers
 * branch on, and a row carrying `name: undefined` would answer `true`.
 */
type RowOverrides = { readonly [K in keyof PrisonerRosterRowViewModel]?: PrisonerRosterRowViewModel[K] | undefined };

function projectedRow(overrides: RowOverrides = {}): PrisonerRosterRowViewModel {
  const row: Record<string, unknown> = {
    entityId: 7,
    name: { givenName: 'Ada', familyName: 'Cole' },
    intakeStage: 'completed',
    classified: true,
    classificationGroupId: 'general-population',
    riskTier: 1,
    tile: { x: 12, y: 9 },
    actionPhase: 'performing',
    currentActionId: 'action.shower',
    accommodation: { instanceId: 'room.cell:4:6', roomCatalogId: 'room.cell', roomNameKey: 'room.cell.name' },
    lowestNeed: { needId: 'safety', level: { permille: 120, filled: 2, segments: 10 }, unmetForStateIncome: true },
    ...overrides,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete row[key];
  }
  return row as unknown as PrisonerRosterRowViewModel;
}

/**
 * `everAdmitted` defaults to `true`: every case in this file below the first
 * describe block is about *what a row becomes*, not about the "nobody has
 * ever been admitted" state, and a roster fixture that carries rows is never
 * the state `everAdmitted: false` describes (`admittedCount` cannot be zero
 * once a row exists). The one place `false` matters --
 * `prisonerRosterFromProjection` passing the flag through unchanged, whatever
 * its value -- is exercised on its own below, with an empty roster on both
 * sides of it, which is the only shape that state can actually take.
 */
function page(
  rows: readonly PrisonerRosterRowViewModel[],
  total = rows.length,
  everAdmitted = true,
): PrisonerRosterPage {
  return { total, offset: 0, limit: PRISONER_ROSTER_ROW_LIMIT, rows, everAdmitted };
}

describe('the mapping turns ids into keys and drops what it cannot render', () => {
  it('carries a performing prisoner as their action, their tier and their group', () => {
    expect(prisonerRosterFromProjection(page([projectedRow()]))).toEqual({
      total: 1,
      everAdmitted: true,
      rows: [
        {
          entityId: 7,
          name: { givenName: 'Ada', familyName: 'Cole' },
          activityLabelKey: 'action.shower.name',
          travelling: false,
          standingLabelKey: 'risk-tier.1.name',
          classificationGroupId: 'general-population',
          riskTier: 1,
          lowestNeed: {
            needId: 'safety',
            labelKey: 'need.safety.name',
            permille: 120,
            unmetForStateIncome: true,
          },
        },
      ],
    });
  });

  it('says the phase when no action is selected, rather than leaving the cell blank', () => {
    const row = prisonerRosterFromProjection(page([projectedRow({ currentActionId: undefined, actionPhase: 'idle' })])).rows[0];
    expect(row?.activityLabelKey).toBe('action-phase.idle.name');
    expect(row?.travelling).toBe(false);
  });

  it('wraps a walk only when there is somewhere named to walk to', () => {
    const walking = prisonerRosterFromProjection(page([projectedRow({ actionPhase: 'travelling' })])).rows[0];
    expect(walking?.activityLabelKey).toBe('action.shower.name');
    expect(walking?.travelling).toBe(true);

    // The combination the simulation is not believed to produce, driven anyway:
    // a `travelling` phase with no action cannot name a destination, so it must
    // report the phase and not claim a walk.
    const nowhere = prisonerRosterFromProjection(
      page([projectedRow({ actionPhase: 'travelling', currentActionId: undefined })]),
    ).rows[0];
    expect(nowhere?.activityLabelKey).toBe('action-phase.travelling.name');
    expect(nowhere?.travelling).toBe(false);
  });

  it('badges an unclassified arrival with their intake stage, and carries no tier at all', () => {
    // The state `classified: false` exists for: `riskTier` is still the zero a
    // fresh record holds, which decodes as "Minimal" and would show a queued
    // arrival as an assessed low-risk prisoner.
    const row = prisonerRosterFromProjection(
      page([
        projectedRow({
          intakeStage: 'accommodation-assignment',
          classified: false,
          classificationGroupId: undefined,
          riskTier: undefined,
        }),
      ]),
    ).rows[0];
    expect(row?.standingLabelKey).toBe('intake-stage.accommodation-assignment.name');
    expect(row?.classificationGroupId).toBeUndefined();
    expect(row?.riskTier).toBeUndefined();
  });

  it('trusts the projection’s `classified` flag over the presence of a tier', () => {
    // A row that carried a tier while `classified` was false would be the
    // zero-initialised slot leaking, so the flag wins and the stage is shown.
    const row = prisonerRosterFromProjection(page([projectedRow({ classified: false, riskTier: 0 })])).rows[0];
    expect(row?.standingLabelKey).toBe('intake-stage.completed.name');
  });

  it('carries no name when the projection has none, rather than inventing a placeholder', () => {
    const row = prisonerRosterFromProjection(page([projectedRow({ name: undefined })])).rows[0];
    expect(row?.name).toBeUndefined();
    expect(Object.hasOwn(row!, 'name')).toBe(false);
  });

  it('reports the prison’s total and not the window’s length', () => {
    const model = prisonerRosterFromProjection(page([projectedRow(), projectedRow({ entityId: 8 })], 512));
    expect(model.total).toBe(512);
    expect(model.rows).toHaveLength(2);
  });

  it('carries `everAdmitted` through unchanged, in both directions (issue #506)', () => {
    // Nothing here is computed by this module -- it is not this translator's
    // fact to decide, only to forward. `projectPrisonerRoster` is what reads
    // `admittedCount`; see `tests/unit/hud-projections.test.ts` for that half.
    expect(prisonerRosterFromProjection(page([], 0, true)).everAdmitted).toBe(true);
    expect(prisonerRosterFromProjection(page([], 0, false)).everAdmitted).toBe(false);
  });
});

describe('every key the mapping can produce is real text in the bundled catalog', () => {
  it('resolves each of the nine actions, three phases, four tiers and six stages', () => {
    const keys = [
      ...['sleep', 'eat-meal', 'eat-in-cell', 'use-toilet', 'shower', 'yard-recreation', 'common-room-recreation', 'classroom-education', 'free-association'].map(
        (id) => `action.${id}.name`,
      ),
      ...['idle', 'travelling', 'performing'].map((id) => `action-phase.${id}.name`),
      ...[0, 1, 2, 3].map((tier) => `risk-tier.${String(tier)}.name`),
      ...['queued', 'reception', 'classification', 'accommodation-assignment', 'completed', 'failed'].map(
        (id) => `intake-stage.${id}.name`,
      ),
    ];
    for (const key of keys) {
      const text = t(key);
      expect(text, key).not.toBe(key);
      expect(text.trim().length, key).toBeGreaterThan(0);
    }
    // The vacuity guard: a typo in the list above would resolve to itself and
    // fail the loop, but a list that shrank silently would not.
    expect(keys).toHaveLength(22);
  });
});

describe('the badge says the tier in a word and the group in a colour', () => {
  it('is neutral for the two tiers below the warning, whatever else is on the row', () => {
    // **This loop ran over `[0, 1, 2]` until the owner's ruling of 2026-09-02
    // on #788**, when tier 2 stopped sharing `Minimal`'s colour. Narrowed
    // rather than deleted: tiers 0 and 1 are still one tone, and the reason --
    // that nothing has been observed about these prisoners -- is unchanged.
    for (const riskTier of [0, 1]) {
      const row = prisonerRosterFromProjection(page([projectedRow({ riskTier })])).rows[0]!;
      expect(describePrisonerRow(row), `tier ${String(riskTier)}`).toEqual({
        tone: 'neutral',
        badgeKey: `risk-tier.${String(riskTier)}.name`,
      });
    }
  });

  it('turns warning on the move that changes the prisoner’s day', () => {
    const before = prisonerRosterFromProjection(page([projectedRow({ riskTier: 2 })])).rows[0]!;
    const after = prisonerRosterFromProjection(
      page([projectedRow({ riskTier: 3, classificationGroupId: 'high-risk' })]),
    ).rows[0]!;

    // Both halves move, and they are two different fields: the word because the
    // tier moved, the colour because the group did.
    expect(describePrisonerRow(before)).toEqual({ tone: 'caution', badgeKey: 'risk-tier.2.name' });
    expect(describePrisonerRow(after)).toEqual({ tone: 'warning', badgeKey: 'risk-tier.3.name' });
    expect(t('risk-tier.2.name')).not.toBe(t('risk-tier.3.name'));
  });

  /**
   * **The owner's ruling of 2026-09-02 on issue #788, as one assertion.**
   *
   * `Medium` gets a tone of its own -- distinct from `Minimal`'s and from
   * `High`'s, bound to the *tier* rather than to the classification group --
   * and the second half of the pairing is what proves the first was built
   * without breaking ADR 0090's cap: the tier-2 row's `classificationGroupId`
   * is still `'general-population'`, so nothing here needs the early warning
   * to have moved a group, and `ClassificationEarlyWarningSystem` is still
   * free to never write `High`.
   *
   * All four tiers are driven rather than only tier 2, because the claim is
   * *distinctness* and a test that read one tone could not make it: a change
   * that toned tier 1 the same way would pass a tier-2-only assertion.
   */
  it('gives tier 2 a tone of its own, and leaves the tier-2 prisoner’s group alone (#788)', () => {
    const rows = [0, 1, 2, 3].map((riskTier) => {
      const groupId = riskTier >= 3 ? 'high-risk' : 'general-population';
      return prisonerRosterFromProjection(page([projectedRow({ riskTier, classificationGroupId: groupId })])).rows[0]!;
    });
    const tones = rows.map((row) => describePrisonerRow(row).tone);

    // The ruling, stated as the two inequalities it is: not `Minimal`'s, and
    // not `High`'s.
    expect(tones[2], 'tier 2 must not read as tier 1 does').not.toBe(tones[1]);
    expect(tones[2], 'tier 2 must not read as tier 3 does').not.toBe(tones[3]);
    // And the tones themselves, so a rename cannot satisfy the inequalities by
    // moving every tier at once.
    expect(tones).toEqual(['neutral', 'neutral', 'caution', 'warning']);
    // Every one of them is a tone the badge primitive and the token layer know
    // about -- `tests/unit/ui-design-tokens.test.ts` is what pairs each with a
    // background and a foreground.
    for (const tone of tones) expect(BADGE_TONES, tone).toContain(tone);

    // ADR 0090's cap, from this side of the worker boundary: the tier moved and
    // the group did not.
    expect(rows[2]?.riskTier).toBe(2);
    expect(rows[2]?.classificationGroupId).toBe('general-population');
    expect(rows[3]?.classificationGroupId).toBe('high-risk');
    // The word is still the tier's, unchanged by any of this.
    expect(rows.map((row) => row.standingLabelKey)).toEqual([
      'risk-tier.0.name',
      'risk-tier.1.name',
      'risk-tier.2.name',
      'risk-tier.3.name',
    ]);
  });

  it('reads the group rather than recomputing the simulation’s threshold', () => {
    // A row whose tier and group disagree cannot be produced by
    // `projectPrisonerRoster` -- `classificationGroupIdForTier` writes both --
    // and it is driven here to prove which field the tone is a function of. A
    // panel that inferred `tier >= 3` would answer differently on both rows.
    const highTierOrdinaryGroup = prisonerRosterFromProjection(page([projectedRow({ riskTier: 3 })])).rows[0]!;
    expect(describePrisonerRow(highTierOrdinaryGroup).tone).toBe('neutral');

    const lowTierRestrictedGroup = prisonerRosterFromProjection(
      page([projectedRow({ riskTier: 0, classificationGroupId: 'high-risk' })]),
    ).rows[0]!;
    expect(describePrisonerRow(lowTierRestrictedGroup).tone).toBe('warning');
  });

  it('is info while the prisoner is still in intake', () => {
    const row = prisonerRosterFromProjection(
      page([projectedRow({ classified: false, classificationGroupId: undefined, riskTier: undefined, intakeStage: 'queued' })]),
    ).rows[0]!;
    expect(describePrisonerRow(row)).toEqual({ tone: 'info', badgeKey: 'intake-stage.queued.name' });
  });
});

describe('the row renders as sentences rather than as keys', () => {
  it('puts the two halves of a name together in this locale’s order', () => {
    const row = prisonerRosterFromProjection(page([projectedRow()])).rows[0]!;
    expect(formatPrisonerName(t, row)).toBe('Ada Cole');
  });

  it('names an unnamed prisoner by their id instead of leaving the row blank', () => {
    const row = prisonerRosterFromProjection(page([projectedRow({ name: undefined })])).rows[0]!;
    const text = formatPrisonerName(t, row);
    expect(text).toContain('7');
    expect(text).not.toContain('{');
    expect(text).not.toBe(HUD_MESSAGE_KEY.regimeRosterUnnamed);
  });

  it('says the action alone while performing and wraps it while walking', () => {
    const performing = prisonerRosterFromProjection(page([projectedRow()])).rows[0]!;
    expect(formatPrisonerActivity(t, performing)).toBe('Showering');

    const travelling = prisonerRosterFromProjection(page([projectedRow({ actionPhase: 'travelling' })])).rows[0]!;
    const walking = formatPrisonerActivity(t, travelling);
    expect(walking).toContain('Showering');
    expect(walking).not.toBe('Showering');
    expect(walking).not.toContain('{');
  });

  it('says the phase, as a word, for a prisoner with nothing to do', () => {
    const row = prisonerRosterFromProjection(page([projectedRow({ currentActionId: undefined, actionPhase: 'idle' })])).rows[0]!;
    expect(formatPrisonerActivity(t, row)).toBe('Idle');
  });

  /**
   * **The errand reaches the roster, which is the only place in the shipped HUD
   * that names what a prisoner is doing.**
   *
   * `hud/prisoner-detail` has a projection route and no reader in `src/ui/`
   * (`tests/foundation/projection-reachability-contract.test.ts`), so this cell
   * is the whole of what a player is told about a carry. Watched happening on
   * 2026-09-03 -- `docs/research/2026-09-03-does-the-errand-walk.md` records
   * nine samples of one errand at 1x, four of them in the travelling form --
   * and nothing in CI held it: the case above exercises the same two branches
   * with `action.shower`, which targets a room-catalog id, and a carry is the
   * one entry of `DEFAULT_ACTIONS` whose target is not a place at all.
   *
   * **It deliberately does not pin the words.** `'Errand'` is marked in
   * `src/content/simulation-message-keys.ts` as a draft for the owner's review,
   * and the wrapper is `hud.regime.roster-heading`; both are the owner's under
   * `AGENTS.md`'s fourth exclusion, and a test pinning them would have to be
   * edited by the ruling that changes them. What is pinned is that the cell
   * resolves to a *sentence* rather than to a key or to a template with a hole
   * in it, and that the walking form is the wrapped one -- which is what fails
   * if the projection stops publishing `currentActionId` for a carry, if the
   * census loses the entry, or if the `travelling` flag stops reading the
   * phase. `tests/unit/simulation-message-keys.test.ts` already gates that an
   * entry *exists* for every `DEFAULT_ACTIONS` id; this gates that it arrives
   * here.
   */
  it('names a prisoner on an errand, performing and walking, without leaking a key or a placeholder', () => {
    const performing = prisonerRosterFromProjection(page([projectedRow({ currentActionId: 'action.carry' })])).rows[0]!;
    expect(performing.activityLabelKey).toBe('action.carry.name');
    const errand = formatPrisonerActivity(t, performing);
    expect(errand).not.toBe('action.carry.name');
    expect(errand).not.toContain('{');
    expect(errand.trim().length).toBeGreaterThan(0);

    const travelling = prisonerRosterFromProjection(
      page([projectedRow({ currentActionId: 'action.carry', actionPhase: 'travelling' })]),
    ).rows[0]!;
    expect(travelling.travelling).toBe(true);
    const heading = formatPrisonerActivity(t, travelling);
    expect(heading).toContain(errand);
    expect(heading).not.toBe(errand);
    expect(heading).not.toContain('{');
    expect(heading).not.toBe(HUD_MESSAGE_KEY.regimeRosterHeading);
  });
});

class FakeChannel implements ProjectionMessageChannel {
  public readonly sent: MainToWorkerMessage[] = [];
  private handler: ((message: WorkerToMainMessage) => void) | undefined;

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public reply(index: number, view: PrisonerRosterPage | undefined): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    const replyTo = (this.sent[index] as { messageId: string }).messageId;
    this.handler({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `reply-${replyTo}`,
      replyTo,
      kind: 'simulation/projection',
      payload: {
        projectionId: 'hud/prisoner-roster',
        tick: 1_100,
        page: { total: view?.total ?? 0, offset: 0, limit: PRISONER_ROSTER_ROW_LIMIT },
        ...(view === undefined
          ? {}
          : {
              view: {
                transport: 'structured-clone' as const,
                schemaId: 'lockstate.hud-view-model.prisoner-roster',
                schemaVersion: 1,
                data: view as never,
              },
            }),
      },
    } as WorkerToMainMessage);
  }
}

describe('the reader asks for the rows the panel can draw and no more', () => {
  it('names hud/prisoner-roster and the panel’s own row budget, with no offset', async () => {
    const channel = new FakeChannel();
    const reader = new PrisonerRosterReader(channel, { generateMessageId: () => 'req-1', replyTimeoutMs: 1_000 });
    // Caught rather than left floating: `dispose` rejects whatever is in flight.
    const pending = reader.read().catch(() => undefined);

    expect(channel.sent).toEqual([
      {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'req-1',
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/prisoner-roster', limit: 4 },
      },
    ]);
    // The window is the panel's constant, written out here as the literal the
    // payload above carries so that a change to one without the other fails.
    expect(PRISONER_ROSTER_ROW_LIMIT).toBe(4);
    reader.dispose();
    await pending;
  });

  it('answers with the rows a real reply carries', async () => {
    const channel = new FakeChannel();
    const reader = new PrisonerRosterReader(channel, { generateMessageId: () => 'req-1', replyTimeoutMs: 1_000 });
    const pending = reader.read();
    channel.reply(0, page([projectedRow()], 31));
    await expect(pending).resolves.toEqual({
      total: 31,
      everAdmitted: true,
      rows: [
        {
          entityId: 7,
          name: { givenName: 'Ada', familyName: 'Cole' },
          activityLabelKey: 'action.shower.name',
          travelling: false,
          standingLabelKey: 'risk-tier.1.name',
          classificationGroupId: 'general-population',
          riskTier: 1,
          lowestNeed: {
            needId: 'safety',
            labelKey: 'need.safety.name',
            permille: 120,
            unmetForStateIncome: true,
          },
        },
      ],
    });
    reader.dispose();
  });

  it('refuses to stack, so a cadence cannot queue a second question', async () => {
    const channel = new FakeChannel();
    let next = 0;
    const reader = new PrisonerRosterReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const first = reader.read();
    await expect(reader.read()).resolves.toBeUndefined();
    expect(channel.sent).toHaveLength(1);

    channel.reply(0, page([], 0));
    await expect(first).resolves.toEqual({ total: 0, everAdmitted: true, rows: [] });

    // And it is a latch rather than a one-shot: the next cadence asks again.
    const third = reader.read().catch(() => undefined);
    expect(channel.sent).toHaveLength(2);
    reader.dispose();
    await third;
  });

  it('answers undefined for a reply that carried no view, rather than an empty prison', async () => {
    // An empty model would draw the empty-roster sentence -- "No prisoners
    // yet. Build a cell -- big enough, walled all round, with a bed and a
    // toilet in it -- to take somebody in." since the owner's ruling of
    // 2026-09-03 as corrected in place on 2026-09-19 (#933), "Nobody has been
    // admitted yet" before either -- over a
    // prison nothing answered for, which is the one thing this readout must
    // not do. Either wording is a claim about a prison, and no claim may be
    // made on a session's behalf before it answers.
    const channel = new FakeChannel();
    const reader = new PrisonerRosterReader(channel, { generateMessageId: () => 'req-1', replyTimeoutMs: 1_000 });
    const pending = reader.read();
    channel.reply(0, undefined);
    await expect(pending).resolves.toBeUndefined();
    reader.dispose();
  });
});
