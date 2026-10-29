import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CourseCyclesModule } from "../course-cycles/course-cycles.module";
import { IdeasModule } from "../ideas/ideas.module";
import { SubmissionService } from "./application/submission.service";
import { SubmissionTeams } from "./application/ports/submission-teams";
import { SubmissionRepository } from "./application/ports/submission.repository";
import { SubmissionRules } from "./domain/submission-rules";
import { IdeasSubmissionTeams } from "./infrastructure/ideas-submission-teams";
import { PrismaSubmissionRepository } from "./infrastructure/prisma-submission.repository";
import { CycleSubmissionsController } from "./presentation/cycle-submissions.controller";
import { SubmissionsController } from "./presentation/submissions.controller";

@Module({
  imports: [IdeasModule, CourseCyclesModule, AuditModule],
  controllers: [SubmissionsController, CycleSubmissionsController],
  providers: [
    SubmissionService,
    SubmissionRules,
    { provide: SubmissionRepository, useClass: PrismaSubmissionRepository },
    { provide: SubmissionTeams, useClass: IdeasSubmissionTeams },
  ],
})
export class SubmissionsModule {}
