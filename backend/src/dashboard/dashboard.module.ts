import { Module } from "@nestjs/common";
import { CourseCyclesModule } from "../course-cycles/course-cycles.module";
import { EvaluationsModule } from "../evaluations/evaluations.module";
import { IdeasModule } from "../ideas/ideas.module";
import { SubmissionsModule } from "../submissions/submissions.module";
import { TeamsModule } from "../teams/teams.module";
import { DashboardService } from "./application/dashboard.service";
import { StudentSources } from "./application/ports/student-sources";
import { ModulesStudentSources } from "./infrastructure/modules-student-sources";
import { DashboardController } from "./presentation/dashboard.controller";

/** A read model of the student's projects (ADR 021). It owns no tables. */
@Module({
  imports: [
    CourseCyclesModule,
    TeamsModule,
    IdeasModule,
    SubmissionsModule,
    EvaluationsModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    { provide: StudentSources, useClass: ModulesStudentSources },
  ],
})
export class DashboardModule {}
