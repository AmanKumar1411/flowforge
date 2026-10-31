import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as cookieParser from "cookie-parser";
import helmet from "helmet";
import { Server } from "node:http";
import { AppModule } from "./app.module";
import { REFRESH_COOKIE } from "./auth/presentation/auth-cookies";
import { API_PREFIX } from "./common/http/api-prefix";
import { AppConfig } from "./config/app-config";

/** Everything between "Nest created the app" and "listen". Integration tests reuse it. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  app.setGlobalPrefix(API_PREFIX);
  // Idle connections stay open longer than any proxy's idle timeout, so the API is never the
  // side that closes one a proxy (or a browser) is about to reuse for a POST (H5).
  const server = app.getHttpServer() as Server;
  server.keepAliveTimeout = config.values.keepAliveTimeoutMs;
  server.headersTimeout = config.values.keepAliveTimeoutMs + 1_000;
  // Off unless a proxy is named: then the client IP comes from its X-Forwarded-For, which a
  // client talking to the API directly cannot forge (ADR 023).
  app.set("trust proxy", config.values.trustProxy);
  app.use(
    helmet({
      // HTTPS-only headers would break plain-http localhost development.
      hsts: config.isProduction,
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
    }),
  );
  app.use(cookieParser(config.values.cookieSecret));
  app.enableCors({ origin: config.values.frontendUrl, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (!config.isProduction) {
    setUpSwagger(app);
  }
}

function setUpSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("FlowForge API")
      .setDescription(
        "Google Sign-In for the university domain, server-side roles and refresh-token sessions. " +
          "Protected routes take `Authorization: Bearer <accessToken>`. " +
          `The access token comes from POST /${API_PREFIX}/auth/refresh, which reads the httpOnly ` +
          `\`${REFRESH_COOKIE}\` cookie and needs Origin = FRONTEND_URL. Every error is { code, message }.`,
      )
      .setVersion("0.3.0")
      .addBearerAuth()
      .addCookieAuth(REFRESH_COOKIE)
      .build(),
  );
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
}

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  return app;
}

/** One API process: `npm run start:single`, or one worker of `src/cluster.ts`. */
export async function bootstrap(): Promise<void> {
  const app = await createApp();
  // SIGTERM: stop accepting, finish requests in flight, close the pool.
  app.enableShutdownHooks();
  await app.listen(app.get(AppConfig).values.port);
}

if (require.main === module) {
  void bootstrap();
}
