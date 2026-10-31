// Phase 9 demo data: one project lived through from teams to a released M1 (with M2 open now),
// and one closed project with results. Every step goes through the real services, with a clock
// moved through the past, so the rules and the audit log apply as in real use.
import { TestingModule } from "@nestjs/testing";
import { FixedClock } from "../src/common/testing/fixed-clock";
import { AppConfig } from "../src/config/app-config";
import { CourseCycleService } from "../src/course-cycles/application/course-cycle.service";
import { EvaluationService } from "../src/evaluations/application/evaluation.service";
import { IdeaService } from "../src/ideas/application/idea.service";
import { SubmissionService } from "../src/submissions/application/submission.service";
import { TeamFormationService } from "../src/teams/application/team-formation.service";
import { UsersService } from "../src/users/users.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const JOURNEY = "Student journey demo";
const PAST = "Last term demo";

type Actor = { id: string; role: "STUDENT" | "FACULTY" | "ADMIN" | "PENDING_STAFF"; batchYear: number | null; email: string };

async function actorFor(users: UsersService, email: string): Promise<Actor | null> {
  const user = await users.findByEmail(email);
  return user && { id: user.id, role: user.role, batchYear: user.batchYear, email: user.email };
}

export async function seedJourney(
  module: TestingModule,
  clock: FixedClock,
  emails: { faculty: string; leader: string; member: string },
): Promise<string[]> {
  const get = <T>(type: new (...args: never[]) => T) => module.get(type, { strict: false });
  const users = get(UsersService);
  const [faculty, leader, member] = await Promise.all([
    actorFor(users, emails.faculty),
    actorFor(users, emails.leader),
    actorFor(users, emails.member),
  ]);
  if (!faculty || !leader || !member) return ["skipped: demo accounts missing"];
  const cycles = get(CourseCycleService);
  const existing = new Set((await cycles.listMine(faculty)).map((cycle) => cycle.title));
  const teams = get(TeamFormationService);
  const ideas = get(IdeaService);
  const submissions = get(SubmissionService);
  const evaluations = get(EvaluationService);
  const realNow = clock.now().getTime();
  const goTo = (time: number) => clock.advance(time - clock.now().getTime());
  const iso = (time: number) => new Date(time).toISOString();
  const github = { required: ["GITHUB" as const], optional: ["DEMO" as const, "REPORT" as const] };
  const report: string[] = [];

  async function project(title: string, start: number, plan: { m1Due: number; m2Due: number }) {
    goTo(start);
    const created = await cycles.create(faculty!, {
      courseName: "Software Design",
      title,
      batchYear: leader!.batchYear ?? 2023,
      semester: 7,
      academicYear: "2026-27",
      minTeamSize: 1,
      maxTeamSize: 4,
      teamDeadline: iso(start + 2 * DAY_MS),
      ideaDeadline: iso(start + 5 * DAY_MS),
      milestones: [
        { name: "Design review", submissionOpensAt: iso(start + 5 * DAY_MS), submissionDueAt: iso(plan.m1Due), evaluationAt: iso(plan.m1Due + DAY_MS), linkRequirement: github },
        { name: "Final", submissionOpensAt: iso(plan.m1Due), submissionDueAt: iso(plan.m2Due), evaluationAt: iso(plan.m2Due + DAY_MS), linkRequirement: github },
      ],
    });
    await cycles.publish(faculty!, created.id);
    const team = await teams.create(leader!, created.id, { name: title === PAST ? "Old Falcon" : "Demo Falcon", memberIds: [member!.id] });
    return { cycle: created, team, m1: created.milestones[0], m2: created.milestones[1] };
  }

  async function ideaRejectedThenApproved(teamId: string, start: number) {
    goTo(start + DAY_MS);
    const first = await ideas.submit(leader!, teamId, {
      title: "Campus lost and found",
      problem: "Things get lost on campus and nobody knows where to look",
      solution: "A board",
      links: [],
    });
    await ideas.review(faculty!, teamId, { version: first.version, decision: "REJECTED", feedback: "Say how owners are found and notified." });
    goTo(start + 2 * DAY_MS);
    const second = await ideas.submit(leader!, teamId, {
      title: "Campus lost and found",
      problem: "Things get lost on campus and nobody knows where to look",
      solution: "A board with photos; owners are matched by student id and notified by email",
      links: [{ type: "GITHUB", url: "https://github.com/demo-falcon/lost-and-found" }],
    });
    await ideas.review(faculty!, teamId, { version: second.version, decision: "APPROVED", feedback: "Clear and doable." });
  }

  // Feedback only unless EVALUATION_MARKS_ENABLED is on (H3).
  const marksEnabled = get(AppConfig).values.evaluationMarksEnabled;
  async function gradeAndRelease(p: Awaited<ReturnType<typeof project>>, at: number, max: number, marks: number, feedback: string) {
    goTo(at);
    if (marksEnabled) {
      await evaluations.setMaxMarks(faculty!, p.cycle.id, p.m1.id, max);
      await evaluations.saveEvaluation(faculty!, p.cycle.id, p.m1.id, p.team.id, { marks, feedback });
    } else {
      await evaluations.saveEvaluation(faculty!, p.cycle.id, p.m1.id, p.team.id, { feedback });
    }
    await evaluations.release(faculty!, p.cycle.id, p.m1.id);
  }

  try {
    if (!existing.has(PAST)) {
      // Finished 40 to 15 days ago: graded, released and closed.
      const start = realNow - 40 * DAY_MS;
      const p = await project(PAST, start, { m1Due: start + 12 * DAY_MS, m2Due: start + 20 * DAY_MS });
      await ideaRejectedThenApproved(p.team.id, start);
      goTo(start + 6 * DAY_MS);
      await submissions.submit(member, p.team.id, p.m1.id, { links: [{ type: "GITHUB", url: "https://github.com/demo-falcon/old-project" }], notes: null });
      await gradeAndRelease(p, start + 13 * DAY_MS, 10, 8, "Good structure; add tests next time.");
      goTo(start + 25 * DAY_MS);
      await cycles.close(faculty, p.cycle.id);
      report.push(`${PAST}: created, graded and closed`);
    } else report.push(`${PAST}: unchanged`);

    if (!existing.has(JOURNEY)) {
      // Started 20 days ago: M1 was due 5 days ago and is released; M2 is open for two more weeks.
      const start = realNow - 20 * DAY_MS;
      const p = await project(JOURNEY, start, { m1Due: realNow - 5 * DAY_MS, m2Due: realNow + 14 * DAY_MS });
      await ideaRejectedThenApproved(p.team.id, start);
      goTo(start + 6 * DAY_MS);
      await submissions.submit(member, p.team.id, p.m1.id, { links: [{ type: "GITHUB", url: "https://github.com/demo-falcon/lost-and-found" }], notes: "Board and photo upload" });
      await gradeAndRelease(p, realNow - 4 * DAY_MS, 20, 16, "Solid design review. Next: notifications and tests.");
      report.push(`${JOURNEY}: M1 released, M2 open`);
    } else report.push(`${JOURNEY}: unchanged`);
  } finally {
    goTo(realNow);
  }
  return report;
}
