import { Transaction } from "../../common/transaction";
import {
  NewUser,
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
}
