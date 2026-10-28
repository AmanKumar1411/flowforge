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
import {
  PickIdeaDto,
  ReviewIdeaDto,
  SubmitIdeaDto,
} from "./dto/idea-requests.dto";
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
    summary: "Submit, change or resubmit the team's own proposal (leader only)",
    description:
      "First submission and changes while it waits for review: until the idea deadline. After a rejection: any number of rounds while the cycle is published. An approved idea is final.",
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

  @Post("pick")
  @Roles("STUDENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Pick an idea from the faculty's catalog (leader only)",
    description:
      "The pick is approved at once and final. Allowed when a proposal could be saved: as the first idea before the idea deadline, instead of a waiting proposal until then, or after a rejection.",
  })
  @ApiOkResponse({ type: IdeaResponseDto })
  async pick(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
    @Body() dto: PickIdeaDto,
  ): Promise<IdeaResponseDto> {
    return IdeaResponseDto.from(
      await this.ideas.pick(user, teamId, dto.catalogIdeaId),
    );
  }

  @Post("review")
  @Roles("FACULTY")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Approve or reject the idea (the cycle's owning faculty)",
    description:
      "Send the version you read. A rejection needs feedback; the team then revises or picks from the catalog, for as many rounds as it takes.",
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
