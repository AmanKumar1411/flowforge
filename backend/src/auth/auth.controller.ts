import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthResponse, AuthService, JwtPayload } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { AuthenticatedRequest, JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest): JwtPayload {
    return request.user as JwtPayload;
  }
}
