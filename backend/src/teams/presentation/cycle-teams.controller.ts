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
import { TeamFormationService } from "../application/team-formation.service";
import { TeamQueryService } from "../application/team-query.service";
import { CreateTeamDto, TeamCandidatesQueryDto } from "./dto/team-requests.dto";
import { TeamCandidateDto, TeamResponseDto } from "./dto/team-responses.dto";

/** Team routes that live under a cycle. */
@ApiTags("teams")
@Controller("course-cycles/:cycleId")
export class CycleTeamsController {
  constructor(
    private readonly formation: TeamFormationService,
    private readonly queries: TeamQueryService,
  ) {}

  @Post("teams")
  @Roles("STUDENT")
  @ApiOperation({
    summary: "Create a team; the caller becomes its leader",
    description:
      "The listed members join at once, without an invitation. Size (leader included) must be within the cycle's range, and only before the formation deadline.",
  })
  @ApiCreatedResponse({ type: TeamResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamResponseDto> {
    return TeamResponseDto.from(
      await this.formation.create(user, cycleId, dto),
    );
  }

  @Get("teams")
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary: "Teams of the cycle visible to the caller",
    description:
      "Students: their own team (zero or one). The owning faculty and admins: every team.",
  })
  @ApiOkResponse({ type: TeamResponseDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<TeamResponseDto[]> {
    return (await this.queries.listForCycle(user, cycleId)).map(
      TeamResponseDto.from,
    );
  }

  @Get("team-candidates")
  @Roles("STUDENT")
  @ApiOperation({
    summary: "Search batch-mates by name or email",
    description:
      "Up to 20 active students of the cycle's batch, each marked AVAILABLE, IN_YOUR_TEAM or IN_ANOTHER_TEAM. Only while formation is open.",
  })
  @ApiOkResponse({ type: TeamCandidateDto, isArray: true })
  async searchCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Query() query: TeamCandidatesQueryDto,
  ): Promise<TeamCandidateDto[]> {
    return (await this.queries.searchCandidates(user, cycleId, query.q)).map(
      TeamCandidateDto.from,
    );
  }
}
