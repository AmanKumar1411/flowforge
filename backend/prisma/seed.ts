// Creates the demo accounts (see src/auth/application/demo-accounts.ts) in the
// database from DATABASE_URL. Run with `npm run seed:demo`; safe to run again.
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { DemoAccountsService } from "../src/auth/application/demo-accounts.service";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const seeded = await app.get(DemoAccountsService).seed();
    console.table(
      seeded.map(({ email, role, batchYear, outcome, note }) => ({
        email,
        role: role ?? "",
        batch: batchYear ?? "",
        outcome: note ? `${outcome}: ${note}` : outcome,
      })),
    );
    console.log("Sign in with any of them through dev login on /login.");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
