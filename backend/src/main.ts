import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origins = config
    .getOrThrow<string>("CORS_ORIGIN")
    .split(",")
    .map((origin) => origin.trim());

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: origins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>("PORT"));
}

if (require.main === module) {
  void bootstrap();
}
