import { UserRole } from "../../generated/prisma/client";
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
