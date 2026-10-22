import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CycleAuthorizationPolicy } from "./domain/cycle-authorization-policy";
import { CycleRepository } from "./domain/cycle-repository";
import { CycleWorkflow } from "./domain/cycle-workflow";
import { PrismaCycleRepository } from "./infrastructure/prisma-cycle.repository";
import { CourseCycleService } from "./course-cycle.service";
import { CourseCycleController } from "./course-cycle.controller";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CourseCycleController],
  providers: [
    CourseCycleService,
    JwtAuthGuard,
    CycleWorkflow,
    CycleAuthorizationPolicy,
    RolesGuard,
    {
      provide: CycleRepository,
      useClass: PrismaCycleRepository,
    },
  ],
  exports: [CourseCycleService],
})
export class CourseCyclesModule {}
