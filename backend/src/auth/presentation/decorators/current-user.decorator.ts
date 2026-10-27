import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedUser } from "../../application/authenticated-user";
import { AuthenticatedRequest } from "../authenticated-request";

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      throw new Error(
        "@CurrentUser() used on a route that is not authenticated",
      );
    }
    return user;
  },
);
