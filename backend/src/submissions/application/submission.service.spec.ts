import { AuditService } from "../../audit/audit.service";
import { AuditEvent } from "../../audit/domain/audit-event";
import { LinkRequirement } from "../../common/links/link-requirement";
import { FixedClock } from "../../common/testing/fixed-clock";
import { ImmediateTransactionRunner } from "../../common/testing/immediate-transaction.runner";
import { Transaction } from "../../common/transaction";
import { Milestone } from "../../course-cycles/domain/milestone";
import { TeamActor } from "../../teams/domain/team-access.policy";
import {
  SubmissionCycle,
  SubmissionIdea,
  SubmissionTeam,
} from "../domain/submission";
import { SubmissionDomainError } from "../domain/submission.errors";
import { SubmissionRules } from "../domain/submission-rules";
import { InMemorySubmissionRepository } from "../testing/in-memory-submission.repository";
import { SubmissionTeams } from "./ports/submission-teams";
import { SubmissionService } from "./submission.service";

// Jest cannot load NestJS 12's ES modules on Node 22; stub the decorator the service uses.
jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 9));
// Phase 8: M1 opened yesterday and is due in four days; M2 follows it.
const NOW = "2026-11-11T09:00:00.000Z";
const milestone = (
  position: number,
  opens: number,
  due: number,
): Milestone => ({
  id: `m${position}`,
  cycleId: "cycle",
  position,
  name: `M${position}`,
  description: null,
  submissionOpensAt: at(opens),
  submissionDueAt: at(due),
  evaluationAt: at(due),
  linkRequirement: LinkRequirement.MILESTONE_DEFAULT,
  createdAt: at(1),
  updatedAt: at(1),
});
const cycle: SubmissionCycle = {
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "faculty",
  milestones: [milestone(1, 10, 15), milestone(2, 15, 25)],
};

const person = (id: string, role: TeamActor["role"]): TeamActor => ({
  id,
  role,
  batchYear: role === "STUDENT" ? 2026 : null,
  email: `${id}@nst.rishihood.edu.in`,
});
const leader = person("leader", "STUDENT");
const member = person("member", "STUDENT");
const outsider = person("outsider", "STUDENT");
const faculty = person("faculty", "FACULTY");

const falcon: SubmissionTeam = {
  id: "falcon",
  cycleId: "cycle",
  name: "Falcon",
  leaderId: "leader",
  members: [
    { userId: "leader", name: "Leader" },
    { userId: "member", name: "Member" },
  ],
};
const kestrel: SubmissionTeam = {
  id: "kestrel",
  cycleId: "cycle",
  name: "Kestrel",
  leaderId: "other-leader",
  members: [{ userId: "other-leader", name: "Other leader" }],
};

const work = {
  links: [{ type: "GITHUB", url: "https://github.com/falcon/app" }],
  notes: "First version",
};

/** Members see their team; the owning faculty see every team; nobody else does. */
class FakeSubmissionTeams extends SubmissionTeams {
  readonly ideas = new Map<string, SubmissionIdea | null>([
    [
      "falcon",
      { title: "Lost and found", status: "APPROVED", source: "PROPOSAL" },
    ],
    [
      "kestrel",
      { title: "Seat finder", status: "SUBMITTED", source: "PROPOSAL" },
    ],
  ]);

  getVisible(actor: TeamActor, teamId: string) {
    const team = [falcon, kestrel].find((entry) => entry.id === teamId);
    const visible =
      team &&
      ((actor.role === "FACULTY" && actor.id === cycle.createdByFacultyId) ||
        team.members.some((entry) => entry.userId === actor.id));
    if (!visible) {
      return Promise.reject(
        new SubmissionDomainError("TEAM_NOT_FOUND", "Team not found"),
      );
    }
    return Promise.resolve({
      team,
      cycle,
      idea: this.ideas.get(teamId) ?? null,
    });
  }

  listForCycle() {
    return Promise.resolve({
      cycle,
      rows: [falcon, kestrel].map((team) => ({
        team,
        idea: this.ideas.get(team.id) ?? null,
      })),
    });
  }
}

