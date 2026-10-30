import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CourseCyclesModule } from "../course-cycles/course-cycles.module";
import { SubmissionsModule } from "../submissions/submissions.module";
import { TeamsModule } from "../teams/teams.module";
import { EvaluationService } from "./application/evaluation.service";
import { EvaluationRepository } from "./application/ports/evaluation.repository";
import { GradingSources } from "./application/ports/grading-sources";
import { EvaluationPolicy } from "./domain/evaluation-policy";
import { EvaluationRules } from "./domain/evaluation-rules";
import { ModulesGradingSources } from "./infrastructure/modules-grading-sources";
import { PrismaEvaluationRepository } from "./infrastructure/prisma-evaluation.repository";
import { EvaluationsController } from "./presentation/evaluations.controller";

@Module({
  imports: [CourseCyclesModule, TeamsModule, SubmissionsModule, AuditModule],
  controllers: [EvaluationsController],
  providers: [
    EvaluationService,
    EvaluationRules,
    EvaluationPolicy,
    { provide: EvaluationRepository, useClass: PrismaEvaluationRepository },
    { provide: GradingSources, useClass: ModulesGradingSources },
  ],
  exports: [EvaluationService],
})
export class EvaluationsModule {}
