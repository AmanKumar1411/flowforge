import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { PrismaService } from "../../prisma/prisma.service";
import {
  NewUser,
  StudentSearch,
  User,
  UserAccessChange,
  UserAccessState,
  UserListQuery,
  UserPage,
  UserProfile,
} from "../domain/user";
import { UsersRepository } from "../domain/users.repository";

@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findById(id: string, tx?: Transaction): Promise<User | null> {
    return this.prisma.client(tx).user.findUnique({ where: { id } });
  }

  findAccessState(id: string): Promise<UserAccessState | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        tokenVersion: true,
        batchYear: true,
      },
    });
  }

  findByGoogleSub(googleSub: string, tx?: Transaction): Promise<User | null> {
    return this.prisma.client(tx).user.findUnique({ where: { googleSub } });
  }

  findByEmail(email: string, tx?: Transaction): Promise<User | null> {
    return this.prisma.client(tx).user.findUnique({ where: { email } });
  }

  create(user: NewUser, tx: Transaction): Promise<User> {
    return this.prisma.client(tx).user.create({ data: user });
  }

  updateProfile(
    id: string,
    profile: UserProfile,
    tx: Transaction,
  ): Promise<User> {
    return this.prisma.client(tx).user.update({
      where: { id },
      data: profile,
    });
  }

  updateAccess(
    id: string,
    change: UserAccessChange,
    tx: Transaction,
  ): Promise<User> {
    return this.prisma.client(tx).user.update({
      where: { id },
      data: { ...change, tokenVersion: { increment: 1 } },
    });
  }

  async list(query: UserListQuery): Promise<UserPage> {
    const rows = await this.prisma.user.findMany({
      where: {
        role: query.role,
        status: query.status,
        batchYear: query.batchYear,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, query.limit);
    return {
      items,
      nextCursor: rows.length > query.limit ? items[items.length - 1].id : null,
    };
  }

  findByIds(ids: readonly string[], tx?: Transaction): Promise<User[]> {
    return this.prisma.client(tx).user.findMany({
      where: { id: { in: [...ids] } },
    });
  }

  searchActiveStudents(search: StudentSearch): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        role: "STUDENT",
        status: "ACTIVE",
        batchYear: search.batchYear,
        OR: [
          { name: { contains: search.query, mode: "insensitive" } },
          // Emails are stored lower-case.
          { email: { startsWith: search.query.toLowerCase() } },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: search.limit,
    });
  }
}
