import { Injectable, OnModuleInit } from "@nestjs/common";
import { PublishChecks } from "../../course-cycles/application/publish-checks";
import { IdeaCatalogRepository } from "./ports/idea-catalog.repository";

/**
 * Plugs into the cycles module's publish checks (ADR 019): a cycle whose
 * ideas come only from the faculty's list needs a list to pick from.
 */
@Injectable()
export class IdeaPublishCheck implements OnModuleInit {
  constructor(
    private readonly checks: PublishChecks,
    private readonly catalog: IdeaCatalogRepository,
  ) {}

  onModuleInit(): void {
    this.checks.register(async (cycle) => {
      if (cycle.ideaSource !== "FACULTY_LIST") return [];
      const ideas = await this.catalog.list(cycle.id);
      return ideas.length > 0
        ? []
        : [
            {
              severity: "BLOCKING",
              code: "IDEA_LIST_EMPTY",
              message:
                "Teams can only pick from your idea list, and it is empty; add ideas or let teams propose their own",
            },
          ];
    });
  }
}
