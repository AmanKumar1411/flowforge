import { Request } from "express";
import { AuthenticatedUser } from "../application/authenticated-user";

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
