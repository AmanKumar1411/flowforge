import { FixedClock } from "../../common/testing/fixed-clock";
import { buildUpdates } from "./dashboard-feed";
import { StudentTodoRules, TodoContext, TodoRule } from "./student-todo-rules";

const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 10, day, hour));
const before = (date: Date) => new Date(date.getTime() - 1);
const rules = StudentTodoRules.withDefaults();
// Teams until the 4th, ideas until the 8th, M1 open the 8th–15th.
const context = (
  moment: Date,
  overrides: Partial<TodoContext> = {},
): TodoContext => ({
  now: new FixedClock(moment).now(),
  cycle: {
    id: "c",
    status: "PUBLISHED",
    teamDeadline: at(4),
    ideaDeadline: at(8),
    milestones: [
      {
        id: "m1",
        position: 1,
        name: "Design review",
        submissionOpensAt: at(8),
        submissionDueAt: at(15),
      },
    ],
  },
  team: null,
  idea: null,
  submittedMilestoneIds: new Set(),
  ...overrides,
});
const texts = (ctx: TodoContext) =>
  rules.itemsFor(ctx).map((item) => item.text);
const leader = { id: "t", isLeader: true };
const member = { id: "t", isLeader: false };

describe("StudentTodoRules", () => {
  it("asks a student without a team to join one, until the team deadline", () => {
    expect(texts(context(before(at(4))))).toEqual(["Create or join a team"]);
    expect(texts(context(at(4)))).toEqual([]);
    expect(rules.itemsFor(context(at(1)))[0]).toMatchObject({
      at: at(4),
      tab: "team",
      actionable: true,
    });
  });

  it("asks the leader for the idea until its deadline, and tells a member it is the leader's", () => {
    expect(
      rules.itemsFor(context(before(at(8)), { team: leader })),
    ).toMatchObject([
      { text: "Submit or pick your team's idea", actionable: true, at: at(8) },
    ]);
    expect(
      rules.itemsFor(context(before(at(8)), { team: member })),
    ).toMatchObject([
      {
        text: "Your leader submits or picks your team's idea",
        actionable: false,
      },
    ]);
    expect(texts(context(at(8), { team: leader }))).toEqual([]);
    expect(
      texts(context(at(5), { team: leader, idea: { status: "SUBMITTED" } })),
    ).toEqual([]);
  });

  it("asks for a revision after a rejection, with no deadline", () => {
    expect(
      rules.itemsFor(
        context(at(20), { team: leader, idea: { status: "REJECTED" } }),
      ),
    ).toMatchObject([
      { kind: "REVISE_IDEA", text: "Revise your idea", at: null },
    ]);
    expect(
      texts(context(at(20), { team: member, idea: { status: "REJECTED" } })),
    ).toEqual(["Your idea was rejected; your leader revises it"]);
  });

  it("asks every member for open work not yet handed in, from opening to due", () => {
    const approved = { team: member, idea: { status: "APPROVED" as const } };
    expect(texts(context(before(at(8)), approved))).toEqual([]);
    expect(rules.itemsFor(context(at(8), approved))).toMatchObject([
      {
        text: "Submit M1 · Design review",
        at: at(15),
        actionable: true,
        milestoneId: "m1",
      },
    ]);
    expect(
      texts(
        context(before(at(15)), {
          ...approved,
          submittedMilestoneIds: new Set(["m1"]),
        }),
      ),
    ).toEqual([]);
    expect(texts(context(at(15), approved))).toEqual([]);
  });

  it("says nothing for a closed project, and never repeats an item", () => {
    expect(
      texts(
        context(at(1), {
          cycle: { ...context(at(1)).cycle, status: "CLOSED" },
        }),
      ),
    ).toEqual([]);
    const rule: TodoRule = {
      name: "always",
      items: (ctx) => [
        {
          key: "k",
          cycleId: ctx.cycle.id,
          kind: "JOIN_TEAM",
          text: "x",
          at: null,
          tab: "team",
          actionable: true,
        },
      ],
    };
    expect(
      new StudentTodoRules()
        .register(rule)
        .register(rule)
        .itemsFor(context(at(1))),
    ).toHaveLength(1);
  });
});

describe("buildUpdates", () => {
  it("merges memberships, reviews and results, newest first, with an update after release", () => {
    const updates = buildUpdates({
      memberships: [{ cycleId: "c", teamName: "Falcon", addedAt: at(2) }],
      reviews: [
        { cycleId: "c", version: 1, decision: "REJECTED", reviewedAt: at(6) },
      ],
      results: [
        {
          cycleId: "c",
          milestone: { position: 1, name: "Design review" },
          releasedAt: at(17),
          updatedAt: at(18),
          updatedAfterRelease: true,
        },
      ],
    });
    expect(updates.map((u) => u.kind)).toEqual([
      "RESULTS_UPDATED",
      "RESULTS_RELEASED",
      "IDEA_REJECTED",
      "JOINED_TEAM",
    ]);
    expect(updates[0].text).toBe(
      "Your result for M1 · Design review was updated",
    );
  });
});
