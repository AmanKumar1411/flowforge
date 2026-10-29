import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";
import { LINK_TYPES, LinkType } from "./link-type";

/** One link in a request or a response. The type is checked against the requirement, not here. */
export class LinkDto {
  @ApiProperty({ enum: LINK_TYPES, example: "GITHUB" })
  @IsString()
  @MaxLength(20)
  type!: string;

  @ApiProperty({
    example: "https://github.com/falcon/lost-and-found",
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  url!: string;
}

export class LinkResponseDto {
  @ApiProperty({ enum: LINK_TYPES })
  type!: LinkType;
  @ApiProperty()
  url!: string;
}
