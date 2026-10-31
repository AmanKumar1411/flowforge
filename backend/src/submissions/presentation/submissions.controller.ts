import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { SubmissionService } from "../application/submission.service";
import {
  HISTORY_PAGE_DEFAULT,
  SubmissionHistoryQueryDto,
  SubmitWorkDto,
} from "./dto/submission-requests.dto";
import { SubmissionDto } from "./dto/submission-responses.dto";

@ApiTags("submissions")
@Controller("teams/:teamId/milestones/:milestoneId/submissions")
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionService) {}

  @Get()
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary:
      "The team's versions for a milestone, newest first, a page at a time",
    description:
      "Members, the cycle's owning faculty and admins. 404 MILESTONE_NOT_FOUND for a milestone of another cycle. For the next page, pass the last version you got as `before`.",
  })
  @ApiOkResponse({ type: SubmissionDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
    @Param("milestoneId", new ParseUUIDPipe()) milestoneId: string,
    @Query() query: SubmissionHistoryQueryDto,
  ): Promise<SubmissionDto[]> {
    const page = {
      limit: query.limit ?? HISTORY_PAGE_DEFAULT,
      beforeVersion: query.before,
    };
    return (await this.submissions.list(user, teamId, milestoneId, page)).map(
      (submission) => SubmissionDto.from(submission),
    );
  }

  @Post()
  @Roles("STUDENT")
  @ApiOperation({
    summary: "Submit a new version for a milestone (any team member)",
    description:
      "Needs an approved or picked idea, and is open from the milestone's submissionOpensAt until its submissionDueAt. Links follow the milestone's requirement. Each call adds a version; the newest one before the due date is final.",
  })
  @ApiCreatedResponse({ type: SubmissionDto })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
    @Param("milestoneId", new ParseUUIDPipe()) milestoneId: string,
    @Body() dto: SubmitWorkDto,
  ): Promise<SubmissionDto> {
    return SubmissionDto.from(
      await this.submissions.submit(user, teamId, milestoneId, {
        links: dto.links,
        notes: dto.notes ?? null,
      }),
    );
  }
}
