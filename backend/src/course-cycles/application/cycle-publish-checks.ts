import { Injectable, OnModuleInit } from "@nestjs/common";
import { UsersService } from "../../users/users.service";
import { CycleWorkflow } from "../domain/cycle-workflow";
import { CycleRepository } from "./ports/cycle.repository";
import { PublishChecks } from "./publish-checks";

/** What publishing needs from the cycle itself: a valid schedule with milestones, and students. */
@Injectable()
export class CyclePublishChecks implements OnModuleInit {
  constructor(
    private readonly checks: PublishChecks,
    private readonly workflow: CycleWorkflow,
    private readonly repository: CycleRepository,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.checks.register(async (cycle) =>
      this.workflow
        .publishProblems(cycle)
        .map((problem) => ({ ...problem, severity: "BLOCKING" as const })),
    );
    this.checks.register(async (cycle, tx) => {
      if (cycle.kind !== "ELECTIVE") return [];
      const enrolled = await this.repository.listEnrollments(cycle.id, tx);
      return enrolled.length > 0
        ? []
        : [
            {
              severity: "BLOCKING",
              code: "ROSTER_EMPTY",
              message:
                "Enroll the elective's students first: only they can see it",
            },
          ];
    });
    this.checks.register(async (cycle) => {
      if (cycle.kind !== "CORE") return [];
      const students = await this.users.listActiveStudents({
        batchYear: cycle.batchYear,
      });
      return students.length > 0
        ? []
        : [
            {
              severity: "WARNING",
              code: "NO_STUDENTS_YET",
              message: `No student of batch ${cycle.batchYear} has signed in or been registered yet; they see the project once they do`,
            },
          ];
    });
  }
}
