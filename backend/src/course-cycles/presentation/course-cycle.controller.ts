import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CourseCycleService } from "../application/course-cycle.service";
import { CreateCycleDto } from "./dto/create-cycle.dto";
import {
  CycleResponseDto,
  PublishChecksDto,
  PublishResponseDto,
} from "./dto/cycle-response.dto";
import { UpdateCycleDto } from "./dto/update-cycle.dto";

@ApiTags("course-cycles")
@Controller("course-cycles")
export class CourseCycleController {
  constructor(private readonly cycles: CourseCycleService) {}

  @Post()
  @Roles("FACULTY")
  @ApiOperation({ summary: "Create a draft cycle owned by the caller" })
  @ApiCreatedResponse({ type: CycleResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCycleDto,
  ): Promise<CycleResponseDto> {
    return this.cycles.create(user, dto);
  }

  @Get()
  @Roles("STUDENT", "ADMIN")
  @ApiOperation({
    summary: "Cycles visible to the caller",
    description:
      "Students: published cycles of their own batch. Admins: every published or closed cycle, read-only.",
  })
  @ApiOkResponse({ type: CycleResponseDto, isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<CycleResponseDto[]> {
    return this.cycles.listVisible(user);
  }

  @Get("my")
  @Roles("FACULTY")
  @ApiOperation({ summary: "The caller's own cycles in every state" })
  @ApiOkResponse({ type: CycleResponseDto, isArray: true })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CycleResponseDto[]> {
    return this.cycles.listMine(user);
  }

  @Get(":id")
  @Roles("STUDENT", "FACULTY", "ADMIN")
  @ApiOperation({
    summary: "Read one cycle",
    description:
      "404 CYCLE_NOT_FOUND when the caller may not see it: another faculty's cycle, another batch, or a draft.",
  })
  @ApiOkResponse({ type: CycleResponseDto })
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<CycleResponseDto> {
    return this.cycles.findById(user, id);
  }

  @Patch(":id")
  @Roles("FACULTY")
  @ApiOperation({ summary: "Edit the fields the cycle's state allows" })
  @ApiOkResponse({ type: CycleResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCycleDto,
  ): Promise<CycleResponseDto> {
    return this.cycles.update(user, id, dto);
  }

  @Get(":id/publish-checks")
  @Roles("FACULTY")
  @ApiOperation({
    summary: "What publishing an owned draft would report now",
    description:
      "Runs every publish check without publishing: blocking problems and warnings, each with a code.",
  })
  @ApiOkResponse({ type: PublishChecksDto })
  checkPublish(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<PublishChecksDto> {
    return this.cycles.checkPublish(user, id);
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @Roles("FACULTY")
  @ApiOperation({
    summary: "Publish an owned draft",
    description:
      "Runs every publish check. Any blocking one stops it with 409 PUBLISH_BLOCKED, listing all of them in details ({ code, message }). Warnings come back with the published cycle.",
  })
  @ApiOkResponse({ type: PublishResponseDto })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<PublishResponseDto> {
    return this.cycles.publish(user, id);
  }

  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  @Roles("FACULTY")
  @ApiOperation({ summary: "Close an owned published cycle" })
  @ApiOkResponse({ type: CycleResponseDto })
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<CycleResponseDto> {
    return this.cycles.close(user, id);
  }
}
