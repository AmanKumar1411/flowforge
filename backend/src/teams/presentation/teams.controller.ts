import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { TeamFormationService } from "../application/team-formation.service";
import { TeamQueryService } from "../application/team-query.service";
import { UpdateTeamDto } from "./dto/team-requests.dto";
import { TeamResponseDto } from "./dto/team-responses.dto";

@ApiTags("teams")
@Controller("teams")
export class TeamsController {
  constructor(
    private readonly formation: TeamFormationService,
    private readonly queries: TeamQueryService,
  ) {}

  // Declared before ":teamId" so "mine" is never parsed as an id.
  @Get("mine")
  @Roles("STUDENT")
  @ApiOperation({ summary: "Every team the caller belongs to, across cycles" })
  @ApiOkResponse({ type: TeamResponseDto, isArray: true })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeamResponseDto[]> {
    return (await this.queries.listMine(user)).map(TeamResponseDto.from);
  }

  @Get(":teamId")
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary: "Read one team",
    description:
      "Members, the cycle's owning faculty and admins. Anyone else gets 404 TEAM_NOT_FOUND.",
  })
  @ApiOkResponse({ type: TeamResponseDto })
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
  ): Promise<TeamResponseDto> {
    return TeamResponseDto.from(await this.queries.findById(user, teamId));
  }

  @Patch(":teamId")
  @Roles("STUDENT")
  @ApiOperation({
    summary: "Rename the team or replace its members (leader only)",
    description:
      "memberIds is the complete list of other members. Only before the formation deadline; the leader always stays.",
  })
  @ApiOkResponse({ type: TeamResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamResponseDto> {
    return TeamResponseDto.from(await this.formation.update(user, teamId, dto));
  }

  @Delete(":teamId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles("STUDENT")
  @ApiOperation({
    summary: "Disband the team (leader only, before the formation deadline)",
  })
  @ApiNoContentResponse()
  disband(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId", new ParseUUIDPipe()) teamId: string,
  ): Promise<void> {
    return this.formation.disband(user, teamId);
  }
}
