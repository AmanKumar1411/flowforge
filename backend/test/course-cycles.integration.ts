import { strict as assert } from "node:assert";
import { createApp } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

type Json = Record<string, unknown> | Json[];
type ResponseData = { status: number; body: Json };

function objectBody(response: ResponseData): Record<string, unknown> {
  assert.equal(typeof response.body, "object");
  assert(!Array.isArray(response.body));
  return response.body as Record<string, unknown>;
}

async function main(): Promise<void> {
  assert(
    process.env.DATABASE_URL?.includes("flowforge_test"),
    "DATABASE_URL must point to flowforge_test",
  );
  const app = await createApp();
  await app.listen(0);
  const address = app.getHttpServer().address();
  assert(address && typeof address === "object");
  const port = address.port;
  const url = `http://127.0.0.1:${port}`;
  const call = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${url}/api${path}`, options);
    return { status: response.status, body: (await response.json()) as Json };
  };
  const headers = (token: string) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });
  const emailSuffix = Date.now();
  const accounts = [
    ["phase2-faculty-a", "FACULTY"],
    ["phase2-faculty-b", "FACULTY"],
    ["phase2student.k26csai", "STUDENT"],
    ["phase2student.k25csai", "STUDENT"],
  ] as const;
  const emails: string[] = [];
  const tokens = new Map<string, string>();

  try {
    for (const [name, role] of accounts) {
      const email = `${name}${emailSuffix}@nst.rishihood.edu.in`;
      emails.push(email);
      const registered = await call("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password: "PhaseTwoPassword123!",
          role,
        }),
      });
      assert.equal(registered.status, 201);
      const loggedIn = await call("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toUpperCase(),
          password: "PhaseTwoPassword123!",
        }),
      });
      assert.equal(loggedIn.status, 201);
      tokens.set(name, String(objectBody(loggedIn).accessToken));
    }

    const facultyA = tokens.get(`phase2-faculty-a`)!;
    const facultyB = tokens.get(`phase2-faculty-b`)!;
    const student26 = tokens.get(`phase2student.k26csai`)!;
    const student25 = tokens.get(`phase2student.k25csai`)!;
    const input = {
      courseName: "Software Design & System Development",
      title: "2026 Software Development Projects",
      description: "The first project cycle.",
      batchYear: 2026,
      semester: 7,
      academicYear: "2026-27",
      submissionStartAt: "2026-10-01T09:00:00.000Z",
      submissionDeadline: "2026-12-01T17:00:00.000Z",
    };

    const created = await call("/course-cycles", {
      method: "POST",
      headers: headers(facultyA),
      body: JSON.stringify(input),
    });
    assert.equal(created.status, 201);
    const cycleId = String(objectBody(created).id);
    const mine = await call("/course-cycles/my", {
      headers: headers(facultyA),
    });
    assert.equal(mine.status, 200);
    assert.equal(
      (mine.body as Json[]).some(
        (item) => (item as Record<string, unknown>).id === cycleId,
      ),
      true,
    );

    const published = await call(`/course-cycles/${cycleId}/publish`, {
      method: "POST",
      headers: headers(facultyA),
    });
    assert.equal(published.status, 200);
    const visible = await call("/course-cycles", {
      headers: headers(student26),
    });
    assert.equal(visible.status, 200);
    assert.equal(
      (visible.body as Json[]).some(
        (item) => (item as Record<string, unknown>).id === cycleId,
      ),
      true,
    );
    assert.equal(
      (await call(`/course-cycles/${cycleId}`, { headers: headers(student26) }))
        .status,
      200,
    );
    assert.equal(
      (await call("/course-cycles", { headers: headers(student25) })).status,
      200,
    );
    const otherBatchList = await call("/course-cycles", {
      headers: headers(student25),
    });
    assert.equal(otherBatchList.body instanceof Array, true);
    assert.equal(
      (otherBatchList.body as Json[]).some(
        (item) => (item as Record<string, unknown>).id === cycleId,
      ),
      false,
    );
    const wrongBatch = await call(`/course-cycles/${cycleId}`, {
      headers: headers(student25),
    });
    assert.equal(wrongBatch.status, 403);
    assert.equal(objectBody(wrongBatch).code, "UNAUTHORIZED_BATCH_ACCESS");

    const draft = await call("/course-cycles", {
      method: "POST",
      headers: headers(facultyA),
      body: JSON.stringify(input),
    });
    const draftId = String(objectBody(draft).id);
    const hiddenDraft = await call(`/course-cycles/${draftId}`, {
      headers: headers(student26),
    });
    assert.equal(hiddenDraft.status, 404);
    const forbiddenEdit = await call(`/course-cycles/${cycleId}`, {
      method: "PATCH",
      headers: headers(facultyB),
      body: JSON.stringify({ title: "No access" }),
    });
    assert.equal(forbiddenEdit.status, 403);
    assert.equal(
      (
        await call(`/course-cycles/${cycleId}/publish`, {
          method: "POST",
          headers: headers(facultyB),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(`/course-cycles/${cycleId}/close`, {
          method: "POST",
          headers: headers(facultyB),
        })
      ).status,
      403,
    );

    const closed = await call(`/course-cycles/${cycleId}/close`, {
      method: "POST",
      headers: headers(facultyA),
    });
    assert.equal(closed.status, 200);
    const closedEdit = await call(`/course-cycles/${cycleId}`, {
      method: "PATCH",
      headers: headers(facultyA),
      body: JSON.stringify({ description: "No" }),
    });
    assert.equal(closedEdit.status, 409);
    assert.equal(objectBody(closedEdit).code, "CYCLE_ALREADY_CLOSED");
    assert.equal(
      (
        await call(`/course-cycles/${cycleId}/publish`, {
          method: "POST",
          headers: headers(facultyA),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call(`/course-cycles/${cycleId}/close`, {
          method: "POST",
          headers: headers(facultyA),
        })
      ).status,
      409,
    );

    const raceDraft = await call("/course-cycles", {
      method: "POST",
      headers: headers(facultyA),
      body: JSON.stringify(input),
    });
    const raceId = String(objectBody(raceDraft).id);
    const race = await Promise.all([
      call(`/course-cycles/${raceId}/publish`, {
        method: "POST",
        headers: headers(facultyA),
      }),
      call(`/course-cycles/${raceId}/publish`, {
        method: "POST",
        headers: headers(facultyA),
      }),
    ]);
    assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
    console.log("Course cycle integration scenario passed");
  } finally {
    const prisma = app.get(PrismaService);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.courseProjectCycle.deleteMany({
      where: { createdByFacultyId: { in: ids } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
