/**
 * A sentence readout uses the tick attached to its detail projection, never
 * wall time (#958). A wrapped Uint32 end precedes its length and is not a
 * readable release deadline (DischargeSystem.isSentenceComplete).
 */
export function remainingSentenceTicks(
  record: { readonly classified: boolean; readonly sentence: { readonly endTick: number; readonly lengthTicks: number } },
  observedTick: number | undefined,
): number | undefined {
  if (!record.classified || observedTick === undefined || !Number.isSafeInteger(observedTick) || observedTick < 0) return undefined;
  const { endTick, lengthTicks } = record.sentence;
  if (!Number.isSafeInteger(endTick) || !Number.isSafeInteger(lengthTicks) || lengthTicks <= 0 || endTick < lengthTicks) return undefined;
  return Math.max(0, endTick - observedTick);
}

/** The day length is the existing clock projection's, not a UI constant. */
export function remainingSentenceDays(remainingTicks: number | undefined, dayLengthTicks: number): number | undefined {
  if (remainingTicks === undefined || !Number.isFinite(remainingTicks) || remainingTicks < 0 ||
      !Number.isSafeInteger(dayLengthTicks) || dayLengthTicks <= 0) return undefined;
  return remainingTicks / dayLengthTicks;
}
