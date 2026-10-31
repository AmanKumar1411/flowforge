import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import {
  ONE_MINUTE_MS,
  RateLimitedError,
  RateLimiter,
} from "../../../common/rate-limit";
import { AppConfig } from "../../../config/app-config";
import { AuthenticatedRequest } from "../authenticated-request";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Global, after authentication: every authenticated write counts against the
 * caller's own budget per minute (SEC-F1, H10), so one account cannot flood
 * the database. Reads and signed-out routes are not counted; sign-in and
 * refresh have limits of their own.
 */
@Injectable()
export class WriteRateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!WRITE_METHODS.has(request.method) || !request.user) return true;
    const decision = await this.limiter.consume(
      `writes:${request.user.id}`,
      this.config.values.rateLimits.writesPerMinute,
      ONE_MINUTE_MS,
    );
    if (!decision.allowed) {
      throw new RateLimitedError(
        "You made many changes in a minute; wait a moment and try again",
      );
    }
    return true;
  }
}
