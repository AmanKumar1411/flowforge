import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { SubmitWorkDto } from "./dto/submission-requests.dto";
import { SubmissionDto } from "./dto/submission-responses.dto";

@ApiTags("submissions")
@Controller("teams/:teamId/submissions")
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionService) {}

  @Get()
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary: "Every version of the team's work, newest first",
    description: "Members, the cycle's owning faculty and admins.",
  })
  @ApiOkResponse({ type: SubmissionDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
  ): Promise<SubmissionDto[]> {
    return (await this.submissions.list(user, teamId)).map((submission) =>
      SubmissionDto.from(submission),
    );
  }

  @Post()
  @Roles("STUDENT")
  @ApiOperation({
    summary: "Submit a new version (any team member)",
    description:
      "Needs an approved or picked idea, and is open from 'submissions open' until the submission deadline. Each call adds a version; the newest one before the deadline is final.",
  })
  @ApiCreatedResponse({ type: SubmissionDto })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
    @Body() dto: SubmitWorkDto,
  ): Promise<SubmissionDto> {
    return SubmissionDto.from(
      await this.submissions.submit(user, teamId, {
        repositoryUrl: dto.repositoryUrl,
        demoUrl: dto.demoUrl ?? null,
        reportUrl: dto.reportUrl ?? null,
        notes: dto.notes ?? null,
      }),
    );
  }
}
