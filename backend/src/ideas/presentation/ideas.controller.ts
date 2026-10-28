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
import { IdeaService } from "../application/idea.service";
import { ReviewIdeaDto, SubmitIdeaDto } from "./dto/idea-requests.dto";
import { IdeaResponseDto, TeamIdeaDto } from "./dto/idea-responses.dto";

@ApiTags("ideas")
@Controller("teams/:teamId/idea")
export class IdeasController {
  constructor(private readonly ideas: IdeaService) {}

  @Get()
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary: "The team's idea and its review history",
    description:
      "Members, the cycle's owning faculty and admins. `idea` is null until the leader submits one.",
  })
  @ApiOkResponse({ type: TeamIdeaDto })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
  ): Promise<TeamIdeaDto> {
    return TeamIdeaDto.from(teamId, await this.ideas.get(user, teamId));
  }

  @Put()
  @Roles("STUDENT")
  @ApiOperation({
    summary: "Submit, change or resubmit the idea (leader only)",
    description:
      "First submission and changes while it waits for review: until the idea deadline. After a rejection: until submissions open. An approved idea is final.",
  })
  @ApiOkResponse({ type: IdeaResponseDto })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
    @Body() dto: SubmitIdeaDto,
  ): Promise<IdeaResponseDto> {
    return IdeaResponseDto.from(
      await this.ideas.submit(user, teamId, {
        title: dto.title,
        problem: dto.problem,
        solution: dto.solution,
        link: dto.link ?? null,
      }),
    );
  }

  @Post("review")
  @Roles("FACULTY")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Approve or reject the idea (the cycle's owning faculty)",
    description:
      "Send the version you read. A rejection needs feedback; the team can then resubmit until submissions open.",
  })
  @ApiOkResponse({ type: IdeaResponseDto })
  async review(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
    @Body() dto: ReviewIdeaDto,
  ): Promise<IdeaResponseDto> {
    return IdeaResponseDto.from(await this.ideas.review(user, teamId, dto));
  }
}
