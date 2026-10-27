import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthDomainError } from "../../domain/auth.errors";
import type { Role } from "../../domain/role";
import { AuthenticatedRequest } from "../authenticated-request";
import { isPublicRoute } from "../decorators/public.decorator";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * Global, runs after JwtAuthGuard. Fails closed: a non-public route without
 * @Roles() is denied, so forgetting the decorator never opens a route.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(this.reflector, context)) {
      return true;
    }
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (user && roles?.includes(user.role)) {
      return true;
    }
    if (user?.role === "PENDING_STAFF") {
      throw new AuthDomainError(
        "FACULTY_APPROVAL_PENDING",
        "Your faculty access is waiting for admin approval",
      );
    }
    throw new AuthDomainError(
      "FORBIDDEN_ROLE",
      "Your role cannot access this resource",
    );
  }
}
