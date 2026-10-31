import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import { Request, Response } from "express";
import { DomainError } from "../../common/errors/domain-error";
import { OriginGuard } from "../../common/http/origin.guard";
import { AppConfig } from "../../config/app-config";
import { AuthenticatedUser } from "../application/authenticated-user";
import { AuthService } from "../application/auth.service";
import { DemoAccountsService } from "../application/demo-accounts.service";
import { AuthCookies, REFRESH_COOKIE } from "./auth-cookies";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { ALL_ROLES, Roles } from "./decorators/roles.decorator";
import { AccessTokenResponseDto } from "./dto/access-token-response.dto";
import { DemoAccountDto } from "./dto/demo-account.dto";
import { DevLoginDto } from "./dto/dev-login.dto";
import { DevLoginGuard } from "./guards/dev-login.guard";
import { MeResponseDto } from "./dto/me-response.dto";

/** Refresh answers that mean the session is over; anything else leaves the cookie in place. */
const SESSION_ENDED = new Set<string>([
  "UNAUTHENTICATED",
  "INVALID_REFRESH_TOKEN",
  "TOKEN_REVOKED",
  "REFRESH_TOKEN_REUSED",
  "ACCOUNT_DEACTIVATED",
]);

const userAgentOf = (request: Request): string | null =>
  request.headers["user-agent"]?.slice(0, 256) ?? null;

@ApiTags("auth")
@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly demoAccounts: DemoAccountsService,
    private readonly cookies: AuthCookies,
    private readonly config: AppConfig,
  ) {}

  @Get("google")
  @Public()
  @ApiOperation({
    summary: "Start Google Sign-In",
    description:
      "Sets a 10-minute signed cookie holding state, nonce and the PKCE verifier, then redirects to Google.",
  })
  @ApiFoundResponse({ description: "Redirect to accounts.google.com" })
  google(@Res() response: Response): void {
    const { url, pending } = this.auth.beginGoogleSignIn();
    this.cookies.setPendingAuthorization(response, pending);
    response.redirect(HttpStatus.FOUND, url);
  }

  @Get("google/callback")
  @Public()
  @ApiOperation({
    summary: "Google redirects here",
    description:
      "Verifies state, exchanges the code, verifies the ID token and signs the user in. Sets the refresh cookie and redirects to FRONTEND_URL/auth/callback, or to FRONTEND_URL/login?error=CODE. Tokens never appear in the URL.",
  })
  @ApiQuery({ name: "code", required: false })
  @ApiQuery({ name: "state", required: false })
  @ApiQuery({ name: "error", required: false })
  @ApiFoundResponse({ description: "Redirect to the frontend" })
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const pending = this.cookies.readPendingAuthorization(request);
    this.cookies.clearPendingAuthorization(response);
    const frontendUrl = this.config.values.frontendUrl;
    try {
      const signedIn = await this.auth.completeGoogleSignIn(
        { code, state, error },
        pending,
        userAgentOf(request),
      );
      this.cookies.setRefreshToken(response, signedIn.refreshToken);
      response.redirect(HttpStatus.FOUND, `${frontendUrl}/auth/callback`);
    } catch (caught) {
      if (!(caught instanceof DomainError)) throw caught;
      response.redirect(
        HttpStatus.FOUND,
        `${frontendUrl}/login?error=${encodeURIComponent(caught.code)}`,
      );
    }
  }

  @Post("dev-login")
  @Public()
  @UseGuards(DevLoginGuard, OriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Development-only sign-in",
    description:
      "Same role resolution, audit and session as Google Sign-In. Returns 404 DEV_LOGIN_DISABLED unless AUTH_DEV_LOGIN_ENABLED=true and either NODE_ENV=test, or NODE_ENV=development with the request coming from this machine (loopback, not forwarded). Requires the Origin header to equal FRONTEND_URL.",
  })
  @ApiNoContentResponse({ description: "Refresh cookie set" })
  async devLogin(
    @Body() dto: DevLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const signedIn = await this.auth.devSignIn(
      dto.email,
      dto.name,
      userAgentOf(request),
    );
    this.cookies.setRefreshToken(response, signedIn.refreshToken);
  }

  @Get("dev-login/accounts")
  @Public()
  @UseGuards(DevLoginGuard)
  @SkipThrottle({ login: true })
  @ApiOperation({
    summary: "Demo accounts for dev login",
    description:
      "The accounts `npm run seed:demo` creates, for one-click dev login. Returns 404 DEV_LOGIN_DISABLED unless dev login is enabled.",
  })
  @ApiOkResponse({ type: DemoAccountDto, isArray: true })
  listDemoAccounts(): DemoAccountDto[] {
    return this.demoAccounts
      .list()
      .map((account) => DemoAccountDto.from(account));
  }

  @Post("refresh")
  @Public()
  @SkipThrottle({ login: true })
  @UseGuards(OriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: "Rotate the refresh token and get an access token",
    description:
      "Revokes the presented refresh token and sets its successor. Replaying an already-rotated token revokes the whole family (REFRESH_TOKEN_REUSED). Requires the Origin header to equal FRONTEND_URL.",
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponseDto> {
    try {
      const session = await this.auth.refresh(
        this.cookies.readRefreshToken(request),
        userAgentOf(request),
      );
      this.cookies.setRefreshToken(response, session.refreshToken);
      return AccessTokenResponseDto.from(session);
    } catch (error) {
      // Only an answer about the session ends it. A database outage (503) or a limit (429) keeps
      // the cookie, so the browser tries again instead of signing the student out (H6).
      if (error instanceof DomainError && SESSION_ENDED.has(error.code)) {
        this.cookies.clearRefreshToken(response);
      }
      throw error;
    }
  }

  @Post("logout")
  @Public()
  @SkipThrottle({ login: true })
  @UseGuards(OriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: "End this session's refresh-token family" })
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookies.readRefreshToken(request));
    this.cookies.clearRefreshToken(response);
  }

  @Post("logout-all")
  @Roles(...ALL_ROLES)
  @SkipThrottle({ login: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "End every session of the current user",
    description:
      "Revokes all refresh-token families and increments tokenVersion, so every access token stops working.",
  })
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    this.cookies.clearRefreshToken(response);
  }

  @Get("me")
  @Roles(...ALL_ROLES)
  @SkipThrottle({ login: true })
  @ApiOperation({ summary: "The signed-in user, including PENDING_STAFF" })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    return MeResponseDto.from(await this.auth.me(user.id));
  }
}
