import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CourseCyclesModule } from "../course-cycles/course-cycles.module";
import { TeamsModule } from "../teams/teams.module";
import { IdeaService } from "./application/idea.service";
import { IdeaTeams } from "./application/ports/idea-teams";
import { IdeaRepository } from "./application/ports/idea.repository";
import { IdeaRules } from "./domain/idea-rules";
import { PrismaIdeaRepository } from "./infrastructure/prisma-idea.repository";
import { TeamsIdeaTeams } from "./infrastructure/teams-idea-teams";
import { CycleIdeasController } from "./presentation/cycle-ideas.controller";
import { IdeasController } from "./presentation/ideas.controller";

@Module({
  imports: [CourseCyclesModule, TeamsModule, AuditModule],
  controllers: [IdeasController, CycleIdeasController],
  providers: [
    IdeaService,
    IdeaRules,
    { provide: IdeaRepository, useClass: PrismaIdeaRepository },
    { provide: IdeaTeams, useClass: TeamsIdeaTeams },
  ],
})
export class IdeasModule {}
