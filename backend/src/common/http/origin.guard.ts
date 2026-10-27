import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppConfig } from "../../config/app-config";
import { CommonErrorCode, DomainError } from "../errors/domain-error";

/**
 * For routes authenticated by a cookie: the browser sends the cookie on its
 * own, so also require the request to come from the FlowForge frontend.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin !== this.config.values.frontendUrl) {
      throw new DomainError<CommonErrorCode>(
        "ORIGIN_NOT_ALLOWED",
        "This request must come from the FlowForge web app",
      );
    }
    return true;
  }
}
