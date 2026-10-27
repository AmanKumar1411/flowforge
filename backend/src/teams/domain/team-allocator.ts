import { RandomSource } from "../../common/random";

export interface Allocation {
  /** Each group's first member becomes its leader: random, because the list was shuffled. */
  groups: string[][];
  /** Students no valid split could place; the faculty add them to a team by hand. */
  unplaced: string[];
}

/** Splits students without a team into random teams within the cycle's size range. */
export class TeamAllocator {
  constructor(private readonly random: RandomSource) {}

  /**
   * Team sizes for `count` students within [min, max]: as few teams as possible,
   * sizes differing by at most one. With k = ceil(n / max) teams every size is
   * at most max, and the split is valid exactly when k * min <= n. When no split
   * of all n students fits, it places as many as can be placed.
   */
  static sizes(count: number, min: number, max: number): number[] {
    for (let placed = count; placed > 0; placed -= 1) {
      const teams = Math.ceil(placed / max);
      if (teams * min <= placed) {
        const base = Math.floor(placed / teams);
        const larger = placed % teams;
        return Array.from({ length: teams }, (_, index) =>
          index < larger ? base + 1 : base,
        );
      }
    }
    return [];
  }

  allocate(
    studentIds: readonly string[],
    min: number,
    max: number,
  ): Allocation {
    const shuffled = this.shuffle(studentIds);
    const groups: string[][] = [];
    let offset = 0;
    for (const size of TeamAllocator.sizes(shuffled.length, min, max)) {
      groups.push(shuffled.slice(offset, offset + size));
      offset += size;
    }
    return { groups, unplaced: shuffled.slice(offset) };
  }

  /** Fisher-Yates: every order is equally likely. */
  private shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.random.int(index + 1);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
}
