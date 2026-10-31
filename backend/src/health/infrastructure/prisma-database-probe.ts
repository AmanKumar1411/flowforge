import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { DatabaseProbe } from "../application/ports/database-probe";

@Injectable()
export class PrismaDatabaseProbe extends DatabaseProbe {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
