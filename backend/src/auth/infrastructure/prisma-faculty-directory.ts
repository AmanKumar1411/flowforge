import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { PrismaService } from "../../prisma/prisma.service";
import {
  FacultyAccessRequest,
  FacultyAccessRequestWithUser,
  FacultyAllowlistEntry,
  FacultyDirectory,
  FacultyRequestDecision,
  FacultyRequestStatus,
  NewAllowlistEntry,
} from "../application/ports/faculty-directory";

@Injectable()
export class PrismaFacultyDirectory extends FacultyDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isApproved(email: string, tx: Transaction): Promise<boolean> {
    const entry = await this.prisma
      .client(tx)
      .facultyAllowlistEntry.findUnique({ where: { email } });
    return entry !== null;
  }

  listEntries(): Promise<FacultyAllowlistEntry[]> {
    return this.prisma.facultyAllowlistEntry.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  findEntryById(
    id: string,
    tx: Transaction,
  ): Promise<FacultyAllowlistEntry | null> {
    return this.prisma
      .client(tx)
      .facultyAllowlistEntry.findUnique({ where: { id } });
  }

  findEntryByEmail(
    email: string,
    tx: Transaction,
  ): Promise<FacultyAllowlistEntry | null> {
    return this.prisma
      .client(tx)
      .facultyAllowlistEntry.findUnique({ where: { email } });
  }

  addEntry(
    entry: NewAllowlistEntry,
    tx: Transaction,
  ): Promise<FacultyAllowlistEntry> {
    return this.prisma.client(tx).facultyAllowlistEntry.create({ data: entry });
  }

  async removeEntry(id: string, tx: Transaction): Promise<void> {
    await this.prisma
      .client(tx)
      .facultyAllowlistEntry.delete({ where: { id } });
  }

  async createRequestIfAbsent(
    userId: string,
    email: string,
    tx: Transaction,
  ): Promise<boolean> {
    // ON CONFLICT DO NOTHING: two simultaneous first logins cannot create two requests.
    const result = await this.prisma
      .client(tx)
      .facultyAccessRequest.createMany({
        data: [{ userId, email }],
        skipDuplicates: true,
      });
    return result.count === 1;
  }

  findRequestById(
    id: string,
    tx?: Transaction,
  ): Promise<FacultyAccessRequest | null> {
    return this.prisma
      .client(tx)
      .facultyAccessRequest.findUnique({ where: { id } });
  }

  findRequestForUser(
    userId: string,
    tx?: Transaction,
  ): Promise<FacultyAccessRequest | null> {
    return this.prisma
      .client(tx)
      .facultyAccessRequest.findUnique({ where: { userId } });
  }

  async listRequests(
    status?: FacultyRequestStatus,
  ): Promise<FacultyAccessRequestWithUser[]> {
    const requests = await this.prisma.facultyAccessRequest.findMany({
      where: { status },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return requests.map(({ user, ...request }) => ({
      ...request,
      userName: user.name,
    }));
  }

  decideRequest(
    userId: string,
    email: string,
    decision: FacultyRequestDecision,
    tx: Transaction,
  ): Promise<FacultyAccessRequest> {
    return this.prisma.client(tx).facultyAccessRequest.upsert({
      where: { userId },
      create: { userId, email, ...decision },
      update: decision,
    });
  }
}
