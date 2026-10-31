import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { Role, UserStatus } from "../../auth/domain/role";
import type { FacultyRequestStatus } from "../../auth/application/ports/faculty-directory";
import { IsCleanText } from "../../common/validation/clean-text";

const ROLES: Role[] = ["STUDENT", "FACULTY", "ADMIN", "PENDING_STAFF"];
const STATUSES: UserStatus[] = ["ACTIVE", "DEACTIVATED"];
const REQUEST_STATUSES: FacultyRequestStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
];

export class AddAllowlistEntryDto {
  @ApiProperty({ example: "prakriti.p@nst.rishihood.edu.in" })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: "Prakriti P" })
  @IsOptional()
  @IsString()
  @IsCleanText()
  @MaxLength(120)
  name?: string;
}

export class CorrectBatchDto {
  @ApiProperty({ example: 2024 })
  @IsInt()
  batchYear!: number;
}

export class ListFacultyRequestsQueryDto {
  @ApiPropertyOptional({ enum: REQUEST_STATUSES })
  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: FacultyRequestStatus;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 2023 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  batchYear?: number;

  @ApiPropertyOptional({ description: "nextCursor from the previous page" })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
