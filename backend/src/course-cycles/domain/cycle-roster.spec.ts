import { CycleRoster, RosterCandidate } from "./cycle-roster";

const person = (overrides: Partial<RosterCandidate> = {}): RosterCandidate => ({
  role: "STUDENT",
  status: "ACTIVE",
  batchYear: 2026,
  email: "neha.t26csai@nst.rishihood.edu.in",
  ...overrides,
});

describe("CycleRoster", () => {
  describe("a core course: the whole batch", () => {
    const roster = CycleRoster.wholeBatch(2026);

    it("includes active students of the batch", () => {
      expect(roster.includes(person())).toBe(true);
    });

    it.each([
      ["another batch", { batchYear: 2025 }],
      ["no batch", { batchYear: null }],
      ["a deactivated student", { status: "DEACTIVATED" as const }],
      ["faculty", { role: "FACULTY" as const, batchYear: null }],
      ["an admin", { role: "ADMIN" as const, batchYear: null }],
    ])("excludes %s", (_label, overrides) => {
      expect(roster.includes(person(overrides))).toBe(false);
    });
  });

  describe("an elective: the enrolled emails", () => {
    const roster = CycleRoster.enrolled(["neha.t26csai@nst.rishihood.edu.in"]);

    it("includes an enrolled student whatever their batch", () => {
      expect(roster.includes(person({ batchYear: 2025 }))).toBe(true);
    });

    it("excludes a batch-mate who is not enrolled", () => {
      expect(
        roster.includes(person({ email: "ravi.b26csai@nst.rishihood.edu.in" })),
      ).toBe(false);
    });

    it("still excludes deactivated or non-student accounts on the list", () => {
      expect(roster.includes(person({ status: "DEACTIVATED" }))).toBe(false);
      expect(roster.includes(person({ role: "FACULTY" }))).toBe(false);
    });
  });

  it("describes itself for error messages", () => {
    expect(CycleRoster.wholeBatch(2026).describe()).toBe(
      "an active student of batch 2026",
    );
    expect(CycleRoster.enrolled([]).describe()).toBe(
      "an active student enrolled in this elective",
    );
  });
});
