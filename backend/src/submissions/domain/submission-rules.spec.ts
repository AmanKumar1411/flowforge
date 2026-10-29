import { LinkRequirement } from "../../common/links/link-requirement";
import { LinkDomainError } from "../../common/links/link.errors";
import { Milestone } from "../../course-cycles/domain/milestone";
import { SubmissionCycle, SubmissionTeam } from "./submission";
import { SubmissionDomainError } from "./submission.errors";
import { SubmissionRules } from "./submission-rules";

const rules = new SubmissionRules();
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 9));

const milestone = (
  position: number,
  opens: number,
  due: number,
  linkRequirement = LinkRequirement.MILESTONE_DEFAULT,
): Milestone => ({
  id: `m${position}`,
  cycleId: "cycle",
  position,
  name: `M${position}`,
  description: null,
  submissionOpensAt: at(opens),
  submissionDueAt: at(due),
  evaluationAt: at(due),
  linkRequirement,
  createdAt: at(1),
  updatedAt: at(1),
});

// Phase 8: one window per milestone (was one per cycle). M1 the 10th–15th, M2 the 15th–20th (Drive only).
const cycle: SubmissionCycle = {
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "faculty",
  milestones: [
    milestone(1, 10, 15),
    milestone(
      2,
      15,
      20,
      LinkRequirement.from({ required: ["DRIVE"], optional: [] }),
    ),
  ],
};
const [m1, m2] = cycle.milestones;

const team: SubmissionTeam = {
  id: "team",
  cycleId: "cycle",
  name: "Falcon",
  leaderId: "leader",
  members: [
    { userId: "leader", name: "Leader" },
    { userId: "member", name: "Member" },
  ],
};
const approved = {
  title: "Idea",
  status: "APPROVED",
  source: "PROPOSAL",
} as const;
const student = (id: string) => ({ id, role: "STUDENT" as const });

const codeOf = (work: () => unknown): string | undefined => {
  try {
    work();
  } catch (error) {
    if (
      error instanceof SubmissionDomainError ||
      error instanceof LinkDomainError
    ) {
      return error.code;
    }
    throw error;
  }
  return undefined;
};

describe("SubmissionRules", () => {
  it("finds the cycle's milestone, and nothing else", () => {
    expect(rules.milestoneOf(cycle, "m2")).toBe(m2);
    expect(codeOf(() => rules.milestoneOf(cycle, "other"))).toBe(
      "MILESTONE_NOT_FOUND",
    );
  });

  it.each([
    [at(9), "NOT_OPEN", "NOT_OPEN"],
    [at(10), "OPEN", "NOT_OPEN"],
    [new Date(at(15).getTime() - 1), "OPEN", "NOT_OPEN"],
    [at(15), "CLOSED", "OPEN"],
    [at(20), "CLOSED", "CLOSED"],
  ])("at %s: M1 %s, M2 %s", (now, first, second) => {
    expect(rules.window(cycle, m1, now)).toBe(first);
    expect(rules.window(cycle, m2, now)).toBe(second);
  });

  it("closes the window of a closed or draft cycle", () => {
    expect(rules.window({ ...cycle, status: "CLOSED" }, m1, at(12))).toBe(
      "CLOSED",
    );
    expect(rules.window({ ...cycle, status: "DRAFT" }, m1, at(12))).toBe(
      "CLOSED",
    );
  });

  it("lets any member submit while the milestone is open, with an approved or picked idea", () => {
    for (const id of ["leader", "member"]) {
      expect(
        codeOf(() =>
          rules.assertCanSubmit(student(id), team, cycle, m1, approved, at(12)),
        ),
      ).toBeUndefined();
    }
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          student("leader"),
          team,
          cycle,
          m1,
          { ...approved, source: "CATALOG" },
          at(12),
        ),
      ),
    ).toBeUndefined();
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          student("leader"),
          team,
          cycle,
          m1,
          { ...approved, status: "SUBMITTED" },
          at(12),
        ),
      ),
    ).toBe("IDEA_NOT_APPROVED");
    expect(
      codeOf(() =>
        rules.assertCanSubmit(student("leader"), team, cycle, m1, null, at(12)),
      ),
    ).toBe("IDEA_NOT_APPROVED");
  });

  it("refuses outside the milestone's window, and anyone outside the team", () => {
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          student("leader"),
          team,
          cycle,
          m1,
          approved,
          at(9),
        ),
      ),
    ).toBe("SUBMISSION_NOT_OPEN");
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          student("leader"),
          team,
          cycle,
          m1,
          approved,
          at(15),
        ),
      ),
    ).toBe("SUBMISSION_CLOSED");
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          student("leader"),
          team,
          cycle,
          m2,
          approved,
          at(15),
        ),
      ),
    ).toBeUndefined();
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          student("outsider"),
          team,
          cycle,
          m1,
          approved,
          at(12),
        ),
      ),
    ).toBe("TEAM_NOT_FOUND");
  });

  it("checks the links against the milestone's requirement and trims the notes", () => {
    expect(
      rules.clean(
        {
          links: [
            { type: "GITHUB", url: " https://github.com/falcon/app " },
            { type: "DEMO", url: "" },
          ],
          notes: "  ",
        },
        m1,
      ),
    ).toEqual({
      links: [{ type: "GITHUB", url: "https://github.com/falcon/app" }],
      notes: null,
    });
    expect(codeOf(() => rules.clean({ links: [], notes: null }, m1))).toBe(
      "MISSING_REQUIRED_LINK",
    );
    expect(
      codeOf(() =>
        rules.clean(
          {
            links: [{ type: "GITHUB", url: "https://github.com/falcon/app" }],
            notes: null,
          },
          m2,
        ),
      ),
    ).toBe("LINK_NOT_ALLOWED");
    expect(
      rules.clean(
        {
          links: [{ type: "DRIVE", url: "https://drive.google.com/file/d/x" }],
          notes: " Final deck ",
        },
        m2,
      ),
    ).toEqual({
      links: [{ type: "DRIVE", url: "https://drive.google.com/file/d/x" }],
      notes: "Final deck",
    });
  });
});