function createKit() {
  const clock = new FixedClock(NOW);
  const audited: AuditEvent[] = [];
  const service = new SubmissionService(
    new InMemorySubmissionRepository((id) => ({ id, name: id })),
    new FakeSubmissionTeams(),
    new SubmissionRules(),
    {
      record: async (_tx: Transaction, event: AuditEvent) => {
        audited.push(event);
      },
    } as unknown as AuditService,
    new ImmediateTransactionRunner(),
    clock,
  );
  return { service, clock, audited };
}

describe("SubmissionService", () => {
  let kit: ReturnType<typeof createKit>;
  beforeEach(() => {
    kit = createKit();
  });

  it("lets any member add versions to a milestone; each save is the next version, newest first", async () => {
    const first = await kit.service.submit(leader, "falcon", "m1", work);
    const second = await kit.service.submit(member, "falcon", "m1", {
      links: [
        { type: "GITHUB", url: "https://github.com/falcon/app" },
        { type: "DEMO", url: "https://falcon.vercel.app" },
      ],
      notes: null,
    });
    expect([first.version, second.version]).toEqual([1, 2]);
    expect(second).toMatchObject({
      milestoneId: "m1",
      submittedBy: { id: "member" },
    });
    expect(
      (await kit.service.list(leader, "falcon", "m1")).map((s) => s.version),
    ).toEqual([2, 1]);
    expect(kit.audited.map((event) => event.metadata)).toEqual([
      { cycleId: "cycle", teamId: "falcon", milestoneId: "m1", version: 1 },
      { cycleId: "cycle", teamId: "falcon", milestoneId: "m1", version: 2 },
    ]);
  });

  it("numbers each milestone's versions from 1, and keeps each milestone to its own window", async () => {
    await kit.service.submit(leader, "falcon", "m1", work);
    await expect(
      kit.service.submit(leader, "falcon", "m2", work),
    ).rejects.toMatchObject({
      code: "SUBMISSION_NOT_OPEN",
    });
    kit.clock.advance(4 * DAY_MS);
    const m2 = await kit.service.submit(leader, "falcon", "m2", work);
    expect(m2.version).toBe(1);
    await expect(
      kit.service.submit(leader, "falcon", "m1", work),
    ).rejects.toMatchObject({
      code: "SUBMISSION_CLOSED",
    });
    expect(await kit.service.list(leader, "falcon", "m1")).toHaveLength(1);
  });

  it("checks links against the milestone and refuses an unknown milestone", async () => {
    await expect(
      kit.service.submit(leader, "falcon", "m1", { links: [], notes: null }),
    ).rejects.toMatchObject({ code: "MISSING_REQUIRED_LINK" });
    await expect(
      kit.service.submit(leader, "falcon", "nope", work),
    ).rejects.toMatchObject({
      code: "MILESTONE_NOT_FOUND",
    });
  });

  it("needs an approved idea", async () => {
    await expect(
      kit.service.submit(
        person("other-leader", "STUDENT"),
        "kestrel",
        "m1",
        work,
      ),
    ).rejects.toMatchObject({ code: "IDEA_NOT_APPROVED" });
  });

  it("hides another team's work", async () => {
    await kit.service.submit(leader, "falcon", "m1", work);
    await expect(
      kit.service.list(outsider, "falcon", "m1"),
    ).rejects.toMatchObject({
      code: "TEAM_NOT_FOUND",
    });
    expect(await kit.service.list(faculty, "falcon", "m1")).toHaveLength(1);
  });

  it("lists every team of the cycle with its idea and its versions for a milestone", async () => {
    await kit.service.submit(leader, "falcon", "m1", work);
    await kit.service.submit(member, "falcon", "m1", work);
    const rows = await kit.service.listForCycle(faculty, "cycle", "m1");
    expect(
      rows.map((row) => [
        row.team.id,
        row.latest?.version ?? null,
        row.versionCount,
        row.versions.length,
      ]),
    ).toEqual([
      ["falcon", 2, 2, 2],
      ["kestrel", null, 0, 0],
    ]);
    expect(
      (await kit.service.listForCycle(faculty, "cycle", "m2"))[0].versionCount,
    ).toBe(0);
  });
});
