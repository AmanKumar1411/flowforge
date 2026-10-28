import { Transaction } from "../../common/transaction";
import {
  NewUser,
  StudentScope,
  StudentSearch,
  User,
  UserAccessChange,
  UserAccessState,
  UserListQuery,
  UserPage,
  UserProfile,
} from "./user";

export abstract class UsersRepository {
  abstract findById(id: string, tx?: Transaction): Promise<User | null>;
  abstract findAccessState(id: string): Promise<UserAccessState | null>;
  abstract findByGoogleSub(
    googleSub: string,
    tx?: Transaction,
  ): Promise<User | null>;
  abstract findByEmail(email: string, tx?: Transaction): Promise<User | null>;
  abstract create(user: NewUser, tx: Transaction): Promise<User>;
  abstract updateProfile(
    id: string,
    profile: UserProfile,
    tx: Transaction,
  ): Promise<User>;
  /** Applies the change and increments tokenVersion, so issued access tokens stop working. */
  abstract updateAccess(
    id: string,
    change: UserAccessChange,
    tx: Transaction,
  ): Promise<User>;
  abstract list(query: UserListQuery): Promise<UserPage>;
  abstract findByIds(ids: readonly string[], tx?: Transaction): Promise<User[]>;
  abstract findByEmails(
    emails: readonly string[],
    tx?: Transaction,
  ): Promise<User[]>;
  /** Gives a pre-registered account its provider sub; null if it was claimed meanwhile. */
  abstract claim(
    id: string,
    googleSub: string,
    tx: Transaction,
  ): Promise<User | null>;
  /** Active students in the scope, ordered by name. */
  abstract listActiveStudents(scope: StudentScope): Promise<User[]>;
  /** Active students in the scope matching the query, ordered by name. */
  abstract searchActiveStudents(search: StudentSearch): Promise<User[]>;
}
