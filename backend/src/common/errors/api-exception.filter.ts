import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";
import { DomainError, ErrorDetail } from "./domain-error";
import { statusForCode } from "./error-status";

export interface ApiErrorBody {
  code: string;
  message: string;
  /** Present when the error reports several problems at once. */
  details?: readonly ErrorDetail[];
}

const codeByHttpStatus: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "VALIDATION_FAILED",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHENTICATED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.TOO_MANY_REQUESTS]: "TOO_MANY_REQUESTS",
};

/** Turns every error into the single `{ code, message }` shape (plus `details` for a list of problems). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = this.toResponse(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }

  private toResponse(exception: unknown): {
    status: number;
    body: ApiErrorBody;
  } {
    if (exception instanceof DomainError) {
      return {
        status: statusForCode(exception.code),
        body: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, try again in a minute",
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          code: codeByHttpStatus[status] ?? "HTTP_ERROR",
          message: this.messageOf(exception),
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    };
  }

  private messageOf(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === "object" && response !== null) {
      const message = (response as { message?: unknown }).message;
      if (Array.isArray(message)) return message.join("; ");
      if (typeof message === "string") return message;
    }
    return exception.message;
  }
}
