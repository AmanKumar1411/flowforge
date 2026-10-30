import { EvaluationDomainError } from "./evaluation.errors";
import { EvaluationActor, GradingCycle, GradingTeam } from "./evaluation";
import { EvaluationPolicy } from "./evaluation-policy";

const policy = new EvaluationPolicy();
const cycle = {
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "owner",
  milestones: [],
} as unknown as GradingCycle;
const team: GradingTeam = {
  id: "t1",
  cycleId: "cycle",
  name: "Falcon",
  memberIds: ["aman", "neha"],
};
const actor = (id: string, role: EvaluationActor["role"]): EvaluationActor => ({
  id,
  role,
});
const allowed = (work: () => void) => {
  try {
    work();
    return true;
  } catch (error) {
    if (error instanceof EvaluationDomainError) {
      // Hidden, never forbidden: a guessed id reveals nothing.
      expect(error.code).toBe("TEAM_NOT_FOUND");
      return false;
    }
    throw error;
  }
};

describe("EvaluationPolicy", () => {
  it.each([
    ["the owner", actor("owner", "FACULTY"), true, true, true],
    ["another faculty member", actor("other", "FACULTY"), false, false, false],
    ["an admin", actor("admin", "ADMIN"), true, false, true],
    ["a member of the team", actor("aman", "STUDENT"), false, false, true],
    [
      "a student of another team",
      actor("ravi", "STUDENT"),
      false,
      false,
      false,
    ],
    ["pending staff", actor("sahil", "PENDING_STAFF"), false, false, false],
  ])(
    "%s: read grading %s, grade %s, read the team %s",
    (_, who, readGrading, grade, readTeam) => {
      expect(allowed(() => policy.assertCanReadGrading(who, cycle))).toBe(
        readGrading,
      );
      expect(allowed(() => policy.assertCanGrade(who, cycle))).toBe(grade);
      expect(allowed(() => policy.assertCanReadTeam(who, cycle, team))).toBe(
        readTeam,
      );
    },
  );

  it("shows students released results only, and never a team of another cycle", () => {
    expect(policy.releasedOnly(actor("aman", "STUDENT"))).toBe(true);
    expect(policy.releasedOnly(actor("owner", "FACULTY"))).toBe(false);
    expect(
      allowed(() =>
        policy.assertCanReadTeam(actor("owner", "FACULTY"), cycle, {
          ...team,
          cycleId: "elsewhere",
        }),
      ),
    ).toBe(false);
  });
});
