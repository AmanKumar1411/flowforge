import { Module } from "@nestjs/common";
import { HealthService } from "./application/health.service";
import { DatabaseProbe } from "./application/ports/database-probe";
import { PrismaDatabaseProbe } from "./infrastructure/prisma-database-probe";
import { HealthController } from "./presentation/health.controller";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: DatabaseProbe, useClass: PrismaDatabaseProbe },
  ],
})
export class HealthModule {}
