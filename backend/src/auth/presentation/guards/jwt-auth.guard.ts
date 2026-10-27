import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedRequest } from "../authenticated-request";
import { isPublicRoute } from "../decorators/public.decorator";
import { AccessTokenStrategy } from "../strategies/access-token.strategy";

/** Global: every route requires a valid access token unless it is marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly strategy: AccessTokenStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.strategy.authenticate(
      request.headers.authorization,
    );
    return true;
  }
}
