import "./test-env";
import { AddressInfo } from "node:net";
import type { Abstract, Type } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { GoogleOAuthClient } from "../../src/auth/infrastructure/google-oauth.client";
import { Clock } from "../../src/common/clock";
import { AppConfig } from "../../src/config/app-config";
import { createTestAppConfig } from "../../src/config/testing/test-environment";
import { configureApp } from "../../src/main";
import { AuditAction } from "../../src/generated/prisma/client";
import { PrismaService } from "../../src/prisma/prisma.service";
import { FakeGoogle } from "./fake-google";
import { TEST_DATABASE_URL } from "./test-env";
import { TestBrowser } from "./test-browser";

export { BOOTSTRAP_ADMIN, DOMAIN, FRONTEND_ORIGIN } from "./constants";

export interface TestApp {
  apiUrl: string;
  prisma: PrismaService;
  google: FakeGoogle;
  /** A provider of the running app, for work that has no HTTP route. */
  get<T>(token: Type<T> | Abstract<T>): T;
  browser(): TestBrowser;
  reset(): Promise<void>;
  close(): Promise<void>;
}

interface TestAppOptions {
  env?: Record<string, string>;
  clock?: Clock;
}

/** The real AppModule on a random port, with Google's network calls faked. */
export async function startTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const google = new FakeGoogle();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleOAuthClient)
    .useValue(google);
  if (options.env) {
    builder = builder.overrideProvider(AppConfig).useValue(
      createTestAppConfig({
        DATABASE_URL: TEST_DATABASE_URL,
        ...options.env,
      }),
    );
  }
  if (options.clock) {
    builder = builder.overrideProvider(Clock).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  const apiUrl = `http://127.0.0.1:${port}/api`;
  const prisma = app.get(PrismaService);

  return {
    apiUrl,
    prisma,
    google,
    get: (token) => app.get(token),
    browser: () => new TestBrowser(apiUrl),
    reset: () => resetDatabase(prisma),
    close: () => app.close(),
  };
}

// TRUNCATE bypasses the audit table's append-only row trigger, which only blocks UPDATE and DELETE.
async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog", "RefreshToken", "FacultyAccessRequest", "FacultyAllowlistEntry", "TeamSeeker", "TeamMember", "Team", "CycleEnrollment", "CourseProjectCycle", "User" CASCADE',
  );
}

export async function auditActions(
  prisma: PrismaService,
  where: { entityId?: string; action?: AuditAction } = {},
): Promise<{ action: string; metadata: Record<string, unknown> }[]> {
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    action: row.action,
    metadata: row.metadata as Record<string, unknown>,
  }));
}
