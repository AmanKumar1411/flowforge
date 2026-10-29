import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CourseCyclesModule } from "../course-cycles/course-cycles.module";
import { TeamsModule } from "../teams/teams.module";
import { IdeaCatalogService } from "./application/idea-catalog.service";
import { IdeaPublishCheck } from "./application/idea-publish-check";
import { IdeaService } from "./application/idea.service";
import { IdeaCatalogRepository } from "./application/ports/idea-catalog.repository";
import { IdeaTeams } from "./application/ports/idea-teams";
import { IdeaRepository } from "./application/ports/idea.repository";
import { IdeaRules } from "./domain/idea-rules";
import { PrismaIdeaCatalogRepository } from "./infrastructure/prisma-idea-catalog.repository";
import { PrismaIdeaRepository } from "./infrastructure/prisma-idea.repository";
import { TeamsIdeaTeams } from "./infrastructure/teams-idea-teams";
import { CycleIdeasController } from "./presentation/cycle-ideas.controller";
import { IdeaCatalogController } from "./presentation/idea-catalog.controller";
import { IdeasController } from "./presentation/ideas.controller";

@Module({
  imports: [CourseCyclesModule, TeamsModule, AuditModule],
  controllers: [IdeasController, CycleIdeasController, IdeaCatalogController],
  providers: [
    IdeaService,
    IdeaCatalogService,
    IdeaPublishCheck,
    IdeaRules,
    { provide: IdeaRepository, useClass: PrismaIdeaRepository },
    { provide: IdeaCatalogRepository, useClass: PrismaIdeaCatalogRepository },
    { provide: IdeaTeams, useClass: TeamsIdeaTeams },
  ],
  exports: [IdeaService],
})
export class IdeasModule {}
