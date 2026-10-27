import { ExecutionContext, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

const IS_PUBLIC_KEY = "isPublic";

/** Opts a route out of the global authentication and role guards. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const isPublicRoute = (
  reflector: Reflector,
  context: ExecutionContext,
): boolean =>
  reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]) === true;
