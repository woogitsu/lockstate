import type { Xoshiro128StarStarState } from './xoshiro128starstar';

const MASK_64 = (1n << 64n) - 1n;

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (const codeUnit of value) {
    hash ^= BigInt(codeUnit.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & MASK_64;
  }
  return hash;
}

function splitMix64(seed: bigint): bigint {
  let value = (seed + 0x9e3779b97f4a7c15n) & MASK_64;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
  return value ^ (value >> 31n);
}

export function deriveXoshiroState(masterSeed: number, streamName: string): Xoshiro128StarStarState {
  if (!Number.isInteger(masterSeed) || masterSeed < 0 || masterSeed > 0xffff_ffff) throw new RangeError('Master seed must be uint32.');
  if (!/^[a-z][a-z0-9.:-]*$/.test(streamName)) throw new RangeError('Stream name must be a stable identifier.');
  let state = (BigInt(masterSeed) << 32n) ^ fnv1a64(streamName);
  const words = [0, 0, 0, 0] as [number, number, number, number];
  for (let index = 0; index < words.length; index += 1) {
    state = splitMix64(state);
    words[index] = Number(state & 0xffff_ffffn);
  }
  if (words.every((word) => word === 0)) words[0] = 1;
  return { algorithm: 'xoshiro128**', version: 1, words };
}
