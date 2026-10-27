import { Injectable } from "@nestjs/common";
import { Transaction, TransactionRunner } from "../common/transaction";
import { PrismaService } from "./prisma.service";

@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((client) =>
      work(client as unknown as Transaction),
    );
  }
}
