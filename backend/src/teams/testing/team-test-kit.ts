import { AuditService } from "../../audit/audit.service";
import { AuditEvent } from "../../audit/domain/audit-event";
import { createDocumentedIdentityParser } from "../../auth/testing/documented-identity-parser";
import { FixedClock } from "../../common/testing/fixed-clock";
import { ImmediateTransactionRunner } from "../../common/testing/immediate-transaction.runner";
import { SeededRandom } from "../../common/testing/seeded-random";
import { Transaction } from "../../common/transaction";
import { CourseCycleService } from "../../course-cycles/course-cycle.service";
import { CycleEnrollmentService } from "../../course-cycles/cycle-enrollment.service";
import { CycleAuthorizationPolicy } from "../../course-cycles/domain/cycle-authorization-policy";
import { CycleWorkflow } from "../../course-cycles/domain/cycle-workflow";
import { InMemoryCycleRepository } from "../../course-cycles/domain/in-memory-cycle.repository";
import { EnrollmentRemovalChecks } from "../../course-cycles/enrollment-removal-checks";
import { UsersService } from "../../users/users.service";
import { TeamCompletionService } from "../application/team-completion.service";
import { TeamEnrollmentGuard } from "../application/team-enrollment-guard";
import { TeamFormationService } from "../application/team-formation.service";
import { TeamQueryService } from "../application/team-query.service";
import { TeamAccessPolicy, TeamActor } from "../domain/team-access.policy";
import { TeamRules } from "../domain/team-rules";
import { DirectoryUser } from "../domain/team";
import { CourseCycleTeamCycles } from "../infrastructure/course-cycle-team-cycles";
import { InMemoryStudentDirectory } from "./in-memory-student-directory";
import { InMemoryTeamSeekerRepository } from "./in-memory-team-seeker.repository";
import { InMemoryTeamRepository } from "./in-memory-team.repository";

export const NOW = "2026-10-27T09:00:00.000Z";
export const FORMATION_DEADLINE = "2026-10-30T12:00:00.000Z";
export const COMPLETION_DEADLINE = "2026-11-02T12:00:00.000Z";

export const student = (
  id: string,
  overrides: Partial<DirectoryUser> = {},
): DirectoryUser => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  email: `${id}.k26csai@nst.rishihood.edu.in`,
  role: "STUDENT",
  status: "ACTIVE",
  batchYear: 2026,
  ...overrides,
});

export const actor = (user: DirectoryUser): TeamActor => ({
  id: user.id,
  role: user.role,
  batchYear: user.batchYear,
  email: user.email,
});

const staff = (id: string, role: "FACULTY" | "ADMIN"): TeamActor => ({
  id,
  role,
  batchYear: null,
  email: `${id}.x@nst.rishihood.edu.in`,
});

export const owner = staff("owner", "FACULTY");
export const otherFaculty = staff("other-faculty", "FACULTY");
export const admin = staff("admin", "ADMIN");

/**
 * Every team service wired to in-memory doubles, with the real cycle and
 * enrollment services underneath, so cycle visibility and rosters are real.
 */
export function createTeamKit(seed = 1) {
  const clock = new FixedClock(NOW);
  const cycleRepository = new InMemoryCycleRepository();
  const transactions = new ImmediateTransactionRunner();
  const audited: AuditEvent[] = [];
  const audit = {
    record: async (_tx: Transaction, event: AuditEvent) => {
      audited.push(event);
    },
  } as unknown as AuditService;
  const directory = new InMemoryStudentDirectory();
  directory.add({
    id: owner.id,
    name: "Owner",
    email: owner.email,
    role: "FACULTY",
    status: "ACTIVE",
    batchYear: null,
  });
  const removalChecks = new EnrollmentRemovalChecks();
  const cycles = new CourseCycleService(
    cycleRepository,
    new CycleWorkflow(),
    new CycleAuthorizationPolicy(),
    clock,
  );
  const enrollments = new CycleEnrollmentService(
    cycleRepository,
    new CycleAuthorizationPolicy(),
    createDocumentedIdentityParser(),
    {
      findByEmails: async (emails: readonly string[]) =>
        directory.findByEmails(emails),
    } as unknown as UsersService,
    removalChecks,
    audit,
    transactions,
  );
  const teams = new InMemoryTeamRepository(directory);
  const seekers = new InMemoryTeamSeekerRepository();
  const teamCycles = new CourseCycleTeamCycles(cycles, enrollments);
  const rules = new TeamRules();
  const policy = new TeamAccessPolicy();
  new TeamEnrollmentGuard(removalChecks, teams).onModuleInit();
  return {
    clock,
    cycles,
    enrollments,
    directory,
    audited,
    teams,
    seekers,
    formation: new TeamFormationService(
      teams,
      seekers,
      teamCycles,
      directory,
      rules,
      policy,
      audit,
      transactions,
      clock,
    ),
    queries: new TeamQueryService(
      teams,
      seekers,
      teamCycles,
      directory,
      rules,
      policy,
      clock,
    ),
    completion: new TeamCompletionService(
      teams,
      seekers,
      teamCycles,
      directory,
      rules,
      policy,
      audit,
      transactions,
      clock,
      new SeededRandom(seed),
    ),
  };
}
