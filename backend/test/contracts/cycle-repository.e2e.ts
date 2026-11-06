import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { ImmediateTransactionRunner } from "../../src/common/testing/immediate-transaction.runner";
import { LinkRequirement } from "../../src/common/links/link-requirement";
import { Transaction, TransactionRunner } from "../../src/common/transaction";
import { CycleRepository } from "../../src/course-cycles/application/ports/cycle.repository";
import { Cycle } from "../../src/course-cycles/domain/cycle.types";
import { planMilestones } from "../../src/course-cycles/domain/milestone";
import {
  aCycle,
  CycleBuilder,
} from "../../src/course-cycles/testing/cycle.builder";
import { InMemoryCycleRepository } from "../../src/course-cycles/testing/in-memory-cycle.repository";
import { DOMAIN, startTestApp } from "../support/test-app";

interface Harness {
  repository: CycleRepository;
  inTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** A user id that foreign keys accept. */
  newFaculty(): Promise<string>;
  close(): Promise<void>;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** What every CycleRepository must do, whichever implementation it is (Liskov). */
function cycleRepositoryContract(
  name: string,
  start: () => Promise<Harness>,
): void {
  describe(`CycleRepository contract: ${name}`, () => {
    let harness: Harness;
    let owner = "";

    before(async () => {
      harness = await start();
      owner = await harness.newFaculty();
    });
    after(() => harness.close());

    const save = (builder: CycleBuilder = aCycle().ownedBy(owner)) =>
      harness.inTransaction((tx) =>
        harness.repository.create(
          builder.buildCreateData(),
          builder.buildMilestones(),
          tx,
        ),
      );
    const move = (
      cycle: Cycle,
      from: Cycle["status"],
      to: Cycle["status"],
      at = new Date("2030-01-07T09:00:00.000Z"),
    ) =>
      harness.inTransaction((tx) =>
        harness.repository.transitionStatus(cycle.id, from, to, at, tx),
      );
    const publish = (cycle: Cycle) => move(cycle, "DRAFT", "PUBLISHED");
    const enroll = (cycle: Cycle, ...emails: string[]) =>
      harness.inTransaction((tx) =>
        harness.repository.addEnrollments(cycle.id, emails, owner, tx),
      );

    it("creates a draft with its milestones in position order", async () => {
      const created = await save(aCycle().ownedBy(owner).withMilestones(3));

      assert.equal(created.status, "DRAFT");
      assert.equal(created.publishedAt, null);
      assert.equal(created.closedAt, null);
      assert.equal(created.createdByFacultyId, owner);
      assert.deepEqual(
        created.milestones.map((m) => m.position),
        [1, 2, 3],
      );
      assert.ok(created.milestones.every((m) => m.cycleId === created.id));
      assert.ok(created.ideaLinkRequirement instanceof LinkRequirement);
      assert.ok(
        created.milestones[0].linkRequirement instanceof LinkRequirement,
      );
    });

    it("finds what it saved, value objects included, and null for anything else", async () => {
      const created = await save(aCycle().ownedBy(owner).withMilestones(2));

      const found = await harness.repository.findById(created.id);

      assert.equal(found?.id, created.id);
      assert.equal(found?.milestones.length, 2);
      assert.ok(
        found?.ideaLinkRequirement.equals(LinkRequirement.IDEA_DEFAULT),
      );
      assert.ok(
        found?.milestones[0].linkRequirement.equals(
          LinkRequirement.MILESTONE_DEFAULT,
        ),
      );
      assert.equal(await harness.repository.findById(randomUUID()), null);
    });

    it("locks and reads inside a transaction, and answers null for an unknown id", async () => {
      const created = await save();

      const locked = await harness.inTransaction((tx) =>
        harness.repository.lockById(created.id, tx),
      );
      const unknown = await harness.inTransaction((tx) =>
        harness.repository.lockById(randomUUID(), tx),
      );

      assert.equal(locked?.id, created.id);
      assert.equal(unknown, null);
    });

    it("lists an owner's cycles, newest first, and no one else's", async () => {
      const someone = await harness.newFaculty();
      const other = await harness.newFaculty();
      const older = await save(aCycle().ownedBy(someone));
      await tick();
      const newer = await save(aCycle().ownedBy(someone));
      await save(aCycle().ownedBy(other));

      const listed = await harness.repository.listByOwner(someone);

      assert.deepEqual(
        listed.map((cycle) => cycle.id),
        [newer.id, older.id],
      );
    });

    it("shows a student published core cycles of their batch and electives they are enrolled in", async () => {
      const email = `enrolled.${randomUUID().slice(0, 8)}@x`;
      const core = await save(aCycle().ownedBy(owner).forBatch(2031));
      const otherBatch = await save(aCycle().ownedBy(owner).forBatch(2032));
      const elective = await save(aCycle().ownedBy(owner).elective());
      const notEnrolled = await save(aCycle().ownedBy(owner).elective());
      const draft = await save(aCycle().ownedBy(owner).forBatch(2031));
      await publish(core);
      await publish(otherBatch);
      await publish(elective);
      await publish(notEnrolled);
      await enroll(elective, email);

      const visible = (
        await harness.repository.listPublishedForStudent(2031, email)
      ).map((cycle) => cycle.id);
      const withoutBatch = (
        await harness.repository.listPublishedForStudent(null, email)
      ).map((cycle) => cycle.id);

      assert.deepEqual(new Set(visible), new Set([core.id, elective.id]));
      assert.ok(!visible.includes(draft.id));
      assert.deepEqual(withoutBatch, [elective.id]);
    });

    it("lists what has been published, for admins, and never a draft", async () => {
      const draft = await save();
      const published = await save();
      await publish(published);

      const ids = (await harness.repository.listPublishedOrClosed()).map(
        (cycle) => cycle.id,
      );

      assert.ok(ids.includes(published.id));
      assert.ok(!ids.includes(draft.id));
    });

    it("lists only the closed cycles among some ids, most recently closed first", async () => {
      const first = await save();
      const second = await save();
      const open = await save();
      for (const cycle of [first, second, open]) await publish(cycle);
      const at = (minute: number) =>
        new Date(`2030-03-01T09:${String(minute).padStart(2, "0")}:00.000Z`);
      await move(first, "PUBLISHED", "CLOSED", at(1));
      await move(second, "PUBLISHED", "CLOSED", at(2));

      const closed = await harness.repository.listClosedByIds([
        first.id,
        second.id,
        open.id,
      ]);

      assert.deepEqual(
        closed.map((cycle) => cycle.id),
        [second.id, first.id],
      );
    });

    it("updates fields, and answers null when the cycle is not in the expected status", async () => {
      const created = await save();

      const updated = await harness.inTransaction((tx) =>
        harness.repository.update(
          created.id,
          "DRAFT",
          { title: "Renamed" },
          null,
          tx,
        ),
      );
      const stale = await harness.inTransaction((tx) =>
        harness.repository.update(
          created.id,
          "PUBLISHED",
          { title: "Too late" },
          null,
          tx,
        ),
      );

      assert.equal(updated?.title, "Renamed");
      assert.equal(stale, null);
      const found = await harness.repository.findById(created.id);
      assert.equal(found?.title, "Renamed");
    });

    it("applies a milestone plan: keeps ids, moves, adds and removes", async () => {
      const created = await save(aCycle().ownedBy(owner).withMilestones(2));
      const [first, second] = created.milestones;
      const added = aCycle().withMilestones(3).buildMilestones()[2];

      const plan = planMilestones(created.milestones, [
        { ...second, name: "Moved first" },
        { ...added, name: "Added" },
      ]);
      const updated = await harness.inTransaction((tx) =>
        harness.repository.update(created.id, "DRAFT", {}, plan, tx),
      );

      assert.deepEqual(
        updated?.milestones.map(({ position, name }) => [position, name]),
        [
          [1, "Moved first"],
          [2, "Added"],
        ],
      );
      assert.equal(updated?.milestones[0].id, second.id);
      assert.ok(!updated?.milestones.some((m) => m.id === first.id));
    });

    it("moves status only from the expected one, and stamps the moment", async () => {
      const created = await save();
      const publishedAt = new Date("2030-02-01T09:00:00.000Z");
      const closedAt = new Date("2030-06-01T09:00:00.000Z");

      const refused = await move(created, "PUBLISHED", "CLOSED", closedAt);
      const published = await move(created, "DRAFT", "PUBLISHED", publishedAt);
      const closed = await move(created, "PUBLISHED", "CLOSED", closedAt);

      assert.equal(refused, null);
      assert.equal(published?.status, "PUBLISHED");
      assert.deepEqual(published?.publishedAt, publishedAt);
      assert.equal(published?.closedAt, null);
      assert.equal(closed?.status, "CLOSED");
      assert.deepEqual(closed?.publishedAt, publishedAt);
      assert.deepEqual(closed?.closedAt, closedAt);
    });

    it("keeps a roster: duplicates are skipped, sorted by email, removal says whether it happened", async () => {
      const elective = await save(aCycle().ownedBy(owner).elective());

      await enroll(elective, "b@x", "a@x");
      await enroll(elective, "a@x", "c@x");

      const roster = await harness.repository.listEnrollments(elective.id);
      assert.deepEqual(
        roster.map((enrollment) => enrollment.email),
        ["a@x", "b@x", "c@x"],
      );
      assert.equal(
        await harness.repository.isEnrolled(elective.id, "a@x"),
        true,
      );
      assert.equal(
        await harness.repository.isEnrolled(elective.id, "z@x"),
        false,
      );
      const removed = await harness.inTransaction((tx) =>
        harness.repository.removeEnrollment(elective.id, "a@x", tx),
      );
      const again = await harness.inTransaction((tx) =>
        harness.repository.removeEnrollment(elective.id, "a@x", tx),
      );
      assert.equal(removed, true);
      assert.equal(again, false);
    });
  });
}

cycleRepositoryContract("in memory", () => {
  const transactions = new ImmediateTransactionRunner();
  return Promise.resolve({
    repository: new InMemoryCycleRepository(),
    inTransaction: (work) => transactions.run(work),
    newFaculty: () => Promise.resolve(randomUUID()),
    close: () => Promise.resolve(),
  });
});

cycleRepositoryContract("Prisma, on the test database", async () => {
  const app = await startTestApp();
  await app.reset();
  const transactions = app.get(TransactionRunner);
  return {
    repository: app.get(CycleRepository),
    inTransaction: (work) => transactions.run(work),
    newFaculty: async () =>
      (
        await app.prisma.user.create({
          data: {
            email: `faculty.${randomUUID().slice(0, 8)}${DOMAIN}`,
            name: "Faculty",
            role: "FACULTY",
          },
        })
      ).id,
    close: () => app.close(),
  };
});
