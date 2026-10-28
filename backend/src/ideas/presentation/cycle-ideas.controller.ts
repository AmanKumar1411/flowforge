import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { IdeaService } from "../application/idea.service";
import { CycleIdeaDto } from "./dto/idea-responses.dto";

@ApiTags("ideas")
@Controller("course-cycles/:cycleId/ideas")
export class CycleIdeasController {
  constructor(private readonly ideas: IdeaService) {}

  @Get()
  @Roles("FACULTY", "ADMIN")
  @ApiOperation({
    summary: "Every team of the cycle with its idea",
    description:
      "The owning faculty and admins. Teams without an idea are listed with `idea: null`.",
  })
  @ApiOkResponse({ type: CycleIdeaDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<CycleIdeaDto[]> {
    return (await this.ideas.listForCycle(user, cycleId)).map((row) =>
      CycleIdeaDto.from(row),
    );
  }
}
