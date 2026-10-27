import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditRepository } from "./domain/audit.repository";
import { PrismaAuditRepository } from "./infrastructure/prisma-audit.repository";

@Module({
  providers: [
    AuditService,
    { provide: AuditRepository, useClass: PrismaAuditRepository },
  ],
  exports: [AuditService],
})
export class AuditModule {}
