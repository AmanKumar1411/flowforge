import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppConfig } from "../../../config/app-config";
import { AuthDomainError } from "../../domain/auth.errors";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const FORWARDING_HEADERS = ["x-forwarded-for", "forwarded", "x-real-ip"];

/**
 * The test login signs anyone in as anyone, so it answers only where that is
 * safe (SEC-F2, H11): in tests (NODE_ENV=test), or in development to a
 * request from this machine. "This machine" means the TCP peer is a loopback
 * address and no proxy forwarded the request: a local proxy must not make a
 * remote user look local. Anything else is 404, as if the route did not exist.
 */
@Injectable()
export class DevLoginGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const { devLoginEnabled, nodeEnv } = this.config.values;
    const request = context.switchToHttp().getRequest<Request>();
    const allowed =
      devLoginEnabled &&
      (nodeEnv === "test" ||
        (nodeEnv === "development" && this.isFromThisMachine(request)));
    if (!allowed) {
      throw new AuthDomainError(
        "DEV_LOGIN_DISABLED",
        "Dev login is not enabled on this server",
      );
    }
    return true;
  }

  private isFromThisMachine(request: Request): boolean {
    return (
      LOOPBACK.has(request.socket.remoteAddress ?? "") &&
      FORWARDING_HEADERS.every(
        (header) => request.headers[header] === undefined,
      )
    );
  }
}
