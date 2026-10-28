import { IdeaCycle, IdeaTeam } from "./idea";
import { IdeaDomainError } from "./idea.errors";
import { IdeaRules } from "./idea-rules";

const rules = new IdeaRules();
const IDEA_DEADLINE = new Date("2026-11-09T09:00:00.000Z");
const SUBMISSIONS_OPEN = new Date("2026-11-10T09:00:00.000Z");
const before = new Date("2026-11-05T09:00:00.000Z");
const betweenDeadlines = new Date("2026-11-09T18:00:00.000Z");

const cycle = (overrides: Partial<IdeaCycle> = {}): IdeaCycle => ({
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "faculty",
  ideaDeadline: IDEA_DEADLINE,
  submissionStartAt: SUBMISSIONS_OPEN,
  ...overrides,
});

const team: IdeaTeam = {
  id: "team",
  cycleId: "cycle",
  name: "Falcon",
  leaderId: "leader",
  members: [
    { userId: "leader", name: "Leader" },
    { userId: "member", name: "Member" },
  ],
};

const codeOf = (work: () => unknown): string | undefined => {
  try {
    work();
    return undefined;
  } catch (error) {
    return (error as IdeaDomainError).code;
  }
};

describe("IdeaRules", () => {
  describe("what saving the leader's idea does", () => {
    it.each([
      ["no idea, before the idea deadline", null, before, "CREATE"],
      ["a waiting idea, before the idea deadline", "SUBMITTED", before, "EDIT"],
      [
        "a rejected idea, before the idea deadline",
        "REJECTED",
        before,
        "RESUBMIT",
      ],
      [
        "a rejected idea, after the idea deadline but before submissions open",
        "REJECTED",
        betweenDeadlines,
        "RESUBMIT",
      ],
    ] as const)("%s: %s", (_label, status, now, expected) => {
      expect(
        rules.submissionAction(status ? { status } : null, cycle(), now),
      ).toBe(expected);
    });

    it.each([
      [
        "no idea once the idea deadline has passed",
        null,
        betweenDeadlines,
        "IDEA_SUBMISSION_CLOSED",
      ],
      [
        "no idea exactly at the idea deadline",
        null,
        IDEA_DEADLINE,
        "IDEA_SUBMISSION_CLOSED",
      ],
      [
        "a waiting idea after the idea deadline",
        "SUBMITTED",
        betweenDeadlines,
        "IDEA_SUBMISSION_CLOSED",
      ],
      [
        "a rejected idea once submissions are open",
        "REJECTED",
        SUBMISSIONS_OPEN,
        "IDEA_RESUBMISSION_CLOSED",
      ],
      ["an approved idea", "APPROVED", before, "IDEA_ALREADY_APPROVED"],
    ] as const)("refuses %s", (_label, status, now, code) => {
      expect(
        codeOf(() =>
          rules.submissionAction(status ? { status } : null, cycle(), now),
        ),
      ).toBe(code);
    });

    it("refuses anything in a draft or closed cycle", () => {
      for (const status of ["DRAFT", "CLOSED"] as const) {
        expect(
          codeOf(() => rules.submissionAction(null, cycle({ status }), before)),
        ).toBe("IDEA_SUBMISSION_CLOSED");
        expect(
          codeOf(() =>
            rules.submissionAction(
              { status: "REJECTED" },
              cycle({ status }),
              before,
            ),
          ),
        ).toBe("IDEA_RESUBMISSION_CLOSED");
      }
    });
  });

  it("lets only the leader submit", () => {
    expect(() =>
      rules.assertLeader({ id: "leader", role: "STUDENT" }, team),
    ).not.toThrow();
    expect(
      codeOf(() => rules.assertLeader({ id: "member", role: "STUDENT" }, team)),
    ).toBe("NOT_TEAM_LEADER");
  });

  it("lets only the owning faculty review; anyone else is told the team does not exist", () => {
    expect(() =>
      rules.assertReviewer({ id: "faculty", role: "FACULTY" }, cycle()),
    ).not.toThrow();
    expect(
      codeOf(() =>
        rules.assertReviewer({ id: "other", role: "FACULTY" }, cycle()),
      ),
    ).toBe("TEAM_NOT_FOUND");
    expect(
      codeOf(() =>
        rules.assertReviewer({ id: "faculty", role: "ADMIN" }, cycle()),
      ),
    ).toBe("TEAM_NOT_FOUND");
  });

  describe("reviewing", () => {
    const idea = (status: "SUBMITTED" | "APPROVED" | "REJECTED", version = 2) =>
      ({ status, version }) as Parameters<IdeaRules["assertCanReview"]>[0];

    it("accepts the waiting version the faculty read", () => {
      expect(() =>
        rules.assertCanReview(idea("SUBMITTED"), cycle(), 2),
      ).not.toThrow();
    });

    it.each([
      [
        "a newer version than the one read",
        idea("SUBMITTED", 3),
        cycle(),
        "IDEA_CHANGED",
      ],
      [
        "an approved idea",
        idea("APPROVED"),
        cycle(),
        "IDEA_NOT_AWAITING_REVIEW",
      ],
      [
        "a rejected idea waiting for the team",
        idea("REJECTED"),
        cycle(),
        "IDEA_NOT_AWAITING_REVIEW",
      ],
      [
        "anything in a closed cycle",
        idea("SUBMITTED"),
        cycle({ status: "CLOSED" }),
        "IDEA_REVIEW_CLOSED",
      ],
    ])("refuses %s", (_label, current, reviewCycle, code) => {
      expect(codeOf(() => rules.assertCanReview(current, reviewCycle, 2))).toBe(
        code,
      );
    });

    it("needs feedback to reject, not to approve", () => {
      expect(codeOf(() => rules.feedbackFor("REJECTED", "  "))).toBe(
        "IDEA_FEEDBACK_REQUIRED",
      );
      expect(codeOf(() => rules.feedbackFor("REJECTED", undefined))).toBe(
        "IDEA_FEEDBACK_REQUIRED",
      );
      expect(rules.feedbackFor("REJECTED", " Too broad ")).toBe("Too broad");
      expect(rules.feedbackFor("APPROVED", undefined)).toBeNull();
      expect(rules.feedbackFor("APPROVED", " Nice ")).toBe("Nice");
    });
  });

  it("trims the content and treats an empty link as none", () => {
    expect(
      rules.clean({
        title: " T ",
        problem: " P ",
        solution: " S ",
        link: "  ",
      }),
    ).toEqual({ title: "T", problem: "P", solution: "S", link: null });
  });
});
