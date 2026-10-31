import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { TEAM_SIZE_LIMIT } from "../../../course-cycles/domain/cycle.types";
import { IsCleanText } from "../../../common/validation/clean-text";

const NAME_MAX_LENGTH = 60;
// Letters, digits, spaces and the punctuation found in names and emails. No LIKE wildcards (% _).
const SEARCH_PATTERN = /^[\p{L}\p{M}\p{N} .@'-]+$/u;

export class CreateTeamDto {
  @ApiProperty({ example: "Team Falcon", maxLength: NAME_MAX_LENGTH })
  @IsString()
  @IsCleanText()
  @Matches(/\S/, { message: "name must not be blank" })
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({
    type: [String],
    description:
      "The other members' user ids. The caller is the leader and counts toward the team size.",
    example: ["1b4e28ba-2fa1-11d2-883f-0016d3cca427"],
  })
  @IsArray()
  @ArrayMaxSize(TEAM_SIZE_LIMIT)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  memberIds!: string[];
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: "Team Falcon", maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @IsCleanText()
  @Matches(/\S/, { message: "name must not be blank" })
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "The complete list of other members after the change. The leader always stays.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TEAM_SIZE_LIMIT)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  memberIds?: string[];
}

export class TeamCandidatesQueryDto {
  @ApiProperty({
    example: "neha",
    description:
      "Part of a name, or the start of an email; at least 2 characters",
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsCleanText()
  @MinLength(2)
  @MaxLength(100)
  @Matches(SEARCH_PATTERN, {
    message: "q may contain letters, digits, spaces and . @ ' - only",
  })
  q!: string;
}

export class LookingForTeamDto {
  @ApiPropertyOptional({
    example: "Good at backend; free on weekends",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @IsCleanText()
  @MaxLength(200)
  note?: string;
}

/** A team the faculty create: by hand, or confirmed from an auto-group preview. */
export class FacultyTeamDto {
  @ApiProperty({ example: "Auto team 1", maxLength: NAME_MAX_LENGTH })
  @IsString()
  @IsCleanText()
  @Matches(/\S/, { message: "name must not be blank" })
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({ description: "The student who leads the team; never changes" })
  @IsUUID("all")
  leaderId!: string;

  @ApiProperty({ type: [String], description: "The other members" })
  @IsArray()
  @ArrayMaxSize(TEAM_SIZE_LIMIT)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  memberIds!: string[];
}

export class AddTeamMemberDto {
  @ApiProperty()
  @IsUUID("all")
  userId!: string;
}

export class ApplyAutoGroupDto {
  @ApiProperty({ type: FacultyTeamDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FacultyTeamDto)
  teams!: FacultyTeamDto[];
}
