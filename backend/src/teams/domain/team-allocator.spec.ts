import { SeededRandom } from "../../common/testing/seeded-random";
import { TeamAllocator } from "./team-allocator";

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `s${index + 1}`);

describe("TeamAllocator", () => {
  describe("sizes", () => {
    it.each([
      [7, 2, 3, [3, 2, 2]],
      [6, 2, 3, [3, 3]],
      [8, 2, 4, [4, 4]],
      [9, 2, 4, [3, 3, 3]],
      [10, 3, 3, [3, 3, 3]],
      [5, 1, 1, [1, 1, 1, 1, 1]],
      [4, 4, 4, [4]],
      [0, 2, 3, []],
    ])(
      "splits %i students with sizes %i to %i into %j",
      (count, min, max, expected) => {
        expect(TeamAllocator.sizes(count, min, max)).toEqual(expected);
      },
    );

    it.each([
      [1, 2, 4, []],
      [5, 3, 3, [3]],
      [11, 4, 5, [5, 5]],
    ])(
      "places as many as it can: %i students with sizes %i to %i give %j",
      (count, min, max, expected) => {
        expect(TeamAllocator.sizes(count, min, max)).toEqual(expected);
      },
    );

    it("is always valid, as even as possible and maximal, for every size range up to 10", () => {
      for (let min = 1; min <= 10; min += 1) {
        for (let max = min; max <= 10; max += 1) {
          for (let count = 0; count <= 60; count += 1) {
            const sizes = TeamAllocator.sizes(count, min, max);
            const placed = sizes.reduce((sum, size) => sum + size, 0);
            expect(sizes.every((size) => size >= min && size <= max)).toBe(
              true,
            );
            if (sizes.length > 0) {
              expect(
                Math.max(...sizes) - Math.min(...sizes),
              ).toBeLessThanOrEqual(1);
            }
            // No split of more students exists: for any n with placed < n <= count, ceil(n / max) * min > n.
            for (let more = placed + 1; more <= count; more += 1) {
              expect(Math.ceil(more / max) * min).toBeGreaterThan(more);
            }
          }
        }
      }
    });
  });

  describe("allocate", () => {
    it("places every student exactly once", () => {
      const allocation = new TeamAllocator(new SeededRandom(7)).allocate(
        ids(7),
        2,
        3,
      );
      expect(allocation.groups.map((group) => group.length)).toEqual([3, 2, 2]);
      expect(
        [...allocation.groups.flat(), ...allocation.unplaced].sort(),
      ).toEqual(ids(7).sort());
      expect(allocation.unplaced).toEqual([]);
    });

    it("leaves over the students no valid split can place", () => {
      const allocation = new TeamAllocator(new SeededRandom(7)).allocate(
        ids(5),
        3,
        3,
      );
      expect(allocation.groups).toHaveLength(1);
      expect(allocation.unplaced).toHaveLength(2);
    });

    it("is reproducible with the same randomness and differs with other randomness", () => {
      const run = (seed: number) =>
        new TeamAllocator(new SeededRandom(seed)).allocate(ids(12), 3, 4);
      expect(run(1)).toEqual(run(1));
      expect(run(1)).not.toEqual(run(2));
    });

    it("shuffles fairly: every student leads a team about equally often", () => {
      const random = new SeededRandom(42);
      const allocator = new TeamAllocator(random);
      const leads = new Map<string, number>();
      const rounds = 3000;
      for (let round = 0; round < rounds; round += 1) {
        for (const [leader] of allocator.allocate(ids(6), 3, 3).groups) {
          leads.set(leader, (leads.get(leader) ?? 0) + 1);
        }
      }
      // 2 leaders out of 6 per round: expected rounds / 3 each.
      for (const count of leads.values()) {
        expect(Math.abs(count - rounds / 3)).toBeLessThan(rounds * 0.05);
      }
    });
  });
});
