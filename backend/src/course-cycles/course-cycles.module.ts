import { Module } from "@nestjs/common";
import { CycleAuthorizationPolicy } from "./domain/cycle-authorization-policy";
import { CycleRepository } from "./domain/cycle-repository";
import { CycleWorkflow } from "./domain/cycle-workflow";
import { PrismaCycleRepository } from "./infrastructure/prisma-cycle.repository";
import { CourseCycleService } from "./course-cycle.service";
import { CourseCycleController } from "./course-cycle.controller";

@Module({
  controllers: [CourseCycleController],
  providers: [
    CourseCycleService,
    CycleWorkflow,
    CycleAuthorizationPolicy,
    {
      provide: CycleRepository,
      useClass: PrismaCycleRepository,
    },
  ],
  exports: [CourseCycleService],
})
export class CourseCyclesModule {}
