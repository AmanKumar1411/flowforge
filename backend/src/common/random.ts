import { randomInt } from "node:crypto";

/** Randomness as a port, so code that shuffles can be tested deterministically. */
export abstract class RandomSource {
  /** A uniformly random integer in [0, maxExclusive). */
  abstract int(maxExclusive: number): number;
}

export class CryptoRandomSource extends RandomSource {
  int(maxExclusive: number): number {
    return randomInt(maxExclusive);
  }
}
