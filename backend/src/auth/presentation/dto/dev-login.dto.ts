import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { IsCleanText } from "../../../common/validation/clean-text";

export class DevLoginDto {
  @ApiProperty({ example: "rahul.25csai@nst.rishihood.edu.in" })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: "Rahul" })
  @IsString()
  @IsCleanText()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
