import { Injectable } from "@nestjs/common";
import type { Role, UserStatus } from "../auth/domain/role";
import { Transaction } from "../common/transaction";
import {
  NewUser,
  StudentScope,
  StudentSearch,
  User,
  UserAccessState,
  UserListQuery,
  UserPage,
  UserProfile,
} from "./domain/user";
import { UsersRepository } from "./domain/users.repository";

/**
 * The only entry point to the User table for other modules. Every change to
 * role, status or batch goes through `updateAccess`, which bumps tokenVersion.
 */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  findById(id: string, tx?: Transaction): Promise<User | null> {
    return this.users.findById(id, tx);
  }

  findAccessState(id: string): Promise<UserAccessState | null> {
    return this.users.findAccessState(id);
  }

  findByGoogleSub(googleSub: string, tx?: Transaction): Promise<User | null> {
    return this.users.findByGoogleSub(googleSub, tx);
  }

  findByEmail(email: string, tx?: Transaction): Promise<User | null> {
    return this.users.findByEmail(email, tx);
  }

  register(user: NewUser, tx: Transaction): Promise<User> {
    return this.users.create(user, tx);
  }

  recordLogin(
    id: string,
    profile: UserProfile,
    tx: Transaction,
  ): Promise<User> {
    return this.users.updateProfile(id, profile, tx);
  }

  changeRole(id: string, role: Role, tx: Transaction): Promise<User> {
    return this.users.updateAccess(id, { role }, tx);
  }

  changeStatus(id: string, status: UserStatus, tx: Transaction): Promise<User> {
    return this.users.updateAccess(id, { status }, tx);
  }

  correctBatch(id: string, batchYear: number, tx: Transaction): Promise<User> {
    return this.users.updateAccess(id, { batchYear }, tx);
  }

  /** Invalidates every access token already issued to the user. */
  revokeAccessTokens(id: string, tx: Transaction): Promise<User> {
    return this.users.updateAccess(id, {}, tx);
  }

  list(query: UserListQuery): Promise<UserPage> {
    return this.users.list(query);
  }

  findByIds(ids: readonly string[], tx?: Transaction): Promise<User[]> {
    return this.users.findByIds(ids, tx);
  }

  findByEmails(emails: readonly string[], tx?: Transaction): Promise<User[]> {
    return emails.length > 0
      ? this.users.findByEmails(emails, tx)
      : Promise.resolve([]);
  }

  claim(id: string, googleSub: string, tx: Transaction): Promise<User | null> {
    return this.users.claim(id, googleSub, tx);
  }

  listActiveStudents(scope: StudentScope): Promise<User[]> {
    return this.users.listActiveStudents(scope);
  }

  searchActiveStudents(search: StudentSearch): Promise<User[]> {
    return this.users.searchActiveStudents(search);
  }
}
