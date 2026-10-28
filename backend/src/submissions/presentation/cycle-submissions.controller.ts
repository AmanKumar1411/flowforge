import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../../auth/application/authenticated-user";
import { CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../../auth/presentation/decorators/roles.decorator";
import { SubmissionService } from "../application/submission.service";
import { CycleSubmissionDto } from "./dto/submission-responses.dto";

@ApiTags("submissions")
@Controller("course-cycles/:cycleId/submissions")
export class CycleSubmissionsController {
  constructor(private readonly submissions: SubmissionService) {}

  @Get()
  @Roles("FACULTY", "ADMIN")
  @ApiOperation({
    summary: "Every team of the cycle with its idea and latest submission",
    description:
      "The owning faculty and admins. Teams without work are listed with `latest: null`.",
  })
  @ApiOkResponse({ type: CycleSubmissionDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<CycleSubmissionDto[]> {
    return (await this.submissions.listForCycle(user, cycleId)).map((row) =>
      CycleSubmissionDto.from(row),
    );
  }
}
