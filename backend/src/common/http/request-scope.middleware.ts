import { Injectable, NestMiddleware } from "@nestjs/common";
import { RequestScope } from "../request-scope";

/**
 * Opens the request's memo (H4). A Nest middleware runs after the body is
 * parsed, so the scope also covers requests with a body.
 */
@Injectable()
export class RequestScopeMiddleware implements NestMiddleware {
  use(_request: unknown, _response: unknown, next: () => void): void {
    RequestScope.run(next);
  }
}
