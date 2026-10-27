import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CourseCyclesModule } from "../course-cycles/course-cycles.module";
import { UsersModule } from "../users/users.module";
import { StudentDirectory } from "./application/ports/student-directory";
import { TeamCycles } from "./application/ports/team-cycles";
import { TeamRepository } from "./application/ports/team.repository";
import { TeamFormationService } from "./application/team-formation.service";
import { TeamQueryService } from "./application/team-query.service";
import { TeamAccessPolicy } from "./domain/team-access.policy";
import { TeamRules } from "./domain/team-rules";
import { CourseCycleTeamCycles } from "./infrastructure/course-cycle-team-cycles";
import { PrismaTeamRepository } from "./infrastructure/prisma-team.repository";
import { UsersStudentDirectory } from "./infrastructure/users-student-directory";
import { CycleTeamsController } from "./presentation/cycle-teams.controller";
import { TeamsController } from "./presentation/teams.controller";

@Module({
  imports: [CourseCyclesModule, UsersModule, AuditModule],
  controllers: [CycleTeamsController, TeamsController],
  providers: [
    TeamFormationService,
    TeamQueryService,
    TeamRules,
    TeamAccessPolicy,
    { provide: TeamRepository, useClass: PrismaTeamRepository },
    { provide: TeamCycles, useClass: CourseCycleTeamCycles },
    { provide: StudentDirectory, useClass: UsersStudentDirectory },
  ],
})
export class TeamsModule {}
