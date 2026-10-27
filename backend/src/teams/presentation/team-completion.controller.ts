import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { TeamCompletionService } from "../application/team-completion.service";
import { ApplyAutoGroupDto, FacultyTeamDto } from "./dto/team-requests.dto";
import {
  AutoGroupPreviewDto,
  CompletionOverviewDto,
  TeamResponseDto,
} from "./dto/team-responses.dto";

/** The owning faculty's tools for students without a team, after the students' own deadline. */
@ApiTags("teams")
@Controller("course-cycles/:cycleId/team-completion")
export class TeamCompletionController {
  constructor(private readonly completion: TeamCompletionService) {}

  @Get()
  @Roles("FACULTY", "ADMIN")
  @ApiOperation({
    summary: "Students without a team, and whether completion is open",
  })
  @ApiOkResponse({ type: CompletionOverviewDto })
  async overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<CompletionOverviewDto> {
    return CompletionOverviewDto.from(
      await this.completion.overview(user, cycleId),
    );
  }

  @Post("teams")
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Create a team from students without one, with a chosen leader",
  })
  @ApiCreatedResponse({ type: TeamResponseDto })
  async createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Body() dto: FacultyTeamDto,
  ): Promise<TeamResponseDto> {
    return TeamResponseDto.from(
      await this.completion.createTeam(user, cycleId, dto),
    );
  }

  @Post("auto-group/preview")
  @HttpCode(HttpStatus.OK)
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Propose random teams for everyone without one; saves nothing",
    description:
      "Call again to re-roll. Sizes are as even as possible within the cycle's range.",
  })
  @ApiOkResponse({ type: AutoGroupPreviewDto })
  async previewAutoGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<AutoGroupPreviewDto> {
    return AutoGroupPreviewDto.from(
      await this.completion.previewAutoGroup(user, cycleId),
    );
  }

  @Post("auto-group")
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Create the confirmed auto-group teams, all or none",
    description:
      "Every team is checked like a manual one; if anything changed since the preview, nothing is created (409).",
  })
  @ApiCreatedResponse({ type: TeamResponseDto, isArray: true })
  async applyAutoGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Body() dto: ApplyAutoGroupDto,
  ): Promise<TeamResponseDto[]> {
    return (await this.completion.applyAutoGroup(user, cycleId, dto.teams)).map(
      TeamResponseDto.from,
    );
  }
}
