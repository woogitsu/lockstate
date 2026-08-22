export interface Xoshiro128StarStarState {
  readonly algorithm: 'xoshiro128**';
  readonly version: 1;
  readonly words: readonly [number, number, number, number];
}

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function assertWord(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError('RNG state words must be uint32 values.');
}

export class Xoshiro128StarStar {
  private state: [number, number, number, number];

  public constructor(words: readonly [number, number, number, number]) {
    words.forEach(assertWord);
    if (words.every((word) => word === 0)) throw new RangeError('xoshiro128** state cannot be all zero.');
    this.state = [words[0], words[1], words[2], words[3]];
  }

  public nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.state[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (this.state[1] << 9) >>> 0;
    this.state[2] ^= this.state[0];
    this.state[3] ^= this.state[1];
    this.state[1] ^= this.state[2];
    this.state[0] ^= this.state[3];
    this.state[2] ^= t;
    this.state[3] = rotl(this.state[3], 11);
    this.state = this.state.map((word) => word >>> 0) as [number, number, number, number];
    return result;
  }

  public snapshot(): Xoshiro128StarStarState {
    return { algorithm: 'xoshiro128**', version: 1, words: [this.state[0], this.state[1], this.state[2], this.state[3]] };
  }
}
