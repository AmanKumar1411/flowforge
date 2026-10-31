import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { CommonModule } from "./common/common.module";
import { AppConfigModule } from "./config/app-config.module";
import { validateEnvironment } from "./config/env.validation";
import { CourseCyclesModule } from "./course-cycles/course-cycles.module";
import { PrismaModule } from "./prisma/prisma.module";
import { IdeasModule } from "./ideas/ideas.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { EvaluationsModule } from "./evaluations/evaluations.module";
import { HealthModule } from "./health/health.module";
import { TeamsModule } from "./teams/teams.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AppConfigModule,
    CommonModule,
    PrismaModule,
    AuthModule,
    AdminModule,
    CourseCyclesModule,
    TeamsModule,
    IdeasModule,
    SubmissionsModule,
    EvaluationsModule,
    DashboardModule,
    HealthModule,
  ],
})
export class AppModule {}
