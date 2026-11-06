import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { ImmediateTransactionRunner } from "../../src/common/testing/immediate-transaction.runner";
import { Transaction, TransactionRunner } from "../../src/common/transaction";
import { CycleRepository } from "../../src/course-cycles/application/ports/cycle.repository";
import { aCycle } from "../../src/course-cycles/testing/cycle.builder";
import { SubmissionRepository } from "../../src/submissions/application/ports/submission.repository";
import { Person } from "../../src/submissions/domain/submission";
import { SubmissionDomainError } from "../../src/submissions/domain/submission.errors";
import { InMemorySubmissionRepository } from "../../src/submissions/testing/in-memory-submission.repository";
import {
  aSubmission,
  SubmissionBuilder,
} from "../../src/submissions/testing/submission.builder";
import { DOMAIN, startTestApp } from "../support/test-app";

interface World {
  cycleId: string;
  milestoneIds: [string, string];
  teamIds: [string, string];
  member: Person;
}

interface Harness {
  repository: SubmissionRepository;
  inTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  world: World;
  close(): Promise<void>;
}

/** What every SubmissionRepository must do, whichever implementation it is (Liskov). */
function submissionRepositoryContract(
  name: string,
  start: () => Promise<Harness>,
): void {
  describe(`SubmissionRepository contract: ${name}`, () => {
    let harness: Harness;
    let world: World;

    before(async () => {
      harness = await start();
      world = harness.world;
    });
    after(() => harness.close());

    const version = (team: number, milestone: number, number: number) =>
      aSubmission()
        .inCycle(world.cycleId)
        .forTeam(world.teamIds[team])
        .forMilestone(world.milestoneIds[milestone])
        .by(world.member)
        .version(number);
    const save = (builder: SubmissionBuilder) =>
      harness.inTransaction((tx) =>
        harness.repository.create(builder.buildNew(), tx),
      );

    it("creates a version and names who submitted it", async () => {
      const created = await save(version(0, 0, 1).withNotes("First"));

      assert.ok(created.id);
      assert.equal(created.version, 1);
      assert.equal(created.notes, "First");
      assert.deepEqual(created.submittedBy, world.member);
      assert.deepEqual(created.links, version(0, 0, 1).buildNew().links);
    });

    it("refuses a version number that is taken, with SUBMISSION_CHANGED", async () => {
      await save(version(1, 1, 1));

      await assert.rejects(
        save(version(1, 1, 1)),
        (error: SubmissionDomainError) => error.code === "SUBMISSION_CHANGED",
      );
    });

    it("reads the latest version number, per team and per milestone, 0 before the first", async () => {
      const latest = (team: number, milestone: number) =>
        harness.inTransaction((tx) =>
          harness.repository.lockLatestVersion(
            world.teamIds[team],
            world.milestoneIds[milestone],
            tx,
          ),
        );

      assert.equal(await latest(1, 0), 0);
      await save(version(1, 0, 1));
      await save(version(1, 0, 2));
      assert.equal(await latest(1, 0), 2);
    });

    it("lists a team's history newest first, a page at a time", async () => {
      await save(version(0, 1, 1));
      await save(version(0, 1, 2));
      await save(version(0, 1, 3));
      const page = (limit: number, beforeVersion?: number) =>
        harness.repository.listByTeam(world.teamIds[0], world.milestoneIds[1], {
          limit,
          beforeVersion,
        });

      assert.deepEqual(
        (await page(2)).map((row) => row.version),
        [3, 2],
      );
      assert.deepEqual(
        (await page(2, 2)).map((row) => row.version),
        [1],
      );
      assert.deepEqual((await page(2))[0].submittedBy, world.member);
    });

    it("gives each team's newest version for a milestone, one row per team", async () => {
      const rows = await harness.repository.listLatestByMilestone(
        world.milestoneIds[1],
      );

      const byTeam = new Map(rows.map((row) => [row.teamId, row]));
      assert.equal(rows.length, byTeam.size, "one row per team");
      assert.equal(byTeam.get(world.teamIds[0])?.version, 3);
      assert.equal(byTeam.get(world.teamIds[1])?.version, 1);
      assert.deepEqual(byTeam.get(world.teamIds[0])?.submittedBy, world.member);
      assert.deepEqual(
        byTeam.get(world.teamIds[0])?.links,
        version(0, 1, 3).buildNew().links,
      );
    });

    it("says which milestones each team has handed in, without repeats", async () => {
      const pairs = await harness.repository.listSubmittedMilestones([
        world.teamIds[0],
      ]);

      const seen = pairs.map(({ teamId, milestoneId }) => {
        assert.equal(teamId, world.teamIds[0]);
        return milestoneId;
      });
      assert.deepEqual(new Set(seen), new Set(world.milestoneIds));
      assert.equal(seen.length, 2);
    });
  });
}

submissionRepositoryContract("in memory", () => {
  const member: Person = { id: "member-1", name: "Member One" };
  const transactions = new ImmediateTransactionRunner();
  return Promise.resolve({
    repository: new InMemorySubmissionRepository(() => member),
    inTransaction: (work) => transactions.run(work),
    world: {
      cycleId: "cycle-1",
      milestoneIds: ["m-1", "m-2"],
      teamIds: ["team-1", "team-2"],
      member,
    },
    close: () => Promise.resolve(),
  });
});

submissionRepositoryContract("Prisma, on the test database", async () => {
  const app = await startTestApp();
  await app.reset();
  const transactions = app.get(TransactionRunner);
  const person = (role: "FACULTY" | "STUDENT", name: string) =>
    app.prisma.user.create({
      data: {
        email: `${name.toLowerCase()}.${randomUUID().slice(0, 8)}${DOMAIN}`,
        name,
        role,
      },
    });
  const owner = await person("FACULTY", "Owner");
  const member = await person("STUDENT", "Member");
  const other = await person("STUDENT", "Other");
  const builder = aCycle().ownedBy(owner.id).withMilestones(2);
  const cycle = await transactions.run((tx) =>
    app
      .get(CycleRepository)
      .create(builder.buildCreateData(), builder.buildMilestones(), tx),
  );
  const team = (leaderId: string, name: string) =>
    app.prisma.team.create({
      data: { cycleId: cycle.id, name, leaderId },
    });
  const teams = [await team(member.id, "One"), await team(other.id, "Two")];
  return {
    repository: app.get(SubmissionRepository),
    inTransaction: (work) => transactions.run(work),
    world: {
      cycleId: cycle.id,
      milestoneIds: [cycle.milestones[0].id, cycle.milestones[1].id],
      teamIds: [teams[0].id, teams[1].id],
      member: { id: member.id, name: member.name },
    },
    close: () => app.close(),
  };
});
