import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UniversityIdentityParser } from "./domain/university-identity-parser";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RishihoodIdentityParser } from "./infrastructure/rishihood-identity-parser";
import { UsersRepository } from "./users.repository";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: "1h" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersRepository,
    JwtAuthGuard,
    RishihoodIdentityParser,
    {
      provide: UniversityIdentityParser,
      useExisting: RishihoodIdentityParser,
    },
  ],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
