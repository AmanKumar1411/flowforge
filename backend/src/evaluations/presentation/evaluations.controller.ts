import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { EvaluationService } from "../application/evaluation.service";
import {
  GradingDto,
  MaxMarksDto,
  SaveEvaluationDto,
  TeamEvaluationDto,
} from "./dto/evaluation.dto";

const uuid = () => new ParseUUIDPipe();

@ApiTags("evaluations")
@Controller("course-cycles/:cycleId/milestones/:milestoneId")
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationService) {}

  @Get("grading")
  // Students reach the policy so they get 404, like any hidden resource.
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary:
      "A milestone's grading: scale, release, and every team's evaluation and latest work",
    description: "The owning faculty and admins (read-only). Anyone else: 404.",
  })
  @ApiOkResponse({ type: GradingDto })
  async grading(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", uuid()) cycleId: string,
    @Param("milestoneId", uuid()) milestoneId: string,
  ): Promise<GradingDto> {
    return GradingDto.from(
      await this.evaluations.gradingView(user, cycleId, milestoneId),
    );
  }

  @Put("grading")
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Set what the milestone is marked out of",
    description:
      "Owner, until the project closes; never below a mark already given (409 MAX_MARKS_BELOW_EXISTING).",
  })
  @ApiOkResponse({ type: GradingDto })
  async setMaxMarks(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", uuid()) cycleId: string,
    @Param("milestoneId", uuid()) milestoneId: string,
    @Body() dto: MaxMarksDto,
  ): Promise<GradingDto> {
    return GradingDto.from(
      await this.evaluations.setMaxMarks(
        user,
        cycleId,
        milestoneId,
        dto.maxMarks,
      ),
    );
  }

  @Post("grading/release")
  @HttpCode(HttpStatus.OK)
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Release the milestone's results to every team at once",
    description:
      "Owner, from the due date; one-way (409 ALREADY_RELEASED); needs a graded team (409 NOTHING_TO_RELEASE).",
  })
  @ApiOkResponse({ type: GradingDto })
  async release(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", uuid()) cycleId: string,
    @Param("milestoneId", uuid()) milestoneId: string,
  ): Promise<GradingDto> {
    return GradingDto.from(
      await this.evaluations.release(user, cycleId, milestoneId),
    );
  }

  @Put("teams/:teamId/evaluation")
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Mark a team and/or give feedback",
    description:
      "Owner, from the due date while published. Each save is a new version; send expectedVersion once it exists (409 EVALUATION_CHANGED otherwise).",
  })
  @ApiOkResponse({ type: TeamEvaluationDto })
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", uuid()) cycleId: string,
    @Param("milestoneId", uuid()) milestoneId: string,
    @Param("teamId", uuid()) teamId: string,
    @Body() dto: SaveEvaluationDto,
  ): Promise<TeamEvaluationDto> {
    return TeamEvaluationDto.from(
      await this.evaluations.saveEvaluation(
        user,
        cycleId,
        milestoneId,
        teamId,
        dto,
      ),
    );
  }

  @Get("teams/:teamId/evaluations")
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary: "A team's evaluation for the milestone (a list of 0 or 1)",
    description:
      "Members: only once released, and only their own team (before release: an empty list). Owner and admins: always. Anyone else: 404.",
  })
  @ApiOkResponse({ type: TeamEvaluationDto, isArray: true })
  async teamEvaluations(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", uuid()) cycleId: string,
    @Param("milestoneId", uuid()) milestoneId: string,
    @Param("teamId", uuid()) teamId: string,
  ): Promise<TeamEvaluationDto[]> {
    return (
      await this.evaluations.teamEvaluations(user, cycleId, milestoneId, teamId)
    ).map((view) => TeamEvaluationDto.from(view));
  }
}
