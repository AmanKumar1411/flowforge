import { ApiProperty } from "@nestjs/swagger";
import type { Role } from "../../domain/role";
import { CurrentUserProfile } from "../../application/auth.service";
import type { FacultyRequestStatus } from "../../application/ports/faculty-directory";

export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "aman.k23csai@nst.rishihood.edu.in" })
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ["STUDENT", "FACULTY", "ADMIN", "PENDING_STAFF"] })
  role!: Role;

  @ApiProperty({ type: Number, nullable: true, example: 2023 })
  batchYear!: number | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({
    enum: ["PENDING", "APPROVED", "REJECTED"],
    nullable: true,
    description: "Only set for PENDING_STAFF users",
  })
  facultyRequestStatus!: FacultyRequestStatus | null;

  static from(profile: CurrentUserProfile): MeResponseDto {
    return Object.assign(new MeResponseDto(), profile);
  }
}
