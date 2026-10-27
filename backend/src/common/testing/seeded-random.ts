import { RandomSource } from "../random";

/** Deterministic randomness for tests (mulberry32). */
export class SeededRandom extends RandomSource {
  constructor(private state: number) {
    super();
  }

  int(maxExclusive: number): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * maxExclusive);
  }
}
