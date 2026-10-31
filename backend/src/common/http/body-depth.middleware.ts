import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request } from "express";
import { AppConfig } from "../../config/app-config";
import { CommonErrorCode, DomainError } from "../errors/domain-error";

/**
 * True when objects or arrays nest deeper than `limit` (the body itself is
 * level 1). It walks with its own stack, so no depth can overflow the call
 * stack, and stops at the first branch that goes too deep.
 */
export function nestsDeeperThan(value: unknown, limit: number): boolean {
  const pending: { node: unknown; depth: number }[] = [
    { node: value, depth: 1 },
  ];
  while (pending.length > 0) {
    const { node, depth } = pending.pop()!;
    if (node === null || typeof node !== "object") continue;
    if (depth > limit) return true;
    for (const child of Object.values(node as object)) {
      if (child !== null && typeof child === "object") {
        pending.push({ node: child, depth: depth + 1 });
      }
    }
  }
  return false;
}

/**
 * Refuses a deeply nested body before the validation pipe, whose recursive
 * walk overflowed the stack and turned it into a 500 with a stack trace in
 * the log (BUG-3, H8). A Nest middleware runs after the body is parsed.
 */
@Injectable()
export class BodyDepthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(BodyDepthMiddleware.name);

  constructor(private readonly config: AppConfig) {}

  use(request: Request, _response: unknown, next: () => void): void {
    const limit = this.config.values.maxBodyDepth;
    if (nestsDeeperThan(request.body, limit)) {
      this.logger.warn(
        `Refused ${request.method} ${request.path}: body nested deeper than ${limit} levels`,
      );
      throw new DomainError<CommonErrorCode>(
        "BODY_TOO_DEEP",
        `The request body is nested deeper than ${limit} levels`,
      );
    }
    next();
  }
}
