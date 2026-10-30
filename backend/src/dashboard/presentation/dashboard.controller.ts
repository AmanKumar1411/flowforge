import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { DashboardService } from "../application/dashboard.service";
import { StudentDashboardDto } from "./dto/dashboard.dto";

@ApiTags("dashboard")
@Controller("me")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("dashboard")
  @Roles("STUDENT")
  @ApiOperation({
    summary: "The student's dashboard",
    description:
      "Up next (things to do, then dates), updates from their own teams, and their active and past projects. Computed from existing data (ADR 021); nothing is stored.",
  })
  @ApiOkResponse({ type: StudentDashboardDto })
  async forMe(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentDashboardDto> {
    return StudentDashboardDto.from(await this.dashboard.forStudent(user));
  }
}
