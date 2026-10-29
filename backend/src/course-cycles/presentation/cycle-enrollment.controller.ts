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
import { CycleEnrollmentService } from "../application/cycle-enrollment.service";
import {
  AddEnrollmentsDto,
  EnrolledStudentDto,
  EnrollmentResultDto,
} from "./dto/enrollment.dto";

/** The enrollment list of an elective, managed by the cycle's faculty. */
@ApiTags("course-cycles")
@Controller("course-cycles/:cycleId/enrollments")
@Roles("FACULTY")
export class CycleEnrollmentController {
  constructor(private readonly enrollments: CycleEnrollmentService) {}

  @Get()
  @ApiOperation({ summary: "Students enrolled in the elective" })
  @ApiOkResponse({ type: EnrolledStudentDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<EnrolledStudentDto[]> {
    return (await this.enrollments.list(user, cycleId)).map(
      EnrolledStudentDto.from,
    );
  }

  @Post()
  @ApiOperation({
    summary: "Enroll students by email (paste or CSV)",
    description:
      "Only student emails of this university are accepted; others are listed under `rejected`. Electives only (409 CYCLE_NOT_ELECTIVE).",
  })
  @ApiCreatedResponse({ type: EnrollmentResultDto })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Body() dto: AddEnrollmentsDto,
  ): Promise<EnrollmentResultDto> {
    return EnrollmentResultDto.from(
      await this.enrollments.add(user, cycleId, dto.emails),
    );
  }

  @Delete(":email")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove a student from the elective",
    description:
      "Refused (409 ENROLLED_STUDENT_IN_TEAM) while the student is in a team of this cycle.",
  })
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Param("email") email: string,
  ): Promise<void> {
    return this.enrollments.remove(user, cycleId, email);
  }
}
