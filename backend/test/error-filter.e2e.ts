import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArgumentsHost } from "@nestjs/common";
import { AdminDomainError } from "../src/admin/admin.errors";
import { AuthDomainError } from "../src/auth/domain/auth.errors";
import { ApiExceptionFilter } from "../src/common/errors/api-exception.filter";
import { DomainError } from "../src/common/errors/domain-error";
import { statusForCode } from "../src/common/errors/error-status";
import { LinkDomainError } from "../src/common/links/link.errors";
import { RateLimitedError } from "../src/common/rate-limit";
import { CycleDomainError } from "../src/course-cycles/domain/cycle.errors";
import { EvaluationDomainError } from "../src/evaluations/domain/evaluation.errors";
import { IdeaDomainError } from "../src/ideas/domain/idea.errors";
import { SubmissionDomainError } from "../src/submissions/domain/submission.errors";
import { TeamDomainError } from "../src/teams/domain/team.errors";

function respond(exception: unknown): { status: number; body: unknown } {
  const sent: { status: number; body: unknown } = { status: 0, body: null };
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return sent;
}

const EVERY_SUBCLASS: [string, DomainError][] = [
  ["AuthDomainError", new AuthDomainError("TOKEN_REVOKED", "m")],
  ["CycleDomainError", new CycleDomainError("CYCLE_NOT_FOUND", "m")],
  ["TeamDomainError", new TeamDomainError("TEAM_FULL", "m")],
  ["IdeaDomainError", new IdeaDomainError("IDEA_CHANGED", "m")],
  [
    "SubmissionDomainError",
    new SubmissionDomainError("SUBMISSION_CLOSED", "m"),
  ],
  ["EvaluationDomainError", new EvaluationDomainError("MARKS_DISABLED", "m")],
  ["AdminDomainError", new AdminDomainError("USER_NOT_FOUND", "m")],
  ["LinkDomainError", new LinkDomainError("INVALID_LINK", "m")],
  ["RateLimitedError", new RateLimitedError("m")],
  ["DomainError itself", new DomainError("ORIGIN_NOT_ALLOWED", "m")],
];

describe("One filter for every DomainError", () => {
  for (const [name, error] of EVERY_SUBCLASS) {
    it(`${name} answers its code's status and the one error shape`, () => {
      const { status, body } = respond(error);

      assert.equal(status, statusForCode(error.code));
      assert.deepEqual(body, { code: error.code, message: "m" });
    });
  }

  it("names no subclass: the same branch handles them all", () => {
    const source = readFileSync(
      join(__dirname, "../src/common/errors/api-exception.filter.ts"),
      "utf8",
    );

    for (const [name] of EVERY_SUBCLASS.slice(0, -1)) {
      assert.ok(!source.includes(name), `the filter mentions ${name}`);
    }
  });

  it("carries details when an error has them", () => {
    const details = [{ code: "ROSTER_EMPTY", message: "Enroll students" }];

    const { status, body } = respond(
      new CycleDomainError("PUBLISH_BLOCKED", "m", details),
    );

    assert.equal(status, 409);
    assert.deepEqual(body, { code: "PUBLISH_BLOCKED", message: "m", details });
  });

  it("never lets an error's cause reach the response", () => {
    const error = new AuthDomainError("INVALID_ID_TOKEN", "Could not verify");
    error.cause = new Error("the payload was aman.k26csai@example.org");

    const { body } = respond(error);

    assert.deepEqual(body, {
      code: "INVALID_ID_TOKEN",
      message: "Could not verify",
    });
  });

  it("answers 503 when the database is too busy to start a transaction", () => {
    const { status, body } = respond(
      new Error(
        "Transaction API error: Unable to start a transaction in the given time.",
      ),
    );

    assert.equal(status, 503);
    assert.equal((body as { code: string }).code, "SERVICE_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(body), /transaction/i);
  });

  it("keeps a transaction used after it closed as a 500: that is a bug, not a busy database", () => {
    const { status, body } = respond(
      new Error("Transaction API error: Transaction already closed."),
    );

    assert.equal(status, 500);
    assert.equal((body as { code: string }).code, "INTERNAL_ERROR");
  });

  it("hides anything it does not recognise behind INTERNAL_ERROR", () => {
    const { status, body } = respond(new Error("secret SQL here"));

    assert.equal(status, 500);
    assert.deepEqual(body, {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
    });
  });
});
