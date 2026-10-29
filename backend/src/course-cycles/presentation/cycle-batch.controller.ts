import {
  Body,
  Controller,
  Get,
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
import { CycleEnrollmentService } from "../application/cycle-enrollment.service";
import {
  AddEnrollmentsDto,
  BatchImportResultDto,
  BatchStudentDto,
} from "./dto/enrollment.dto";

/** The batch list of a core cycle: its students, including those who have not signed in yet. */
@ApiTags("course-cycles")
@Controller("course-cycles/:cycleId/batch-students")
@Roles("FACULTY")
export class CycleBatchController {
  constructor(private readonly enrollments: CycleEnrollmentService) {}

  @Get()
  @ApiOperation({
    summary: "Students of the core cycle's batch",
    description:
      "Signed in or pre-registered. Core cycles only (409 CYCLE_NOT_CORE).",
  })
  @ApiOkResponse({ type: BatchStudentDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
  ): Promise<BatchStudentDto[]> {
    return (await this.enrollments.listBatch(user, cycleId)).map(
      BatchStudentDto.from,
    );
  }

  @Post()
  @ApiOperation({
    summary: "Register the batch's students by email (paste or CSV)",
    description:
      "Creates accounts for students of this batch who have not signed in yet, so they can be placed in teams. Other batches, staff and unknown emails are listed under `rejected`.",
  })
  @ApiCreatedResponse({ type: BatchImportResultDto })
  async import(
    @CurrentUser() user: AuthenticatedUser,
    @Param("cycleId", new ParseUUIDPipe()) cycleId: string,
    @Body() dto: AddEnrollmentsDto,
  ): Promise<BatchImportResultDto> {
    return BatchImportResultDto.from(
      await this.enrollments.importBatch(user, cycleId, dto.emails),
    );
  }
}
