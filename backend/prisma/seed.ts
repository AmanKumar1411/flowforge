// Creates the demo accounts (see src/auth/application/demo-accounts.ts) in the
// database from DATABASE_URL, and one published demo project with three
// milestones, plus a lived-through project and a closed one (Phase 9, seed-journey.ts).
// Run with `npm run seed:demo`; safe to run again.
import { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { Clock } from "../src/common/clock";
import { FixedClock } from "../src/common/testing/fixed-clock";
import {
  DemoAccountsService,
  SeededDemoAccount,
} from "../src/auth/application/demo-accounts.service";
import { CourseCycleService } from "../src/course-cycles/application/course-cycle.service";
import { seedJourney } from "./seed-journey";
import { UsersService } from "../src/users/users.service";

const DEMO_TITLE = "AIML demo project";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The AIML example of Phase 8, owned by the first demo faculty member: teams
 * for a week, ideas for another, then M1 and M2 ask for the GitHub
 * repository and the final milestone for a Drive folder. Dates count from
 * today, so the project is always in its team stage right after seeding.
 */
async function seedDemoCycle(
  app: INestApplicationContext,
  accounts: SeededDemoAccount[],
): Promise<string> {
  const faculty = accounts.find(
    (account) => account.role === "FACULTY" && account.outcome !== "SKIPPED",
  );
  const user = faculty && (await app.get(UsersService).findByEmail(faculty.email));
  if (!user) return "skipped: no demo faculty account";
  const actor = {
    id: user.id,
    role: user.role,
    batchYear: user.batchYear,
    email: user.email,
  };
  const cycles = app.get(CourseCycleService);
  if ((await cycles.listMine(actor)).some((cycle) => cycle.title === DEMO_TITLE)) {
    return `unchanged: ${faculty.email} already has "${DEMO_TITLE}"`;
  }
  const day = (days: number) => {
    const date = new Date(Date.now() + days * DAY_MS);
    date.setUTCHours(18, 29, 0, 0); // 11:59 PM in India
    return date.toISOString();
  };
  const github = { required: ["GITHUB" as const], optional: ["DEMO" as const, "REPORT" as const] };
  const created = await cycles.create(actor, {
    courseName: "Applied Machine Learning",
    title: DEMO_TITLE,
    description:
      "Build, train and present a small ML system. M1 and M2 are reviewed on GitHub; the final presentation goes in a Drive folder.",
    batchYear: 2023,
    semester: 7,
    academicYear: "2026-27",
    minTeamSize: 2,
    maxTeamSize: 4,
    teamDeadline: day(7),
    ideaDeadline: day(14),
    milestones: [
      { name: "Data and baseline", submissionOpensAt: day(14), submissionDueAt: day(28), evaluationAt: day(30), linkRequirement: github },
      { name: "Model iteration", submissionOpensAt: day(30), submissionDueAt: day(44), evaluationAt: day(46), linkRequirement: github },
      {
        name: "Final",
        description: "Slides, report and demo video in one Drive folder.",
        submissionOpensAt: day(46),
        submissionDueAt: day(56),
        evaluationAt: day(58),
        linkRequirement: { required: ["DRIVE"], optional: [] },
      },
    ],
  });
  await cycles.publish(actor, created.id);
  return `created and published for ${faculty.email}`;
}

async function main(): Promise<void> {
  // A clock the journey seed can move through the past (Phase 9); it reads real time otherwise.
  const clock = new FixedClock(new Date());
  const app = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  app.useLogger(["error", "warn"]);
  await app.init();
  try {
    const seeded = await app.get(DemoAccountsService).seed();
    console.table(
      seeded.map(({ email, role, batchYear, outcome, note }) => ({
        email,
        role: role ?? "",
        batch: batchYear ?? "",
        outcome: note ? `${outcome}: ${note}` : outcome,
      })),
    );
    console.log(`${DEMO_TITLE}: ${await seedDemoCycle(app, seeded)}`);
    const faculty = seeded.find((account) => account.role === "FACULTY" && account.outcome !== "SKIPPED");
    const batch2023 = seeded.filter((account) => account.role === "STUDENT" && account.batchYear === 2023);
    if (faculty && batch2023.length >= 2) {
      for (const line of await seedJourney(app, clock, {
        faculty: faculty.email,
        leader: batch2023[0].email,
        member: batch2023[1].email,
      })) {
        console.log(line);
      }
    }
    console.log("Sign in with any of them through dev login on /login.");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
