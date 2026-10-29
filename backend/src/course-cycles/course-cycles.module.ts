import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { Clock } from "../common/clock";
import { UsersModule } from "../users/users.module";
import { CourseCycleService } from "./application/course-cycle.service";
import { CycleEnrollmentService } from "./application/cycle-enrollment.service";
import { CyclePublishChecks } from "./application/cycle-publish-checks";
import { EnrollmentRemovalChecks } from "./application/enrollment-removal-checks";
import { CycleRepository } from "./application/ports/cycle.repository";
import { PublishChecks } from "./application/publish-checks";
import { CycleAuthorizationPolicy } from "./domain/cycle-authorization-policy";
import { CycleTimeline } from "./domain/cycle-timeline";
import { CycleWorkflow } from "./domain/cycle-workflow";
import { PrismaCycleRepository } from "./infrastructure/prisma-cycle.repository";
import { CourseCycleController } from "./presentation/course-cycle.controller";
import { CycleBatchController } from "./presentation/cycle-batch.controller";
import { CycleEnrollmentController } from "./presentation/cycle-enrollment.controller";
import { MeController } from "./presentation/me.controller";

@Module({
  imports: [AuthModule, UsersModule, AuditModule],
  controllers: [
    CourseCycleController,
    CycleEnrollmentController,
    CycleBatchController,
    MeController,
  ],
  providers: [
    CourseCycleService,
    CycleEnrollmentService,
    EnrollmentRemovalChecks,
    PublishChecks,
    CyclePublishChecks,
    CycleWorkflow,
    CycleAuthorizationPolicy,
    {
      provide: CycleTimeline,
      useFactory: (clock: Clock) => new CycleTimeline(clock),
      inject: [Clock],
    },
    {
      provide: CycleRepository,
      useClass: PrismaCycleRepository,
    },
  ],
  exports: [
    CourseCycleService,
    CycleEnrollmentService,
    EnrollmentRemovalChecks,
    PublishChecks,
  ],
})
export class CourseCyclesModule {}
