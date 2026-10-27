import { applyDecorators, SetMetadata } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import type { Role } from "../../domain/role";

export const ROLES_KEY = "roles";

export const ALL_ROLES: readonly Role[] = [
  "STUDENT",
  "FACULTY",
  "ADMIN",
  "PENDING_STAFF",
];

/** The roles allowed on a route. Every non-public route must declare them. */
export const Roles = (...roles: Role[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), ApiBearerAuth());
