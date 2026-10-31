import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { OAuth2Client } from "google-auth-library";
import { AuditModule } from "../audit/audit.module";
import { Clock } from "../common/clock";
import { ONE_MINUTE_MS } from "../common/rate-limit";
import { AppConfig } from "../config/app-config";
import { PostgresRateLimiter } from "../prisma/postgres-rate-limiter";
import { UsersModule } from "../users/users.module";
import { AuthService } from "./application/auth.service";
import { DemoAccountsService } from "./application/demo-accounts.service";
import { StudentPreRegistration } from "./application/student-pre-registration";
import { FacultyAccessService } from "./application/faculty-access.service";
import { DevIdentityProvider } from "./application/ports/dev-identity-provider";
import { FacultyDirectory } from "./application/ports/faculty-directory";
import { IdentityProvider } from "./application/ports/identity-provider";
import { RefreshTokenRepository } from "./application/ports/refresh-token.repository";
import { TokenSigner } from "./application/ports/token-signer";
import { SessionService } from "./application/session.service";
import { SignInService } from "./application/sign-in.service";
import { BatchYearPolicy } from "./domain/batch-year.policy";
import { RoleResolver } from "./domain/role-resolver";
import { UniversityIdentityParser } from "./domain/university-identity-parser";
import { LocalDevIdentityProvider } from "./infrastructure/dev-identity.provider";
import { GoogleIdentityProvider } from "./infrastructure/google-identity.provider";
import {
  GoogleAuthLibraryClient,
  GoogleOAuthClient,
} from "./infrastructure/google-oauth.client";
import { JwtTokenSigner } from "./infrastructure/jwt-token.signer";
import { PrismaFacultyDirectory } from "./infrastructure/prisma-faculty-directory";
import { PrismaRefreshTokenRepository } from "./infrastructure/prisma-refresh-token.repository";
import { RishihoodIdentityParser } from "./infrastructure/rishihood-identity-parser";
import { AuthCookies } from "./presentation/auth-cookies";
import { AuthController } from "./presentation/auth.controller";
import { DevLoginGuard } from "./presentation/guards/dev-login.guard";
import { JwtAuthGuard } from "./presentation/guards/jwt-auth.guard";
import { RolesGuard } from "./presentation/guards/roles.guard";
import { WriteRateLimitGuard } from "./presentation/guards/write-rate-limit.guard";
import { AccessTokenStrategy } from "./presentation/strategies/access-token.strategy";

@Module({
  imports: [
    UsersModule,
    AuditModule,
    JwtModule.register({}),
    // Only sign-in is limited per client IP (campus-sized, ADR 023); refresh is limited per
    // session family in SessionService. The counters live in PostgreSQL, shared by every process.
    ThrottlerModule.forRootAsync({
      inject: [AppConfig, PostgresRateLimiter],
      useFactory: (config: AppConfig, storage: PostgresRateLimiter) => ({
        throttlers: [
          {
            name: "login",
            ttl: ONE_MINUTE_MS,
            limit: config.values.rateLimits.loginPerMinute,
          },
        ],
        storage,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    DemoAccountsService,
    StudentPreRegistration,
    SignInService,
    SessionService,
    FacultyAccessService,
    AccessTokenStrategy,
    AuthCookies,
    DevLoginGuard,
    { provide: RoleResolver, useValue: new RoleResolver() },
    {
      provide: BatchYearPolicy,
      inject: [AppConfig, Clock],
      useFactory: (config: AppConfig, clock: Clock) =>
        new BatchYearPolicy(config.values.identity.batchMinYear, clock),
    },
    {
      provide: UniversityIdentityParser,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new RishihoodIdentityParser(config.values.identity),
    },
    {
      provide: GoogleOAuthClient,
      inject: [AppConfig],
      useFactory: ({ values: { google } }: AppConfig) =>
        new GoogleAuthLibraryClient(
          new OAuth2Client({
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            redirectUri: google.redirectUri,
          }),
          google.clientId,
        ),
    },
    { provide: IdentityProvider, useClass: GoogleIdentityProvider },
    { provide: DevIdentityProvider, useClass: LocalDevIdentityProvider },
    { provide: TokenSigner, useClass: JwtTokenSigner },
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
    { provide: FacultyDirectory, useClass: PrismaFacultyDirectory },
    // Secure by default, in this order: authenticate, check the role, then count the write.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: WriteRateLimitGuard },
  ],
  exports: [
    FacultyAccessService,
    SessionService,
    BatchYearPolicy,
    UniversityIdentityParser,
    StudentPreRegistration,
  ],
})
export class AuthModule {}
