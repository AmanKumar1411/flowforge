import { AuditService } from "../../audit/audit.service";
import { AuditEvent } from "../../audit/domain/audit-event";
import { FixedClock } from "../../common/testing/fixed-clock";
import { ImmediateTransactionRunner } from "../../common/testing/immediate-transaction.runner";
import { Transaction } from "../../common/transaction";
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
// Submissions opened yesterday and close in a month.
const NOW = "2026-11-11T09:00:00.000Z";
const cycle: SubmissionCycle = {
  id: "cycle",
  status: "PUBLISHED",
  createdByFacultyId: "faculty",
  submissionStartAt: new Date("2026-11-10T09:00:00.000Z"),
  submissionDeadline: new Date("2026-12-10T09:00:00.000Z"),
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
  repositoryUrl: "https://github.com/falcon/app",
  demoUrl: null,
  reportUrl: null,
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
    return Promise.resolve(
      [falcon, kestrel].map((team) => ({
        team,
        idea: this.ideas.get(team.id) ?? null,
      })),
    );
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

  it("lets any member add versions; each save is the next version, newest first", async () => {
    const first = await kit.service.submit(member, "falcon", {
      ...work,
      demoUrl: " ",
    });
    expect(first).toMatchObject({
      version: 1,
      demoUrl: null,
      submittedBy: { id: "member" },
    });
    kit.clock.advance(DAY_MS);
    const second = await kit.service.submit(leader, "falcon", {
      ...work,
      notes: "Fixed the map",
    });
    expect(second).toMatchObject({ version: 2, submittedBy: { id: "leader" } });
    expect(
      (await kit.service.list(faculty, "falcon")).map((entry) => entry.version),
    ).toEqual([2, 1]);
    expect(kit.audited).toMatchObject([
      {
        action: "SUBMISSION_CREATED",
        metadata: { teamId: "falcon", version: 1 },
      },
      {
        action: "SUBMISSION_CREATED",
        metadata: { teamId: "falcon", version: 2 },
      },
    ]);
  });

  it("needs an approved idea", async () => {
    await expect(
      kit.service.submit(person("other-leader", "STUDENT"), "kestrel", work),
    ).rejects.toMatchObject({ code: "IDEA_NOT_APPROVED" });
  });

  it("closes at the deadline; the last version before it stays the final one", async () => {
    await kit.service.submit(member, "falcon", work);
    kit.clock.advance(29 * DAY_MS);
    await expect(
      kit.service.submit(member, "falcon", work),
    ).rejects.toMatchObject({ code: "SUBMISSION_CLOSED" });
    expect(await kit.service.list(member, "falcon")).toHaveLength(1);
  });

  it("hides another team's work", async () => {
    await expect(
      kit.service.submit(outsider, "falcon", work),
    ).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
    await expect(kit.service.list(outsider, "falcon")).rejects.toMatchObject({
      code: "TEAM_NOT_FOUND",
    });
  });

  it("lists every team of the cycle with its idea, latest version and count", async () => {
    await kit.service.submit(member, "falcon", work);
    await kit.service.submit(member, "falcon", { ...work, notes: "v2" });
    const rows = await kit.service.listForCycle(faculty, "cycle");
    expect(rows).toMatchObject([
      {
        team: { id: "falcon" },
        idea: { status: "APPROVED" },
        latest: { version: 2, notes: "v2" },
        versionCount: 2,
      },
      { team: { id: "kestrel" }, latest: null, versionCount: 0 },
    ]);
  });
});
