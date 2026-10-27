import { ApiProperty } from "@nestjs/swagger";
import type {
  FacultyAccessRequest,
  FacultyAccessRequestWithUser,
  FacultyAllowlistEntry,
  FacultyAllowlistSource,
  FacultyRequestStatus,
} from "../../auth/application/ports/faculty-directory";
import type { Role, UserStatus } from "../../auth/domain/role";
import type { User, UserPage } from "../../users/domain/user";

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ["STUDENT", "FACULTY", "ADMIN", "PENDING_STAFF"] })
  role!: Role;
  @ApiProperty({ enum: ["ACTIVE", "DEACTIVATED"] }) status!: UserStatus;
  @ApiProperty({ type: Number, nullable: true }) batchYear!: number | null;
  @ApiProperty({ type: String, nullable: true }) lastLoginAt!: string | null;
  @ApiProperty() createdAt!: string;

  static from(user: User): AdminUserDto {
    return Object.assign(new AdminUserDto(), {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      batchYear: user.batchYear,
      lastLoginAt: iso(user.lastLoginAt),
      createdAt: user.createdAt.toISOString(),
    });
  }
}

export class UserPageDto {
  @ApiProperty({ type: AdminUserDto, isArray: true }) items!: AdminUserDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;

  static from(page: UserPage): UserPageDto {
    return Object.assign(new UserPageDto(), {
      items: page.items.map(AdminUserDto.from),
      nextCursor: page.nextCursor,
    });
  }
}

export class AllowlistEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ enum: ["MANUAL", "APPROVED_REQUEST", "CSV_IMPORT"] })
  source!: FacultyAllowlistSource;
  @ApiProperty() addedById!: string;
  @ApiProperty() createdAt!: string;

  static from(entry: FacultyAllowlistEntry): AllowlistEntryDto {
    return Object.assign(new AllowlistEntryDto(), {
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    });
  }
}

export class FacultyRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ required: false }) userName?: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ["PENDING", "APPROVED", "REJECTED"] })
  status!: FacultyRequestStatus;
  @ApiProperty({ type: String, nullable: true }) decidedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) decidedAt!: string | null;
  @ApiProperty() createdAt!: string;

  static from(
    request: FacultyAccessRequest | FacultyAccessRequestWithUser,
  ): FacultyRequestDto {
    return Object.assign(new FacultyRequestDto(), {
      ...request,
      decidedAt: iso(request.decidedAt),
      createdAt: request.createdAt.toISOString(),
    });
  }
}
