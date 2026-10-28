import { SubmissionCycle, SubmissionIdea, SubmissionTeam } from "./submission";
import { SubmissionActor, SubmissionRules } from "./submission-rules";
import { SubmissionDomainError } from "./submission.errors";

const rules = new SubmissionRules();
const OPENS = new Date("2026-11-10T09:00:00.000Z");
const CLOSES = new Date("2026-12-10T09:00:00.000Z");
const during = new Date("2026-11-20T09:00:00.000Z");

const cycle = (overrides: Partial<SubmissionCycle> = {}): SubmissionCycle => ({
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "faculty",
  submissionStartAt: OPENS,
  submissionDeadline: CLOSES,
  ...overrides,
});

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

const approved: SubmissionIdea = {
  title: "Lost and found",
  status: "APPROVED",
  source: "PROPOSAL",
};
const member: SubmissionActor = { id: "member", role: "STUDENT" };

const codeOf = (work: () => unknown): string | undefined => {
  try {
    work();
    return undefined;
  } catch (error) {
    return error instanceof SubmissionDomainError ? error.code : "OTHER";
  }
};

describe("SubmissionRules", () => {
  it.each([
    [
      "before submissions open",
      new Date("2026-11-10T08:59:59.999Z"),
      "NOT_OPEN",
    ],
    ["exactly when they open", OPENS, "OPEN"],
    ["while open", during, "OPEN"],
    ["exactly at the deadline", CLOSES, "CLOSED"],
  ] as const)("the window %s is %s", (_label, now, expected) => {
    expect(rules.window(cycle(), now)).toBe(expected);
  });

  it("closes the window of a closed or draft cycle", () => {
    expect(rules.window(cycle({ status: "CLOSED" }), during)).toBe("CLOSED");
    expect(rules.window(cycle({ status: "DRAFT" }), during)).toBe("CLOSED");
  });

  it("lets any member submit while open, with an approved or picked idea", () => {
    expect(() =>
      rules.assertCanSubmit(member, team, cycle(), approved, during),
    ).not.toThrow();
    expect(() =>
      rules.assertCanSubmit(
        { id: "leader", role: "STUDENT" },
        team,
        cycle(),
        { ...approved, source: "CATALOG" },
        during,
      ),
    ).not.toThrow();
  });

  it.each([
    ["no idea", null],
    ["a waiting idea", { ...approved, status: "SUBMITTED" as const }],
    ["a rejected idea", { ...approved, status: "REJECTED" as const }],
  ])("refuses a team with %s", (_label, idea) => {
    expect(
      codeOf(() => rules.assertCanSubmit(member, team, cycle(), idea, during)),
    ).toBe("IDEA_NOT_APPROVED");
  });

  it("refuses outside the window, and anyone outside the team", () => {
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          member,
          team,
          cycle(),
          approved,
          new Date("2026-11-01"),
        ),
      ),
    ).toBe("SUBMISSION_NOT_OPEN");
    expect(
      codeOf(() =>
        rules.assertCanSubmit(member, team, cycle(), approved, CLOSES),
      ),
    ).toBe("SUBMISSION_CLOSED");
    expect(
      codeOf(() =>
        rules.assertCanSubmit(
          { id: "outsider", role: "STUDENT" },
          team,
          cycle(),
          approved,
          during,
        ),
      ),
    ).toBe("TEAM_NOT_FOUND");
  });

  it("trims the content and treats empty optional fields as none", () => {
    expect(
      rules.clean({
        repositoryUrl: " https://github.com/team/app ",
        demoUrl: " ",
        reportUrl: null,
        notes: " First version ",
      }),
    ).toEqual({
      repositoryUrl: "https://github.com/team/app",
      demoUrl: null,
      reportUrl: null,
      notes: "First version",
    });
  });
});
