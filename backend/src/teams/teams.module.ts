import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CourseCyclesModule } from "../course-cycles/course-cycles.module";
import { UsersModule } from "../users/users.module";
import { StudentDirectory } from "./application/ports/student-directory";
import { TeamCycles } from "./application/ports/team-cycles";
import { TeamSeekerRepository } from "./application/ports/team-seeker.repository";
import { TeamRepository } from "./application/ports/team.repository";
import { TeamCompletionService } from "./application/team-completion.service";
import { TeamCycleMembership } from "./application/team-cycle-membership";
import { TeamEnrollmentGuard } from "./application/team-enrollment-guard";
import { TeamFormationService } from "./application/team-formation.service";
import { TeamQueryService } from "./application/team-query.service";
import { TeamAccessPolicy } from "./domain/team-access.policy";
import { TeamRules } from "./domain/team-rules";
import { CourseCycleTeamCycles } from "./infrastructure/course-cycle-team-cycles";
import { PrismaTeamSeekerRepository } from "./infrastructure/prisma-team-seeker.repository";
import { PrismaTeamRepository } from "./infrastructure/prisma-team.repository";
import { UsersStudentDirectory } from "./infrastructure/users-student-directory";
import { CycleTeamsController } from "./presentation/cycle-teams.controller";
import { TeamCompletionController } from "./presentation/team-completion.controller";
import { TeamsController } from "./presentation/teams.controller";

@Module({
  imports: [CourseCyclesModule, UsersModule, AuditModule],
  controllers: [
    CycleTeamsController,
    TeamsController,
    TeamCompletionController,
  ],
  providers: [
    TeamFormationService,
    TeamQueryService,
    TeamCompletionService,
    TeamEnrollmentGuard,
    TeamCycleMembership,
    TeamRules,
    TeamAccessPolicy,
    { provide: TeamRepository, useClass: PrismaTeamRepository },
    { provide: TeamSeekerRepository, useClass: PrismaTeamSeekerRepository },
    { provide: TeamCycles, useClass: CourseCycleTeamCycles },
    { provide: StudentDirectory, useClass: UsersStudentDirectory },
  ],
  exports: [TeamQueryService],
})
export class TeamsModule {}
