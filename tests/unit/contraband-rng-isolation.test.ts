import { describe, expect, it } from 'vitest';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { CONTRABAND_DETECTION_RNG_STREAM, CONTRABAND_INTELLIGENCE_RNG_STREAM, PRISONER_CLASSIFICATION_RNG_STREAM } from '../../src/simulation/runtime/new-session';

const MASTER_SEED = 1234;

function namedStreams(): NamedRngStreams {
  return new NamedRngStreams([
    { name: PRISONER_CLASSIFICATION_RNG_STREAM, state: deriveXoshiroState(MASTER_SEED, PRISONER_CLASSIFICATION_RNG_STREAM) },
    { name: CONTRABAND_DETECTION_RNG_STREAM, state: deriveXoshiroState(MASTER_SEED, CONTRABAND_DETECTION_RNG_STREAM) },
    { name: CONTRABAND_INTELLIGENCE_RNG_STREAM, state: deriveXoshiroState(MASTER_SEED, CONTRABAND_INTELLIGENCE_RNG_STREAM) },
  ]);
}

/**
 * Issue #27's "detection uses explicit factors and named RNG; one
 * subsystem's draws cannot perturb another." Each named stream is its own
 * independent generator instance (`NamedRngStreams.get` never shares
 * state across names), so interleaving draws from unrelated streams can
 * never change a stream's own output sequence.
 */
describe('named RNG stream isolation between contraband subsystems', () => {
  it('draws from the detection stream are unaffected by any number of interleaved intelligence-stream draws', () => {
    const undisturbed = namedStreams();
    const baseline = [undisturbed.get(CONTRABAND_DETECTION_RNG_STREAM).nextFloat(), undisturbed.get(CONTRABAND_DETECTION_RNG_STREAM).nextFloat(), undisturbed.get(CONTRABAND_DETECTION_RNG_STREAM).nextFloat()];

    const interleaved = namedStreams();
    const detection = interleaved.get(CONTRABAND_DETECTION_RNG_STREAM);
    const intelligence = interleaved.get(CONTRABAND_INTELLIGENCE_RNG_STREAM);
    const classification = interleaved.get(PRISONER_CLASSIFICATION_RNG_STREAM);

    const observed: number[] = [];
    observed.push(detection.nextFloat());
    intelligence.nextFloat();
    intelligence.nextFloat();
    classification.nextInt(3);
    observed.push(detection.nextFloat());
    classification.nextInt(3);
    intelligence.nextFloat();
    observed.push(detection.nextFloat());

    expect(observed).toEqual(baseline);
  });

  it('the detection and intelligence streams never produce the same sequence from the same master seed', () => {
    const streams = namedStreams();
    const detectionDraws = [streams.get(CONTRABAND_DETECTION_RNG_STREAM).nextFloat(), streams.get(CONTRABAND_DETECTION_RNG_STREAM).nextFloat()];
    const intelligenceDraws = [streams.get(CONTRABAND_INTELLIGENCE_RNG_STREAM).nextFloat(), streams.get(CONTRABAND_INTELLIGENCE_RNG_STREAM).nextFloat()];
    expect(detectionDraws).not.toEqual(intelligenceDraws);
  });

  it('the same master seed reproduces an identical draw sequence -- deterministic replay', () => {
    const first = namedStreams().get(CONTRABAND_DETECTION_RNG_STREAM);
    const second = namedStreams().get(CONTRABAND_DETECTION_RNG_STREAM);
    const firstDraws = Array.from({ length: 5 }, () => first.nextFloat());
    const secondDraws = Array.from({ length: 5 }, () => second.nextFloat());
    expect(secondDraws).toEqual(firstDraws);
  });
});
