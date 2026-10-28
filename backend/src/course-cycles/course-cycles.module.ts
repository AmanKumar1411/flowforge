import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { CycleAuthorizationPolicy } from "./domain/cycle-authorization-policy";
import { CycleRepository } from "./domain/cycle-repository";
import { CycleWorkflow } from "./domain/cycle-workflow";
import { PrismaCycleRepository } from "./infrastructure/prisma-cycle.repository";
import { CourseCycleService } from "./course-cycle.service";
import { CourseCycleController } from "./course-cycle.controller";
import { CycleBatchController } from "./cycle-batch.controller";
import { CycleEnrollmentController } from "./cycle-enrollment.controller";
import { CycleEnrollmentService } from "./cycle-enrollment.service";
import { EnrollmentRemovalChecks } from "./enrollment-removal-checks";

@Module({
  imports: [AuthModule, UsersModule, AuditModule],
  controllers: [
    CourseCycleController,
    CycleEnrollmentController,
    CycleBatchController,
  ],
  providers: [
    CourseCycleService,
    CycleEnrollmentService,
    EnrollmentRemovalChecks,
    CycleWorkflow,
    CycleAuthorizationPolicy,
    {
      provide: CycleRepository,
      useClass: PrismaCycleRepository,
    },
  ],
  exports: [
    CourseCycleService,
    CycleEnrollmentService,
    EnrollmentRemovalChecks,
  ],
})
export class CourseCyclesModule {}
