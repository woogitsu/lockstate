import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';
import {
  contrabandIntroductionProbability,
  eligibleContrabandCategories,
  type ContrabandCategoryView,
} from '../contraband/introduction';
import { classifyPrisoner, type RiskTier } from './classification';
import { DAY_LENGTH_TICKS } from './regime';
import { drawSentenceLengthTicks } from './sentence';

export const INTAKE_CANDIDATE_RNG_STREAM = 'prisoners.candidates';

/** One-off payment, in the same minor units as the treasury's grants. */
export function candidateBountyMinorUnits(tier: number): number {
  return [0, 150, 350, 750][tier] ?? 0;
}

export interface IntakeCandidate {
  readonly id: string;
  readonly offeredAtTick: number;
  readonly expiresAtTick: number;
  readonly status: 'new' | 'delayed';
  readonly sentenceLengthTicks: number;
  readonly priorIncidents: number;
  readonly riskTier: RiskTier;
  readonly contrabandCategoryId?: string;
  readonly bountyMinorUnits: number;
}

export interface IntakeCandidateBoardSnapshot {
  readonly lastOfferDay: number;
  readonly nextId: number;
  readonly candidates: readonly IntakeCandidate[];
}

/** The pending offer is separate from the physical overflow queue (#590). */
export class IntakeCandidateBoard {
  private candidates: IntakeCandidate[] = [];
  private lastOfferDay = -1;
  private nextId = 1;

  public constructor(private readonly categories: readonly ContrabandCategoryView[]) {}

  public advanceToTick(tick: number, rng: Xoshiro128StarStar): void {
    const day = Math.floor(tick / DAY_LENGTH_TICKS);
    this.candidates = this.candidates.filter((candidate) => candidate.expiresAtTick > tick);
    if (day <= this.lastOfferDay) return;
    this.lastOfferDay = day;
    const count = 1 + rng.nextInt(3);
    for (let i = 0; i < count; i += 1) {
      const sentenceLengthTicks = drawSentenceLengthTicks(rng);
      const priorIncidents = rng.nextInt(4);
      const riskTier = classifyPrisoner({ sentenceLengthTicks, priorIncidents }, rng).riskTier;
      let contrabandCategoryId: string | undefined;
      if (rng.nextFloat() < contrabandIntroductionProbability(riskTier)) {
        const eligible = eligibleContrabandCategories(this.categories, riskTier);
        if (eligible.length > 0) contrabandCategoryId = eligible[rng.nextInt(eligible.length)]!.id;
      }
      this.candidates.push({
        id: String(this.nextId++),
        offeredAtTick: day * DAY_LENGTH_TICKS,
        expiresAtTick: (day + 2) * DAY_LENGTH_TICKS,
        status: 'new',
        sentenceLengthTicks,
        priorIncidents,
        riskTier,
        ...(contrabandCategoryId === undefined ? {} : { contrabandCategoryId }),
        bountyMinorUnits: candidateBountyMinorUnits(riskTier),
      });
    }
  }

  public delay(id: string, tick: number): boolean {
    const index = this.candidates.findIndex((candidate) => candidate.id === id && candidate.expiresAtTick > tick);
    if (index < 0) return false;
    this.candidates[index] = { ...this.candidates[index]!, status: 'delayed' };
    return true;
  }

  public accept(id: string, tick: number): IntakeCandidate | undefined {
    const index = this.candidates.findIndex((candidate) => candidate.id === id && candidate.expiresAtTick > tick);
    if (index < 0) return undefined;
    return this.candidates.splice(index, 1)[0];
  }

  public snapshot(): IntakeCandidateBoardSnapshot {
    return { lastOfferDay: this.lastOfferDay, nextId: this.nextId, candidates: this.candidates.map((candidate) => ({ ...candidate })) };
  }

  public loadSnapshot(snapshot: IntakeCandidateBoardSnapshot): void {
    this.lastOfferDay = snapshot.lastOfferDay;
    this.nextId = snapshot.nextId;
    this.candidates = snapshot.candidates.map((candidate) => ({ ...candidate }));
  }
}
