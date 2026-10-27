import { ApiProperty } from "@nestjs/swagger";
import { RefreshedSession } from "../../application/auth.service";

export class AccessTokenResponseDto {
  @ApiProperty({ description: "Short-lived JWT; keep it in memory only" })
  accessToken!: string;

  @ApiProperty({ example: "Bearer" })
  tokenType!: "Bearer";

  @ApiProperty({
    example: 900,
    description: "Seconds until the access token expires",
  })
  expiresIn!: number;

  static from(session: RefreshedSession): AccessTokenResponseDto {
    const dto = new AccessTokenResponseDto();
    dto.accessToken = session.accessToken;
    dto.tokenType = "Bearer";
    dto.expiresIn = session.expiresInSeconds;
    return dto;
  }
}
