import type { JsonValue } from '../../shared/json';
import { canonicalJson } from '../determinism/canonical';
import type { SimulationEvent } from './types';

/**
 * What makes two events on the channel **the same statement**
 * ([ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md),
 * the owner's decisions 1 and 2 of 2026-09-01).
 *
 * The envelope is dropped and everything else is kept: `sequence` is which
 * arrival this is and `tick` is when it arrived, and neither is part of *what
 * was said*. Two events with the same identity are byte-identical on the wire
 * apart from those two fields, which is exactly the property ADR 0084's
 * Finding 1 measured for the four incident-opening types -- *"there is no
 * field this layer is declining to show; there is no field to show"*.
 *
 * ## Why this is one rule over the whole union rather than a rule per family
 *
 * ADR 0084 warned that the four zero-payload types are the only ones that
 * *can* repeat verbatim, and rejected a collapse that would therefore have
 * *"[treated] one class of event specially with no signal as to why"*. This
 * rule treats none of them specially: it asks the same question of every
 * member, and the answer differs only because the data differs. A second
 * `incidents.assault-opened` matches its predecessor because an assault
 * carries nothing to differ in; a second `prisoners.discharged` matches only
 * another discharge of the same `count`; a second
 * `incidents.escape-succeeded` never matches, because a different prisoner is
 * a different `entityId`. Nothing here enumerates which of those it is, so
 * nothing here can fall out of step with the union.
 *
 * ## Why the payload rather than the rendered sentence
 *
 * The sentence a player reads is a function of the type and the non-envelope
 * fields and of nothing else -- `eventParameters` and
 * `eventParameterMessages` in `src/ui/simulation-events.ts` read exactly those
 * -- so identity over the payload is **at least as strict** as identity over
 * the sentence, and never collapses two rows that would read differently. It
 * is occasionally stricter, which is the safe direction: an escape by an
 * unnamed prisoner renders through `hud.regime.roster-unnamed` and two of
 * those differ in `entityId`, so they stay two rows rather than becoming one
 * that claims the same person got out twice.
 *
 * Canonical rather than `JSON.stringify`: the same event reaches this function
 * as an object the log built and as one `simulationEventSchema` parsed off a
 * message, and key order is not a promise either side makes. `canonicalJson`
 * sorts, so the two agree -- which they must, because the worker resolves a
 * dismissal by this identity and the main thread groups rows by it.
 */
export function simulationEventIdentity(event: SimulationEvent): string {
  const { sequence, tick, ...statement } = event;
  return canonicalJson(statement as unknown as JsonValue);
}
