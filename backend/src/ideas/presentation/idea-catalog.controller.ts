import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { IdeaCatalogService } from "../application/idea-catalog.service";
import { CatalogIdeaRequestDto } from "./dto/idea-requests.dto";
import { CatalogIdeaDto } from "./dto/idea-responses.dto";

@ApiTags("ideas")
@Controller("course-cycles/:cycleId/idea-catalog")
export class IdeaCatalogController {
  constructor(private readonly catalog: IdeaCatalogService) {}

  @Get()
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary: "The faculty's list of ideas for the cycle",
    description:
      "Anyone who can see the cycle. Any number of teams can pick the same idea; `pickCount` says how many did.",
  })
  @ApiOkResponse({ type: CatalogIdeaDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<CatalogIdeaDto[]> {
    return (await this.catalog.list(user, cycleId)).map((idea) =>
      CatalogIdeaDto.from(idea),
    );
  }

  @Post()
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Add an idea (owning faculty, until the cycle closes)",
  })
  @ApiCreatedResponse({ type: CatalogIdeaDto })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Body() dto: CatalogIdeaRequestDto,
  ): Promise<CatalogIdeaDto> {
    return CatalogIdeaDto.from(
      await this.catalog.add(user, cycleId, {
        title: dto.title,
        description: dto.description,
        link: dto.link ?? null,
      }),
    );
  }

  @Put(":ideaId")
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Change an idea (owning faculty)",
    description: "Teams that already picked it keep the version they picked.",
  })
  @ApiOkResponse({ type: CatalogIdeaDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Param("ideaId", new ParseUUIDPipe()) ideaId: string,
    @Body() dto: CatalogIdeaRequestDto,
  ): Promise<CatalogIdeaDto> {
    return CatalogIdeaDto.from(
      await this.catalog.update(user, cycleId, ideaId, {
        title: dto.title,
        description: dto.description,
        link: dto.link ?? null,
      }),
    );
  }

  @Delete(":ideaId")
  @Roles("FACULTY")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove an idea (owning faculty)",
    description: "Only while no team has picked it (409 CATALOG_IDEA_PICKED).",
  })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Param("ideaId", new ParseUUIDPipe()) ideaId: string,
  ): Promise<void> {
    await this.catalog.remove(user, cycleId, ideaId);
  }
}
