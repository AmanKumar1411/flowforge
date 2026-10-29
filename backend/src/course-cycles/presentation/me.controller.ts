import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { CourseCycleService } from "../application/course-cycle.service";
import { UpcomingEventDto } from "./dto/cycle-response.dto";

@ApiTags("course-cycles")
@Controller("me")
export class MeController {
  constructor(private readonly cycles: CourseCycleService) {}

  @Get("upcoming")
  @Roles("STUDENT")
  @ApiOperation({
    summary: "What comes next in the caller's projects",
    description:
      "Deadlines, submission windows and evaluations of the student's visible cycles, soonest first, at most 10. Computed from the dates; nothing is stored.",
  })
  @ApiOkResponse({ type: UpcomingEventDto, isArray: true })
  upcoming(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UpcomingEventDto[]> {
    return this.cycles.upcomingFor(user);
  }
}
