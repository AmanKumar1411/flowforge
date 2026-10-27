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
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUser } from "../auth/application/authenticated-user";
import { FacultyAccessService } from "../auth/application/faculty-access.service";
import { CurrentUser } from "../auth/presentation/decorators/current-user.decorator";
import { Roles } from "../auth/presentation/decorators/roles.decorator";
import { AdminService } from "./admin.service";
import {
  AddAllowlistEntryDto,
  CorrectBatchDto,
  ListFacultyRequestsQueryDto,
  ListUsersQueryDto,
} from "./dto/admin-requests.dto";
import {
  AdminUserDto,
  AllowlistEntryDto,
  FacultyRequestDto,
  UserPageDto,
} from "./dto/admin-responses.dto";

const DEFAULT_PAGE_SIZE = 50;

@ApiTags("admin")
@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  constructor(
    private readonly facultyAccess: FacultyAccessService,
    private readonly admin: AdminService,
  ) {}

  @Get("faculty-allowlist")
  @ApiOperation({ summary: "List approved faculty emails" })
  @ApiOkResponse({ type: AllowlistEntryDto, isArray: true })
  async listAllowlist(): Promise<AllowlistEntryDto[]> {
    return (await this.facultyAccess.listAllowlist()).map(
      AllowlistEntryDto.from,
    );
  }

  @Post("faculty-allowlist")
  @ApiOperation({
    summary: "Add a staff email to the faculty allowlist",
    description:
      "Rejects student emails (STUDENT_EMAIL_CANNOT_BE_ELEVATED) and non-staff emails (INVALID_STAFF_EMAIL). A waiting PENDING_STAFF user with this email becomes FACULTY.",
  })
  @ApiCreatedResponse({ type: AllowlistEntryDto })
  async addToAllowlist(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AddAllowlistEntryDto,
  ): Promise<AllowlistEntryDto> {
    return AllowlistEntryDto.from(
      await this.facultyAccess.addToAllowlist(
        actor.id,
        dto.email,
        dto.name?.trim() || null,
      ),
    );
  }

  @Delete("faculty-allowlist/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove a faculty allowlist entry",
    description:
      "A FACULTY user with this email returns to PENDING_STAFF and their tokenVersion moves, so their access token stops working immediately.",
  })
  @ApiNoContentResponse()
  removeFromAllowlist(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.facultyAccess.removeFromAllowlist(actor.id, id);
  }

  @Get("faculty-requests")
  @ApiOperation({ summary: "List faculty access requests, oldest first" })
  @ApiOkResponse({ type: FacultyRequestDto, isArray: true })
  async listRequests(
    @Query() query: ListFacultyRequestsQueryDto,
  ): Promise<FacultyRequestDto[]> {
    return (await this.facultyAccess.listRequests(query.status)).map(
      FacultyRequestDto.from,
    );
  }

  @Post("faculty-requests/:id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Approve a request: allowlist the email and make the user FACULTY",
  })
  @ApiOkResponse({ type: FacultyRequestDto })
  async approveRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<FacultyRequestDto> {
    return FacultyRequestDto.from(
      await this.facultyAccess.approveRequest(actor.id, id),
    );
  }

  @Post("faculty-requests/:id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject a pending request" })
  @ApiOkResponse({ type: FacultyRequestDto })
  async rejectRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<FacultyRequestDto> {
    return FacultyRequestDto.from(
      await this.facultyAccess.rejectRequest(actor.id, id),
    );
  }

  @Get("users")
  @ApiOperation({ summary: "List users, newest first, with cursor pagination" })
  @ApiOkResponse({ type: UserPageDto })
  async listUsers(@Query() query: ListUsersQueryDto): Promise<UserPageDto> {
    return UserPageDto.from(
      await this.admin.listUsers({
        ...query,
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
      }),
    );
  }

  @Patch("users/:id/batch")
  @ApiOperation({ summary: "Correct a student's batch year" })
  @ApiOkResponse({ type: AdminUserDto })
  async correctBatch(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CorrectBatchDto,
  ): Promise<AdminUserDto> {
    return AdminUserDto.from(
      await this.admin.correctBatch(actor.id, id, dto.batchYear),
    );
  }

  @Post("users/:id/deactivate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Deactivate a user and end all their sessions",
    description: "Admins cannot deactivate themselves.",
  })
  @ApiOkResponse({ type: AdminUserDto })
  async deactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<AdminUserDto> {
    return AdminUserDto.from(await this.admin.deactivate(actor.id, id));
  }

  @Post("users/:id/reactivate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reactivate a user" })
  @ApiOkResponse({ type: AdminUserDto })
  async reactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<AdminUserDto> {
    return AdminUserDto.from(await this.admin.reactivate(actor.id, id));
  }
}
