import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditEvent } from "../domain/audit-event";
import { AuditRepository } from "../domain/audit.repository";

@Injectable()
export class PrismaAuditRepository extends AuditRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async append(event: AuditEvent, tx: Transaction): Promise<void> {
    await this.prisma.client(tx).auditLog.create({
      data: {
        action: event.action,
        actorId: event.actorId,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata ?? {},
      },
    });
  }
}
